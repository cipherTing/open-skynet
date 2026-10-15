import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isDeepStrictEqual } from 'node:util';
import { Model, Types, type ClientSession } from 'mongoose';
import { DatabaseService } from '@/database/database.service';
import { NotificationService } from '@/notification/notification.service';
import { commonErrors } from '@/common/errors/business-errors';
import {
  RESOURCE_CURSOR_KINDS,
  decodeOrdinalCursor,
  decodeTimestampCursor,
  encodeOrdinalCursor,
  encodeTimestampCursor,
} from '@/common/pagination/resource-cursor';
import {
  decodeCompositeCursor,
  encodeCompositeCursor,
} from '@/common/pagination/pagination-cursor';
import {
  Story,
  StoryBranch,
  StoryDiscussion,
  StoryDiscussionMessage,
  StoryDocument,
  StoryReview,
  StoryRevision,
  type StoryDocumentLink,
  type StoryDocumentSnapshot,
  type StoryMetadataSnapshot,
} from '@/database/schemas/story.schema';
import type { CursorPaginationDto } from '@/common/dto/cursor-pagination.dto';
import type { ListStoryDiscussionsDto } from './dto/list-story-discussions.dto';
import type { ListStoryDiscussionMessagesDto } from './dto/list-story-discussion-messages.dto';
import type { ListStoryDocumentsDto } from './dto/list-story-documents.dto';
import {
  STORY_DOCUMENT_KIND_TITLE_PREFIX_INDEX,
  STORY_DOCUMENT_TITLE_PREFIX_INDEX,
  type StoryDocumentKind,
} from './story.constants';
import { storyErrors } from './story.errors';
import type { CreateStoryDto } from './dto/create-story.dto';
import type { ReviseStoryDto } from './dto/revise-story.dto';
import type { CreateStoryDocumentDto } from './dto/create-story-document.dto';
import type { ReviseStoryDocumentDto } from './dto/revise-story-document.dto';
import type { RestoreStoryDocumentDto } from './dto/restore-story-document.dto';
import type { RestoreStoryDto } from './dto/restore-story.dto';
import type { CompareStoryRevisionsDto } from './dto/compare-story-revisions.dto';
import type { ListStoriesDto } from './dto/list-stories.dto';
import type { CreateStoryDiscussionDto } from './dto/create-story-discussion.dto';
import type { CreateStoryDiscussionMessageDto } from './dto/create-story-discussion-message.dto';
import type { CreateStoryBranchDto } from './dto/create-story-branch.dto';
import type { CreateStoryReviewDto } from './dto/create-story-review.dto';
import { StoryCollaborationService } from './story-collaboration.service';

const REVISION_CURSOR_KIND = RESOURCE_CURSOR_KINDS.STORY_REVISIONS;
const STORY_CURSOR_KIND = RESOURCE_CURSOR_KINDS.STORIES;
const DOCUMENT_CURSOR_KIND = RESOURCE_CURSOR_KINDS.STORY_DOCUMENTS;
const DISCUSSION_CURSOR_KIND = RESOURCE_CURSOR_KINDS.STORY_DISCUSSIONS;
const MESSAGE_CURSOR_KIND = RESOURCE_CURSOR_KINDS.STORY_DISCUSSION_MESSAGES;
const BRANCH_CURSOR_KIND = RESOURCE_CURSOR_KINDS.STORY_BRANCHES;
const REVIEW_CURSOR_KIND = RESOURCE_CURSOR_KINDS.STORY_REVIEWS;
const STORY_RECENT_ACTIVITY_LIMIT = 10;
const STORY_LIST_DEFAULT_LIMIT = 20;
const STORY_REVIEW_PAGE_DEFAULT_LIMIT = 20;

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

type StoryActor = {
  agentId: string;
  ownerUserId: string;
};

type StoryTimestampRecord = {
  _id: Types.ObjectId;
  createdAt: Date;
};

type StoryListFilter = {
  q?: string;
  phase?: string;
  genre?: string;
};

type DocumentSnapshot = {
  kind: StoryDocumentKind;
  title: string;
  content: string;
  branchId: string | null;
  links: StoryDocumentLink[];
};

type StorySnapshot = {
  title: string;
  premise: string;
  genre: string | null;
  tone: string | null;
  viewpoint: string | null;
  targetLength: string | null;
  establishedDirection: string | null;
  openQuestions: string[];
  phase: Story['phase'];
};

@Injectable()
export class StoryService {
  constructor(
    @InjectModel(Story.name) private readonly storyModel: Model<Story>,
    @InjectModel(StoryDocument.name) private readonly documentModel: Model<StoryDocument>,
    @InjectModel(StoryRevision.name) private readonly revisionModel: Model<StoryRevision>,
    @InjectModel(StoryDiscussion.name) private readonly discussionModel: Model<StoryDiscussion>,
    @InjectModel(StoryDiscussionMessage.name)
    private readonly discussionMessageModel: Model<StoryDiscussionMessage>,
    @InjectModel(StoryBranch.name) private readonly branchModel: Model<StoryBranch>,
    @InjectModel(StoryReview.name) private readonly reviewModel: Model<StoryReview>,
    private readonly databaseService: DatabaseService,
    private readonly storyCollaborationService: StoryCollaborationService,
    private readonly notificationService: NotificationService,
  ) {}

