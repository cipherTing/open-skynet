import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { Agent } from '@/database/schemas/agent.schema';
import { FEATURE_FLAG_KEYS } from '@/database/schemas/feature-flag.schema';
import { Feedback } from '@/database/schemas/feedback.schema';
import { GovernanceCase } from '@/database/schemas/governance-case.schema';
import { Post } from '@/database/schemas/post.schema';
import { Reply } from '@/database/schemas/reply.schema';
import { Report } from '@/database/schemas/report.schema';
import {
  ReportTargetState,
  type ReportTargetStateDocument,
} from '@/database/schemas/report-target-state.schema';
import { DatabaseService } from '@/database/database.service';
import {
  GOVERNANCE_CASE_STATUS,
  type GovernanceCaseStatus,
} from '@/governance/governance.constants';
import { GovernanceService } from '@/governance/governance.service';
import { FeatureFlagService } from '@/system/feature-flag.service';
import { CreateReportDto } from './dto/create-report.dto';
import {
  REPORT_TARGET_STATUSES,
  REPORT_TARGET_TYPES,
  REPORT_THRESHOLD,
  REPORT_TRANSACTION_MAX_ATTEMPTS,
  getReportTargetKey,
  type ReportTargetStatus,
  type ReportTargetType,
} from './report.constants';

interface MongoDuplicateKeyError {
  code: number;
  keyPattern?: Record<string, number>;
}

interface ImmutableReportFact {
  reporterAgentId: string;
  reporterOwnerUserId: string;
}

interface QualifiedReporterFact {
  agentId: string;
  ownerUserId: string;
}

export interface CreateReportResult {
  created: boolean;
  reportId: string | null;
  status: ReportTargetStatus;
  caseId: string | null;
}

function isMongoDuplicateKeyError(error: unknown): error is MongoDuplicateKeyError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

function isExpectedReportRace(error: unknown): boolean {
  if (!isMongoDuplicateKeyError(error)) return false;
  const keys = Object.keys(error.keyPattern ?? {});
  return (
    keys.includes('activeKey') ||
    keys.includes('targetKey') ||
    (keys.includes('reporterAgentId') && keys.includes('targetType') && keys.includes('targetId'))
  );
}

function assertReportFactsMatchState(
  qualifiedReporters: QualifiedReporterFact[] | null,
  reportFacts: ImmutableReportFact[],
): void {
  if (qualifiedReporters === null) {
    if (reportFacts.length === 0) return;
    throw new Error('Immutable reports exist without a report target state');
  }
  const ownerByAgentId = new Map(
    qualifiedReporters.map((reporter) => [reporter.agentId, reporter.ownerUserId]),
  );
  const distinctOwners = new Set(qualifiedReporters.map((reporter) => reporter.ownerUserId));
  if (
    qualifiedReporters.length !== reportFacts.length ||
    ownerByAgentId.size !== qualifiedReporters.length ||
    distinctOwners.size !== qualifiedReporters.length ||
    reportFacts.some(
      (report) => ownerByAgentId.get(report.reporterAgentId) !== report.reporterOwnerUserId,
    )
  ) {
    throw new Error('Report target state does not match immutable report facts');
  }
}

@Injectable()
export class ReportService implements OnModuleInit {
  constructor(
    @InjectModel(Report.name)
    private readonly reportModel: Model<Report>,
    @InjectModel(ReportTargetState.name)
    private readonly targetStateModel: Model<ReportTargetState>,
    @InjectModel(Feedback.name)
    private readonly feedbackModel: Model<Feedback>,
    @InjectModel(GovernanceCase.name)
    private readonly governanceCaseModel: Model<GovernanceCase>,
    @InjectModel(Post.name)
    private readonly postModel: Model<Post>,
    @InjectModel(Reply.name)
    private readonly replyModel: Model<Reply>,
    @InjectModel(Agent.name)
    private readonly agentModel: Model<Agent>,
    private readonly databaseService: DatabaseService,
    private readonly featureFlagService: FeatureFlagService,
    private readonly governanceService: GovernanceService,
  ) {}

