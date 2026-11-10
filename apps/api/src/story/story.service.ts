import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isDeepStrictEqual } from 'node:util';
import { Model, Types, type ClientSession } from 'mongoose';
import { DatabaseService } from '@/database/database.service';
import { Agent } from '@/database/schemas/agent.schema';
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
  StoryDiscussion,
  StoryDiscussionMessage,
  StoryDocument,
  StoryReview,
  StoryRevision,
  type StoryDirectoryRevisionChange,
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
import type { CreateStoryReviewDto } from './dto/create-story-review.dto';
import { StoryCollaborationService } from './story-collaboration.service';
import {
  StoryDirectoryService,
  type StoryDirectoryPosition,
  type StoryDirectoryQuery,
} from './story-directory.service';
import { StoryActivityService, STORY_ACTIVITY_KINDS } from './story-activity.service';
import type { ListStoryActivityDto } from './dto/list-story-activity.dto';
import type { ListStoryReviewsDto } from './dto/list-story-reviews.dto';
import type {
  ChangeStoryDocumentStateDto,
  MoveStoryDocumentDto,
} from './dto/change-story-document-state.dto';

const REVISION_CURSOR_KIND = RESOURCE_CURSOR_KINDS.STORY_REVISIONS;
const STORY_CURSOR_KIND = RESOURCE_CURSOR_KINDS.STORIES;
const DOCUMENT_CURSOR_KIND = RESOURCE_CURSOR_KINDS.STORY_DOCUMENTS;
const DISCUSSION_CURSOR_KIND = RESOURCE_CURSOR_KINDS.STORY_DISCUSSIONS;
const MESSAGE_CURSOR_KIND = RESOURCE_CURSOR_KINDS.STORY_DISCUSSION_MESSAGES;
const REVIEW_CURSOR_KIND = RESOURCE_CURSOR_KINDS.STORY_REVIEWS;
const STORY_RECENT_ACTIVITY_LIMIT = 10;
const STORY_LIST_DEFAULT_LIMIT = 20;
const STORY_REVIEW_PAGE_DEFAULT_LIMIT = 20;
const ACTIVITY_SUMMARY_MAX_LENGTH = 1000;

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
  archived: boolean;
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
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
    @InjectModel(StoryDocument.name) private readonly documentModel: Model<StoryDocument>,
    @InjectModel(StoryRevision.name) private readonly revisionModel: Model<StoryRevision>,
    @InjectModel(StoryDiscussion.name) private readonly discussionModel: Model<StoryDiscussion>,
    @InjectModel(StoryDiscussionMessage.name)
    private readonly discussionMessageModel: Model<StoryDiscussionMessage>,
    @InjectModel(StoryReview.name) private readonly reviewModel: Model<StoryReview>,
    private readonly databaseService: DatabaseService,
    private readonly storyCollaborationService: StoryCollaborationService,
    private readonly directoryService: StoryDirectoryService,
    private readonly activityService: StoryActivityService,
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
          { $match: { storyId: { $in: storyIds }, archived: false } },
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
    const latestSequence = await this.activityService.latestSequence(storyId);
    const story = await this.requireStory(storyId);
    const [counts, recentActivity] = await Promise.all([
      this.documentModel.aggregate<{ _id: StoryDocumentKind; count: number }>([
        { $match: { storyId, archived: false } },
        { $group: { _id: '$kind', count: { $sum: 1 } } },
      ]),
      this.activityService.recent(storyId, STORY_RECENT_ACTIVITY_LIMIT),
    ]);
    return {
      story: story.toJSON(),
      documentCounts: counts.map(({ _id, count }) => ({ kind: _id, count })),
      recentActivity,
      latestSequence,
    };
  }

  async listDirectory(storyId: string, dto: StoryDirectoryQuery) {
    return this.directoryService.list(storyId, dto);
  }

  async getReadingStart(storyId: string, dto: CursorPaginationDto = {}) {
    return this.directoryService.firstChapter(storyId, dto);
  }

  async getDocumentLocation(storyId: string, documentId: string) {
    return this.directoryService.locate(storyId, documentId);
  }

  async listActivity(storyId: string, dto: ListStoryActivityDto) {
    await this.requireStory(storyId);
    return this.activityService.list(storyId, dto);
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
      return { story: updated, revision: this.revisionSummary(revision) };
    });
  }

  async listStoryRevisions(storyId: string, dto: CursorPaginationDto) {
    await this.requireStory(storyId);
    const cursorContext = JSON.stringify({ storyId, targetType: 'story', direction: 'desc' });
    const lastRevision = dto.cursor
      ? decodeOrdinalCursor(dto.cursor, REVISION_CURSOR_KIND, cursorContext)
      : null;
    const limit = dto.limit ?? STORY_LIST_DEFAULT_LIMIT;
    const revisions = await this.revisionModel
      .find({
        storyId,
        targetType: 'story',
        documentId: null,
        ...(lastRevision === null ? {} : { revisionNumber: { $lt: lastRevision } }),
      })
      .sort({ revisionNumber: -1 })
      .limit(limit + 1)
      .exec();
    const hasMore = revisions.length > limit;
    const items = revisions.slice(0, limit);
    const last = items.at(-1);
    return {
      items: items.map((revision) => this.revisionSummary(revision)),
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
      return { story: updated, revision: this.revisionSummary(revision) };
    });
  }

  async listDocuments(storyId: string, dto: ListStoryDocumentsDto = {}) {
    await this.requireStory(storyId);
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
    const context = { storyId, kind: dto.kind ?? null, q: query ?? null };
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
      archived: false,
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
      const links = await this.validateLinks(storyId, dto.links ?? [], session);
      const document = new this.documentModel({
        storyId,
        kind: dto.kind,
        title: dto.title,
        content: dto.content,
        links,
        archived: false,
        parentDocumentId: null,
        previousDocumentId: null,
        currentVersion: 1,
        createdByAgentId: actor.agentId,
        createdByOwnerUserIdSnapshot: actor.ownerUserId,
      });
      if (this.isNarrative(dto.kind))
        await this.directoryService.insert(document, this.position(dto), session);
      else {
        this.assertNoPosition(dto);
        await document.save({ session });
      }
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
          directoryChange: this.isNarrative(dto.kind)
            ? {
                structureVersion: this.position(dto).expectedStructureVersion + 1,
                before: null,
                after: {
                  parentDocumentId: dto.parentDocumentId ?? null,
                  afterDocumentId: dto.afterDocumentId ?? null,
                },
              }
            : null,
          diff: {
            beforeStory: null,
            afterStory: null,
            beforeDocument: null,
            afterDocument: this.documentSnapshot(document),
          },
        },
        session,
      );
      return { document, revision: this.revisionSummary(revision) };
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
      if (document.archived) throw storyErrors.documentWithdrawn();
      await this.storyCollaborationService.assertAgentCanEdit(
        document.storyId,
        actor.agentId,
        session,
        document.id,
      );
      if (
        dto.kind !== undefined &&
        dto.kind !== document.kind &&
        (this.isNarrative(dto.kind) || this.isNarrative(document.kind))
      )
        throw storyErrors.documentPositionInvalid();
      const before = this.documentSnapshot(document);
      const after: DocumentSnapshot = {
        ...before,
        ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.links !== undefined
          ? {
              links: await this.validateLinks(document.storyId, dto.links, session),
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
      return { document: updated, revision: this.revisionSummary(revision) };
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
        directoryChange: 1,
        createdAt: 1,
        'diff.afterDocument.title': 1,
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
          directoryChange: revision.directoryChange,
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
        : {
            ...before,
            kind: target.kind,
            title: target.title,
            content: target.content,
            links: target.links,
          };
      if (
        after.kind !== before.kind &&
        (this.isNarrative(after.kind) || this.isNarrative(before.kind))
      )
        throw storyErrors.documentPositionInvalid();
      if (isDeepStrictEqual(before, after)) throw storyErrors.unchanged();
      const links = await this.validateLinks(document.storyId, after.links, session);
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
      return { document: updated, revision: this.revisionSummary(revision) };
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
    const changedFields = (Object.keys(after) as Array<keyof DocumentSnapshot>).filter(
      (field) => !isDeepStrictEqual(before[field], after[field]),
    );
    return {
      fromRevision: this.revisionSummary(fromRevision),
      toRevision: this.revisionSummary(toRevision),
      fromSnapshot: before,
      toSnapshot: after,
      changedFields,
    };
  }

  async getStoryRevision(storyId: string, revisionNumber: number) {
    const revision = await this.requireRevision(storyId, 'story', null, revisionNumber);
    const snapshot = revision.diff.afterStory;
    if (!snapshot) throw storyErrors.revisionNotFound();
    return { revision: this.revisionSummary(revision), snapshot: this.metadataSnapshot(snapshot) };
  }

  async getDocumentRevision(storyId: string, documentId: string, revisionNumber: number) {
    const revision = await this.requireRevision(storyId, 'document', documentId, revisionNumber);
    const snapshot = revision.diff.afterDocument;
    if (!snapshot) throw storyErrors.revisionNotFound();
    return { revision: this.revisionSummary(revision), snapshot: this.documentSnapshot(snapshot) };
  }

  async listDocumentReferences(storyId: string, documentId: string, dto: CursorPaginationDto = {}) {
    await this.getDocument(documentId, storyId);
    const context = JSON.stringify({ storyId, documentId, references: true });
    const cursor = dto.cursor
      ? decodeTimestampCursor(dto.cursor, DOCUMENT_CURSOR_KIND, context)
      : null;
    const where = {
      storyId,
      archived: false,
      'links.targetDocumentId': documentId,
      ...(cursor
        ? {
            $or: [
              { createdAt: { $lt: cursor.timestamp } },
              { createdAt: cursor.timestamp, _id: { $lt: cursor.id } },
            ],
          }
        : {}),
    };
    const limit = dto.limit ?? STORY_LIST_DEFAULT_LIMIT;
    const documents = await this.documentModel
      .find(where)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .select({ content: 0 })
      .exec();
    const items = documents.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        documents.length > limit && last
          ? encodeTimestampCursor(DOCUMENT_CURSOR_KIND, context, last.createdAt, last.id)
          : null,
    };
  }

  async listDiscussions(storyId: string, dto: ListStoryDiscussionsDto = {}) {
    await this.requireStory(storyId);
    const context = JSON.stringify({
      storyId,
      targetType: dto.targetType ?? null,
      documentId: dto.documentId ?? null,
      revisionNumber: dto.revisionNumber ?? null,
    });
    const cursor = dto.cursor
      ? decodeTimestampCursor(dto.cursor, DISCUSSION_CURSOR_KIND, context)
      : null;
    const where: Record<string, unknown> = { storyId };
    if (dto.targetType) where['targetType'] = dto.targetType;
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
    const last = items.at(-1) as (StoryDiscussion & StoryTimestampRecord) | undefined;
    return {
      items,
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
    return discussion;
  }

  async createDiscussion(storyId: string, actor: StoryActor, dto: CreateStoryDiscussionDto) {
    return this.databaseService.$transaction(async (session) => {
      const revision = await this.requireRevision(
        storyId,
        dto.targetType,
        dto.documentId,
        dto.revisionNumber,
        session,
      );
      const snapshot =
        dto.targetType === 'story' ? revision.diff.afterStory : revision.diff.afterDocument;
      if (
        !snapshot ||
        (dto.anchorText !== undefined && !this.anchorContent(revision).includes(dto.anchorText)) ||
        dto.addressedAgentId === actor.agentId
      )
        throw storyErrors.discussionTargetInvalid();
      if (
        dto.addressedAgentId &&
        !(await this.agentModel
          .exists({ _id: dto.addressedAgentId, deletedAt: null })
          .session(session))
      ) {
        throw storyErrors.discussionTargetInvalid();
      }
      const [discussion] = await this.discussionModel.create(
        [
          {
            storyId,
            targetType: dto.targetType,
            documentId: dto.documentId ?? null,
            revisionNumber: dto.revisionNumber,
            anchorText: dto.anchorText ?? null,
            title: dto.title,
            addressedAgentId: dto.addressedAgentId ?? null,
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
      await this.activityService.append(
        {
          storyId,
          kind: STORY_ACTIVITY_KINDS.DISCUSSION_CREATED,
          targetType: dto.targetType,
          documentId: dto.documentId ?? null,
          revisionNumber: dto.revisionNumber,
          discussionId: discussion.id,
          messageId: initialMessage.id,
          authorAgentId: actor.agentId,
          title: dto.title,
          summary: dto.content.slice(0, ACTIVITY_SUMMARY_MAX_LENGTH),
        },
        session,
      );
      return { discussion, initialMessage };
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
      await this.activityService.append(
        {
          storyId,
          kind: STORY_ACTIVITY_KINDS.MESSAGE_CREATED,
          targetType: discussion.targetType,
          documentId: discussion.documentId,
          revisionNumber: discussion.revisionNumber,
          discussionId,
          messageId: message.id,
          authorAgentId: actor.agentId,
          title: discussion.title,
          summary: dto.content.slice(0, ACTIVITY_SUMMARY_MAX_LENGTH),
        },
        session,
      );
      return message;
    });
  }

  async listReviews(storyId: string, dto: ListStoryReviewsDto = {}) {
    await this.requireStory(storyId);
    const context = JSON.stringify({
      storyId,
      targetType: dto.targetType ?? null,
      documentId: dto.documentId ?? null,
      revisionNumber: dto.revisionNumber ?? null,
    });
    const cursor = dto.cursor
      ? decodeTimestampCursor(dto.cursor, REVIEW_CURSOR_KIND, context)
      : null;
    const where: Record<string, unknown> = {
      storyId,
      ...(dto.targetType ? { targetType: dto.targetType } : {}),
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
      const revision = await this.requireRevision(
        storyId,
        dto.targetType,
        dto.documentId,
        dto.revisionNumber,
        session,
      );
      const snapshot =
        dto.targetType === 'story' ? revision.diff.afterStory : revision.diff.afterDocument;
      if (
        !snapshot ||
        (dto.anchorText != null && !this.anchorContent(revision).includes(dto.anchorText))
      )
        throw storyErrors.reviewTargetInvalid();
      const [review] = await this.reviewModel.create(
        [
          {
            storyId,
            targetType: dto.targetType,
            documentId: dto.documentId ?? null,
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
      await this.activityService.append(
        {
          storyId,
          kind: STORY_ACTIVITY_KINDS.REVIEW_CREATED,
          targetType: dto.targetType,
          documentId: dto.documentId ?? null,
          revisionNumber: dto.revisionNumber,
          authorAgentId: actor.agentId,
          title: snapshot.title,
          summary: dto.content.slice(0, ACTIVITY_SUMMARY_MAX_LENGTH),
        },
        session,
      );
      return review;
    });
  }

  async getDiscussionMessage(storyId: string, discussionId: string, messageId: string) {
    await this.getDiscussion(storyId, discussionId);
    const message = await this.discussionMessageModel
      .findOne({ _id: this.objectId(messageId), storyId, discussionId })
      .exec();
    if (!message) throw storyErrors.discussionNotFound();
    return message;
  }

  async moveDocument(
    storyId: string,
    documentId: string,
    actor: StoryActor,
    dto: MoveStoryDocumentDto,
  ) {
    return this.changeDocumentState(storyId, documentId, actor, dto, 'move');
  }

  async withdrawDocument(
    storyId: string,
    documentId: string,
    actor: StoryActor,
    dto: ChangeStoryDocumentStateDto,
  ) {
    return this.changeDocumentState(storyId, documentId, actor, dto, 'withdraw');
  }

  async reinstateDocument(
    storyId: string,
    documentId: string,
    actor: StoryActor,
    dto: MoveStoryDocumentDto,
  ) {
    return this.changeDocumentState(storyId, documentId, actor, dto, 'reinstate');
  }

  private async changeDocumentState(
    storyId: string,
    documentId: string,
    actor: StoryActor,
    dto: MoveStoryDocumentDto,
    action: 'move' | 'withdraw' | 'reinstate',
  ) {
    return this.databaseService.$transaction(async (session) => {
      const document = await this.documentModel
        .findOne({ _id: this.objectId(documentId), storyId })
        .session(session)
        .exec();
      if (!document) throw storyErrors.documentNotFound();
      this.assertVersion(document.currentVersion, dto.expectedVersion);
      await this.storyCollaborationService.assertAgentCanEdit(
        storyId,
        actor.agentId,
        session,
        documentId,
      );
      const before = this.documentSnapshot(document);
      const beforePosition = {
        parentDocumentId: document.parentDocumentId?.toString() ?? null,
        afterDocumentId: document.previousDocumentId?.toString() ?? null,
      };
      if (
        (action === 'withdraw' && document.archived) ||
        (action !== 'reinstate' && document.archived) ||
        (action === 'reinstate' && !document.archived)
      )
        throw storyErrors.unchanged();
      document.currentVersion += 1;
      if (action === 'move')
        await this.directoryService.move(document, this.position(dto), session);
      else if (action === 'withdraw')
        await this.directoryService.withdraw(document, dto.expectedStructureVersion, session);
      else if (this.isNarrative(document.kind))
        await this.directoryService.rejoin(document, this.position(dto), session);
      else {
        this.assertNoPosition(dto);
        document.archived = false;
        await document.save({ session });
      }
      const after = this.documentSnapshot(document);
      const revision = await this.createRevision(
        {
          storyId,
          documentId,
          targetType: 'document',
          revisionNumber: document.currentVersion,
          baseVersion: dto.expectedVersion,
          authorAgentId: actor.agentId,
          authorOwnerUserIdSnapshot: actor.ownerUserId,
          changeSummary: dto.changeSummary,
          directoryChange: this.isNarrative(document.kind)
            ? {
                structureVersion: (dto.expectedStructureVersion ?? 0) + 1,
                before: action === 'reinstate' ? null : beforePosition,
                after:
                  action === 'withdraw'
                    ? null
                    : {
                        parentDocumentId: document.parentDocumentId?.toString() ?? null,
                        afterDocumentId: document.previousDocumentId?.toString() ?? null,
                      },
              }
            : null,
          diff: {
            beforeStory: null,
            afterStory: null,
            beforeDocument: before,
            afterDocument: after,
          },
        },
        session,
        action === 'move'
          ? STORY_ACTIVITY_KINDS.DOCUMENT_MOVED
          : action === 'withdraw'
            ? STORY_ACTIVITY_KINDS.DOCUMENT_WITHDRAWN
            : STORY_ACTIVITY_KINDS.DOCUMENT_REINSTATED,
      );
      return { document, revision: this.revisionSummary(revision) };
    });
  }

  private position(dto: {
    parentDocumentId?: string | null;
    afterDocumentId?: string | null;
    expectedStructureVersion?: number;
  }): StoryDirectoryPosition {
    if (
      dto.expectedStructureVersion === undefined ||
      dto.parentDocumentId === undefined ||
      dto.afterDocumentId === undefined
    )
      throw storyErrors.documentPositionInvalid();
    return {
      parentDocumentId: dto.parentDocumentId,
      afterDocumentId: dto.afterDocumentId,
      expectedStructureVersion: dto.expectedStructureVersion,
    };
  }

  private assertNoPosition(dto: {
    parentDocumentId?: string | null;
    afterDocumentId?: string | null;
    expectedStructureVersion?: number;
  }): void {
    if (
      dto.parentDocumentId !== undefined ||
      dto.afterDocumentId !== undefined ||
      dto.expectedStructureVersion !== undefined
    )
      throw storyErrors.documentPositionInvalid();
  }

  private isNarrative(kind: StoryDocumentKind): boolean {
    return kind === 'volume' || kind === 'chapter' || kind === 'scene';
  }

  private async requireRevision(
    storyId: string,
    targetType: 'story' | 'document',
    documentId: string | null,
    revisionNumber: number,
    session?: ClientSession,
  ) {
    if (
      (targetType === 'story' && documentId != null) ||
      (targetType === 'document' && !documentId)
    )
      throw storyErrors.discussionTargetInvalid();
    const query = this.revisionModel.findOne({
      storyId,
      targetType,
      documentId: documentId ?? null,
      revisionNumber,
    });
    if (session) query.session(session);
    const revision = await query.exec();
    if (!revision) throw storyErrors.revisionNotFound();
    return revision;
  }

  private anchorContent(revision: StoryRevision): string {
    if (revision.targetType === 'document') {
      const snapshot = revision.diff.afterDocument;
      if (!snapshot) throw storyErrors.revisionNotFound();
      return snapshot.content;
    }
    const snapshot = revision.diff.afterStory;
    if (!snapshot) throw storyErrors.revisionNotFound();
    return [
      snapshot.title,
      snapshot.premise,
      snapshot.genre,
      snapshot.tone,
      snapshot.viewpoint,
      snapshot.targetLength,
      snapshot.phase,
      snapshot.establishedDirection,
      ...snapshot.openQuestions,
    ]
      .filter((value) => value !== null)
      .join('\n');
  }

  private revisionSummary(revision: StoryRevision) {
    const snapshot = revision.diff.afterDocument ?? revision.diff.afterStory;
    if (!snapshot) throw storyErrors.revisionNotFound();
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
      directoryChange: revision.directoryChange,
    };
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
      directoryChange?: StoryDirectoryRevisionChange | null;
      diff: {
        beforeStory: StoryMetadataSnapshot | StorySnapshot | null;
        afterStory: StoryMetadataSnapshot | StorySnapshot | null;
        beforeDocument: StoryDocumentSnapshot | DocumentSnapshot | null;
        afterDocument: StoryDocumentSnapshot | DocumentSnapshot | null;
      };
    },
    session: ClientSession,
    activityKind?: (typeof STORY_ACTIVITY_KINDS)[keyof typeof STORY_ACTIVITY_KINDS],
  ) {
    const [revision] = await this.revisionModel.create([input], { session });
    if (!revision) throw new Error('Story revision creation did not return a document');
    const snapshot = input.diff.afterDocument ?? input.diff.afterStory;
    if (!snapshot) throw storyErrors.revisionNotFound();
    await this.activityService.append(
      {
        storyId: input.storyId,
        kind:
          activityKind ??
          (input.targetType === 'story'
            ? input.baseVersion === 0
              ? STORY_ACTIVITY_KINDS.STORY_CREATED
              : STORY_ACTIVITY_KINDS.STORY_REVISED
            : input.baseVersion === 0
              ? STORY_ACTIVITY_KINDS.DOCUMENT_CREATED
              : STORY_ACTIVITY_KINDS.DOCUMENT_REVISED),
        targetType: input.targetType,
        documentId: input.documentId,
        revisionNumber: input.revisionNumber,
        authorAgentId: input.authorAgentId,
        title: snapshot.title,
        summary: input.changeSummary,
      },
      session,
    );
    return revision;
  }

  private async requireStory(storyId: string, session?: ClientSession) {
    const query = this.storyModel.findById(this.objectId(storyId));
    if (session) query.session(session);
    const story = await query.exec();
    if (!story) throw storyErrors.storyNotFound();
    return story;
  }

  private async validateLinks(
    storyId: string,
    links: readonly { targetDocumentId: string; relation: StoryDocumentLink['relation'] }[],
    session: ClientSession,
  ): Promise<StoryDocumentLink[]> {
    if (links.length === 0) return [];
    const query = this.documentModel.find({
      _id: { $in: links.map((link) => this.objectId(link.targetDocumentId)) },
      storyId,
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
      archived: document.archived,
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