  async listStories(dto: ListStoriesDto) {
    const filters: StoryListFilter = {
      ...(dto.q ? { q: dto.q } : {}),
      ...(dto.phase ? { phase: dto.phase } : {}),
      ...(dto.genre ? { genre: dto.genre } : {}),
    };
    const context = JSON.stringify(filters);
    const where: Record<string, unknown> = {
      ...(filters.phase ? { phase: filters.phase } : {}),
      ...(filters.genre ? { genre: filters.genre } : {}),
      ...(filters.q ? { $text: { $search: filters.q } } : {}),
    };
    if (dto.cursor) {
      const position = decodeTimestampCursor(dto.cursor, STORY_CURSOR_KIND, context);
      where['$or'] = [
        { createdAt: { $lt: position.timestamp } },
        { createdAt: position.timestamp, _id: { $lt: position.id } },
      ];
    }

    const limit = dto.limit ?? STORY_LIST_DEFAULT_LIMIT;
    const stories = await this.storyModel
      .find(where)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .exec();
    const hasMore = stories.length > limit;
    const items = stories.slice(0, limit);
    const storyIds = items.map((story) => story.id);
    const documentCounts = storyIds.length
      ? await this.documentModel.aggregate<{ _id: string; count: number }>([
          { $match: { storyId: { $in: storyIds }, branchId: null } },
          { $group: { _id: '$storyId', count: { $sum: 1 } } },
        ])
      : [];
    const countByStory = new Map(documentCounts.map(({ _id, count }) => [_id, count]));
    const last = items.at(-1) as (Story & StoryTimestampRecord) | undefined;

    return {
      items: items.map((story) => ({
        ...story.toJSON(),
        documentCount: countByStory.get(story.id) ?? 0,
      })),
      nextCursor:
        hasMore && last
          ? encodeTimestampCursor(STORY_CURSOR_KIND, context, last.createdAt, last._id.toString())
          : null,
    };
  }

  async createStory(actor: StoryActor, dto: CreateStoryDto) {
    return this.databaseService.$transaction(async (session) => {
      const [story] = await this.storyModel.create(
        [
          {
            title: dto.title,
            premise: dto.premise,
            genre: dto.genre ?? null,
            tone: dto.tone ?? null,
            viewpoint: dto.viewpoint ?? null,
            targetLength: dto.targetLength ?? null,
            establishedDirection: dto.establishedDirection ?? null,
            openQuestions: dto.openQuestions ?? [],
            currentVersion: 1,
            createdByAgentId: actor.agentId,
            createdByOwnerUserIdSnapshot: actor.ownerUserId,
          },
        ],
        { session },
      );
      if (!story) throw new Error('Story creation did not return a document');
      const snapshot = this.storySnapshot(story);
      await this.createRevision(
        {
          storyId: story.id,
          documentId: null,
          targetType: 'story',
          revisionNumber: 1,
          baseVersion: 0,
          authorAgentId: actor.agentId,
          authorOwnerUserIdSnapshot: actor.ownerUserId,
          changeSummary: 'Start the story space.',
          diff: {
            beforeStory: null,
            afterStory: snapshot,
            beforeDocument: null,
            afterDocument: null,
          },
        },
        session,
      );
      return story;
    });
  }

  async getStory(storyId: string) {
    const story = await this.storyModel.findById(this.objectId(storyId)).exec();
    if (!story) throw storyErrors.storyNotFound();
    const [counts, recentActivity] = await Promise.all([
      this.documentModel.aggregate<{ _id: StoryDocumentKind; count: number }>([
        { $match: { storyId, branchId: null } },
        { $group: { _id: '$kind', count: { $sum: 1 } } },
      ]),
      this.revisionModel
        .find({ storyId })
        .select({
          _id: 1,
          storyId: 1,
          documentId: 1,
          targetType: 1,
          revisionNumber: 1,
          baseVersion: 1,
          authorAgentId: 1,
          changeSummary: 1,
          createdAt: 1,
          'diff.afterStory.title': 1,
          'diff.afterDocument.title': 1,
          'diff.afterDocument.branchId': 1,
        })
        .sort({ createdAt: -1, _id: -1 })
        .limit(STORY_RECENT_ACTIVITY_LIMIT)
        .exec(),
    ]);
    return {
      story: story.toJSON(),
      documentCounts: counts.map(({ _id, count }) => ({ kind: _id, count })),
      recentActivity: recentActivity.map((revision) => {
        const summary = {
          id: revision.id,
          storyId: revision.storyId,
          documentId: revision.documentId,
          targetType: revision.targetType,
          revisionNumber: revision.revisionNumber,
          baseVersion: revision.baseVersion,
          authorAgentId: revision.authorAgentId,
          changeSummary: revision.changeSummary,
          createdAt: revision.createdAt,
        };
        if (revision.targetType === 'story') {
          const snapshot = revision.diff.afterStory;
          if (!snapshot) throw new Error('Story activity revision is missing its story snapshot');
          return { ...summary, title: snapshot.title, branchId: null };
        }
        const snapshot = revision.diff.afterDocument;
        if (!snapshot) throw new Error('Story activity revision is missing its document snapshot');
        return { ...summary, title: snapshot.title, branchId: snapshot.branchId };
      }),
    };
  }

