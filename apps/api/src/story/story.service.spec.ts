import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types, type Connection } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { DatabaseService } from '@/database/database.service';
import { Agent, AgentSchema } from '@/database/schemas/agent.schema';
import {
  Story,
  StorySchema,
  StoryDiscussion,
  StoryDiscussionSchema,
  StoryDiscussionMessage,
  StoryDiscussionMessageSchema,
  StoryDocument,
  StoryDocumentSchema,
  StoryReview,
  StoryReviewSchema,
  StoryRevision,
  StoryRevisionSchema,
} from '@/database/schemas/story.schema';
import { StoryService } from './story.service';
import { StoryCollaborationService } from './story-collaboration.service';
import { StoryActivityService } from './story-activity.service';
import { StoryDirectoryService } from './story-directory.service';
import {
  StoryActivity,
  StoryActivitySchema,
  StoryActivityCounter,
  StoryActivityCounterSchema,
} from '@/database/schemas/story-activity.schema';

describe('StoryService', () => {
  jest.setTimeout(60_000);

  let replicaSet: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let connection: Connection;
  let service: StoryService;
  const collaborationService = {
    assertAgentCanEdit: jest.fn(),
    detectAndRecordEditConflict: jest.fn(),
  };
  const actor = (name: string) => ({
    agentId: `agent-${name}`,
    ownerUserId: `owner-${name}`,
  });

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(replicaSet.getUri()),
        MongooseModule.forFeature([
          { name: Agent.name, schema: AgentSchema },
          { name: Story.name, schema: StorySchema },
          { name: StoryActivity.name, schema: StoryActivitySchema },
          { name: StoryActivityCounter.name, schema: StoryActivityCounterSchema },
          { name: StoryDocument.name, schema: StoryDocumentSchema },
          { name: StoryRevision.name, schema: StoryRevisionSchema },
          { name: StoryDiscussion.name, schema: StoryDiscussionSchema },
          { name: StoryDiscussionMessage.name, schema: StoryDiscussionMessageSchema },
          { name: StoryReview.name, schema: StoryReviewSchema },
        ]),
      ],
      providers: [
        StoryService,
        StoryActivityService,
        StoryDirectoryService,
        DatabaseService,
        { provide: StoryCollaborationService, useValue: collaborationService },
      ],
    }).compile();
    connection = moduleRef.get<Connection>(getConnectionToken());
    service = moduleRef.get(StoryService);
    await Promise.all([
      connection.model(Agent.name).init(),
      connection.model(Story.name).init(),
      connection.model(StoryActivity.name).init(),
      connection.model(StoryActivityCounter.name).init(),
      connection.model(StoryDocument.name).init(),
      connection.model(StoryRevision.name).init(),
      connection.model(StoryDiscussion.name).init(),
      connection.model(StoryDiscussionMessage.name).init(),
      connection.model(StoryReview.name).init(),
    ]);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    collaborationService.assertAgentCanEdit.mockResolvedValue(undefined);
    collaborationService.detectAndRecordEditConflict.mockResolvedValue(null);
    await Promise.all([
      connection.model(Agent.name).deleteMany({}),
      connection.model(Story.name).deleteMany({}),
      connection.model(StoryDocument.name).deleteMany({}),
      connection.collection('story_revisions').deleteMany({}),
      connection.collection('story_activities').deleteMany({}),
      connection.collection('story_activity_counters').deleteMany({}),
      connection.collection('story_discussions').deleteMany({}),
      connection.collection('story_discussion_messages').deleteMany({}),
      connection.collection('story_reviews').deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await moduleRef.close();
    await replicaSet.stop();
  });

  it('preserves the original failure when rolling back a linked scene and its revision', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'Scene rollback',
      premise: 'The clockmaker follows a physical trace.',
    });
    const { document: setting } = await service.createDocument(story.id, actor('a'), {
      kind: 'world_setting',
      title: 'Physical traces remain',
      content: 'The tide removes memories but leaves objects untouched.',
      changeSummary: 'Define the world rule.',
    });
    const { document: chapter } = await service.createDocument(story.id, actor('a'), {
      kind: 'chapter',
      title: 'At the lighthouse',
      content: 'The clockmaker reaches the door.',
      changeSummary: 'Draft the chapter.',
      expectedStructureVersion: 1,
      parentDocumentId: null,
      afterDocumentId: null,
    });
    const failure = new Error('Abort the scene creation transaction');
    const database = moduleRef.get(DatabaseService);

    await expect(
      database.$transaction(async () => {
        await service.createDocument(story.id, actor('a'), {
          kind: 'scene',
          title: 'Oil on the latch',
          content: 'Red oil remains on the latch after the tide.',
          links: [{ targetDocumentId: setting.id, relation: 'references' }],
          changeSummary: 'Add a scene that applies the world rule.',
          expectedStructureVersion: 2,
          parentDocumentId: chapter.id,
          afterDocumentId: null,
        });
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(await connection.model(StoryDocument.name).countDocuments({ kind: 'scene' })).toBe(0);
    expect(await connection.model(StoryRevision.name).countDocuments({ storyId: story.id })).toBe(
      3,
    );
    expect((await service.getStory(story.id)).story.structureVersion).toBe(2);
  });

  it('returns a structure conflict instead of an internal error for simultaneous linked scenes', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'Concurrent scenes',
      premise: 'Two writers add a scene at the same position.',
    });
    const { document: setting } = await service.createDocument(story.id, actor('a'), {
      kind: 'world_setting',
      title: 'The tide',
      content: 'Physical traces remain after memories fade.',
      changeSummary: 'Define a shared rule.',
    });
    const { document: chapter } = await service.createDocument(story.id, actor('a'), {
      kind: 'chapter',
      title: 'The door',
      content: 'The clockmaker reaches the lighthouse.',
      changeSummary: 'Draft the chapter.',
      expectedStructureVersion: 1,
      parentDocumentId: null,
      afterDocumentId: null,
    });
    const results = await Promise.allSettled(
      ['a', 'b'].map((name) =>
        service.createDocument(story.id, actor(name), {
          kind: 'scene',
          title: 'Scene ' + name,
          content: 'Red oil remains on the door.',
          links: [{ targetDocumentId: setting.id, relation: 'references' }],
          changeSummary: 'Add an evidence scene.',
          expectedStructureVersion: 2,
          parentDocumentId: chapter.id,
          afterDocumentId: null,
        }),
      ),
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    if (!rejected || rejected.status !== 'rejected') throw new Error('Expected a stale scene');
    expect(rejected.reason).toMatchObject({
      response: { code: 'STORY_STRUCTURE_VERSION_CONFLICT', currentStructureVersion: 3 },
    });
    expect(await connection.model(StoryDocument.name).countDocuments({ kind: 'scene' })).toBe(1);
  });

  it('returns one current body and a revision summary for every document write', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'Compact writes',
      premise: 'A clockmaker keeps the original record.',
    });
    const { document: volume } = await service.createDocument(story.id, actor('a'), {
      kind: 'volume',
      title: 'First volume',
      content: 'The first arc.',
      changeSummary: 'Create the volume.',
      expectedStructureVersion: 1,
      parentDocumentId: null,
      afterDocumentId: null,
    });
    const original = 'The clockmaker remembers. '.repeat(1_000);
    const changed = 'The clockmaker writes it down. '.repeat(1_000);
    const created = await service.createDocument(story.id, actor('a'), {
      kind: 'chapter',
      title: 'The original record',
      content: original,
      changeSummary: 'Draft the chapter.',
      expectedStructureVersion: 2,
      parentDocumentId: null,
      afterDocumentId: volume.id,
    });
    const revised = await service.reviseDocument(created.document.id, actor('b'), {
      expectedVersion: 1,
      content: changed,
      changeSummary: 'Record the memory.',
    });
    const restored = await service.restoreDocument(created.document.id, actor('a'), {
      expectedVersion: 2,
      targetRevisionNumber: 1,
      changeSummary: 'Restore the original wording.',
    });
    const moved = await service.moveDocument(story.id, created.document.id, actor('a'), {
      expectedVersion: 3,
      expectedStructureVersion: 3,
      parentDocumentId: volume.id,
      afterDocumentId: null,
      changeSummary: 'Place in the first volume.',
    });
    const withdrawn = await service.withdrawDocument(story.id, created.document.id, actor('a'), {
      expectedVersion: 4,
      expectedStructureVersion: 4,
      changeSummary: 'Withdraw for checking.',
    });
    const reinstated = await service.reinstateDocument(story.id, created.document.id, actor('a'), {
      expectedVersion: 5,
      expectedStructureVersion: 5,
      parentDocumentId: volume.id,
      afterDocumentId: null,
      changeSummary: 'Reinstate the checked chapter.',
    });

    for (const [index, result] of [
      created,
      revised,
      restored,
      moved,
      withdrawn,
      reinstated,
    ].entries()) {
      expect(result.revision).toMatchObject({
        storyId: story.id,
        documentId: created.document.id,
        revisionNumber: index + 1,
        baseVersion: index,
      });
      expect(result.revision).not.toHaveProperty('diff');
      const serialized = JSON.stringify(result);
      expect(serialized.split(result.document.content)).toHaveLength(2);
      expect(serialized).not.toContain(index === 1 ? original : changed);
    }
    expect(reinstated.revision.directoryChange).toMatchObject({
      structureVersion: 6,
      before: null,
      after: { parentDocumentId: volume.id, afterDocumentId: null },
    });
    expect(
      (await service.getDocumentRevision(story.id, created.document.id, 2)).snapshot.content,
    ).toBe(changed);
  });

  it('returns a revision summary beside the current opening when revising and restoring', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'Opening history',
      premise: 'An old letter arrives.',
    });
    const revised = await service.reviseStory(story.id, actor('b'), {
      expectedVersion: 1,
      premise: 'A new letter arrives.',
      changeSummary: 'Change the premise.',
    });
    const restored = await service.restoreStory(story.id, actor('a'), {
      expectedVersion: 2,
      targetRevisionNumber: 1,
      changeSummary: 'Restore the original premise.',
    });
    for (const result of [revised, restored]) {
      expect(result.revision).toMatchObject({
        storyId: story.id,
        targetType: 'story',
        documentId: null,
      });
      expect(result.revision).not.toHaveProperty('diff');
      expect(JSON.stringify(result).split(result.story.premise)).toHaveLength(2);
    }
    expect((await service.getStoryRevision(story.id, 2)).snapshot.premise).toBe(
      'A new letter arrives.',
    );
  });

  it('captures the initial activity checkpoint before reading the opening', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'A safe handover',
      premise: 'The clock has not moved.',
    });
    const activities = moduleRef.get(StoryActivityService);
    const readLatestSequence = activities.latestSequence.bind(activities);
    const latestSequence = jest
      .spyOn(activities, 'latestSequence')
      .mockImplementationOnce(async (id) => {
        await service.reviseStory(story.id, actor('b'), {
          expectedVersion: 1,
          premise: 'The clock has moved.',
          changeSummary: 'A revision commits while the newcomer reads.',
        });
        return readLatestSequence(id);
      });
    try {
      const overview = await service.getStory(story.id);
      expect(overview.latestSequence).toBe(2);
      expect(overview.story).toMatchObject({ currentVersion: 2, premise: 'The clock has moved.' });
      await service.reviseStory(story.id, actor('b'), {
        expectedVersion: 2,
        premise: 'The clock moves again.',
        changeSummary: 'Continue after the handover.',
      });
      const resumed = await service.listActivity(story.id, {
        afterSequence: overview.latestSequence,
      });
      expect(resumed.items).toEqual([expect.objectContaining({ sequence: 3, revisionNumber: 3 })]);
    } finally {
      latestSequence.mockRestore();
    }
  });

  it('restores a selection whose resulting content exceeds 50000 characters', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'Long chapter',
      premise: 'A record.',
    });
    const { document } = await service.createDocument(story.id, actor('a'), {
      kind: 'world_setting',
      title: 'Long memory',
      content: `${'A'.repeat(30_000)}\ntail`,
      changeSummary: 'Record the first version.',
    });
    await service.reviseDocument(document.id, actor('b'), {
      expectedVersion: 1,
      content: `${'B'.repeat(20_000)}\nx`,
      changeSummary: 'Record a shorter first line.',
    });
    const selection = {
      currentStartLine: 2,
      currentEndLine: 2,
      targetStartLine: 1,
      targetEndLine: 1,
    };
    const restored = await service.restoreDocument(document.id, actor('a'), {
      expectedVersion: 2,
      targetRevisionNumber: 1,
      selection,
      changeSummary: 'Restore the selected historical line.',
    });
    expect(restored.document.content).toBe(`${'B'.repeat(20_000)}\n${'A'.repeat(30_000)}`);
    expect(restored.document.currentVersion).toBe(3);
    expect((await service.listDocumentRevisions(document.id)).items).toHaveLength(3);
    expect((await service.listActivity(story.id, { afterSequence: 0 })).nextSequence).toBe(4);
  });

  it('creates, revises and restores full bodies above 50000 characters', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'Wave records',
      premise: 'A record survives.',
    });
    const content = '潮'.repeat(60_000);
    const revisedContent = '🌊'.repeat(60_001);
    for (const body of [content, revisedContent]) {
      expect(Buffer.byteLength(JSON.stringify({ content: body }), 'utf8')).toBeLessThan(1_048_576);
    }
    const { document } = await service.createDocument(story.id, actor('a'), {
      kind: 'world_setting',
      title: 'Wave notation',
      content,
      changeSummary: 'Write the full notation.',
    });
    expect(document.content).toBe(content);
    const revised = await service.reviseDocument(document.id, actor('b'), {
      expectedVersion: 1,
      content: revisedContent,
      changeSummary: 'Record the revised full text.',
    });
    expect(revised.document.content).toBe(revisedContent);
    expect((await service.getDocumentRevision(story.id, document.id, 1)).snapshot.content).toBe(
      content,
    );
    expect((await service.getDocumentRevision(story.id, document.id, 2)).snapshot.content).toBe(
      revisedContent,
    );
    const restored = await service.restoreDocument(document.id, actor('a'), {
      expectedVersion: 2,
      targetRevisionNumber: 1,
      changeSummary: 'Restore the full notation.',
    });
    expect(restored.document.content).toBe(content);
    expect(restored.document.currentVersion).toBe(3);
  });

  it('passes the document id to restriction checks before revising and records conflict signals', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'The Glass Coast',
      premise: 'A cartographer discovers a coastline that changes overnight.',
    });
    const { document } = await service.createDocument(story.id, actor('a'), {
      kind: 'world_setting',
      title: 'Opening',
      content: 'The coast is quiet.',
      changeSummary: 'Start the chapter.',
    });

    await service.reviseDocument(
      document.id,
      actor('b'),
      {
        expectedVersion: 1,
        content: 'The coast remembers every visitor.',
        changeSummary: 'Reveal the coast remembers people.',
      },
      story.id,
    );

    expect(collaborationService.assertAgentCanEdit).toHaveBeenLastCalledWith(
      story.id,
      'agent-b',
      expect.anything(),
      document.id,
    );
    expect(collaborationService.detectAndRecordEditConflict).toHaveBeenCalledWith(
      story.id,
      document.id,
      actor('b'),
      expect.anything(),
    );
  });

  it('passes the document id to restriction checks before restoring a document', async () => {
    const story = await service.createStory(actor('author'), {
      title: 'The Glass Coast',
      premise: 'A cartographer discovers a coastline that changes overnight.',
    });
    const { document } = await service.createDocument(story.id, actor('author'), {
      kind: 'world_setting',
      title: 'Opening',
      content: 'The coast is quiet.',
      changeSummary: 'Start the chapter.',
    });
    await service.reviseDocument(
      document.id,
      actor('editor'),
      { expectedVersion: 1, content: 'The coast remembers.', changeSummary: 'Add memory.' },
      story.id,
    );

    await service.restoreDocument(
      document.id,
      actor('editor'),
      { expectedVersion: 2, targetRevisionNumber: 1, changeSummary: 'Restore opening.' },
      story.id,
    );

    expect(collaborationService.assertAgentCanEdit).toHaveBeenLastCalledWith(
      story.id,
      'agent-editor',
      expect.anything(),
      document.id,
    );
  });

  it('returns a lightweight document directory while preserving linked full-text reads', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'The Glass Coast',
      premise: 'A coastline changes overnight.',
    });
    const { document: setting } = await service.createDocument(story.id, actor('a'), {
      kind: 'world_setting',
      title: 'Tide rule',
      content: 'Every tide returns a forgotten name.',
      changeSummary: 'Establish the tide.',
    });
    const { document: chapter } = await service.createDocument(story.id, actor('b'), {
      kind: 'world_setting',
      title: 'The First Map',
      content: 'Mira watches the harbor move.',
      links: [{ targetDocumentId: setting.id, relation: 'references' }],
      changeSummary: 'Write the opening.',
    });

    const page = await service.listDocuments(story.id);
    expect(page.items.map((item) => item.toJSON())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: chapter.id,
          storyId: story.id,
          kind: 'world_setting',
          title: 'The First Map',
          currentVersion: 1,
          createdByAgentId: 'agent-b',
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
          links: [{ targetDocumentId: setting.id, relation: 'references' }],
        }),
      ]),
    );
    for (const item of JSON.parse(JSON.stringify(page.items))) {
      expect(item).not.toHaveProperty('content');
      expect(item).not.toHaveProperty('createdByOwnerUserIdSnapshot');
    }
    expect(await service.getDocument(chapter.id, story.id)).toMatchObject({
      content: 'Mira watches the harbor move.',
    });
  });

  it('searches document titles by literal prefix and binds pagination to the title and kind filters', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'The Glass Coast',
      premise: 'A coastline changes overnight.',
    });
    for (const title of ['Mira [map] I', 'Mira [map] II', 'Mira map III']) {
      await service.createDocument(story.id, actor('a'), {
        kind: 'world_setting',
        title,
        content: 'A tide.',
        changeSummary: 'Add a chapter.',
      });
    }
    await service.createDocument(story.id, actor('a'), {
      kind: 'world_setting',
      title: 'Mira [map] I',
      content: 'A second version of the title.',
      changeSummary: 'Repeat the chapter title.',
    });
    await service.createDocument(story.id, actor('a'), {
      kind: 'character',
      title: 'Mira [map]',
      content: 'A cartographer.',
      changeSummary: 'Introduce Mira.',
    });

    const filters = { q: 'Mira [map]', kind: 'world_setting' as const, limit: 1 };
    const firstPage = await service.listDocuments(story.id, filters);
    expect(firstPage.items.map((item) => item.title)).toEqual(['Mira [map] I']);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    const secondPage = await service.listDocuments(story.id, {
      ...filters,
      cursor: firstPage.nextCursor ?? undefined,
    });
    expect(secondPage.items.map((item) => item.title)).toEqual(['Mira [map] I']);
    expect(secondPage.nextCursor).toEqual(expect.any(String));
    const thirdPage = await service.listDocuments(story.id, {
      ...filters,
      cursor: secondPage.nextCursor ?? undefined,
    });
    expect(thirdPage.items.map((item) => item.title)).toEqual(['Mira [map] II']);
    expect(thirdPage.nextCursor).toBeNull();
    await expect(
      service.listDocuments(story.id, {
        ...filters,
        q: 'Mira',
        cursor: firstPage.nextCursor ?? undefined,
      }),
    ).rejects.toMatchObject({ response: { code: 'PAGINATION_CURSOR_INVALID' } });
    await expect(service.listDocuments(story.id, { q: 'mira [map]' })).resolves.toMatchObject({
      items: [],
      nextCursor: null,
    });
  });

  it('reads latest discussion messages first and binds tie-safe cursors to the requested direction', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'The Glass Coast',
      premise: 'A coastline changes overnight.',
    });
    const { document } = await service.createDocument(story.id, actor('a'), {
      kind: 'world_setting',
      title: 'The First Map',
      content: 'A tide.',
      changeSummary: 'Start.',
    });
    const { discussion } = await service.createDiscussion(story.id, actor('a'), {
      targetType: 'document',
      documentId: document.id,
      revisionNumber: 1,
      title: 'Who sees the coast?',
      content: 'First.',
    });
    await service.addDiscussionMessage(story.id, discussion.id, actor('b'), { content: 'Second.' });
    await service.addDiscussionMessage(story.id, discussion.id, actor('c'), { content: 'Third.' });
    await connection
      .collection('story_discussion_messages')
      .updateMany(
        { discussionId: discussion.id },
        { $set: { createdAt: new Date('2026-01-01T00:00:00Z') } },
      );

    const latest = await service.listDiscussionMessages(story.id, discussion.id, { limit: 2 });
    expect(latest.items.map((item) => item.content)).toEqual(['Third.', 'Second.']);
    const older = await service.listDiscussionMessages(story.id, discussion.id, {
      limit: 2,
      cursor: latest.nextCursor ?? undefined,
    });
    expect(older.items.map((item) => item.content)).toEqual(['First.']);
    expect(older.nextCursor).toBeNull();
    const forward = { limit: 2, order: 'asc' as const };
    const earliest = await service.listDiscussionMessages(story.id, discussion.id, forward);
    expect(earliest.items.map((item) => item.content)).toEqual(['First.', 'Second.']);
    const newer = await service.listDiscussionMessages(story.id, discussion.id, {
      ...forward,
      cursor: earliest.nextCursor ?? undefined,
    });
    expect(newer.items.map((item) => item.content)).toEqual(['Third.']);
    await expect(
      service.listDiscussionMessages(story.id, discussion.id, {
        ...forward,
        cursor: latest.nextCursor ?? undefined,
      }),
    ).rejects.toMatchObject({ response: { code: 'PAGINATION_CURSOR_INVALID' } });
  });

  it('lets a second Agent edit and rejects an outdated base without overwriting the current revision', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'The Glass Coast',
      premise: 'A cartographer discovers a coastline that changes overnight.',
    });
    expect(story.toJSON()).not.toHaveProperty('createdByOwnerUserIdSnapshot');
    const { document } = await service.createDocument(story.id, actor('a'), {
      kind: 'character',
      title: 'Mira',
      content: 'Mira is a patient mapmaker.',
      changeSummary: 'Start the character archive.',
    });

    await service.reviseDocument(document.id, actor('b'), {
      expectedVersion: 1,
      content: 'Mira is a patient mapmaker who distrusts fixed borders.',
      changeSummary: 'Give Mira a conflict with the changing coast.',
    });

    await expect(
      service.reviseDocument(document.id, actor('c'), {
        expectedVersion: 1,
        content: 'Mira is a retired admiral.',
        changeSummary: 'Try another character direction.',
      }),
    ).rejects.toMatchObject({
      response: { code: 'STORY_VERSION_CONFLICT', currentVersion: 2 },
    });

    const current = await service.getDocument(document.id);
    const revisions = await service.listDocumentRevisions(document.id);
    expect(current).toMatchObject({
      currentVersion: 2,
      content: 'Mira is a patient mapmaker who distrusts fixed borders.',
    });
    expect(revisions.items).toHaveLength(2);
    expect(revisions.items[0]).not.toHaveProperty('authorOwnerUserIdSnapshot');
    expect(revisions.items[0]).toMatchObject({
      baseVersion: 1,
      revisionNumber: 2,
      authorAgentId: 'agent-b',
      changeSummary: 'Give Mira a conflict with the changing coast.',
      title: 'Mira',
    });
    expect(revisions.items[0]).not.toHaveProperty('diff');
    expect(
      await service.compareRevisions({
        documentId: document.id,
        fromRevisionNumber: 1,
        toRevisionNumber: 2,
      }),
    ).toMatchObject({
      fromSnapshot: { content: 'Mira is a patient mapmaker.' },
      toSnapshot: { content: 'Mira is a patient mapmaker who distrusts fixed borders.' },
      changedFields: ['content'],
    });
  });

  it('allows exactly one of two concurrent edits against the same base version', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'The Glass Coast',
      premise: 'A cartographer discovers a coastline that changes overnight.',
    });
    const { document } = await service.createDocument(story.id, actor('a'), {
      kind: 'world_setting',
      title: 'The First Map',
      content: 'Mira finds the map.',
      changeSummary: 'Start the chapter.',
    });

    const outcomes = await Promise.allSettled([
      service.reviseDocument(document.id, actor('b'), {
        expectedVersion: 1,
        content: 'Mira hides the map.',
        changeSummary: 'Choose a secretive direction.',
      }),
      service.reviseDocument(document.id, actor('c'), {
        expectedVersion: 1,
        content: 'Mira gives the map away.',
        changeSummary: 'Choose a generous direction.',
      }),
    ]);
    const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const conflict = rejected[0];
    if (!conflict || conflict.status !== 'rejected') {
      throw new Error('The competing story edit did not return a conflict.');
    }
    expect(conflict.reason).toMatchObject({
      response: { code: 'STORY_VERSION_CONFLICT', currentVersion: 2 },
    });
    const current = await service.getDocument(document.id);
    const revisions = await service.listDocumentRevisions(document.id);
    expect(current.currentVersion).toBe(2);
    expect(revisions.items).toHaveLength(2);
  });

  it('restores a prior version as a new revision and compares immutable snapshots', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'The Glass Coast',
      premise: 'A cartographer discovers a coastline that changes overnight.',
    });
    const { document } = await service.createDocument(story.id, actor('a'), {
      kind: 'world_setting',
      title: 'Tideglass',
      content: 'The coast shifts at each new moon.',
      changeSummary: 'Establish the coastal rule.',
    });
    await service.reviseDocument(document.id, actor('b'), {
      expectedVersion: 1,
      content: 'The coast shifts every dawn.',
      changeSummary: 'Test a faster cycle.',
    });

    const { document: restored } = await service.restoreDocument(document.id, actor('c'), {
      expectedVersion: 2,
      targetRevisionNumber: 1,
      changeSummary: 'Return to the slower cycle while preserving the experiment in history.',
    });
    const comparison = await service.compareRevisions({
      documentId: document.id,
      fromRevisionNumber: 1,
      toRevisionNumber: 3,
    });
    const history = await service.listDocumentRevisions(document.id);

    expect(restored).toMatchObject({
      currentVersion: 3,
      content: 'The coast shifts at each new moon.',
    });
    expect(comparison.changedFields).toEqual([]);
    expect(history.items.map((revision) => revision.revisionNumber)).toEqual([3, 2, 1]);
    expect(history.items[0]).toMatchObject({
      baseVersion: 2,
      revisionNumber: 3,
      authorAgentId: 'agent-c',
      changeSummary: 'Return to the slower cycle while preserving the experiment in history.',
    });
  });

  it('pages document revision summaries from newest to older and binds the cursor to that document', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'The Glass Coast',
      premise: 'A coastline changes overnight.',
    });
    const { document } = await service.createDocument(story.id, actor('a'), {
      kind: 'world_setting',
      title: 'The First Map',
      content: 'Version one.',
      changeSummary: 'Start the chapter.',
    });
    await service.reviseDocument(document.id, actor('b'), {
      expectedVersion: 1,
      content: 'Version two.',
      changeSummary: 'Revise twice.',
    });
    await service.reviseDocument(document.id, actor('c'), {
      expectedVersion: 2,
      content: 'Version three.',
      changeSummary: 'Revise thrice.',
    });
    const firstPage = await service.listDocumentRevisions(document.id, { limit: 2 });
    expect(firstPage.items.map((revision) => revision.revisionNumber)).toEqual([3, 2]);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    const olderPage = await service.listDocumentRevisions(document.id, {
      cursor: firstPage.nextCursor ?? undefined,
      limit: 2,
    });
    expect(olderPage.items.map((revision) => revision.revisionNumber)).toEqual([1]);
    expect(olderPage.nextCursor).toBeNull();

    const { document: anotherDocument } = await service.createDocument(story.id, actor('d'), {
      kind: 'world_setting',
      title: 'Another Map',
      content: 'Another version.',
      changeSummary: 'Start another chapter.',
    });
    await expect(
      service.listDocumentRevisions(anotherDocument.id, {
        cursor: firstPage.nextCursor ?? undefined,
        limit: 2,
      }),
    ).rejects.toMatchObject({ response: { code: 'PAGINATION_CURSOR_INVALID' } });
  });

  it('restores a selected line range from a prior version without replacing adjacent edits', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'The Glass Coast',
      premise: 'A cartographer discovers a coastline that changes overnight.',
    });
    const { document } = await service.createDocument(story.id, actor('a'), {
      kind: 'world_setting',
      title: 'The Harbor',
      content: 'The harbor is silent.\nMira checks the map.\nThe tide turns.',
      changeSummary: 'Draft the scene.',
    });
    await service.reviseDocument(document.id, actor('b'), {
      expectedVersion: 1,
      content: 'The harbor is silent.\nMira burns the map.\nThe tide turns.',
      changeSummary: 'Try a more forceful choice.',
    });

    const restored = await service.restoreDocument(document.id, actor('c'), {
      expectedVersion: 2,
      targetRevisionNumber: 1,
      changeSummary: 'Restore Mira checking the map, leaving the surrounding lines intact.',
      selection: {
        currentStartLine: 2,
        currentEndLine: 2,
        targetStartLine: 2,
        targetEndLine: 2,
      },
    });

    expect(restored.document).toMatchObject({
      currentVersion: 3,
      content: 'The harbor is silent.\nMira checks the map.\nThe tide turns.',
    });
    const previous = await service.getDocumentRevision(story.id, document.id, 2);
    expect(previous.snapshot).toMatchObject({
      content: 'The harbor is silent.\nMira burns the map.\nThe tide turns.',
    });
  });

  it('binds discussion cursors to optional document and revision filters', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'The Glass Coast',
      premise: 'A cartographer discovers a coastline that changes overnight.',
    });
    const { document } = await service.createDocument(story.id, actor('a'), {
      kind: 'world_setting',
      title: 'The First Map',
      content: 'Mira watches the harbor move.',
      changeSummary: 'Draft the opening chapter.',
    });
    await service.createDiscussion(story.id, actor('b'), {
      targetType: 'document',
      documentId: document.id,
      revisionNumber: 1,
      title: 'First question',
      content: 'Should Mira trust the map?',
    });
    await service.createDiscussion(story.id, actor('c'), {
      targetType: 'document',
      documentId: document.id,
      revisionNumber: 1,
      title: 'Second question',
      content: 'Who drew the map?',
    });

    const firstPage = await service.listDiscussions(story.id, {
      documentId: document.id,
      revisionNumber: 1,
      limit: 1,
    });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    await expect(
      service.listDiscussions(story.id, {
        documentId: document.id,
        revisionNumber: 2,
        cursor: firstPage.nextCursor ?? undefined,
        limit: 1,
      }),
    ).rejects.toMatchObject({ response: { code: 'PAGINATION_CURSOR_INVALID' } });
  });

  it('records a discussion target without sending an inbox notification', async () => {
    const story = await service.createStory(actor('author'), {
      title: 'The Glass Coast',
      premise: 'A cartographer discovers a coastline that changes overnight.',
    });
    const { document } = await service.createDocument(story.id, actor('author'), {
      kind: 'character',
      title: 'Mira',
      content: 'Mira studies the old maps.',
      changeSummary: 'Create Mira.',
    });

    const addressedAgent = await connection.model(Agent.name).create({
      name: 'addressed-agent',
      description: '',
      userId: 'addressed-owner',
    });
    const notificationsBefore = await connection.collection('notifications').countDocuments({});
    const result = await service.createDiscussion(story.id, actor('author'), {
      targetType: 'document',
      documentId: document.id,
      revisionNumber: 1,
      title: 'Question about Mira',
      content: 'Does this conflict with her earlier motive?',
      anchorText: 'Mira studies the old maps.',
      addressedAgentId: addressedAgent.id,
    });

    expect(result.discussion).toMatchObject({ addressedAgentId: addressedAgent.id });
    await expect(connection.collection('notifications').countDocuments({})).resolves.toBe(
      notificationsBefore,
    );
  });

  it('rejects a targeted discussion addressed to its own author', async () => {
    const story = await service.createStory(actor('author'), {
      title: 'The Glass Coast',
      premise: 'A cartographer discovers a coastline that changes overnight.',
    });
    const { document } = await service.createDocument(story.id, actor('author'), {
      kind: 'character',
      title: 'Mira',
      content: 'Mira studies the old maps.',
      changeSummary: 'Create Mira.',
    });

    await expect(
      service.createDiscussion(story.id, actor('author'), {
        targetType: 'document',
        documentId: document.id,
        revisionNumber: 1,
        title: 'Question about Mira',
        content: 'Does this conflict with her earlier motive?',
        addressedAgentId: actor('author').agentId,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a discussion addressed to an Agent that does not exist', async () => {
    const story = await service.createStory(actor('author'), {
      title: 'The Glass Coast',
      premise: 'A cartographer discovers a coastline that changes overnight.',
    });
    const { document } = await service.createDocument(story.id, actor('author'), {
      kind: 'character',
      title: 'Mira',
      content: 'Mira studies the old maps.',
      changeSummary: 'Create Mira.',
    });
    await expect(
      service.createDiscussion(story.id, actor('author'), {
        targetType: 'document',
        documentId: document.id,
        revisionNumber: 1,
        title: 'Question about Mira',
        content: 'Does this conflict with her earlier motive?',
        addressedAgentId: new Types.ObjectId().toString(),
      }),
    ).rejects.toMatchObject({ response: { code: 'STORY_DISCUSSION_TARGET_INVALID' } });
  });
  it('keeps story opening discussion and feedback anchored to the exact metadata revision', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'A shared opening',
      premise: 'The city remembers.',
    });
    const { discussion } = await service.createDiscussion(story.id, actor('b'), {
      targetType: 'story',
      documentId: null,
      revisionNumber: 1,
      title: 'What does remember mean?',
      content: 'Can we make this memory unreliable?',
      anchorText: 'The city remembers.',
    });
    const review = await service.createReview(story.id, actor('b'), {
      targetType: 'story',
      documentId: null,
      revisionNumber: 1,
      content: 'The premise gives a useful shared question.',
    });
    await service.reviseStory(story.id, actor('a'), {
      expectedVersion: 1,
      changeSummary: 'Clarify the premise.',
      premise: 'The city forgets at dawn.',
    });
    expect(await service.getStoryRevision(story.id, 1)).toMatchObject({
      snapshot: { premise: 'The city remembers.' },
    });
    expect(await service.getDiscussion(story.id, discussion.id)).toMatchObject({
      targetType: 'story',
      documentId: null,
      revisionNumber: 1,
    });
    expect(
      (await service.listReviews(story.id, { targetType: 'story' })).items.map((item) => item.id),
    ).toEqual([review.id]);
    const phaseReview = await service.createReview(story.id, actor('b'), {
      targetType: 'story',
      documentId: null,
      revisionNumber: 2,
      content: 'The opening phase is still appropriate.',
      anchorText: 'opening',
    });
    expect(phaseReview).toMatchObject({ revisionNumber: 2, anchorText: 'opening' });
  });

  it('returns only the selected historical snapshots when comparing large document revisions', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'History',
      premise: 'An archive.',
    });
    const { document } = await service.createDocument(story.id, actor('a'), {
      kind: 'character',
      title: 'Archivist',
      content: 'A'.repeat(10000),
      changeSummary: 'Start.',
    });
    await service.reviseDocument(document.id, actor('b'), {
      expectedVersion: 1,
      content: 'B'.repeat(10000),
      changeSummary: 'Revise.',
    });
    await service.reviseDocument(document.id, actor('b'), {
      expectedVersion: 2,
      content: 'C'.repeat(10000),
      changeSummary: 'Revise again.',
    });
    const result = await service.compareRevisions(
      { documentId: document.id, fromRevisionNumber: 2, toRevisionNumber: 3 },
      story.id,
    );
    expect(result.changedFields).toEqual(['content']);
    expect(result.fromRevision).not.toHaveProperty('diff');
    expect(JSON.stringify(result).split('B'.repeat(10000))).toHaveLength(2);
    expect(JSON.stringify(result).split('C'.repeat(10000))).toHaveLength(2);
    expect(await service.getDocumentRevision(story.id, document.id, 2)).toMatchObject({
      snapshot: { content: 'B'.repeat(10000) },
    });
  });

  it('withdraws a mistaken material reversibly without hiding its history or changing state during content restore', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'Materials',
      premise: 'A shared archive.',
    });
    const { document } = await service.createDocument(story.id, actor('a'), {
      kind: 'character',
      title: 'Duplicate',
      content: 'First note.',
      changeSummary: 'Create.',
    });
    await service.reviseDocument(document.id, actor('b'), {
      expectedVersion: 1,
      content: 'Second note.',
      changeSummary: 'Correct.',
    });
    await service.withdrawDocument(story.id, document.id, actor('b'), {
      expectedVersion: 2,
      changeSummary: 'Duplicate material.',
    });
    expect((await service.listDocuments(story.id)).items).toHaveLength(0);
    expect(await service.getDocument(document.id, story.id)).toMatchObject({
      archived: true,
      currentVersion: 3,
    });
    await expect(
      service.reviseDocument(document.id, actor('b'), {
        expectedVersion: 3,
        content: 'Hidden update.',
        changeSummary: 'Wrong.',
      }),
    ).rejects.toMatchObject({ response: { code: 'STORY_DOCUMENT_WITHDRAWN' } });
    await service.restoreDocument(
      document.id,
      actor('b'),
      { expectedVersion: 3, targetRevisionNumber: 1, changeSummary: 'Restore content only.' },
      story.id,
    );
    expect(await service.getDocument(document.id, story.id)).toMatchObject({
      archived: true,
      currentVersion: 4,
      content: 'First note.',
    });
    await service.reinstateDocument(story.id, document.id, actor('b'), {
      expectedVersion: 4,
      changeSummary: 'Restore to directory.',
    });
    expect(await service.getDocument(document.id, story.id)).toMatchObject({
      archived: false,
      currentVersion: 5,
      content: 'First note.',
    });
    expect((await service.listDocumentRevisions(document.id)).items).toHaveLength(5);
  });

  it('records old-thread replies in persistent activity and reads the parent without scanning the discussion', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'Conversation',
      premise: 'A city.',
    });
    const { discussion, initialMessage } = await service.createDiscussion(story.id, actor('a'), {
      targetType: 'story',
      documentId: null,
      revisionNumber: 1,
      title: 'Opening question',
      content: 'Who remembers?',
    });
    const message = await service.addDiscussionMessage(story.id, discussion.id, actor('b'), {
      content: 'A clockmaker.',
      parentMessageId: initialMessage.id,
    });
    expect(
      await service.getDiscussionMessage(story.id, discussion.id, initialMessage.id),
    ).toMatchObject({ content: 'Who remembers?' });
    const activities = await service.listActivity(story.id, { afterSequence: 2 });
    expect(activities.items).toEqual([
      expect.objectContaining({
        kind: 'MESSAGE_CREATED',
        messageId: message.id,
        discussionId: discussion.id,
      }),
    ]);
    expect(activities.nextSequence).toBe(3);
  });
  it('uses the shared ordered directory for chapter insertion, moving and explicit reinstatement', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'Ordered novel',
      premise: 'A clockmaker follows the tide.',
    });
    const { document: volume } = await service.createDocument(story.id, actor('a'), {
      kind: 'volume',
      title: 'Volume one',
      content: 'First arc.',
      changeSummary: 'Start volume.',
      expectedStructureVersion: 1,
      parentDocumentId: null,
      afterDocumentId: null,
    });
    const { document: first } = await service.createDocument(story.id, actor('a'), {
      kind: 'chapter',
      title: 'First chapter',
      content: 'The clock stops.',
      changeSummary: 'Start first chapter.',
      expectedStructureVersion: 2,
      parentDocumentId: volume.id,
      afterDocumentId: null,
    });
    const { document: last } = await service.createDocument(story.id, actor('b'), {
      kind: 'chapter',
      title: 'Last chapter',
      content: 'The tide returns.',
      changeSummary: 'Continue.',
      expectedStructureVersion: 3,
      parentDocumentId: volume.id,
      afterDocumentId: first.id,
    });
    const { document: middle } = await service.createDocument(story.id, actor('b'), {
      kind: 'chapter',
      title: 'Middle chapter',
      content: 'A letter arrives.',
      changeSummary: 'Insert missing scene.',
      expectedStructureVersion: 4,
      parentDocumentId: volume.id,
      afterDocumentId: first.id,
    });
    expect(
      (await service.listDirectory(story.id, { parentDocumentId: volume.id })).items.map(
        (item) => item.id,
      ),
    ).toEqual([first.id, middle.id, last.id]);
    const firstHistorical = await service.getDocumentRevision(story.id, last.id, 1);
    expect(firstHistorical.snapshot).not.toHaveProperty('previousDocumentId');
    expect(firstHistorical.revision.directoryChange).toMatchObject({
      structureVersion: 4,
      before: null,
      after: { parentDocumentId: volume.id, afterDocumentId: first.id },
    });
    expect(await service.getReadingStart(story.id)).toMatchObject({ document: { id: first.id } });
    expect(await service.getDocumentLocation(story.id, middle.id)).toMatchObject({
      ancestors: [{ id: volume.id }],
      previousDocument: { id: first.id },
      nextDocument: { id: last.id },
    });
    await expect(
      service.withdrawDocument(story.id, volume.id, actor('b'), {
        expectedVersion: 1,
        expectedStructureVersion: 5,
        changeSummary: 'Cannot hide chapters.',
      }),
    ).rejects.toMatchObject({ response: { code: 'STORY_DOCUMENT_HAS_CHILDREN' } });
    await service.withdrawDocument(story.id, middle.id, actor('b'), {
      expectedVersion: 1,
      expectedStructureVersion: 5,
      changeSummary: 'Remove mistaken insertion.',
    });
    await service.reinstateDocument(story.id, middle.id, actor('b'), {
      expectedVersion: 2,
      expectedStructureVersion: 6,
      parentDocumentId: volume.id,
      afterDocumentId: last.id,
      changeSummary: 'Rejoin at end.',
    });
    await expect(
      service.restoreDocument(
        middle.id,
        actor('b'),
        {
          expectedVersion: 3,
          targetRevisionNumber: 1,
          changeSummary: 'Check old body cannot change position.',
        },
        story.id,
      ),
    ).rejects.toMatchObject({ response: { code: 'STORY_UNCHANGED' } });
    expect((await service.getDocument(middle.id, story.id)).previousDocumentId?.toString()).toBe(
      last.id,
    );
    expect(
      (await service.listDirectory(story.id, { parentDocumentId: volume.id })).items.map(
        (item) => item.id,
      ),
    ).toEqual([first.id, last.id, middle.id]);
  });

  it('resolves linked summaries and reverse references without reading unrelated full text', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'References',
      premise: 'An archive.',
    });
    const { document: character } = await service.createDocument(story.id, actor('a'), {
      kind: 'character',
      title: 'Mira',
      content: 'A mapmaker.',
      changeSummary: 'Introduce.',
    });
    const { document: setting } = await service.createDocument(story.id, actor('a'), {
      kind: 'world_setting',
      title: 'Glass coast',
      content: 'Mira visits the coast.',
      changeSummary: 'Link a character.',
      links: [{ targetDocumentId: character.id, relation: 'features' }],
    });
    const selection = await service.listDocuments(story.id, {
      documentIds: [setting.id, character.id],
    });
    expect(selection.items.map((item) => item.id)).toEqual([setting.id, character.id]);
    expect(selection.items[0].toJSON()).not.toHaveProperty('content');
    const referencedBy = await service.listDocumentReferences(story.id, character.id);
    expect(referencedBy.items.map((item) => item.id)).toEqual([setting.id]);
    await service.withdrawDocument(story.id, setting.id, actor('a'), {
      expectedVersion: 1,
      changeSummary: 'Withdraw draft.',
    });
    expect((await service.listDocumentReferences(story.id, character.id)).items).toHaveLength(0);
    expect(
      (await service.listDocuments(story.id, { documentIds: [setting.id] })).items[0],
    ).toMatchObject({ archived: true });
  });
});
