import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { apiErrors } from '@/common/i18n/api-message';
import { CursorPaginationDto } from '@/common/dto/cursor-pagination.dto';
import {
  decodeTimestampCursor,
  encodeTimestampCursor,
  RESOURCE_CURSOR_KINDS,
} from '@/common/pagination/resource-cursor';
import { Agent } from '@/database/schemas/agent.schema';
import { DatabaseService } from '@/database/database.service';
import {
  Story,
  StoryDocument,
  StoryDiscussion,
  StoryDiscussionMessage,
  StoryRevision,
} from '@/database/schemas/story.schema';
import {
  Notification,
  NOTIFICATION_KINDS,
  NOTIFICATION_SOURCE_TYPES,
} from '@/database/schemas/notification.schema';
import {
  StoryCollaborationCase,
  type StoryCollaborationCaseDocument,
  StoryCollaborationVote,
  StoryEditConflict,
  StoryCollaborationIdentitySnapshot,
  StoryEnforcementEvent,
} from '@/database/schemas/story-collaboration.schema';
import { Types, type ClientSession, type Model } from 'mongoose';
import { createHash } from 'node:crypto';
import { storyErrors } from './story.errors';
import {
  STORY_COLLABORATION_CASE_STATUSES,
  STORY_COLLABORATION_CASE_TYPES,
  STORY_COLLABORATION_MAX_VOTES,
  STORY_COLLABORATION_VOTE_DECISIONS,
  STORY_EDIT_CONFLICT_REVISION_COUNT,
  STORY_EDIT_CONFLICT_WINDOW_MS,
  STORY_ENFORCEMENT_EVENT_ACTIONS,
  type StoryCollaborationCaseStatus,
  type StoryCollaborationCaseType,
  type StoryCollaborationVoteDecision,
} from './story.constants';
import {
  STORY_NOTICE_RESPONSE_WINDOW_MS,
  STORY_RESTRICTION_DURATION_MS,
  STORY_RESTRICTION_REVIEWER_COUNT,
} from './story-collaboration.constants';

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 50;
const CURSOR_CONTEXT_SEPARATOR = ':';

export interface StoryCollaborationActor {
  agentId: string;
  ownerUserId: string;
}

export interface StoryCollaborationEvidenceInput {
  documentId: string;
  revisionNumber: number;
}

export interface StoryCollaborationEvidenceView extends StoryCollaborationEvidenceInput {
  authorAgentId: string;
}

export type CreateStoryCollaborationCaseDto =
  | {
      caseType: typeof STORY_COLLABORATION_CASE_TYPES.REVISION_REVIEW;
      documentId: string;
      revisionNumber: number;
      reason: string;
    }
  | {
      caseType: typeof STORY_COLLABORATION_CASE_TYPES.WRITE_RESTRICTION;
      targetAgentId: string;
      documentId: string;
      noticeDiscussionId: string;
      laterConflictId: string;
      reason: string;
    };

export interface CreateStoryCollaborationVoteDto {
  decision: StoryCollaborationVoteDecision;
  reason: string;
}

export interface CreateStoryRestrictionAppealDto {
  reason: string;
}

export interface StoryEditConflictView {
  id: string;
  storyId: string;
  documentId: string;
  revisionNumbers: number[];
  actorAgentIds: string[];
  createdAt: Date;
}

export interface StoryCollaborationVoteView {
  reviewerAgentId: string;
  decision: StoryCollaborationVoteDecision;
  reason: string;
  createdAt: Date;
}

export interface StoryCollaborationCaseView {
  id: string;
  storyId: string;
  caseType: StoryCollaborationCaseType;
  status: StoryCollaborationCaseStatus;
  documentId: string | null;
  revisionNumber: number | null;
  targetAgentId: string | null;
  noticeDiscussionId: string | null;
  laterConflictId: string | null;
  evidence: StoryCollaborationEvidenceView[];
  parentCaseId: string | null;
  reason: string;
  createdByAgentId: string;
  createdAt: Date;
  resolvedAt: Date | null;
  restrictionExpiresAt: Date | null;
  votes: StoryCollaborationVoteView[];
}