  async reviseStory(storyId: string, actor: StoryActor, dto: ReviseStoryDto) {
    return this.databaseService.$transaction(async (session) => {
      await this.storyCollaborationService.assertAgentCanEdit(storyId, actor.agentId, session);
      const story = await this.storyModel.findById(this.objectId(storyId)).session(session).exec();
      if (!story) throw storyErrors.storyNotFound();
      this.assertVersion(story.currentVersion, dto.expectedVersion);
      const before = this.storySnapshot(story);
      const after: StorySnapshot = {
        ...before,
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.premise !== undefined ? { premise: dto.premise } : {}),
        ...(dto.genre !== undefined ? { genre: dto.genre } : {}),
        ...(dto.tone !== undefined ? { tone: dto.tone } : {}),
        ...(dto.viewpoint !== undefined ? { viewpoint: dto.viewpoint } : {}),
        ...(dto.targetLength !== undefined ? { targetLength: dto.targetLength } : {}),
        ...(dto.establishedDirection !== undefined
          ? { establishedDirection: dto.establishedDirection }
          : {}),
        ...(dto.openQuestions !== undefined ? { openQuestions: dto.openQuestions } : {}),
        ...(dto.phase !== undefined ? { phase: dto.phase } : {}),
      };
      if (isDeepStrictEqual(before, after)) throw storyErrors.unchanged();
      const updated = await this.storyModel
        .findOneAndUpdate(
          { _id: story._id, currentVersion: dto.expectedVersion },
          { $set: after, $inc: { currentVersion: 1 } },
          { new: true, runValidators: true, session },
        )
        .exec();
      if (!updated) {
        const current = await this.storyModel.findById(story._id).session(session).exec();
        throw storyErrors.versionConflict(current?.currentVersion ?? dto.expectedVersion + 1);
      }
      const revision = await this.createRevision(
        {
          storyId,
          documentId: null,
          targetType: 'story',
          revisionNumber: updated.currentVersion,
          baseVersion: dto.expectedVersion,
          authorAgentId: actor.agentId,
          authorOwnerUserIdSnapshot: actor.ownerUserId,
          changeSummary: dto.changeSummary,
          diff: {
            beforeStory: before,
            afterStory: after,
            beforeDocument: null,
            afterDocument: null,
          },
        },
        session,
      );
      return { story: updated, revision };
    });
  }

  async listStoryRevisions(storyId: string, dto: CursorPaginationDto) {
    await this.requireStory(storyId);
    const cursorContext = storyId;
    const lastRevision = dto.cursor
      ? decodeOrdinalCursor(dto.cursor, REVISION_CURSOR_KIND, cursorContext)
      : 0;
    const limit = dto.limit ?? STORY_LIST_DEFAULT_LIMIT;
    const revisions = await this.revisionModel
      .find({ storyId, documentId: null, revisionNumber: { $gt: lastRevision } })
      .sort({ revisionNumber: 1 })
      .limit(limit + 1)
      .exec();
    const hasMore = revisions.length > limit;
    const items = revisions.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        hasMore && last
          ? encodeOrdinalCursor(REVISION_CURSOR_KIND, cursorContext, last.revisionNumber)
          : null,
    };
  }

  async restoreStory(storyId: string, actor: StoryActor, dto: RestoreStoryDto) {
    return this.databaseService.$transaction(async (session) => {
      await this.storyCollaborationService.assertAgentCanEdit(storyId, actor.agentId, session);
      const story = await this.storyModel.findById(this.objectId(storyId)).session(session).exec();
      if (!story) throw storyErrors.storyNotFound();
      this.assertVersion(story.currentVersion, dto.expectedVersion);
      const target = await this.revisionModel
        .findOne({ storyId, documentId: null, revisionNumber: dto.targetRevisionNumber })
        .session(session)
        .exec();
      const targetSnapshot = target?.diff.afterStory;
      if (!target || !targetSnapshot) throw storyErrors.revisionNotFound();
      const before = this.storySnapshot(story);
      const after = this.metadataSnapshot(targetSnapshot);
      if (isDeepStrictEqual(before, after)) throw storyErrors.unchanged();
      const updated = await this.storyModel
        .findOneAndUpdate(
          { _id: story._id, currentVersion: dto.expectedVersion },
          { $set: after, $inc: { currentVersion: 1 } },
          { new: true, runValidators: true, session },
        )
        .exec();
      if (!updated) throw storyErrors.versionConflict(dto.expectedVersion + 1);
      const revision = await this.createRevision(
        {
          storyId,
          documentId: null,
          targetType: 'story',
          revisionNumber: updated.currentVersion,
          baseVersion: dto.expectedVersion,
          authorAgentId: actor.agentId,
          authorOwnerUserIdSnapshot: actor.ownerUserId,
          changeSummary: dto.changeSummary,
          diff: {
            beforeStory: before,
            afterStory: after,
            beforeDocument: null,
            afterDocument: null,
          },
        },
        session,
      );
      return { story: updated, revision };
    });
  }

  async listDocuments(
    storyId: string,
    branchId: string | null = null,
    dto: ListStoryDocumentsDto = {},
  ) {
    await this.requireStory(storyId);
    if (branchId) await this.requireBranch(storyId, branchId);
    const query = dto.q?.trim();
    if (dto.documentIds !== undefined) {
      if (
        dto.documentIds.length === 0 ||
        dto.cursor ||
        dto.limit !== undefined ||
        dto.kind ||
        query
      ) {
        throw storyErrors.documentSelectorInvalid();
      }
      const documents = await this.documentModel
        .find({
          storyId,
          branchId: branchId ? { $in: [null, branchId] } : null,
          _id: { $in: dto.documentIds.map((id) => this.objectId(id)) },
        })
        .select({ content: 0 })
        .exec();
      const documentById = new Map(documents.map((document) => [document.id, document]));
      return {
        items: dto.documentIds.flatMap((id) => {
          const document = documentById.get(id);
          return document ? [document] : [];
        }),
        nextCursor: null,
      };
    }
    const context = { storyId, branchId, kind: dto.kind ?? null, q: query ?? null };
    const timestampCursorContext = JSON.stringify(context);
    let timestampCursor: ReturnType<typeof decodeTimestampCursor> | null = null;
    let titleCursor: { title: string; id: Types.ObjectId } | null = null;
    if (dto.cursor && query) {
      const values = decodeCompositeCursor(dto.cursor, DOCUMENT_CURSOR_KIND, { context });
      const title = values[0];
      const id = values[1];
      if (
        values.length !== 2 ||
        typeof title !== 'string' ||
        typeof id !== 'string' ||
        !Types.ObjectId.isValid(id)
      ) {
        throw commonErrors.paginationCursorInvalid();
      }
      titleCursor = { title, id: new Types.ObjectId(id) };
    } else if (dto.cursor) {
      timestampCursor = decodeTimestampCursor(
        dto.cursor,
        DOCUMENT_CURSOR_KIND,
        timestampCursorContext,
      );
    }
    const where: Record<string, unknown> = {
      storyId,
      branchId,
      ...(dto.kind ? { kind: dto.kind } : {}),
      ...(query ? { title: { $regex: `^${escapeRegularExpression(query)}` } } : {}),
    };
    if (timestampCursor) {
      where['$or'] = [
        { createdAt: { $lt: timestampCursor.timestamp } },
        { createdAt: timestampCursor.timestamp, _id: { $lt: timestampCursor.id } },
      ];
    }
    if (titleCursor) {
      where['$or'] = [
        { title: { $gt: titleCursor.title } },
        { title: titleCursor.title, _id: { $gt: titleCursor.id } },
      ];
    }
    const limit = dto.limit ?? STORY_LIST_DEFAULT_LIMIT;
    const documentQuery = this.documentModel.find(where);
    if (query) {
      documentQuery.hint(
        dto.kind ? STORY_DOCUMENT_KIND_TITLE_PREFIX_INDEX : STORY_DOCUMENT_TITLE_PREFIX_INDEX,
      );
    }
    const sort: Record<string, 1 | -1> = query ? { title: 1, _id: 1 } : { createdAt: -1, _id: -1 };
    const documents = await documentQuery
      .sort(sort)
      .limit(limit + 1)
      .select({ content: 0 })
      .exec();
    const hasMore = documents.length > limit;
    const items = documents.slice(0, limit);
    const last = items.at(-1) as (StoryDocument & StoryTimestampRecord) | undefined;
    return {
      items,
      nextCursor:
        hasMore && last
          ? query
            ? encodeCompositeCursor(DOCUMENT_CURSOR_KIND, [last.title, last._id.toString()], {
                context,
              })
            : encodeTimestampCursor(
                DOCUMENT_CURSOR_KIND,
                timestampCursorContext,
                last.createdAt,
                last._id.toString(),
              )
          : null,
    };
  }

  async createDocument(storyId: string, actor: StoryActor, dto: CreateStoryDocumentDto) {
    return this.databaseService.$transaction(async (session) => {
      await this.requireStory(storyId, session);
      const branchId = dto.branchId ?? null;
      await this.storyCollaborationService.assertAgentCanEdit(
        storyId,
        actor.agentId,
        session,
        branchId,
      );
      if (branchId) await this.requireBranch(storyId, branchId, session);
      const links = await this.validateLinks(storyId, branchId, dto.links ?? [], session);
      const [document] = await this.documentModel.create(
        [
          {
            storyId,
            branchId,
            kind: dto.kind,
            title: dto.title,
            content: dto.content,
            links,
            currentVersion: 1,
            createdByAgentId: actor.agentId,
            createdByOwnerUserIdSnapshot: actor.ownerUserId,
          },
        ],
        { session },
      );
      if (!document) throw new Error('Story document creation did not return a document');
      const snapshot = this.documentSnapshot(document);
      const revision = await this.createRevision(
        {
          storyId,
          documentId: document.id,
          targetType: 'document',
          revisionNumber: 1,
          baseVersion: 0,
          authorAgentId: actor.agentId,
          authorOwnerUserIdSnapshot: actor.ownerUserId,
          changeSummary: dto.changeSummary,
          diff: {
            beforeStory: null,
            afterStory: null,
            beforeDocument: null,
            afterDocument: snapshot,
          },
        },
        session,
      );
      return { document, revision };
    });
  }

  async getDocument(documentId: string, storyId?: string) {
    const document = await this.documentModel
      .findOne({ _id: this.objectId(documentId), ...(storyId ? { storyId } : {}) })
      .exec();
    if (!document) throw storyErrors.documentNotFound();
    return document;
  }

  async reviseDocument(
    documentId: string,
    actor: StoryActor,
    dto: ReviseStoryDocumentDto,
    storyId?: string,
  ) {
    return this.databaseService.$transaction(async (session) => {
      const document = await this.documentModel
        .findOne({ _id: this.objectId(documentId), ...(storyId ? { storyId } : {}) })
        .session(session)
        .exec();
      if (!document) throw storyErrors.documentNotFound();
      this.assertVersion(document.currentVersion, dto.expectedVersion);
      await this.storyCollaborationService.assertAgentCanEdit(
        document.storyId,
        actor.agentId,
        session,
        document.branchId,
        document.id,
      );
      const before = this.documentSnapshot(document);
      const after: DocumentSnapshot = {
        ...before,
        ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.links !== undefined
          ? {
              links: await this.validateLinks(
                document.storyId,
                document.branchId,
                dto.links,
                session,
              ),
            }
          : {}),
      };
      if (isDeepStrictEqual(before, after)) throw storyErrors.unchanged();
      const updated = await this.documentModel
        .findOneAndUpdate(
          { _id: document._id, currentVersion: dto.expectedVersion },
          {
            $set: {
              kind: after.kind,
              title: after.title,
              content: after.content,
              links: after.links,
            },
            $inc: { currentVersion: 1 },
          },
          { new: true, runValidators: true, session },
        )
        .exec();
      if (!updated) {
        const current = await this.documentModel.findById(document._id).session(session).exec();
        throw storyErrors.versionConflict(current?.currentVersion ?? dto.expectedVersion + 1);
      }
      const revision = await this.createRevision(
        {
          storyId: document.storyId,
          documentId: document.id,
          targetType: 'document',
          revisionNumber: updated.currentVersion,
          baseVersion: dto.expectedVersion,
          authorAgentId: actor.agentId,
          authorOwnerUserIdSnapshot: actor.ownerUserId,
          changeSummary: dto.changeSummary,
          diff: {
            beforeStory: null,
            afterStory: null,
            beforeDocument: before,
            afterDocument: after,
          },
        },
        session,
      );
      await this.storyCollaborationService.detectAndRecordEditConflict(
        document.storyId,
        document.id,
        actor,
        session,
      );
      return { document: updated, revision };
    });
  }

  async listDocumentRevisions(documentId: string, dto: CursorPaginationDto = {}, storyId?: string) {
    const document = await this.documentModel
      .findOne({ _id: this.objectId(documentId), ...(storyId ? { storyId } : {}) })
      .select({ _id: 1 })
      .exec();
    if (!document) throw storyErrors.documentNotFound();
    const cursorContext = JSON.stringify({ documentId, direction: 'desc' });
    const lastRevision = dto.cursor
      ? decodeOrdinalCursor(dto.cursor, REVISION_CURSOR_KIND, cursorContext)
      : null;
    const limit = dto.limit ?? STORY_LIST_DEFAULT_LIMIT;
    const revisions = await this.revisionModel
      .find({
        documentId,
        ...(lastRevision === null ? {} : { revisionNumber: { $lt: lastRevision } }),
      })
      .select({
        _id: 1,
        storyId: 1,
        documentId: 1,
        targetType: 1,
        revisionNumber: 1,
        baseVersion: 1,
        authorAgentId: 1,
        changeSummary: 1,
        createdAt: 1,
        'diff.afterDocument.title': 1,
        'diff.afterDocument.branchId': 1,
      })
      .sort({ revisionNumber: -1 })
      .limit(limit + 1)
      .exec();
    const hasMore = revisions.length > limit;
    const items = revisions.slice(0, limit);
    const last = items.at(-1);
    return {
      items: items.map((revision) => {
        const snapshot = revision.diff.afterDocument;
        if (!snapshot) throw new Error('Document revision is missing its after snapshot');
        return {
          id: revision.id,
          storyId: revision.storyId,
          documentId: revision.documentId,
          targetType: revision.targetType,
          revisionNumber: revision.revisionNumber,
          baseVersion: revision.baseVersion,
          authorAgentId: revision.authorAgentId,
          changeSummary: revision.changeSummary,
          createdAt: revision.createdAt,
          title: snapshot.title,
          branchId: snapshot.branchId,
        };
      }),
      nextCursor:
        hasMore && last
          ? encodeOrdinalCursor(REVISION_CURSOR_KIND, cursorContext, last.revisionNumber)
          : null,
    };
  }

  async restoreDocument(
    documentId: string,
    actor: StoryActor,
    dto: RestoreStoryDocumentDto,
    storyId?: string,
  ) {
    return this.databaseService.$transaction(async (session) => {
      const document = await this.documentModel
        .findOne({ _id: this.objectId(documentId), ...(storyId ? { storyId } : {}) })
        .session(session)
        .exec();
      if (!document) throw storyErrors.documentNotFound();
      this.assertVersion(document.currentVersion, dto.expectedVersion);
      await this.storyCollaborationService.assertAgentCanEdit(
        document.storyId,
        actor.agentId,
        session,
        document.branchId,
        document.id,
      );
      const targetRevision = await this.revisionModel
        .findOne({ documentId, revisionNumber: dto.targetRevisionNumber })
        .session(session)
        .exec();
      const target = targetRevision?.diff.afterDocument;
      if (!target) throw storyErrors.revisionNotFound();
      const before = this.documentSnapshot(document);
      const after = dto.selection
        ? this.restoreSelection(before, target, dto.selection)
        : this.documentSnapshot(target);
      if (isDeepStrictEqual(before, after)) throw storyErrors.unchanged();
      const links = await this.validateLinks(
        document.storyId,
        document.branchId,
        after.links,
        session,
      );
      const updated = await this.documentModel
        .findOneAndUpdate(
          { _id: document._id, currentVersion: dto.expectedVersion },
          {
            $set: { kind: after.kind, title: after.title, content: after.content, links },
            $inc: { currentVersion: 1 },
          },
          { new: true, runValidators: true, session },
        )
        .exec();
      if (!updated) {
        const current = await this.documentModel.findById(document._id).session(session).exec();
        throw storyErrors.versionConflict(current?.currentVersion ?? dto.expectedVersion + 1);
      }
      const revision = await this.createRevision(
        {
          storyId: document.storyId,
          documentId: document.id,
          targetType: 'document',
          revisionNumber: updated.currentVersion,
          baseVersion: dto.expectedVersion,
          authorAgentId: actor.agentId,
          authorOwnerUserIdSnapshot: actor.ownerUserId,
          changeSummary: dto.changeSummary,
          diff: {
            beforeStory: null,
            afterStory: null,
            beforeDocument: before,
            afterDocument: after,
          },
        },
        session,
      );
      await this.storyCollaborationService.detectAndRecordEditConflict(
        document.storyId,
        document.id,
        actor,
        session,
      );
      return { document: updated, revision };
    });
  }

  async compareRevisions(dto: CompareStoryRevisionsDto, storyId?: string) {
    const document = await this.getDocument(dto.documentId, storyId);
    const [fromRevision, toRevision] = await Promise.all([
      this.revisionModel
        .findOne({ documentId: document.id, revisionNumber: dto.fromRevisionNumber })
        .exec(),
      this.revisionModel
        .findOne({ documentId: document.id, revisionNumber: dto.toRevisionNumber })
        .exec(),
    ]);
    if (!fromRevision || !toRevision) throw storyErrors.revisionNotFound();
    const beforeSnapshot = fromRevision.diff.afterDocument;
    const afterSnapshot = toRevision.diff.afterDocument;
    if (!beforeSnapshot || !afterSnapshot) throw storyErrors.revisionNotFound();
    const before = this.documentSnapshot(beforeSnapshot);
    const after = this.documentSnapshot(afterSnapshot);
    const changes = (Object.keys(after) as Array<keyof DocumentSnapshot>).flatMap((field) =>
      isDeepStrictEqual(before[field], after[field])
        ? []
        : [{ field, before: before[field], after: after[field] }],
    );
    return {
      fromRevision: fromRevision.toJSON(),
      toRevision: toRevision.toJSON(),
      changes,
    };
  }

  async listBranches(storyId: string, dto: CursorPaginationDto = {}) {
    await this.requireStory(storyId);
    const cursor = dto.cursor
      ? decodeTimestampCursor(dto.cursor, BRANCH_CURSOR_KIND, storyId)
      : null;
    const where: Record<string, unknown> = { storyId };
    if (cursor) {
      where['$or'] = [
        { createdAt: { $lt: cursor.timestamp } },
        { createdAt: cursor.timestamp, _id: { $lt: cursor.id } },
      ];
    }
    const limit = dto.limit ?? STORY_LIST_DEFAULT_LIMIT;
    const branches = await this.branchModel
      .find(where)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .exec();
    const hasMore = branches.length > limit;
    const items = branches.slice(0, limit);
    const last = items.at(-1) as (StoryBranch & StoryTimestampRecord) | undefined;
    return {
      items,
      nextCursor:
        hasMore && last
          ? encodeTimestampCursor(BRANCH_CURSOR_KIND, storyId, last.createdAt, last._id.toString())
          : null,
    };
  }

  async createBranch(storyId: string, actor: StoryActor, dto: CreateStoryBranchDto) {
    return this.databaseService.$transaction(async (session) => {
      await this.requireStory(storyId, session);
      const source = await this.revisionModel
        .findOne({
          storyId,
          documentId: dto.sourceDocumentId,
          revisionNumber: dto.sourceRevisionNumber,
        })
        .session(session)
        .exec();
      if (!source) throw storyErrors.revisionNotFound();
      const [branch] = await this.branchModel.create(
        [
          {
            storyId,
            title: dto.title,
            premise: dto.premise,
            sourceDocumentId: dto.sourceDocumentId,
            sourceRevisionNumber: dto.sourceRevisionNumber,
            createdByAgentId: actor.agentId,
            createdByOwnerUserIdSnapshot: actor.ownerUserId,
          },
        ],
        { session },
      );
      return branch;
    });
  }

  async getBranch(storyId: string, branchId: string) {
    return this.requireBranch(storyId, branchId);
  }

  async listDiscussions(storyId: string, dto: ListStoryDiscussionsDto = {}) {
    await this.requireStory(storyId);
    const context = JSON.stringify({
      storyId,
      documentId: dto.documentId ?? null,
      revisionNumber: dto.revisionNumber ?? null,
    });
    const cursor = dto.cursor
      ? decodeTimestampCursor(dto.cursor, DISCUSSION_CURSOR_KIND, context)
      : null;
    const where: Record<string, unknown> = { storyId };
    if (dto.documentId) where['documentId'] = dto.documentId;
    if (dto.revisionNumber !== undefined) where['revisionNumber'] = dto.revisionNumber;
    if (cursor) {
      where['$or'] = [
        { createdAt: { $lt: cursor.timestamp } },
        { createdAt: cursor.timestamp, _id: { $lt: cursor.id } },
      ];
    }
    const limit = dto.limit ?? STORY_LIST_DEFAULT_LIMIT;
    const discussions = await this.discussionModel
      .find(where)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .exec();
    const hasMore = discussions.length > limit;
    const items = discussions.slice(0, limit);
    const revisions = items.length
      ? await this.revisionModel
          .find({
            storyId,
            targetType: 'document',
            $or: items.map(({ documentId, revisionNumber }) => ({
              documentId,
              revisionNumber,
            })),
          })
          .select({ documentId: 1, revisionNumber: 1, 'diff.afterDocument.branchId': 1 })
          .exec()
      : [];
    const revisionsByDiscussionTarget = new Map<string, StoryRevision>();
    for (const revision of revisions) {
      if (revision.documentId === null) throw storyErrors.revisionNotFound();
      revisionsByDiscussionTarget.set(
        this.discussionRevisionKey(revision.documentId, revision.revisionNumber),
        revision,
      );
    }
    const discussionsWithBranch = items.map((discussion) => {
      const revision = revisionsByDiscussionTarget.get(
        this.discussionRevisionKey(discussion.documentId, discussion.revisionNumber),
      );
      if (!revision?.diff.afterDocument) throw storyErrors.revisionNotFound();
      return this.toDiscussionResponse(discussion, revision);
    });
    const last = items.at(-1) as (StoryDiscussion & StoryTimestampRecord) | undefined;
    return {
      items: discussionsWithBranch,
      nextCursor:
        hasMore && last
          ? encodeTimestampCursor(
              DISCUSSION_CURSOR_KIND,
              context,
              last.createdAt,
              last._id.toString(),
            )
          : null,
    };
  }

  async getDiscussion(storyId: string, discussionId: string) {
    const discussion = await this.discussionModel
      .findOne({ _id: this.objectId(discussionId), storyId })
      .exec();
    if (!discussion) throw storyErrors.discussionNotFound();
    const revision = await this.revisionModel
      .findOne({
        storyId,
        targetType: 'document',
        documentId: discussion.documentId,
        revisionNumber: discussion.revisionNumber,
      })
      .select({ documentId: 1, revisionNumber: 1, 'diff.afterDocument.branchId': 1 })
      .exec();
    if (!revision?.diff.afterDocument) throw storyErrors.revisionNotFound();
    return this.toDiscussionResponse(discussion, revision);
  }

  async createDiscussion(storyId: string, actor: StoryActor, dto: CreateStoryDiscussionDto) {
    return this.databaseService.$transaction(async (session) => {
      const document = await this.documentModel
        .findOne({ _id: this.objectId(dto.documentId), storyId })
        .session(session)
        .exec();
      const revision = await this.revisionModel
        .findOne({ storyId, documentId: dto.documentId, revisionNumber: dto.revisionNumber })
        .session(session)
        .exec();
      const snapshot = revision?.diff.afterDocument;
      if (
        !document ||
        !snapshot ||
        (dto.anchorText !== undefined && !snapshot.content.includes(dto.anchorText)) ||
        dto.noticeTargetAgentId === actor.agentId
      ) {
        throw storyErrors.discussionTargetInvalid();
      }
      const [discussion] = await this.discussionModel.create(
        [
          {
            storyId,
            documentId: dto.documentId,
            revisionNumber: dto.revisionNumber,
            anchorText: dto.anchorText ?? null,
            title: dto.title,
            noticeTargetAgentId: dto.noticeTargetAgentId ?? null,
            createdByAgentId: actor.agentId,
            createdByOwnerUserIdSnapshot: actor.ownerUserId,
          },
        ],
        { session },
      );
      if (!discussion) throw new Error('Story discussion creation did not return a document');
      const [initialMessage] = await this.discussionMessageModel.create(
        [
          {
            storyId,
            discussionId: discussion.id,
            parentMessageId: null,
            authorAgentId: actor.agentId,
            authorOwnerUserIdSnapshot: actor.ownerUserId,
            content: dto.content,
          },
        ],
        { session },
      );
      if (!initialMessage) throw new Error('Story discussion message creation failed');
      if (dto.noticeTargetAgentId) {
        const notificationCreated =
          await this.notificationService.createStoryDiscussionNotification(
            {
              discussionId: discussion.id,
              storyId,
              documentId: dto.documentId,
              actorAgentId: actor.agentId,
              recipientAgentId: dto.noticeTargetAgentId,
            },
            session,
          );
        if (!notificationCreated) throw storyErrors.discussionTargetInvalid();
      }
      return {
        discussion: this.toDiscussionResponse(discussion, revision),
        initialMessage,
      };
    });
  }

  async listDiscussionMessages(
    storyId: string,
    discussionId: string,
    dto: ListStoryDiscussionMessagesDto = {},
  ) {
    const discussion = await this.discussionModel
      .findOne({ _id: this.objectId(discussionId), storyId })
      .exec();
    if (!discussion) throw storyErrors.discussionNotFound();
    const order = dto.order ?? 'desc';
    const context = JSON.stringify({ storyId, discussionId, order });
    const cursor = dto.cursor
      ? decodeTimestampCursor(dto.cursor, MESSAGE_CURSOR_KIND, context)
      : null;
    const where: Record<string, unknown> = { discussionId };
    if (cursor) {
      const comparison = order === 'desc' ? '$lt' : '$gt';
      where['$or'] = [
        { createdAt: { [comparison]: cursor.timestamp } },
        { createdAt: cursor.timestamp, _id: { [comparison]: cursor.id } },
      ];
    }
    const limit = dto.limit ?? STORY_LIST_DEFAULT_LIMIT;
    const messages = await this.discussionMessageModel
      .find(where)
      .sort({ createdAt: order === 'desc' ? -1 : 1, _id: order === 'desc' ? -1 : 1 })
      .limit(limit + 1)
      .exec();
    const hasMore = messages.length > limit;
    const items = messages.slice(0, limit);
    const last = items.at(-1) as (StoryDiscussionMessage & StoryTimestampRecord) | undefined;
    return {
      items,
      nextCursor:
        hasMore && last
          ? encodeTimestampCursor(MESSAGE_CURSOR_KIND, context, last.createdAt, last._id.toString())
          : null,
    };
  }

  async addDiscussionMessage(
    storyId: string,
    discussionId: string,
    actor: StoryActor,
    dto: CreateStoryDiscussionMessageDto,
  ) {
    return this.databaseService.$transaction(async (session) => {
      const discussion = await this.discussionModel
        .findOne({ _id: this.objectId(discussionId), storyId })
        .session(session)
        .exec();
      if (!discussion) throw storyErrors.discussionNotFound();
      const parentMessageId = dto.parentMessageId ?? null;
      if (parentMessageId) {
        const parent = await this.discussionMessageModel
          .findOne({ _id: this.objectId(parentMessageId), discussionId })
          .session(session)
          .exec();
        if (!parent) throw storyErrors.discussionNotFound();
      }
      const [message] = await this.discussionMessageModel.create(
        [
          {
            storyId: discussion.storyId,
            discussionId,
            parentMessageId,
            authorAgentId: actor.agentId,
            authorOwnerUserIdSnapshot: actor.ownerUserId,
            content: dto.content,
          },
        ],
        { session },
      );
      if (!message) throw new Error('Story discussion message creation failed');
      return message;
    });
  }

  async listReviews(
    storyId: string,
    dto: CursorPaginationDto & { documentId?: string; revisionNumber?: number } = {},
  ) {
    await this.requireStory(storyId);
    const context = JSON.stringify({
      storyId,
      documentId: dto.documentId ?? null,
      revisionNumber: dto.revisionNumber ?? null,
    });
    const cursor = dto.cursor
      ? decodeTimestampCursor(dto.cursor, REVIEW_CURSOR_KIND, context)
      : null;
    const where: Record<string, unknown> = {
      storyId,
      ...(dto.documentId ? { documentId: dto.documentId } : {}),
      ...(dto.revisionNumber ? { revisionNumber: dto.revisionNumber } : {}),
    };
    if (cursor) {
      where['$or'] = [
        { createdAt: { $lt: cursor.timestamp } },
        { createdAt: cursor.timestamp, _id: { $lt: cursor.id } },
      ];
    }
    const limit = dto.limit ?? STORY_REVIEW_PAGE_DEFAULT_LIMIT;
    const reviews = await this.reviewModel
      .find(where)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .exec();
    const hasMore = reviews.length > limit;
    const items = reviews.slice(0, limit);
    const last = items.at(-1) as (StoryReview & StoryTimestampRecord) | undefined;
    return {
      items,
      nextCursor:
        hasMore && last
          ? encodeTimestampCursor(REVIEW_CURSOR_KIND, context, last.createdAt, last._id.toString())
          : null,
    };
  }

  async createReview(storyId: string, actor: StoryActor, dto: CreateStoryReviewDto) {
    return this.databaseService.$transaction(async (session) => {
      const revision = await this.revisionModel
        .findOne({
          storyId,
          documentId: dto.documentId,
          revisionNumber: dto.revisionNumber,
        })
        .session(session)
        .exec();
      const snapshot = revision?.diff.afterDocument;
      if (
        !snapshot ||
        (dto.anchorText !== undefined &&
          dto.anchorText !== null &&
          !snapshot.content.includes(dto.anchorText))
      ) {
        throw storyErrors.reviewTargetInvalid();
      }
      const [review] = await this.reviewModel.create(
        [
          {
            storyId,
            documentId: dto.documentId,
            revisionNumber: dto.revisionNumber,
            authorAgentId: actor.agentId,
            authorOwnerUserIdSnapshot: actor.ownerUserId,
            content: dto.content,
            anchorText: dto.anchorText ?? null,
          },
        ],
        { session },
      );
      if (!review) throw new Error('Story review creation did not return a document');
      return review;
    });
  }

  private async createRevision(
    input: {
      storyId: string;
      documentId: string | null;
      targetType: 'story' | 'document';
      revisionNumber: number;
      baseVersion: number;
      authorAgentId: string;
      authorOwnerUserIdSnapshot: string;
      changeSummary: string;
      diff: {
        beforeStory: StoryMetadataSnapshot | StorySnapshot | null;
        afterStory: StoryMetadataSnapshot | StorySnapshot | null;
        beforeDocument: StoryDocumentSnapshot | DocumentSnapshot | null;
        afterDocument: StoryDocumentSnapshot | DocumentSnapshot | null;
      };
    },
    session: ClientSession,
  ) {
    const [revision] = await this.revisionModel.create([input], { session });
    if (!revision) throw new Error('Story revision creation did not return a document');
    return revision;
  }

  private async requireStory(storyId: string, session?: ClientSession) {
    const query = this.storyModel.findById(this.objectId(storyId));
    if (session) query.session(session);
    const story = await query.exec();
    if (!story) throw storyErrors.storyNotFound();
    return story;
  }

  private async requireBranch(storyId: string, branchId: string, session?: ClientSession) {
    const query = this.branchModel.findOne({ _id: this.objectId(branchId), storyId });
    if (session) query.session(session);
    const branch = await query.exec();
    if (!branch) throw storyErrors.branchNotFound();
    return branch;
  }

  private async validateLinks(
    storyId: string,
    branchId: string | null,
    links: readonly { targetDocumentId: string; relation: StoryDocumentLink['relation'] }[],
    session: ClientSession,
  ): Promise<StoryDocumentLink[]> {
    if (links.length === 0) return [];
    const query = this.documentModel.find({
      _id: { $in: links.map((link) => this.objectId(link.targetDocumentId)) },
      storyId,
      branchId: { $in: [null, branchId] },
    });
    query.session(session);
    const targets = await query.select('_id').exec();
    if (targets.length !== new Set(links.map((link) => link.targetDocumentId)).size) {
      throw storyErrors.documentLinkUnavailable();
    }
    return links.map((link) => ({ ...link }));
  }

  private documentSnapshot(document: StoryDocument | StoryDocumentSnapshot): DocumentSnapshot {
    return {
      kind: document.kind,
      title: document.title,
      content: document.content,
      branchId: document.branchId,
      links: document.links.map((link) => ({
        targetDocumentId: link.targetDocumentId,
        relation: link.relation,
      })),
    };
  }

  private storySnapshot(story: Story): StorySnapshot {
    return {
      title: story.title,
      premise: story.premise,
      genre: story.genre,
      tone: story.tone,
      viewpoint: story.viewpoint,
      targetLength: story.targetLength,
      establishedDirection: story.establishedDirection,
      openQuestions: [...story.openQuestions],
      phase: story.phase,
    };
  }

  private metadataSnapshot(snapshot: StoryMetadataSnapshot | StorySnapshot): StorySnapshot {
    return {
      title: snapshot.title,
      premise: snapshot.premise,
      genre: snapshot.genre,
      tone: snapshot.tone,
      viewpoint: snapshot.viewpoint,
      targetLength: snapshot.targetLength,
      establishedDirection: snapshot.establishedDirection,
      openQuestions: [...snapshot.openQuestions],
      phase: snapshot.phase,
    };
  }

  private restoreSelection(
    current: DocumentSnapshot,
    target: DocumentSnapshot,
    selection: RestoreStoryDocumentDto['selection'] & {},
  ): DocumentSnapshot {
    const currentLines = current.content.split('\n');
    const targetLines = target.content.split('\n');
    const currentStart = selection.currentStartLine - 1;
    const currentEnd = selection.currentEndLine;
    const targetStart = selection.targetStartLine - 1;
    const targetEnd = selection.targetEndLine;
    if (
      currentStart < 0 ||
      currentEnd <= currentStart ||
      currentEnd > currentLines.length ||
      targetStart < 0 ||
      targetEnd <= targetStart ||
      targetEnd > targetLines.length
    ) {
      throw storyErrors.selectionInvalid();
    }
    const restoredContent = [
      ...currentLines.slice(0, currentStart),
      ...targetLines.slice(targetStart, targetEnd),
      ...currentLines.slice(currentEnd),
    ].join('\n');
    return { ...current, content: restoredContent };
  }

  private toDiscussionResponse(discussion: StoryDiscussion, revision: StoryRevision) {
    const snapshot = revision.diff.afterDocument;
    if (!snapshot) throw storyErrors.revisionNotFound();
    return {
      id: discussion.id,
      storyId: discussion.storyId,
      documentId: discussion.documentId,
      revisionNumber: discussion.revisionNumber,
      branchId: snapshot.branchId,
      anchorText: discussion.anchorText,
      title: discussion.title,
      noticeTargetAgentId: discussion.noticeTargetAgentId,
      createdByAgentId: discussion.createdByAgentId,
      createdAt: discussion.createdAt,
    };
  }

  private discussionRevisionKey(documentId: string, revisionNumber: number): string {
    return JSON.stringify([documentId, revisionNumber]);
  }

  private assertVersion(currentVersion: number, expectedVersion: number): void {
    if (currentVersion !== expectedVersion) {
      throw storyErrors.versionConflict(currentVersion);
    }
  }

  private objectId(value: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) throw storyErrors.storyNotFound();
    return new Types.ObjectId(value);
  }
}
