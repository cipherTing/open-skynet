import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type ClientSession } from 'mongoose';
import { Story, StoryDocument, type StoryContentDocument } from '@/database/schemas/story.schema';
import { apiErrors } from '@/common/i18n/api-message';
import { commonErrors } from '@/common/errors/business-errors';
import {
  decodeCompositeCursor,
  encodeCompositeCursor,
  PAGINATION_CURSOR_KINDS,
} from '@/common/pagination/pagination-cursor';
import { storyErrors } from './story.errors';

const DIRECTORY_KINDS = ['volume', 'chapter', 'scene'] as const;
const DIRECTORY_MAX_LIMIT = 50;
const DIRECTORY_DEFAULT_LIMIT = 30;
const DIRECTORY_MAX_ANCESTORS = 2;

export interface StoryDirectoryPosition {
  parentDocumentId: string | null;
  afterDocumentId: string | null;
  expectedStructureVersion: number;
}
export interface StoryDirectoryQuery {
  parentDocumentId?: string | null;
  cursor?: string;
  limit?: number;
}
export interface StoryDirectoryItem {
  id: string;
  title: string;
  kind: StoryDocument['kind'];
  currentVersion: number;
  archived: boolean;
  parentDocumentId: string | null;
  previousDocumentId: string | null;
  nextDocumentId: string | null;
  hasChildren: boolean;
}
export interface StoryDirectoryPage {
  items: StoryDirectoryItem[];
  ancestors: StoryDirectoryItem[];
  structureVersion: number;
  nextCursor: string | null;
}
export interface StoryDirectoryLocation {
  document: StoryDirectoryItem;
  ancestors: StoryDirectoryItem[];
  previousDocument: StoryDirectoryItem | null;
  nextDocument: StoryDirectoryItem | null;
  structureVersion: number;
}
interface DirectoryRecord {
  _id: Types.ObjectId;
  title: string;
  kind: StoryDocument['kind'];
  currentVersion: number;
  archived: boolean;
  parentDocumentId: Types.ObjectId | null;
  previousDocumentId: Types.ObjectId | null;
  depth?: number;
}
interface DirectoryChain extends DirectoryRecord {
  following: DirectoryRecord[];
}
interface DirectoryRelations extends DirectoryRecord {
  child: Array<{ _id: Types.ObjectId }>;
  successor: Array<{ _id: Types.ObjectId }>;
}

function positionInvalid() {
  return apiErrors.badRequest(
    'STORY_DIRECTORY_POSITION_INVALID',
    'api.errors.storyDirectoryPositionInvalid',
  );
}
function structureConflict(currentStructureVersion: number) {
  return apiErrors.conflict(
    'STORY_STRUCTURE_VERSION_CONFLICT',
    'api.errors.storyStructureVersionConflict',
    { args: { currentStructureVersion }, details: { currentStructureVersion } },
  );
}
function objectId(id: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) throw positionInvalid();
  return new Types.ObjectId(id);
}
function nullableId(id: string | null): Types.ObjectId | null {
  return id === null ? null : objectId(id);
}
function sameId(left: Types.ObjectId | null, right: Types.ObjectId | null): boolean {
  return left?.toString() === right?.toString();
}
export function isNarrativeDocument(kind: StoryDocument['kind']): boolean {
  return kind === 'volume' || kind === 'chapter' || kind === 'scene';
}

@Injectable()
export class StoryDirectoryService {
  constructor(
    @InjectModel(Story.name) private readonly storyModel: Model<Story>,
    @InjectModel(StoryDocument.name) private readonly documentModel: Model<StoryDocument>,
  ) {}