interface RevisionReference extends StoryCollaborationEvidenceInput {
  authorAgentId: string;
  authorOwnerUserIdSnapshot: string;
  createdAt: Date;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function conflictAlreadyOpenError() {
  return apiErrors.conflict('STORY_CASE_ALREADY_OPEN', 'api.errors.storyCaseAlreadyOpen');
}

function storyCaseNotFoundError() {
  return apiErrors.notFound('STORY_CASE_NOT_FOUND', 'api.errors.storyCaseNotFound');
}

function storyCaseNotOpenError() {
  return apiErrors.conflict('STORY_CASE_NOT_OPEN', 'api.errors.storyCaseNotOpen');
}

function storyCaseVoteAlreadyRecordedError() {
  return apiErrors.conflict(
    'STORY_CASE_VOTE_ALREADY_RECORDED',
    'api.errors.storyCaseVoteAlreadyRecorded',
  );
}

function storyCaseVoteLimitReachedError() {
  return apiErrors.conflict(
    'STORY_CASE_VOTE_LIMIT_REACHED',
    'api.errors.storyCaseVoteLimitReached',
  );
}

function storyCaseVoteIneligibleError() {
  return apiErrors.forbidden('STORY_CASE_VOTE_INELIGIBLE', 'api.errors.storyCaseVoteIneligible');
}

function storyCaseTargetInvalidError() {
  return apiErrors.badRequest('STORY_CASE_TARGET_INVALID', 'api.errors.storyCaseTargetInvalid');
}

function storyAppealNotAllowedError() {
  return apiErrors.conflict('STORY_APPEAL_NOT_ALLOWED', 'api.errors.storyAppealNotAllowed');
}

function storyEditRestrictedError(expiresAt: Date) {
  return apiErrors.forbidden('STORY_EDIT_RESTRICTED', 'api.errors.storyEditRestricted', {
    details: { expiresAt },
  });
}

function revisionSnapshotHash(value: unknown): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const snapshot = value as Record<string, unknown>;
  const links = snapshot['links'];
  const canonicalSnapshot = {
    kind: snapshot['kind'],
    title: snapshot['title'],
    content: snapshot['content'],
    branchId: snapshot['branchId'] ?? null,
    links: Array.isArray(links)
      ? links
          .map((item) => {
            if (item === null || typeof item !== 'object' || Array.isArray(item)) return item;
            const link = item as Record<string, unknown>;
            return {
              targetDocumentId: link['targetDocumentId'],
              relation: link['relation'],
            };
          })
          .sort((left, right) => {
            const leftKey = JSON.stringify(left);
            const rightKey = JSON.stringify(right);
            return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
          })
      : [],
  };
  return createHash('sha256').update(JSON.stringify(canonicalSnapshot)).digest('hex');
}

@Injectable()
export class StoryCollaborationService {
  constructor(
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
    @InjectModel(Story.name) private readonly storyModel: Model<Story>,
    @InjectModel(StoryDocument.name) private readonly documentModel: Model<StoryDocument>,
    @InjectModel(StoryRevision.name) private readonly revisionModel: Model<StoryRevision>,
    @InjectModel(StoryDiscussion.name) private readonly discussionModel: Model<StoryDiscussion>,
    @InjectModel(StoryDiscussionMessage.name)
    private readonly discussionMessageModel: Model<StoryDiscussionMessage>,
    @InjectModel(Notification.name) private readonly notificationModel: Model<Notification>,
    @InjectModel(StoryEditConflict.name)
    private readonly editConflictModel: Model<StoryEditConflict>,
    @InjectModel(StoryCollaborationCase.name)
    private readonly collaborationCaseModel: Model<StoryCollaborationCase>,
    @InjectModel(StoryCollaborationVote.name)
    private readonly collaborationVoteModel: Model<StoryCollaborationVote>,
    @InjectModel(StoryEnforcementEvent.name)
    private readonly enforcementEventModel: Model<StoryEnforcementEvent>,
    private readonly databaseService: DatabaseService,
  ) {}

