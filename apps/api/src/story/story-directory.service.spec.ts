import { getConnectionToken, getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { type Connection, type Model } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { DatabaseService } from '@/database/database.service';
import {
  Story,
  StorySchema,
  StoryDocument,
  StoryDocumentSchema,
} from '@/database/schemas/story.schema';
import { StoryDirectoryService } from './story-directory.service';

describe('StoryDirectoryService', () => {
  jest.setTimeout(60_000);
  let replicaSet: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let connection: Connection;
  let service: StoryDirectoryService;
  let database: DatabaseService;
  let stories: Model<Story>;
  let documents: Model<StoryDocument>;
  let storyId: string;
  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(replicaSet.getUri()),
        MongooseModule.forFeature([
          { name: Story.name, schema: StorySchema },
          { name: StoryDocument.name, schema: StoryDocumentSchema },
        ]),
      ],
      providers: [StoryDirectoryService, DatabaseService],
    }).compile();
    connection = moduleRef.get<Connection>(getConnectionToken());
    database = moduleRef.get(DatabaseService);
    service = moduleRef.get(StoryDirectoryService);
    stories = moduleRef.get<Model<Story>>(getModelToken(Story.name));
    documents = moduleRef.get<Model<StoryDocument>>(getModelToken(StoryDocument.name));
    await Promise.all([stories.init(), documents.init()]);
  });
  beforeEach(async () => {
    await Promise.all([stories.deleteMany({}), documents.deleteMany({})]);
    const story = await stories.create({
      title: '潮汐档案',
      premise: '一座会遗忘的城市',
      createdByAgentId: 'agent-a',
      createdByOwnerUserIdSnapshot: 'owner-a',
    });
    storyId = story.id;
  });
  afterAll(async () => {
    if (connection) await connection.close();
    if (moduleRef) await moduleRef.close();
    if (replicaSet) await replicaSet.stop();
  });
  async function insert(
    title: string,
    kind: StoryDocument['kind'],
    parentDocumentId: string | null,
    afterDocumentId: string | null,
    expectedStructureVersion: number,
  ) {
    const document = new documents({
      storyId,
      kind,
      title,
      content: title,
      createdByAgentId: 'agent-a',
      createdByOwnerUserIdSnapshot: 'owner-a',
    });
    return database.$transaction((session) =>
      service.insert(
        document,
        { parentDocumentId, afterDocumentId, expectedStructureVersion },
        session,
      ),
    );
  }
  it('reads chapters in narrative order and inserts without reversing creation order', async () => {
    const first = await insert('第一章', 'chapter', null, null, 1);
    const third = await insert('第三章', 'chapter', null, first.id, 2);
    await insert('第二章', 'chapter', null, first.id, 3);
    const page = await service.list(storyId);
    expect(page.items.map((item) => item.title)).toEqual(['第一章', '第二章', '第三章']);
    expect(page.structureVersion).toBe(4);
    expect(page.nextCursor).toBeNull();
    expect(page.items[2]?.id).toBe(third.id);
  });
  it('rejects a stale insertion and leaves the directory unchanged', async () => {
    await insert('第一章', 'chapter', null, null, 1);
    await expect(insert('旧草稿', 'chapter', null, null, 1)).rejects.toMatchObject({
      response: { code: 'STORY_STRUCTURE_VERSION_CONFLICT', currentStructureVersion: 2 },
    });
    expect(await documents.countDocuments({ storyId })).toBe(1);
  });
  it('enforces volume chapter scene parent types and rejects an unrelated predecessor', async () => {
    const volume = await insert('第一卷', 'volume', null, null, 1);
    await expect(insert('场景', 'scene', volume.id, null, 2)).rejects.toMatchObject({
      response: { code: 'STORY_DIRECTORY_POSITION_INVALID' },
    });
    const chapter = await insert('第一章', 'chapter', volume.id, null, 2);
    await expect(insert('根章节', 'chapter', null, chapter.id, 3)).rejects.toMatchObject({
      response: { code: 'STORY_DIRECTORY_POSITION_INVALID' },
    });
    const scene = await insert('场景', 'scene', chapter.id, null, 3);
    const location = await service.locate(storyId, scene.id);
    expect(location.ancestors.map((item) => item.title)).toEqual(['第一卷', '第一章']);
    expect(await service.firstChapter(storyId)).toMatchObject({
      document: { id: chapter.id },
      nextCursor: null,
    });
  });
  it('moves a chapter across volumes and reconnects both sibling chains', async () => {
    const a = await insert('上卷', 'volume', null, null, 1);
    const b = await insert('下卷', 'volume', null, a.id, 2);
    const first = await insert('第一章', 'chapter', a.id, null, 3);
    const second = await insert('第二章', 'chapter', a.id, first.id, 4);
    await database.$transaction((session) =>
      service.move(
        first,
        { parentDocumentId: b.id, afterDocumentId: null, expectedStructureVersion: 5 },
        session,
      ),
    );
    expect(
      (await service.list(storyId, { parentDocumentId: a.id })).items.map((item) => item.id),
    ).toEqual([second.id]);
    expect(
      (await service.list(storyId, { parentDocumentId: b.id })).items.map((item) => item.id),
    ).toEqual([first.id]);
    expect((await service.locate(storyId, first.id)).ancestors.map((item) => item.id)).toEqual([
      b.id,
    ]);
  });
  it('withdraws a leaf and restores it at an explicit position while keeping its identity', async () => {
    const first = await insert('第一章', 'chapter', null, null, 1);
    const second = await insert('第二章', 'chapter', null, first.id, 2);
    await database.$transaction((session) => service.withdraw(first, 3, session));
    expect((await service.list(storyId)).items.map((item) => item.id)).toEqual([second.id]);
    expect(await documents.findById(first.id)).toMatchObject({ archived: true });
    await database.$transaction((session) =>
      service.rejoin(
        first,
        { parentDocumentId: null, afterDocumentId: second.id, expectedStructureVersion: 4 },
        session,
      ),
    );
    expect((await service.list(storyId)).items.map((item) => item.id)).toEqual([
      second.id,
      first.id,
    ]);
  });
  it('refuses to withdraw a parent with active children', async () => {
    const volume = await insert('第一卷', 'volume', null, null, 1);
    await insert('第一章', 'chapter', volume.id, null, 2);
    await expect(
      database.$transaction((session) => service.withdraw(volume, 3, session)),
    ).rejects.toMatchObject({ response: { code: 'STORY_DOCUMENT_HAS_CHILDREN' } });
    expect((await service.list(storyId)).items.map((item) => item.id)).toEqual([volume.id]);
  });
  it('continues bounded pages and rejects a cursor after the structure changed', async () => {
    const first = await insert('第一章', 'chapter', null, null, 1);
    const second = await insert('第二章', 'chapter', null, first.id, 2);
    await insert('第三章', 'chapter', null, second.id, 3);
    const page = await service.list(storyId, { limit: 2 });
    expect(page.items.map((item) => item.title)).toEqual(['第一章', '第二章']);
    expect(page.nextCursor).not.toBeNull();
    const cursor = page.nextCursor;
    if (!cursor) throw new Error('Expected a continuation cursor');
    expect(
      (await service.list(storyId, { limit: 2, cursor })).items.map((item) => item.title),
    ).toEqual(['第三章']);
    await insert('新开头', 'chapter', null, null, 4);
    await expect(service.list(storyId, { limit: 2, cursor })).rejects.toMatchObject({
      response: { code: 'STORY_STRUCTURE_VERSION_CONFLICT' },
    });
  });
  it('keeps reading-start incomplete until a chapter beyond fifty empty volumes is reached', async () => {
    let previous: string | null = null;
    for (let index = 0; index < 51; index += 1) {
      const volume = await insert('空卷' + index, 'volume', null, previous, index + 1);
      previous = volume.id;
    }
    const chapter = await insert('开篇', 'chapter', null, previous, 52);
    const first = await service.firstChapter(storyId);
    expect(first).toMatchObject({ document: null, structureVersion: 53 });
    expect(first.nextCursor).not.toBeNull();
    const cursor = first.nextCursor;
    if (!cursor) throw new Error('Expected more roots');
    expect(await service.firstChapter(storyId, { cursor })).toMatchObject({
      document: { id: chapter.id },
      nextCursor: null,
    });
  });

  it('serializes simultaneous insertions using the same structure version', async () => {
    const result = await Promise.allSettled([
      insert('方案甲', 'chapter', null, null, 1),
      insert('方案乙', 'chapter', null, null, 1),
    ]);
    expect(result.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(result.filter((item) => item.status === 'rejected')).toHaveLength(1);
    const rejected = result.find((item) => item.status === 'rejected');
    if (rejected?.status !== 'rejected') throw new Error('Expected a rejected insertion');
    expect(rejected.reason).toMatchObject({
      response: { code: 'STORY_STRUCTURE_VERSION_CONFLICT' },
    });
    expect((await service.list(storyId)).items).toHaveLength(1);
  });

  it('moves a middle chapter to the beginning and preserves the remaining order', async () => {
    const first = await insert('第一章', 'chapter', null, null, 1);
    const second = await insert('第二章', 'chapter', null, first.id, 2);
    const third = await insert('第三章', 'chapter', null, second.id, 3);
    await database.$transaction((session) =>
      service.move(
        second,
        { parentDocumentId: null, afterDocumentId: null, expectedStructureVersion: 4 },
        session,
      ),
    );
    expect((await service.list(storyId)).items.map((item) => item.id)).toEqual([
      second.id,
      first.id,
      third.id,
    ]);
    const location = await service.locate(storyId, first.id);
    expect(location.previousDocument?.id).toBe(second.id);
    expect(location.nextDocument?.id).toBe(third.id);
  });
});
