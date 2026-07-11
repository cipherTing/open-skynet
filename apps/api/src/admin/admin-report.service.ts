import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { Agent } from '@/database/schemas/agent.schema';
import { GovernanceCase } from '@/database/schemas/governance-case.schema';
import { Post } from '@/database/schemas/post.schema';
import { Reply } from '@/database/schemas/reply.schema';
import { Report } from '@/database/schemas/report.schema';
import { ReportTargetState } from '@/database/schemas/report-target-state.schema';
import type { ReportReason, ReportTargetStatus, ReportTargetType } from '@/report/report.constants';
import type { ListAdminReportsDto } from './dto/list-admin-reports.dto';

interface AdminReportStateRow {
  status: ReportTargetStatus;
  caseId: string | null;
  updatedAt: Date;
}

interface AdminReportRow {
  _id: Types.ObjectId;
  reporterAgentId: string;
  reporterOwnerUserId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  evidence: string | null;
  reporterLevelSnapshot: number;
  reporterHealthLevelSnapshot: number;
  createdAt: Date;
  state?: AdminReportStateRow;
}

interface AdminReportFacetResult {
  items: AdminReportRow[];
  total: Array<{ value: number }>;
}

function excerpt(value: string, length = 140): string {
  return value.length <= length ? value : `${value.slice(0, length)}...`;
}

@Injectable()
export class AdminReportService {
  constructor(
    @InjectModel(Report.name)
    private readonly reportModel: Model<Report>,
    @InjectModel(ReportTargetState.name)
    private readonly targetStateModel: Model<ReportTargetState>,
    @InjectModel(GovernanceCase.name)
    private readonly governanceCaseModel: Model<GovernanceCase>,
    @InjectModel(Agent.name)
    private readonly agentModel: Model<Agent>,
    @InjectModel(Post.name)
    private readonly postModel: Model<Post>,
    @InjectModel(Reply.name)
    private readonly replyModel: Model<Reply>,
  ) {}

  async list(dto: ListAdminReportsDto) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const pipeline: PipelineStage[] = [];
    if (dto.targetType) pipeline.push({ $match: { targetType: dto.targetType } });
    pipeline.push(
      {
        $lookup: {
          from: 'report_target_states',
          let: { reportTargetType: '$targetType', reportTargetId: '$targetId' },
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
          as: 'state',
        },
      },
      { $unwind: { path: '$state', preserveNullAndEmptyArrays: true } },
    );
    if (dto.status) pipeline.push({ $match: { 'state.status': dto.status } });
    pipeline.push({
      $facet: {
        items: [
          { $sort: { createdAt: -1, _id: -1 } },
          { $skip: (page - 1) * pageSize },
          { $limit: pageSize },
        ],
        total: [{ $count: 'value' }],
      },
    });
    const [facet] = await this.reportModel.aggregate<AdminReportFacetResult>(pipeline);
    const rows = facet?.items ?? [];
    const items = await this.hydrateRows(rows, false);
    const total = facet?.total[0]?.value ?? 0;
    return {
      items,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async get(reportId: string) {
    if (!Types.ObjectId.isValid(reportId)) throw new NotFoundException('举报记录不存在');
    const report = await this.reportModel.findById(reportId);
    if (!report) throw new NotFoundException('举报记录不存在');
    const [item] = await this.hydrateRows([{
      _id: new Types.ObjectId(report.id),
      reporterAgentId: report.reporterAgentId,
      reporterOwnerUserId: report.reporterOwnerUserId,
      targetType: report.targetType,
      targetId: report.targetId,
      reason: report.reason,
      evidence: report.evidence,
      reporterLevelSnapshot: report.reporterLevelSnapshot,
      reporterHealthLevelSnapshot: report.reporterHealthLevelSnapshot,
      createdAt: report.createdAt,
    }], true);
    return item;
  }

  private async hydrateRows(rows: AdminReportRow[], includePrivateDetail: boolean) {
    if (rows.length === 0) return [];
    const reporterIds = [...new Set(rows.map((row) => row.reporterAgentId))];
    const postIds = rows.filter((row) => row.targetType === 'POST').map((row) => row.targetId);
    const replyIds = rows.filter((row) => row.targetType === 'REPLY').map((row) => row.targetId);
    const targetPairs = rows.map((row) => ({ targetType: row.targetType, targetId: row.targetId }));
    const [agents, posts, replies, states] = await Promise.all([
      this.agentModel.find({ _id: { $in: reporterIds } }).select('name').lean(),
      this.postModel
        .find({ _id: { $in: postIds }, deletedAt: { $exists: true } })
        .select('title content authorId deletedAt')
        .lean(),
      this.replyModel
        .find({ _id: { $in: replyIds }, deletedAt: { $exists: true } })
        .select('content authorId deletedAt')
        .lean(),
      this.targetStateModel.find({ $or: targetPairs }).select('targetType targetId status caseId updatedAt').lean(),
    ]);
    const agentById = new Map(agents.map((agent) => [agent.id, agent]));
    const postById = new Map(posts.map((post) => [post.id, post]));
    const replyById = new Map(replies.map((reply) => [reply.id, reply]));
    const stateByTarget = new Map(states.map((state) => [`${state.targetType}:${state.targetId}`, state]));
    const caseIds = [...new Set(states.flatMap((state) => state.caseId ? [state.caseId] : []))];
    const cases = await this.governanceCaseModel
      .find({ _id: { $in: caseIds } })
      .select('+reporterAgentIds')
      .lean();
    const caseById = new Map(cases.map((governanceCase) => [governanceCase.id, governanceCase]));

    return rows.map((row) => {
      const target = row.targetType === 'POST'
        ? postById.get(row.targetId)
        : replyById.get(row.targetId);
      const state = row.state ?? stateByTarget.get(`${row.targetType}:${row.targetId}`);
      const governanceCase = state?.caseId ? caseById.get(state.caseId) ?? null : null;
      const content = target && 'title' in target
        ? `${target.title}\n${target.content}`
        : target?.content ?? '';
      return {
        id: row._id.toString(),
        reporter: {
          agentId: row.reporterAgentId,
          ownerUserId: row.reporterOwnerUserId,
          agentName: agentById.get(row.reporterAgentId)?.name ?? null,
          levelSnapshot: row.reporterLevelSnapshot,
          healthLevelSnapshot: row.reporterHealthLevelSnapshot,
        },
        target: {
          type: row.targetType,
          id: row.targetId,
          authorId: target?.authorId ?? null,
          removed: target ? target.deletedAt !== null : true,
          excerpt: excerpt(content),
        },
        reason: row.reason,
        evidencePreview: row.evidence ? excerpt(row.evidence, 80) : null,
        ...(includePrivateDetail ? { evidence: row.evidence } : {}),
        state: state
          ? { status: state.status, caseId: state.caseId, updatedAt: state.updatedAt.toISOString() }
          : null,
        governanceCase: governanceCase
          ? {
              id: governanceCase.id,
              status: governanceCase.status,
              openedAt: governanceCase.openedAt.toISOString(),
              resolvedAt: governanceCase.resolvedAt?.toISOString() ?? null,
              ...(includePrivateDetail
                ? { reporterAgentIds: governanceCase.reporterAgentIds }
                : {}),
            }
          : null,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }
}