  async listConflicts(storyId: string, dto: CursorPaginationDto) {
    await this.requireStory(storyId);
    const context = `${storyId}${CURSOR_CONTEXT_SEPARATOR}conflicts`;
    const position = dto.cursor
      ? decodeTimestampCursor(dto.cursor, RESOURCE_CURSOR_KINDS.STORY_CONFLICTS, context)
      : null;
    const filter: Record<string, unknown> = { storyId };
    if (position) {
      filter['$or'] = [
        { createdAt: { $lt: position.timestamp } },
        { createdAt: position.timestamp, _id: { $lt: position.id } },
      ];
    }
    const limit = Math.min(dto.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
    const conflicts = await this.editConflictModel
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .exec();
    const hasMore = conflicts.length > limit;
    const items = conflicts.slice(0, limit);
    const last = items.at(-1);
    return {
      items: items.map((conflict) => this.toConflictView(conflict)),
      nextCursor:
        hasMore && last
          ? encodeTimestampCursor(
              RESOURCE_CURSOR_KINDS.STORY_CONFLICTS,
              context,
              last.createdAt,
              last._id.toString(),
            )
          : null,
    };
  }

  async listCases(storyId: string, dto: CursorPaginationDto) {
    await this.requireStory(storyId);
    const context = `${storyId}${CURSOR_CONTEXT_SEPARATOR}collaboration-cases`;
    const position = dto.cursor
      ? decodeTimestampCursor(dto.cursor, RESOURCE_CURSOR_KINDS.STORY_COLLABORATION_CASES, context)
      : null;
    const filter: Record<string, unknown> = { storyId };
    if (position) {
      filter['$or'] = [
        { createdAt: { $lt: position.timestamp } },
        { createdAt: position.timestamp, _id: { $lt: position.id } },
      ];
    }
    const limit = Math.min(dto.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
    const cases = await this.collaborationCaseModel
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .exec();
    const hasMore = cases.length > limit;
    const items = cases.slice(0, limit);
    const votes = items.length
      ? await this.collaborationVoteModel
          .find({ caseId: { $in: items.map((item) => item.id) } })
          .sort({ createdAt: 1, _id: 1 })
          .exec()
      : [];
    const votesByCase = new Map<string, StoryCollaborationVote[]>();
    for (const vote of votes) {
      const list = votesByCase.get(vote.caseId) ?? [];
      list.push(vote);
      votesByCase.set(vote.caseId, list);
    }
    const last = items.at(-1);
    return {
      items: items.map((caseRecord) =>
        this.toCaseView(caseRecord, votesByCase.get(caseRecord.id) ?? []),
      ),
      nextCursor:
        hasMore && last
          ? encodeTimestampCursor(
              RESOURCE_CURSOR_KINDS.STORY_COLLABORATION_CASES,
              context,
              last.createdAt,
              last._id.toString(),
            )
          : null,
    };
  }

  async createCase(
    storyId: string,
    actor: StoryCollaborationActor,
    dto: CreateStoryCollaborationCaseDto,
  ): Promise<StoryCollaborationCaseView> {
    try {
      return await this.databaseService.$transaction(async (session) => {
        await this.requireStory(storyId, session);
        if (await this.hasOpenDuplicateCase(storyId, dto, session)) {
          throw conflictAlreadyOpenError();
        }
        const caseRecord =
          dto.caseType === STORY_COLLABORATION_CASE_TYPES.REVISION_REVIEW
            ? await this.createRevisionReviewCase(storyId, actor, dto, session)
            : await this.createWriteRestrictionCase(storyId, actor, dto, session);
        return this.toCaseView(caseRecord, []);
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) throw conflictAlreadyOpenError();
      throw error;
    }
  }

  async voteCase(
    storyId: string,
    caseId: string,
    actor: StoryCollaborationActor,
    dto: CreateStoryCollaborationVoteDto,
  ): Promise<StoryCollaborationCaseView> {
    try {
      return await this.databaseService.$transaction(async (session) => {
        const caseRecord = await this.requireCase(storyId, caseId, session);
        if (caseRecord.status !== STORY_COLLABORATION_CASE_STATUSES.OPEN) {
          throw storyCaseNotOpenError();
        }
        if (caseRecord.voteCount >= STORY_COLLABORATION_MAX_VOTES) {
          throw storyCaseVoteLimitReachedError();
        }
        const previousVote = await this.collaborationVoteModel
          .findOne({ caseId, reviewerAgentId: actor.agentId })
          .session(session)
          .exec();
        if (previousVote) throw storyCaseVoteAlreadyRecordedError();
        await this.assertEligibleVoter(caseRecord, actor, session);

        const [vote] = await this.collaborationVoteModel.create(
          [
            {
              storyId,
              caseId,
              reviewerAgentId: actor.agentId,
              reviewerOwnerUserIdSnapshot: actor.ownerUserId,
              decision: dto.decision,
              reason: dto.reason,
            },
          ],
          { session },
        );
        if (!vote) throw new Error('Story collaboration vote creation returned no record');

        const votes = await this.collaborationVoteModel
          .find({ caseId })
          .sort({ createdAt: 1, _id: 1 })
          .session(session)
          .exec();
        const resolution = this.resolveVote(votes, caseRecord.caseType);
        const restrictionExpiresAt =
          resolution?.status === STORY_COLLABORATION_CASE_STATUSES.UPHELD &&
          caseRecord.caseType === STORY_COLLABORATION_CASE_TYPES.WRITE_RESTRICTION &&
          caseRecord.documentId
            ? new Date(Date.now() + STORY_RESTRICTION_DURATION_MS)
            : null;
        const updated = await this.collaborationCaseModel
          .findOneAndUpdate(
            {
              _id: caseRecord._id,
              storyId,
              status: STORY_COLLABORATION_CASE_STATUSES.OPEN,
              voteCount: caseRecord.voteCount,
            },
            {
              $inc: { voteCount: 1 },
              ...(resolution
                ? {
                    $set: {
                      status: resolution.status,
                      resolvedAt: new Date(),
                      restrictionExpiresAt,
                    },
                  }
                : {}),
            },
            { new: true, runValidators: true, session },
          )
          .select('+createdByOwnerUserIdSnapshot +targetOwnerUserIdSnapshot')
          .exec();
        if (!updated) throw storyCaseNotOpenError();
        if (resolution?.status === STORY_COLLABORATION_CASE_STATUSES.UPHELD) {
          await this.applyUpheldCase(updated, session);
        }
        return this.toCaseView(updated, votes);
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) throw storyCaseVoteAlreadyRecordedError();
      throw error;
    }
  }

  async appealCase(
    storyId: string,
    caseId: string,
    actor: StoryCollaborationActor,
    dto: CreateStoryRestrictionAppealDto,
  ): Promise<StoryCollaborationCaseView> {
    try {
      return await this.databaseService.$transaction(async (session) => {
        const parentCase = await this.requireCase(storyId, caseId, session);
        if (
          parentCase.caseType !== STORY_COLLABORATION_CASE_TYPES.WRITE_RESTRICTION ||
          parentCase.status !== STORY_COLLABORATION_CASE_STATUSES.UPHELD ||
          parentCase.targetAgentId !== actor.agentId ||
          !parentCase.restrictionExpiresAt ||
          parentCase.restrictionExpiresAt.getTime() <= Date.now()
        ) {
          throw storyAppealNotAllowedError();
        }
        const existingRevoke = await this.enforcementEventModel
          .findOne({
            storyId,
            sourceCaseId: parentCase.id,
            action: STORY_ENFORCEMENT_EVENT_ACTIONS.REVOKE,
          })
          .session(session)
          .exec();
        if (existingRevoke) throw storyAppealNotAllowedError();
        const appeal = await this.collaborationCaseModel.create(
          [
            {
              storyId,
              caseType: STORY_COLLABORATION_CASE_TYPES.RESTRICTION_APPEAL,
              status: STORY_COLLABORATION_CASE_STATUSES.OPEN,
              documentId: parentCase.documentId,
              revisionNumber: null,
              targetAgentId: parentCase.targetAgentId,
              noticeDiscussionId: null,
              laterConflictId: null,
              targetOwnerUserIdSnapshot: parentCase.targetOwnerUserIdSnapshot,
              evidence: [],
              recusalIdentitySnapshots: parentCase.recusalIdentitySnapshots,
              requestedRestrictionHours: null,
              parentCaseId: parentCase.id,
              reason: dto.reason,
              createdByAgentId: actor.agentId,
              createdByOwnerUserIdSnapshot: actor.ownerUserId,
              voteCount: 0,
              resolvedAt: null,
              restrictionExpiresAt: null,
            },
          ],
          { session },
        );
        const [caseRecord] = appeal;
        if (!caseRecord) throw new Error('Story restriction appeal creation returned no record');
        return this.toCaseView(caseRecord, []);
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) throw conflictAlreadyOpenError();
      throw error;
    }
  }

  async assertAgentCanEdit(
    storyId: string,
    agentId: string,
    session?: ClientSession,
    branchId: string | null = null,
    documentId: string | null = null,
  ): Promise<void> {
    if (branchId !== null || documentId === null) return;
    await this.requireStory(storyId, session);
    const expiresAt = await this.findActiveRestrictionExpiry(storyId, agentId, documentId, session);
    if (expiresAt) throw storyEditRestrictedError(expiresAt);
  }

  private async findActiveRestrictionExpiry(
    storyId: string,
    agentId: string,
    documentId: string,
    session?: ClientSession,
  ): Promise<Date | null> {
    const now = new Date();
    const eventsQuery = this.enforcementEventModel
      .find({ storyId, targetAgentId: agentId, documentId })
      .sort({ createdAt: -1, _id: -1 })
      .limit(1);
    if (session) eventsQuery.session(session);
    const latestEvent = await eventsQuery.exec();
    const event = latestEvent[0];
    return event?.action === STORY_ENFORCEMENT_EVENT_ACTIONS.RESTRICT &&
      event.expiresAt !== null &&
      event.expiresAt.getTime() > now.getTime()
      ? event.expiresAt
      : null;
  }

  async detectAndRecordEditConflict(
    storyId: string,
    documentId: string,
    actor: StoryCollaborationActor,
    session?: ClientSession,
  ): Promise<StoryEditConflictView | null> {
    return this.databaseService.runInTransaction(session, async (activeSession) => {
      const document = await this.documentModel
        .findOne({ _id: documentId, storyId })
        .session(activeSession)
        .exec();
      if (!document || document.branchId !== null) return null;
      const now = new Date();
      const cutoff = new Date(now.getTime() - STORY_EDIT_CONFLICT_WINDOW_MS);
      const revisions = await this.revisionModel
        .find({
          storyId,
          documentId,
          targetType: 'document',
          createdAt: { $gte: cutoff },
        })
        .sort({ revisionNumber: -1 })
        .limit(STORY_EDIT_CONFLICT_REVISION_COUNT)
        .session(activeSession)
        .exec();
      if (revisions.length !== STORY_EDIT_CONFLICT_REVISION_COUNT) return null;
      revisions.reverse();
      if (revisions.some((revision) => revision.diff.afterDocument?.branchId !== null)) return null;
      const identities = revisions.map((revision) => ({
        agentId: revision.authorAgentId,
        ownerUserId: revision.authorOwnerUserIdSnapshot,
        hash: revisionSnapshotHash(revision.diff.afterDocument),
      }));
      const hashes = identities.map((identity) => identity.hash);
      if (
        hashes.some((hash) => hash === null) ||
        hashes[0] === hashes[1] ||
        hashes[1] === hashes[2] ||
        hashes[2] === hashes[3] ||
        hashes[0] !== hashes[2] ||
        hashes[1] !== hashes[3] ||
        new Set(identities.map((identity) => identity.agentId)).size < 2 ||
        new Set(identities.map((identity) => identity.ownerUserId)).size < 2
      ) {
        return null;
      }
      const triggeringRevision = revisions[3];
      if (!triggeringRevision) return null;
      if (
        triggeringRevision.authorAgentId !== actor.agentId ||
        triggeringRevision.authorOwnerUserIdSnapshot !== actor.ownerUserId
      ) {
        return null;
      }
      if (document.currentVersion !== triggeringRevision.revisionNumber) return null;
      const conflict = await this.editConflictModel.create(
        [
          {
            storyId,
            documentId,
            revisionNumbers: revisions.map((revision) => revision.revisionNumber),
            actorAgentIds: [...new Set(identities.map((identity) => identity.agentId))],
            participantIdentitySnapshots: identities
              .filter(
                (identity, index) =>
                  identities.findIndex(
                    (candidate) =>
                      candidate.agentId === identity.agentId &&
                      candidate.ownerUserId === identity.ownerUserId,
                  ) === index,
              )
              .map((identity) => ({
                agentId: identity.agentId,
                ownerUserIdSnapshot: identity.ownerUserId,
              })),
            triggeringRevisionNumber: triggeringRevision.revisionNumber,
          },
        ],
        { session: activeSession },
      );
      const [record] = conflict;
      if (!record) throw new Error('Story edit conflict creation returned no record');
      return this.toConflictView(record);
    });
  }

  private async createRevisionReviewCase(
    storyId: string,
    actor: StoryCollaborationActor,
    dto: Extract<
      CreateStoryCollaborationCaseDto,
      { caseType: typeof STORY_COLLABORATION_CASE_TYPES.REVISION_REVIEW }
    >,
    session: ClientSession,
  ): Promise<StoryCollaborationCaseDocument> {
    const [revision] = await this.findEvidenceRevisions(
      storyId,
      [{ documentId: dto.documentId, revisionNumber: dto.revisionNumber }],
      session,
    );
    if (!revision) throw storyCaseTargetInvalidError();
    const [caseRecord] = await this.collaborationCaseModel.create(
      [
        {
          storyId,
          caseType: STORY_COLLABORATION_CASE_TYPES.REVISION_REVIEW,
          status: STORY_COLLABORATION_CASE_STATUSES.OPEN,
          documentId: dto.documentId,
          revisionNumber: dto.revisionNumber,
          targetAgentId: revision.authorAgentId,
          noticeDiscussionId: null,
          laterConflictId: null,
          targetOwnerUserIdSnapshot: revision.authorOwnerUserIdSnapshot,
          evidence: [this.toEvidenceSnapshot(revision)],
          requestedRestrictionHours: null,
          parentCaseId: null,
          reason: dto.reason,
          createdByAgentId: actor.agentId,
          createdByOwnerUserIdSnapshot: actor.ownerUserId,
          voteCount: 0,
          resolvedAt: null,
          restrictionExpiresAt: null,
        },
      ],
      { session },
    );
    if (!caseRecord) throw new Error('Story revision review case creation returned no record');
    return caseRecord;
  }

  private async hasOpenDuplicateCase(
    storyId: string,
    dto: CreateStoryCollaborationCaseDto,
    session: ClientSession,
  ): Promise<boolean> {
    const filter =
      dto.caseType === STORY_COLLABORATION_CASE_TYPES.REVISION_REVIEW
        ? {
            storyId,
            caseType: dto.caseType,
            documentId: dto.documentId,
            revisionNumber: dto.revisionNumber,
            status: STORY_COLLABORATION_CASE_STATUSES.OPEN,
          }
        : {
            storyId,
            caseType: dto.caseType,
            targetAgentId: dto.targetAgentId,
            documentId: dto.documentId,
            status: STORY_COLLABORATION_CASE_STATUSES.OPEN,
          };
    return (await this.collaborationCaseModel.findOne(filter).session(session).exec()) !== null;
  }

  private async createWriteRestrictionCase(
    storyId: string,
    actor: StoryCollaborationActor,
    dto: Extract<
      CreateStoryCollaborationCaseDto,
      { caseType: typeof STORY_COLLABORATION_CASE_TYPES.WRITE_RESTRICTION }
    >,
    session: ClientSession,
  ): Promise<StoryCollaborationCaseDocument> {
    if (actor.agentId === dto.targetAgentId) throw storyCaseTargetInvalidError();
    const target = await this.agentModel
      .findOne({ _id: dto.targetAgentId, deletedAt: null })
      .select('userId')
      .session(session)
      .exec();
    if (!target) throw storyCaseTargetInvalidError();
    const discussionId = this.objectId(dto.noticeDiscussionId);
    const conflictId = this.objectId(dto.laterConflictId);
    if (!discussionId || !conflictId) throw storyCaseTargetInvalidError();
    const notice = await this.discussionModel
      .findOne({
        _id: discussionId,
        storyId,
        documentId: dto.documentId,
      })
      .session(session)
      .exec();
    const noticeTargetAgentId = notice
      ? (notice as StoryDiscussion & { noticeTargetAgentId: string | null }).noticeTargetAgentId
      : null;
    if (!notice || noticeTargetAgentId !== dto.targetAgentId) throw storyCaseTargetInvalidError();
    const notification = await this.notificationModel
      .findOne({
        recipientAgentId: dto.targetAgentId,
        kind: NOTIFICATION_KINDS.MENTION,
        sourceType: NOTIFICATION_SOURCE_TYPES.STORY_DISCUSSION,
        sourceId: dto.noticeDiscussionId,
        storyId,
        documentId: dto.documentId,
        discussionId: dto.noticeDiscussionId,
      })
      .session(session)
      .exec();
    if (!notification) throw storyCaseTargetInvalidError();
    const targetResponse = await this.discussionMessageModel
      .findOne({
        storyId,
        discussionId: dto.noticeDiscussionId,
        authorAgentId: dto.targetAgentId,
        createdAt: { $gt: notification.createdAt },
      })
      .session(session)
      .exec();
    const responseWindowEnded =
      notification.createdAt.getTime() + STORY_NOTICE_RESPONSE_WINDOW_MS <= Date.now();
    if (!targetResponse && !responseWindowEnded) throw storyCaseTargetInvalidError();

    const conflict = await this.editConflictModel
      .findOne({
        _id: conflictId,
        storyId,
        documentId: dto.documentId,
        createdAt: { $gt: notice.createdAt },
        actorAgentIds: dto.targetAgentId,
      })
      .select('+participantIdentitySnapshots')
      .session(session)
      .exec();
    if (!conflict || conflict.revisionNumbers.length !== STORY_EDIT_CONFLICT_REVISION_COUNT) {
      throw storyCaseTargetInvalidError();
    }
    const evidenceReferences = conflict.revisionNumbers.map((revisionNumber) => ({
      documentId: dto.documentId,
      revisionNumber,
    }));
    const evidence = await this.findEvidenceRevisions(storyId, evidenceReferences, session);
    if (
      evidence.length !== STORY_EDIT_CONFLICT_REVISION_COUNT ||
      !evidence.some((revision) => revision.authorAgentId === dto.targetAgentId) ||
      evidence.some((revision) => revision.createdAt.getTime() <= notification.createdAt.getTime())
    ) {
      throw storyCaseTargetInvalidError();
    }
    if (
      await this.findActiveRestrictionExpiry(storyId, dto.targetAgentId, dto.documentId, session)
    ) {
      throw conflictAlreadyOpenError();
    }
    const revisionsByReference = new Map(
      evidence.map((revision) => [this.evidenceKey(revision), revision]),
    );
    const evidenceSnapshots = evidenceReferences.map((reference) => {
      const revision = revisionsByReference.get(this.evidenceKey(reference));
      if (!revision) throw storyCaseTargetInvalidError();
      return this.toEvidenceSnapshot(revision);
    });
    const recusalIdentities = new Map<string, StoryCollaborationIdentitySnapshot>();
    for (const identity of conflict.participantIdentitySnapshots) {
      recusalIdentities.set(JSON.stringify([identity.agentId, identity.ownerUserIdSnapshot]), {
        agentId: identity.agentId,
        ownerUserIdSnapshot: identity.ownerUserIdSnapshot,
      });
    }
    recusalIdentities.set(
      JSON.stringify([notice.createdByAgentId, notice.createdByOwnerUserIdSnapshot]),
      {
        agentId: notice.createdByAgentId,
        ownerUserIdSnapshot: notice.createdByOwnerUserIdSnapshot,
      },
    );
    const recusalIdentitySnapshots = [...recusalIdentities.values()];
    const [caseRecord] = await this.collaborationCaseModel.create(
      [
        {
          storyId,
          caseType: STORY_COLLABORATION_CASE_TYPES.WRITE_RESTRICTION,
          status: STORY_COLLABORATION_CASE_STATUSES.OPEN,
          documentId: dto.documentId,
          revisionNumber: null,
          targetAgentId: dto.targetAgentId,
          noticeDiscussionId: dto.noticeDiscussionId,
          laterConflictId: dto.laterConflictId,
          targetOwnerUserIdSnapshot: target.userId,
          evidence: evidenceSnapshots,
          recusalIdentitySnapshots,
          requestedRestrictionHours: 1,
          parentCaseId: null,
          reason: dto.reason,
          createdByAgentId: actor.agentId,
          createdByOwnerUserIdSnapshot: actor.ownerUserId,
          voteCount: 0,
          resolvedAt: null,
          restrictionExpiresAt: null,
        },
      ],
      { session },
    );
    if (!caseRecord) throw new Error('Story write restriction case creation returned no record');
    return caseRecord;
  }

  private async findEvidenceRevisions(
    storyId: string,
    evidence: readonly StoryCollaborationEvidenceInput[],
    session: ClientSession,
  ): Promise<RevisionReference[]> {
    const references = evidence.map((item) => ({
      documentId: this.objectId(item.documentId),
      revisionNumber: item.revisionNumber,
    }));
    if (references.some((item) => !item.documentId)) throw storyCaseTargetInvalidError();
    const revisions = await this.revisionModel
      .find({
        storyId,
        targetType: 'document',
        $or: references.map((item) => ({
          documentId: item.documentId?.toString(),
          revisionNumber: item.revisionNumber,
        })),
      })
      .session(session)
      .exec();
    return revisions.map((revision) => ({
      documentId: revision.documentId ?? '',
      revisionNumber: revision.revisionNumber,
      authorAgentId: revision.authorAgentId,
      authorOwnerUserIdSnapshot: revision.authorOwnerUserIdSnapshot,
      createdAt: revision.createdAt,
    }));
  }

  private evidenceKey(reference: StoryCollaborationEvidenceInput): string {
    return `${reference.documentId}\u0000${reference.revisionNumber}`;
  }

  private toEvidenceSnapshot(revision: RevisionReference) {
    return {
      documentId: revision.documentId,
      revisionNumber: revision.revisionNumber,
      authorAgentId: revision.authorAgentId,
      authorOwnerUserIdSnapshot: revision.authorOwnerUserIdSnapshot,
    };
  }

  private async assertEligibleVoter(
    caseRecord: StoryCollaborationCase,
    actor: StoryCollaborationActor,
    session: ClientSession,
  ): Promise<void> {
    const excluded = await this.getExcludedIdentities(caseRecord, session);
    if (excluded.agentIds.has(actor.agentId) || excluded.ownerUserIds.has(actor.ownerUserId)) {
      throw storyCaseVoteIneligibleError();
    }
    if (
      caseRecord.caseType === STORY_COLLABORATION_CASE_TYPES.WRITE_RESTRICTION ||
      caseRecord.caseType === STORY_COLLABORATION_CASE_TYPES.RESTRICTION_APPEAL
    ) {
      const sameOwnerVote = await this.collaborationVoteModel
        .findOne({ caseId: caseRecord.id, reviewerOwnerUserIdSnapshot: actor.ownerUserId })
        .select('+reviewerOwnerUserIdSnapshot')
        .session(session)
        .exec();
      if (sameOwnerVote) throw storyCaseVoteIneligibleError();
    }
  }

  private async getExcludedIdentities(
    caseRecord: StoryCollaborationCase,
    session: ClientSession,
  ): Promise<{ agentIds: Set<string>; ownerUserIds: Set<string> }> {
    const agentIds = new Set<string>();
    const ownerUserIds = new Set<string>();
    this.addCaseIdentitySnapshots(caseRecord, agentIds, ownerUserIds);
    if (caseRecord.caseType === STORY_COLLABORATION_CASE_TYPES.RESTRICTION_APPEAL) {
      const parentCase = await this.requireCase(
        caseRecord.storyId,
        caseRecord.parentCaseId ?? '',
        session,
      );
      this.addCaseIdentitySnapshots(parentCase, agentIds, ownerUserIds);
      const parentVotes = await this.collaborationVoteModel
        .find({ caseId: caseRecord.parentCaseId })
        .select('+reviewerOwnerUserIdSnapshot')
        .session(session)
        .exec();
      for (const vote of parentVotes) {
        agentIds.add(vote.reviewerAgentId);
        ownerUserIds.add(vote.reviewerOwnerUserIdSnapshot);
      }
    }
    return { agentIds, ownerUserIds };
  }

  private addCaseIdentitySnapshots(
    caseRecord: StoryCollaborationCase,
    agentIds: Set<string>,
    ownerUserIds: Set<string>,
  ): void {
    agentIds.add(caseRecord.createdByAgentId);
    ownerUserIds.add(caseRecord.createdByOwnerUserIdSnapshot);
    if (caseRecord.targetAgentId) agentIds.add(caseRecord.targetAgentId);
    if (caseRecord.targetOwnerUserIdSnapshot) {
      ownerUserIds.add(caseRecord.targetOwnerUserIdSnapshot);
    }
    for (const evidence of caseRecord.evidence) {
      agentIds.add(evidence.authorAgentId);
      ownerUserIds.add(evidence.authorOwnerUserIdSnapshot);
    }
    for (const identity of caseRecord.recusalIdentitySnapshots) {
      agentIds.add(identity.agentId);
      ownerUserIds.add(identity.ownerUserIdSnapshot);
    }
  }

  private resolveVote(
    votes: readonly StoryCollaborationVote[],
    caseType: StoryCollaborationCaseType,
  ): { status: StoryCollaborationCaseStatus } | null {
    if (
      caseType === STORY_COLLABORATION_CASE_TYPES.WRITE_RESTRICTION ||
      caseType === STORY_COLLABORATION_CASE_TYPES.RESTRICTION_APPEAL
    ) {
      if (votes.some((vote) => vote.decision === STORY_COLLABORATION_VOTE_DECISIONS.DISMISS)) {
        return { status: STORY_COLLABORATION_CASE_STATUSES.DISMISSED };
      }
      if (
        votes.length === STORY_RESTRICTION_REVIEWER_COUNT &&
        votes.every((vote) => vote.decision === STORY_COLLABORATION_VOTE_DECISIONS.UPHOLD)
      ) {
        return { status: STORY_COLLABORATION_CASE_STATUSES.UPHELD };
      }
      return null;
    }
    const upholdCount = votes.filter(
      (vote) => vote.decision === STORY_COLLABORATION_VOTE_DECISIONS.UPHOLD,
    ).length;
    const dismissCount = votes.length - upholdCount;
    if (upholdCount >= 2) return { status: STORY_COLLABORATION_CASE_STATUSES.UPHELD };
    if (dismissCount >= 2) return { status: STORY_COLLABORATION_CASE_STATUSES.DISMISSED };
    if (votes.length < STORY_COLLABORATION_MAX_VOTES) return null;
    return {
      status:
        votes.at(-1)?.decision === STORY_COLLABORATION_VOTE_DECISIONS.UPHOLD
          ? STORY_COLLABORATION_CASE_STATUSES.UPHELD
          : STORY_COLLABORATION_CASE_STATUSES.DISMISSED,
    };
  }

  private async applyUpheldCase(
    caseRecord: StoryCollaborationCase,
    session: ClientSession,
  ): Promise<void> {
    if (caseRecord.caseType === STORY_COLLABORATION_CASE_TYPES.WRITE_RESTRICTION) {
      if (
        !caseRecord.targetAgentId ||
        !caseRecord.targetOwnerUserIdSnapshot ||
        !caseRecord.restrictionExpiresAt
      ) {
        throw storyCaseTargetInvalidError();
      }
      await this.enforcementEventModel.create(
        [
          {
            storyId: caseRecord.storyId,
            targetAgentId: caseRecord.targetAgentId,
            documentId: caseRecord.documentId,
            targetOwnerUserIdSnapshot: caseRecord.targetOwnerUserIdSnapshot,
            sourceCaseId: caseRecord.id,
            action: STORY_ENFORCEMENT_EVENT_ACTIONS.RESTRICT,
            expiresAt: caseRecord.restrictionExpiresAt,
          },
        ],
        { session },
      );
      return;
    }
    if (caseRecord.caseType === STORY_COLLABORATION_CASE_TYPES.RESTRICTION_APPEAL) {
      const parentCase = await this.requireCase(
        caseRecord.storyId,
        caseRecord.parentCaseId ?? '',
        session,
      );
      if (!parentCase.targetAgentId || !parentCase.targetOwnerUserIdSnapshot) {
        throw storyCaseTargetInvalidError();
      }
      await this.enforcementEventModel.create(
        [
          {
            storyId: caseRecord.storyId,
            targetAgentId: parentCase.targetAgentId,
            documentId: parentCase.documentId,
            targetOwnerUserIdSnapshot: parentCase.targetOwnerUserIdSnapshot,
            sourceCaseId: parentCase.id,
            action: STORY_ENFORCEMENT_EVENT_ACTIONS.REVOKE,
            expiresAt: null,
          },
        ],
        { session },
      );
    }
  }

  private async requireStory(storyId: string, session?: ClientSession): Promise<Story> {
    const objectId = this.objectId(storyId);
    if (!objectId) throw storyErrors.storyNotFound();
    const query = this.storyModel.findById(objectId);
    if (session) query.session(session);
    const story = await query.exec();
    if (!story) throw storyErrors.storyNotFound();
    return story;
  }

  private async requireCase(
    storyId: string,
    caseId: string,
    session?: ClientSession,
  ): Promise<StoryCollaborationCaseDocument> {
    const objectId = this.objectId(caseId);
    if (!objectId) throw storyCaseNotFoundError();
    const query = this.collaborationCaseModel.findOne({ _id: objectId, storyId });
    query.select(
      '+createdByOwnerUserIdSnapshot +targetOwnerUserIdSnapshot +evidence.authorOwnerUserIdSnapshot +recusalIdentitySnapshots',
    );
    if (session) query.session(session);
    const caseRecord = await query.exec();
    if (!caseRecord) throw storyCaseNotFoundError();
    return caseRecord;
  }

  private toConflictView(conflict: StoryEditConflict): StoryEditConflictView {
    return {
      id: conflict.id,
      storyId: conflict.storyId,
      documentId: conflict.documentId,
      revisionNumbers: [...conflict.revisionNumbers],
      actorAgentIds: [...conflict.actorAgentIds],
      createdAt: conflict.createdAt,
    };
  }

  private toCaseView(
    caseRecord: StoryCollaborationCase,
    votes: readonly StoryCollaborationVote[],
  ): StoryCollaborationCaseView {
    return {
      id: caseRecord.id,
      storyId: caseRecord.storyId,
      caseType: caseRecord.caseType,
      status: caseRecord.status,
      documentId: caseRecord.documentId,
      revisionNumber: caseRecord.revisionNumber,
      targetAgentId: caseRecord.targetAgentId,
      noticeDiscussionId: caseRecord.noticeDiscussionId,
      laterConflictId: caseRecord.laterConflictId,
      evidence: caseRecord.evidence.map(({ documentId, revisionNumber, authorAgentId }) => ({
        documentId,
        revisionNumber,
        authorAgentId,
      })),
      parentCaseId: caseRecord.parentCaseId,
      reason: caseRecord.reason,
      createdByAgentId: caseRecord.createdByAgentId,
      createdAt: caseRecord.createdAt,
      resolvedAt: caseRecord.resolvedAt,
      restrictionExpiresAt: caseRecord.restrictionExpiresAt,
      votes: votes.map((vote) => ({
        reviewerAgentId: vote.reviewerAgentId,
        decision: vote.decision,
        reason: vote.reason,
        createdAt: vote.createdAt,
      })),
    };
  }

  private objectId(value: string): Types.ObjectId | null {
    if (!Types.ObjectId.isValid(value)) return null;
    return new Types.ObjectId(value);
  }
}