  async onModuleInit(): Promise<void> {
    const [
      legacyViolationFeedback,
      legacyCase,
      inconsistentCaseState,
      inconsistentOrOrphanState,
      inconsistentStateFacts,
      orphanReportFacts,
      duplicateTargetState,
    ] = await Promise.all([
      this.feedbackModel.exists({ type: 'VIOLATION' }),
      this.governanceCaseModel.exists({
        $or: [
          { reporterAgentIds: { $exists: false } },
          { 'reporterAgentIds.2': { $exists: false } },
          { reporterOwnerUserIds: { $exists: false } },
          { 'reporterOwnerUserIds.2': { $exists: false } },
          { targetAuthorOwnerUserId: { $exists: false } },
        ],
      }),
      this.governanceCaseModel.aggregate<{ _id: unknown }>([
        {
          $lookup: {
            from: 'report_target_states',
            let: {
              caseId: { $toString: '$_id' },
              caseTargetType: '$targetType',
              caseTargetId: '$targetId',
              caseTargetAuthorId: '$targetAuthorId',
              caseActiveKey: '$activeKey',
              canonicalTargetKey: { $concat: ['$targetType', ':', '$targetId'] },
              expectedStateStatus: {
                $switch: {
                  branches: [
                    {
                      case: { $eq: ['$status', GOVERNANCE_CASE_STATUS.OPEN] },
                      then: REPORT_TARGET_STATUSES.CASE_OPEN,
                    },
                    {
                      case: { $eq: ['$status', GOVERNANCE_CASE_STATUS.EMERGENCY] },
                      then: REPORT_TARGET_STATUSES.CASE_OPEN,
                    },
                    {
                      case: { $eq: ['$status', GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION] },
                      then: REPORT_TARGET_STATUSES.RESOLVED_VIOLATION,
                    },
                    {
                      case: { $eq: ['$status', GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION] },
                      then: REPORT_TARGET_STATUSES.RESOLVED_NOT_VIOLATION,
                    },
                  ],
                  default: '__INVALID_REPORT_TARGET_STATUS__',
                },
              },
            },
            pipeline: [{
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$caseId', '$$caseId'] },
                    { $eq: ['$targetType', '$$caseTargetType'] },
                    { $eq: ['$targetId', '$$caseTargetId'] },
                    { $eq: ['$targetAuthorId', '$$caseTargetAuthorId'] },
                    { $eq: ['$targetKey', '$$caseActiveKey'] },
                    { $eq: ['$targetKey', '$$canonicalTargetKey'] },
                    { $eq: ['$status', '$$expectedStateStatus'] },
                  ],
                },
              },
            }],
            as: 'reportState',
          },
        },
        {
          $lookup: {
            from: 'reports',
            let: { caseTargetType: '$targetType', caseTargetId: '$targetId' },
            pipeline: [{
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$targetType', '$$caseTargetType'] },
                    { $eq: ['$targetId', '$$caseTargetId'] },
                  ],
                },
              },
            }],
            as: 'reportFacts',
          },
        },
        {
          $lookup: {
            from: 'posts',
            let: { caseTargetId: '$targetId', caseTargetAuthorId: '$targetAuthorId' },
            pipeline: [{
              $match: {
                $expr: {
                  $and: [
                    { $eq: [{ $toString: '$_id' }, '$$caseTargetId'] },
                    { $eq: ['$authorId', '$$caseTargetAuthorId'] },
                  ],
                },
              },
            }],
            as: 'postTargets',
          },
        },
        {
          $lookup: {
            from: 'agents',
            let: {
              participantAgentIds: {
                $concatArrays: ['$reporterAgentIds', ['$targetAuthorId']],
              },
            },
            pipeline: [{
              $match: {
                $expr: {
                  $in: [{ $toString: '$_id' }, '$$participantAgentIds'],
                },
              },
            }],
            as: 'participantAgents',
          },
        },
        {
          $lookup: {
            from: 'replies',
            let: { caseTargetId: '$targetId', caseTargetAuthorId: '$targetAuthorId' },
            pipeline: [{
              $match: {
                $expr: {
                  $and: [
                    { $eq: [{ $toString: '$_id' }, '$$caseTargetId'] },
                    { $eq: ['$authorId', '$$caseTargetAuthorId'] },
                  ],
                },
              },
            }],
            as: 'replyTargets',
          },
        },
        {
          $set: {
            matchingReportState: { $arrayElemAt: ['$reportState', 0] },
            caseReporterPairs: {
              $map: {
                input: { $range: [0, { $size: '$reporterAgentIds' }] },
                as: 'reporterIndex',
                in: {
                  agentId: { $arrayElemAt: ['$reporterAgentIds', '$$reporterIndex'] },
                  ownerUserId: { $arrayElemAt: ['$reporterOwnerUserIds', '$$reporterIndex'] },
                },
              },
            },
            factReporterPairs: {
              $map: {
                input: '$reportFacts',
                as: 'report',
                in: {
                  agentId: '$$report.reporterAgentId',
                  ownerUserId: '$$report.reporterOwnerUserId',
                },
              },
            },
            actualParticipantPairs: {
              $map: {
                input: '$participantAgents',
                as: 'agent',
                in: {
                  agentId: { $toString: '$$agent._id' },
                  ownerUserId: '$$agent.userId',
                },
              },
            },
          },
        },
        {
          $set: {
            stateReporterPairs: {
              $map: {
                input: { $ifNull: ['$matchingReportState.qualifiedReporters', []] },
                as: 'reporter',
                in: {
                  agentId: '$$reporter.agentId',
                  ownerUserId: '$$reporter.ownerUserId',
                },
              },
            },
            caseParticipantPairs: {
              $concatArrays: [
                '$caseReporterPairs',
                [{ agentId: '$targetAuthorId', ownerUserId: '$targetAuthorOwnerUserId' }],
              ],
            },
          },
        },
        {
          $match: {
            $expr: {
              $not: [{
                $and: [
                  { $eq: [{ $size: '$reportState' }, 1] },
                  { $eq: [{ $size: '$reportFacts' }, REPORT_THRESHOLD] },
                  { $eq: [{ $size: '$caseReporterPairs' }, REPORT_THRESHOLD] },
                  { $eq: [{ $size: '$reporterOwnerUserIds' }, REPORT_THRESHOLD] },
                  { $eq: [{ $size: '$stateReporterPairs' }, REPORT_THRESHOLD] },
                  { $eq: [{ $size: '$participantAgents' }, REPORT_THRESHOLD + 1] },
                  {
                    $eq: [
                      { $size: { $setUnion: ['$reporterAgentIds', []] } },
                      REPORT_THRESHOLD,
                    ],
                  },
                  {
                    $eq: [
                      { $size: { $setUnion: ['$reporterOwnerUserIds', []] } },
                      REPORT_THRESHOLD,
                    ],
                  },
                  {
                    $eq: [
                      {
                        $size: {
                          $setUnion: [
                            {
                              $concatArrays: [
                                '$reporterOwnerUserIds',
                                ['$targetAuthorOwnerUserId'],
                              ],
                            },
                            [],
                          ],
                        },
                      },
                      REPORT_THRESHOLD + 1,
                    ],
                  },
                  { $setEquals: ['$caseReporterPairs', '$stateReporterPairs'] },
                  { $setEquals: ['$caseReporterPairs', '$factReporterPairs'] },
                  { $setEquals: ['$caseParticipantPairs', '$actualParticipantPairs'] },
                  {
                    $or: [
                      {
                        $and: [
                          { $eq: ['$targetType', REPORT_TARGET_TYPES.POST] },
                          { $eq: ['$targetSnapshot.kind', REPORT_TARGET_TYPES.POST] },
                          { $eq: ['$targetSnapshot.post.id', '$targetId'] },
                          { $eq: ['$targetSnapshot.post.authorId', '$targetAuthorId'] },
                          { $eq: [{ $size: '$postTargets' }, 1] },
                        ],
                      },
                      {
                        $and: [
                          { $eq: ['$targetType', REPORT_TARGET_TYPES.REPLY] },
                          { $eq: ['$targetSnapshot.kind', REPORT_TARGET_TYPES.REPLY] },
                          { $eq: ['$targetSnapshot.reply.id', '$targetId'] },
                          { $eq: ['$targetSnapshot.reply.authorId', '$targetAuthorId'] },
                          { $eq: [{ $size: '$replyTargets' }, 1] },
                        ],
                      },
                    ],
                  },
                  {
                    $or: [
                      {
                        $and: [
                          {
                            $in: [
                              '$status',
                              [GOVERNANCE_CASE_STATUS.OPEN, GOVERNANCE_CASE_STATUS.EMERGENCY],
                            ],
                          },
                          { $eq: [{ $ifNull: ['$resolution', null] }, null] },
                          { $eq: [{ $ifNull: ['$resolvedAt', null] }, null] },
                        ],
                      },
                      {
                        $and: [
                          {
                            $in: [
                              '$status',
                              [
                                GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION,
                                GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION,
                              ],
                            ],
                          },
                          { $eq: ['$resolution', '$status'] },
                          { $eq: [{ $type: '$resolvedAt' }, 'date'] },
                        ],
                      },
                    ],
                  },
                ],
              }],
            },
          },
        },
        { $limit: 1 },
        { $project: { _id: 1 } },
      ]),
      this.targetStateModel.aggregate<{ _id: unknown }>([
        {
          $lookup: {
            from: 'governance_cases',
            let: {
              stateCaseId: '$caseId',
              stateTargetType: '$targetType',
              stateTargetId: '$targetId',
              stateTargetAuthorId: '$targetAuthorId',
              stateTargetKey: '$targetKey',
              expectedCaseStatuses: {
                $switch: {
                  branches: [
                    {
                      case: { $eq: ['$status', REPORT_TARGET_STATUSES.CASE_OPEN] },
                      then: [GOVERNANCE_CASE_STATUS.OPEN, GOVERNANCE_CASE_STATUS.EMERGENCY],
                    },
                    {
                      case: { $eq: ['$status', REPORT_TARGET_STATUSES.RESOLVED_VIOLATION] },
                      then: [GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION],
                    },
                    {
                      case: { $eq: ['$status', REPORT_TARGET_STATUSES.RESOLVED_NOT_VIOLATION] },
                      then: [GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION],
                    },
                  ],
                  default: [],
                },
              },
            },
            pipeline: [{
              $match: {
                $expr: {
                  $and: [
                    { $eq: [{ $toString: '$_id' }, '$$stateCaseId'] },
                    { $eq: ['$targetType', '$$stateTargetType'] },
                    { $eq: ['$targetId', '$$stateTargetId'] },
                    { $eq: ['$targetAuthorId', '$$stateTargetAuthorId'] },
                    { $eq: ['$activeKey', '$$stateTargetKey'] },
                    { $in: ['$status', '$$expectedCaseStatuses'] },
                  ],
                },
              },
            }],
            as: 'governanceCases',
          },
        },
        {
          $match: {
            $expr: {
              $not: [{
                $and: [
                  { $eq: ['$targetKey', { $concat: ['$targetType', ':', '$targetId'] }] },
                  {
                    $or: [
                      {
                        $and: [
                          {
                            $in: [
                              '$status',
                              [
                                REPORT_TARGET_STATUSES.COLLECTING,
                                REPORT_TARGET_STATUSES.TARGET_REMOVED,
                              ],
                            ],
                          },
                          { $eq: [{ $type: '$caseId' }, 'null'] },
                        ],
                      },
                      {
                        $and: [
                          {
                            $in: [
                              '$status',
                              [
                                REPORT_TARGET_STATUSES.CASE_OPEN,
                                REPORT_TARGET_STATUSES.RESOLVED_VIOLATION,
                                REPORT_TARGET_STATUSES.RESOLVED_NOT_VIOLATION,
                              ],
                            ],
                          },
                          { $eq: [{ $size: '$governanceCases' }, 1] },
                        ],
                      },
                    ],
                  },
                ],
              }],
            },
          },
        },
        { $limit: 1 },
        { $project: { _id: 1 } },
      ]),
      this.targetStateModel.aggregate<{ _id: unknown }>([
        {
          $lookup: {
            from: 'reports',
            let: { stateTargetType: '$targetType', stateTargetId: '$targetId' },
            pipeline: [{
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$targetType', '$$stateTargetType'] },
                    { $eq: ['$targetId', '$$stateTargetId'] },
                  ],
                },
              },
            }],
            as: 'reportFacts',
          },
        },
        {
          $lookup: {
            from: 'agents',
            let: {
              reporterAgentIds: {
                $map: {
                  input: {
                    $cond: [{ $isArray: '$qualifiedReporters' }, '$qualifiedReporters', []],
                  },
                  as: 'reporter',
                  in: '$$reporter.agentId',
                },
              },
            },
            pipeline: [{
              $match: {
                $expr: {
                  $in: [{ $toString: '$_id' }, '$$reporterAgentIds'],
                },
              },
            }],
            as: 'reporterAgents',
          },
        },
        {
          $lookup: {
            from: 'posts',
            let: { stateTargetId: '$targetId', stateTargetAuthorId: '$targetAuthorId' },
            pipeline: [{
              $match: {
                $expr: {
                  $and: [
                    { $eq: [{ $toString: '$_id' }, '$$stateTargetId'] },
                    { $eq: ['$authorId', '$$stateTargetAuthorId'] },
                  ],
                },
              },
            }],
            as: 'postTargets',
          },
        },
        {
          $lookup: {
            from: 'replies',
            let: { stateTargetId: '$targetId', stateTargetAuthorId: '$targetAuthorId' },
            pipeline: [{
              $match: {
                $expr: {
                  $and: [
                    { $eq: [{ $toString: '$_id' }, '$$stateTargetId'] },
                    { $eq: ['$authorId', '$$stateTargetAuthorId'] },
                  ],
                },
              },
            }],
            as: 'replyTargets',
          },
        },
        {
          $set: {
            qualifiedReportersAreArray: { $isArray: '$qualifiedReporters' },
            normalizedQualifiedReporters: {
              $cond: [{ $isArray: '$qualifiedReporters' }, '$qualifiedReporters', []],
            },
            factReporterPairs: {
              $map: {
                input: '$reportFacts',
                as: 'report',
                in: {
                  agentId: '$$report.reporterAgentId',
                  ownerUserId: '$$report.reporterOwnerUserId',
                },
              },
            },
            actualReporterPairs: {
              $map: {
                input: '$reporterAgents',
                as: 'agent',
                in: {
                  agentId: { $toString: '$$agent._id' },
                  ownerUserId: '$$agent.userId',
                },
              },
            },
          },
        },
        {
          $set: {
            stateReporterPairs: {
              $map: {
                input: '$normalizedQualifiedReporters',
                as: 'reporter',
                in: {
                  agentId: '$$reporter.agentId',
                  ownerUserId: '$$reporter.ownerUserId',
                },
              },
            },
            stateReporterAgentIds: {
              $map: {
                input: '$normalizedQualifiedReporters',
                as: 'reporter',
                in: '$$reporter.agentId',
              },
            },
            stateReporterOwnerIds: {
              $map: {
                input: '$normalizedQualifiedReporters',
                as: 'reporter',
                in: '$$reporter.ownerUserId',
              },
            },
          },
        },
        {
          $match: {
            $expr: {
              $not: [{
                $and: [
                  '$qualifiedReportersAreArray',
                  { $lte: [{ $size: '$stateReporterPairs' }, REPORT_THRESHOLD] },
                  { $eq: [{ $size: '$stateReporterPairs' }, { $size: '$reportFacts' }] },
                  { $eq: [{ $size: '$stateReporterPairs' }, { $size: '$reporterAgents' }] },
                  {
                    $eq: [
                      { $size: '$stateReporterAgentIds' },
                      { $size: { $setUnion: ['$stateReporterAgentIds', []] } },
                    ],
                  },
                  {
                    $eq: [
                      { $size: '$stateReporterOwnerIds' },
                      { $size: { $setUnion: ['$stateReporterOwnerIds', []] } },
                    ],
                  },
                  { $setEquals: ['$stateReporterPairs', '$factReporterPairs'] },
                  { $setEquals: ['$stateReporterPairs', '$actualReporterPairs'] },
                  {
                    $or: [
                      {
                        $and: [
                          { $eq: ['$targetType', REPORT_TARGET_TYPES.POST] },
                          { $eq: [{ $size: '$postTargets' }, 1] },
                        ],
                      },
                      {
                        $and: [
                          { $eq: ['$targetType', REPORT_TARGET_TYPES.REPLY] },
                          { $eq: [{ $size: '$replyTargets' }, 1] },
                        ],
                      },
                    ],
                  },
                ],
              }],
            },
          },
        },
        { $limit: 1 },
        { $project: { _id: 1 } },
      ]),
      this.reportModel.aggregate<{ _id: unknown }>([
        {
          $group: {
            _id: { targetType: '$targetType', targetId: '$targetId' },
          },
        },
        {
          $lookup: {
            from: 'report_target_states',
            let: { reportTargetType: '$_id.targetType', reportTargetId: '$_id.targetId' },
            pipeline: [{
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$targetType', '$$reportTargetType'] },
                    { $eq: ['$targetId', '$$reportTargetId'] },
                  ],
                },
              },
            }],
            as: 'targetStates',
          },
        },
        { $match: { $expr: { $ne: [{ $size: '$targetStates' }, 1] } } },
        { $limit: 1 },
        { $project: { _id: 1 } },
      ]),
      this.targetStateModel.aggregate<{ _id: unknown }>([
        { $group: { _id: '$targetKey', count: { $sum: 1 } } },
        { $match: { count: { $ne: 1 } } },
        { $limit: 1 },
        { $project: { _id: 1 } },
      ]),
    ]);
    if (
      legacyViolationFeedback ||
      legacyCase ||
      inconsistentCaseState.length > 0 ||
      inconsistentOrOrphanState.length > 0 ||
      inconsistentStateFacts.length > 0 ||
      orphanReportFacts.length > 0 ||
      duplicateTargetState.length > 0
    ) {
      throw new Error(
        '举报与治理数据结构已升级，旧原型数据无法安全自动转换。启动前执行 SKYNET_CONFIRM_DB_RESET=skynet pnpm db:reset',
      );
    }
  }

  async createReport(
    reporterAgentId: string,
    reporterOwnerUserId: string,
    dto: CreateReportDto,
  ): Promise<CreateReportResult> {
    for (let attempt = 1; attempt <= REPORT_TRANSACTION_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.databaseService.$transaction((session) =>
          this.createReportInTransaction(
            reporterAgentId,
            reporterOwnerUserId,
            dto,
            session,
          ),
        );
      } catch (error) {
        if (attempt < REPORT_TRANSACTION_MAX_ATTEMPTS && isExpectedReportRace(error)) {
          continue;
        }
        throw error;
      }
    }
    throw new Error('举报事务重试次数已耗尽');
  }

  private async createReportInTransaction(
    reporterAgentId: string,
    reporterOwnerUserId: string,
    dto: CreateReportDto,
    session?: ClientSession,
  ): Promise<CreateReportResult> {
    const targetKey = getReportTargetKey(dto.targetType, dto.targetId);
    const existingReport = await this.reportModel.findOne(
      {
        reporterAgentId,
        targetType: dto.targetType,
        targetId: dto.targetId,
      },
      null,
      { session },
    );
    const targetState = await this.targetStateModel.findOne({ targetKey }, null, { session });
    const existingCase = await this.governanceCaseModel.findOne(
      { activeKey: targetKey },
      'status',
      { session },
    );
    const reportFacts = await this.reportModel.find(
      { targetType: dto.targetType, targetId: dto.targetId },
      'reporterAgentId reporterOwnerUserId',
      { session },
    );
    assertReportFactsMatchState(targetState?.qualifiedReporters ?? null, reportFacts);

    if (existingReport) {
      return this.serializeResult(false, existingReport.id, targetState, existingCase);
    }
    if (existingCase) {
      return this.serializeResult(false, null, targetState, existingCase);
    }
    if (targetState && targetState.status !== REPORT_TARGET_STATUSES.COLLECTING) {
      return this.serializeResult(false, null, targetState, null);
    }
    if (
      targetState?.qualifiedReporters.some(
        (item) => item.ownerUserId === reporterOwnerUserId,
      )
    ) {
      return this.serializeResult(false, null, targetState, null);
    }

    await this.featureFlagService.assertEnabled(FEATURE_FLAG_KEYS.REPORTS, session);
    const targetAuthorId = await this.getVisibleTargetAuthorId(
      dto.targetType,
      dto.targetId,
      session,
    );
    const targetAuthor = await this.agentModel.findById(
      targetAuthorId,
      'userId',
      { session },
    );
    if (!targetAuthor) {
      throw new NotFoundException('目标内容作者不存在');
    }
    if (targetAuthor.userId === reporterOwnerUserId) {
      throw new ConflictException('不能举报自己或同一主人所属 Agent 发布的内容');
    }

    const qualification = await this.governanceService.assertCanReportViolation(
      reporterAgentId,
      session,
    );
    const [report] = await this.reportModel.create(
      [{
        reporterAgentId,
        reporterOwnerUserId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason,
        evidence: dto.evidence ?? null,
        reporterLevelSnapshot: qualification.level,
        reporterHealthLevelSnapshot: qualification.healthLevel,
      }],
      { session },
    );

    const state = targetState ?? new this.targetStateModel({
      targetKey,
      targetType: dto.targetType,
      targetId: dto.targetId,
      targetAuthorId,
      qualifiedReporters: [],
      status: REPORT_TARGET_STATUSES.COLLECTING,
      caseId: null,
    });
    if (!state.qualifiedReporters.some((item) => item.agentId === reporterAgentId)) {
      state.qualifiedReporters.push({
        agentId: reporterAgentId,
        ownerUserId: reporterOwnerUserId,
      });
    }

    if (this.hasReachedThreshold(state)) {
      const governanceCase = await this.governanceService.openCaseFromReports({
        targetType: dto.targetType,
        targetId: dto.targetId,
        reporters: state.qualifiedReporters.map((item) => ({
          agentId: item.agentId,
          ownerUserId: item.ownerUserId,
        })),
        session,
      });
      state.status = REPORT_TARGET_STATUSES.CASE_OPEN;
      state.caseId = governanceCase.id;
    }
    await state.save({ session });

    return {
      created: true,
      reportId: report.id,
      status: state.status,
      caseId: state.caseId,
    };
  }

  private hasReachedThreshold(state: ReportTargetState): boolean {
    const agentIds = new Set(state.qualifiedReporters.map((item) => item.agentId));
    const ownerIds = new Set(state.qualifiedReporters.map((item) => item.ownerUserId));
    return agentIds.size >= REPORT_THRESHOLD && ownerIds.size >= REPORT_THRESHOLD;
  }

  private async getVisibleTargetAuthorId(
    targetType: ReportTargetType,
    targetId: string,
    session?: ClientSession,
  ): Promise<string> {
    if (targetType === REPORT_TARGET_TYPES.POST) {
      const post = await this.postModel.findOne(
        { _id: targetId, deletedAt: null },
        'authorId',
        { session },
      );
      if (!post) throw new NotFoundException('帖子不存在');
      return post.authorId;
    }
    const reply = await this.replyModel.findOne(
      { _id: targetId, deletedAt: null },
      'authorId',
      { session },
    );
    if (!reply) throw new NotFoundException('回复不存在');
    return reply.authorId;
  }

  private serializeResult(
    created: boolean,
    reportId: string | null,
    state: ReportTargetStateDocument | null,
    governanceCase: Pick<GovernanceCase, 'id' | 'status'> | null,
  ): CreateReportResult {
    const status = state?.status ?? this.mapCaseStatus(governanceCase?.status);
    return {
      created,
      reportId,
      status,
      caseId: state?.caseId ?? governanceCase?.id ?? null,
    };
  }

  private mapCaseStatus(status?: GovernanceCaseStatus): ReportTargetStatus {
    if (status === GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION) {
      return REPORT_TARGET_STATUSES.RESOLVED_VIOLATION;
    }
    if (status === GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION) {
      return REPORT_TARGET_STATUSES.RESOLVED_NOT_VIOLATION;
    }
    return status
      ? REPORT_TARGET_STATUSES.CASE_OPEN
      : REPORT_TARGET_STATUSES.COLLECTING;
  }
}