  async list(storyId: string, query: StoryDirectoryQuery = {}): Promise<StoryDirectoryPage> {
    const story = await this.requireStory(storyId);
    const parentDocumentId = query.parentDocumentId ?? null;
    const parent = nullableId(parentDocumentId);
    const limit = query.limit ?? DIRECTORY_DEFAULT_LIMIT;
    if (!Number.isInteger(limit) || limit < 1 || limit > DIRECTORY_MAX_LIMIT)
      throw positionInvalid();
    let previousDocumentId: Types.ObjectId | null = null;
    if (query.cursor) {
      const values = decodeCompositeCursor(query.cursor, PAGINATION_CURSOR_KINDS.STORY_DOCUMENTS, {
        context: { directory: true, storyId, parentDocumentId },
      });
      if (values.length !== 2 || typeof values[0] !== 'string' || typeof values[1] !== 'number')
        throw commonErrors.paginationCursorInvalid();
      if (values[1] !== story.structureVersion) throw structureConflict(story.structureVersion);
      previousDocumentId = objectId(values[0]);
    }
    const ancestors = parentDocumentId ? await this.ancestors(storyId, parentDocumentId) : [];
    const chains = await this.documentModel
      .aggregate<DirectoryChain>([
        {
          $match: {
            storyId,
            parentDocumentId: parent,
            previousDocumentId,
            archived: false,
            kind: { $in: DIRECTORY_KINDS },
          },
        },
        { $limit: 1 },
        {
          $graphLookup: {
            from: this.documentModel.collection.name,
            startWith: '$_id',
            connectFromField: '_id',
            connectToField: 'previousDocumentId',
            as: 'following',
            maxDepth: limit - 1,
            depthField: 'depth',
            restrictSearchWithMatch: {
              storyId,
              parentDocumentId: parent,
              archived: false,
              kind: { $in: DIRECTORY_KINDS },
            },
          },
        },
        { $project: { content: 0, 'following.content': 0 } },
      ])
      .exec();
    const chain = chains[0];
    const records = chain
      ? [chain, ...chain.following.sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0))]
      : [];
    const selected = records.slice(0, limit);
    const items = await this.items(storyId, selected);
    const last = selected.at(-1);
    await this.assertReadVersion(storyId, story.structureVersion);
    return {
      items,
      ancestors,
      structureVersion: story.structureVersion,
      nextCursor:
        records.length > limit && last
          ? encodeCompositeCursor(
              PAGINATION_CURSOR_KINDS.STORY_DOCUMENTS,
              [last._id.toString(), story.structureVersion],
              { context: { directory: true, storyId, parentDocumentId } },
            )
          : null,
    };
  }

  async locate(storyId: string, documentId: string): Promise<StoryDirectoryLocation> {
    const story = await this.requireStory(storyId);
    const document = await this.requireDocument(storyId, documentId);
    const [item] = await this.items(storyId, [document]);
    if (!item) throw storyErrors.documentNotFound();
    const neighbourIds = [item.previousDocumentId, item.nextDocumentId].filter(
      (id): id is string => id !== null,
    );
    const neighbours = await this.documentModel
      .find({ storyId, _id: { $in: neighbourIds.map(objectId) }, archived: false })
      .select({ content: 0 })
      .exec();
    const neighbourItems = await this.items(storyId, neighbours);
    const ancestors = document.parentDocumentId
      ? await this.ancestors(storyId, document.parentDocumentId.toString())
      : [];
    await this.assertReadVersion(storyId, story.structureVersion);
    return {
      document: item,
      ancestors,
      previousDocument:
        neighbourItems.find((value) => value.id === item.previousDocumentId) ?? null,
      nextDocument: neighbourItems.find((value) => value.id === item.nextDocumentId) ?? null,
      structureVersion: story.structureVersion,
    };
  }

  async firstChapter(
    storyId: string,
    query: Pick<StoryDirectoryQuery, 'cursor' | 'limit'> = {},
  ): Promise<{
    document: StoryDirectoryItem | null;
    nextCursor: string | null;
    structureVersion: number;
  }> {
    const roots = await this.list(storyId, { ...query, limit: query.limit ?? DIRECTORY_MAX_LIMIT });
    const volumeIds = roots.items
      .filter((item) => item.kind === 'volume' && item.hasChildren)
      .map((item) => objectId(item.id));
    const chapters = volumeIds.length
      ? await this.documentModel
          .find({
            storyId,
            parentDocumentId: { $in: volumeIds },
            previousDocumentId: null,
            archived: false,
            kind: 'chapter',
          })
          .select({ content: 0 })
          .exec()
      : [];
    const chapterItems = await this.items(storyId, chapters);
    const firstByVolume = new Map(chapterItems.map((item) => [item.parentDocumentId, item]));
    let document: StoryDirectoryItem | null = null;
    for (const root of roots.items) {
      const candidate = root.kind === 'chapter' ? root : firstByVolume.get(root.id);
      if (candidate) {
        document = candidate;
        break;
      }
    }
    await this.assertReadVersion(storyId, roots.structureVersion);
    return {
      document,
      nextCursor: document ? null : roots.nextCursor,
      structureVersion: roots.structureVersion,
    };
  }

  async insert(
    document: StoryContentDocument,
    position: StoryDirectoryPosition,
    session: ClientSession,
  ): Promise<StoryContentDocument> {
    if (!isNarrativeDocument(document.kind)) throw positionInvalid();
    await this.validatePosition(document, position, session);
    await this.claimVersion(document.storyId, position.expectedStructureVersion, session);
    await this.connect(document, position, session);
    return document;
  }

  async move(
    document: StoryContentDocument,
    position: StoryDirectoryPosition,
    session: ClientSession,
  ): Promise<StoryContentDocument> {
    if (!isNarrativeDocument(document.kind) || document.archived) throw positionInvalid();
    await this.validatePosition(document, position, session);
    if (
      sameId(document.parentDocumentId, nullableId(position.parentDocumentId)) &&
      sameId(document.previousDocumentId, nullableId(position.afterDocumentId))
    )
      throw storyErrors.unchanged();
    await this.claimVersion(document.storyId, position.expectedStructureVersion, session);
    await this.disconnect(document, session);
    await this.connect(document, position, session);
    return document;
  }

  async withdraw(
    document: StoryContentDocument,
    expectedStructureVersion: number | undefined,
    session: ClientSession,
  ): Promise<StoryContentDocument> {
    if (document.archived) throw storyErrors.unchanged();
    const hasChildren = await this.documentModel
      .exists({ storyId: document.storyId, parentDocumentId: document._id, archived: false })
      .session(session);
    if (hasChildren)
      throw apiErrors.conflict(
        'STORY_DOCUMENT_HAS_CHILDREN',
        'api.errors.storyDocumentHasChildren',
      );
    if (isNarrativeDocument(document.kind)) {
      if (expectedStructureVersion === undefined) throw positionInvalid();
      await this.claimVersion(document.storyId, expectedStructureVersion, session);
      await this.disconnect(document, session);
    }
    document.archived = true;
    await document.save({ session });
    return document;
  }

  async rejoin(
    document: StoryContentDocument,
    position: StoryDirectoryPosition,
    session: ClientSession,
  ): Promise<StoryContentDocument> {
    if (!document.archived) throw storyErrors.unchanged();
    if (isNarrativeDocument(document.kind)) {
      await this.validatePosition(document, position, session);
      await this.claimVersion(document.storyId, position.expectedStructureVersion, session);
      await this.connect(document, position, session);
    } else {
      document.archived = false;
      await document.save({ session });
    }
    return document;
  }

  private async validatePosition(
    document: StoryContentDocument,
    position: StoryDirectoryPosition,
    session: ClientSession,
  ): Promise<void> {
    if (position.parentDocumentId === document.id || position.afterDocumentId === document.id)
      throw positionInvalid();
    const parent = position.parentDocumentId
      ? await this.documentModel
          .findOne({
            _id: objectId(position.parentDocumentId),
            storyId: document.storyId,
            archived: false,
          })
          .session(session)
          .exec()
      : null;
    if (position.parentDocumentId && !parent) throw positionInvalid();
    if (
      (document.kind === 'volume' && parent !== null) ||
      (document.kind === 'chapter' && parent !== null && parent.kind !== 'volume') ||
      (document.kind === 'scene' && parent?.kind !== 'chapter')
    )
      throw positionInvalid();
    if (position.afterDocumentId) {
      const previous = await this.documentModel
        .findOne({
          _id: objectId(position.afterDocumentId),
          storyId: document.storyId,
          parentDocumentId: nullableId(position.parentDocumentId),
          archived: false,
          kind: { $in: DIRECTORY_KINDS },
        })
        .session(session)
        .exec();
      if (!previous) throw positionInvalid();
    }
  }

  private async claimVersion(
    storyId: string,
    expectedStructureVersion: number,
    session: ClientSession,
  ): Promise<void> {
    const result = await this.storyModel.updateOne(
      { _id: objectId(storyId), structureVersion: expectedStructureVersion },
      { $inc: { structureVersion: 1 } },
      { session },
    );
    if (result.matchedCount === 0) {
      const story = await this.storyModel.findById(objectId(storyId)).session(session).exec();
      if (!story) throw storyErrors.storyNotFound();
      throw structureConflict(story.structureVersion);
    }
  }

  private async disconnect(document: StoryContentDocument, session: ClientSession): Promise<void> {
    const successor = await this.documentModel
      .findOne({
        storyId: document.storyId,
        parentDocumentId: document.parentDocumentId,
        previousDocumentId: document._id,
        archived: false,
        kind: { $in: DIRECTORY_KINDS },
      })
      .session(session)
      .exec();
    document.archived = true;
    await document.save({ session });
    if (successor) {
      successor.previousDocumentId = document.previousDocumentId;
      await successor.save({ session });
    }
  }

  private async connect(
    document: StoryContentDocument,
    position: StoryDirectoryPosition,
    session: ClientSession,
  ): Promise<void> {
    const parentDocumentId = nullableId(position.parentDocumentId);
    const previousDocumentId = nullableId(position.afterDocumentId);
    const successor = await this.documentModel
      .findOne({
        storyId: document.storyId,
        parentDocumentId,
        previousDocumentId,
        archived: false,
        kind: { $in: DIRECTORY_KINDS },
      })
      .session(session)
      .exec();
    if (successor) {
      successor.previousDocumentId = document._id;
      await successor.save({ session });
    }
    document.parentDocumentId = parentDocumentId;
    document.previousDocumentId = previousDocumentId;
    document.archived = false;
    await document.save({ session });
  }

  private async items(
    storyId: string,
    records: readonly DirectoryRecord[],
  ): Promise<StoryDirectoryItem[]> {
    if (!records.length) return [];
    const ids = records.map((record) => record._id);
    const relations = await this.documentModel
      .aggregate<DirectoryRelations>([
        { $match: { storyId, _id: { $in: ids } } },
        {
          $lookup: {
            from: this.documentModel.collection.name,
            localField: '_id',
            foreignField: 'parentDocumentId',
            pipeline: [
              { $match: { storyId, archived: false } },
              { $limit: 1 },
              { $project: { _id: 1 } },
            ],
            as: 'child',
          },
        },
        {
          $lookup: {
            from: this.documentModel.collection.name,
            localField: '_id',
            foreignField: 'previousDocumentId',
            let: { parentDocumentId: '$parentDocumentId' },
            pipeline: [
              {
                $match: {
                  storyId,
                  archived: false,
                  kind: { $in: DIRECTORY_KINDS },
                  $expr: { $eq: ['$parentDocumentId', '$$parentDocumentId'] },
                },
              },
              { $limit: 1 },
              { $project: { _id: 1 } },
            ],
            as: 'successor',
          },
        },
        { $project: { content: 0 } },
      ])
      .exec();
    const relationById = new Map(relations.map((record) => [record._id.toString(), record]));
    return records.map((record) => {
      const relation = relationById.get(record._id.toString());
      return {
        id: record._id.toString(),
        title: record.title,
        kind: record.kind,
        currentVersion: record.currentVersion,
        archived: record.archived,
        parentDocumentId: record.parentDocumentId?.toString() ?? null,
        previousDocumentId: record.previousDocumentId?.toString() ?? null,
        nextDocumentId: record.archived ? null : (relation?.successor[0]?._id.toString() ?? null),
        hasChildren: (relation?.child.length ?? 0) > 0,
      };
    });
  }

  private async ancestors(storyId: string, startingId: string): Promise<StoryDirectoryItem[]> {
    const records: StoryContentDocument[] = [];
    let nextId: string | null = startingId;
    for (let depth = 0; depth < DIRECTORY_MAX_ANCESTORS && nextId; depth += 1) {
      const record = await this.requireDocument(storyId, nextId);
      records.unshift(record);
      nextId = record.parentDocumentId?.toString() ?? null;
    }
    if (nextId) throw positionInvalid();
    return this.items(storyId, records);
  }

  private async assertReadVersion(storyId: string, expectedVersion: number): Promise<void> {
    const story = await this.requireStory(storyId);
    if (story.structureVersion !== expectedVersion) throw structureConflict(story.structureVersion);
  }

  private async requireStory(storyId: string) {
    const story = await this.storyModel.findById(objectId(storyId)).exec();
    if (!story) throw storyErrors.storyNotFound();
    return story;
  }

  private async requireDocument(storyId: string, documentId: string) {
    const document = await this.documentModel
      .findOne({ _id: objectId(documentId), storyId })
      .select({ content: 0 })
      .exec();
    if (!document) throw storyErrors.documentNotFound();
    return document;
  }
}
