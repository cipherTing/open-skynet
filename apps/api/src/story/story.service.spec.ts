import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { type Connection } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { DatabaseService } from '@/database/database.service';
import { NotificationService } from '@/notification/notification.service';
import {
  Story,
  StorySchema,
  StoryBranch,
  StoryBranchSchema,
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
  const notificationService = {
    createStoryDiscussionNotification: jest.fn(),
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
          { name: Story.name, schema: StorySchema },
          { name: StoryDocument.name, schema: StoryDocumentSchema },
          { name: StoryRevision.name, schema: StoryRevisionSchema },
          { name: StoryDiscussion.name, schema: StoryDiscussionSchema },
          { name: StoryDiscussionMessage.name, schema: StoryDiscussionMessageSchema },
          { name: StoryBranch.name, schema: StoryBranchSchema },
          { name: StoryReview.name, schema: StoryReviewSchema },
        ]),
      ],
      providers: [
        StoryService,
        DatabaseService,
        { provide: StoryCollaborationService, useValue: collaborationService },
        { provide: NotificationService, useValue: notificationService },
      ],
    }).compile();
    connection = moduleRef.get<Connection>(getConnectionToken());
    service = moduleRef.get(StoryService);
    await Promise.all([
      connection.model(Story.name).init(),
      connection.model(StoryDocument.name).init(),
      connection.model(StoryRevision.name).init(),
      connection.model(StoryDiscussion.name).init(),
      connection.model(StoryDiscussionMessage.name).init(),
      connection.model(StoryBranch.name).init(),
      connection.model(StoryReview.name).init(),
    ]);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    notificationService.createStoryDiscussionNotification.mockResolvedValue(true);
    collaborationService.assertAgentCanEdit.mockResolvedValue(undefined);
    collaborationService.detectAndRecordEditConflict.mockResolvedValue(null);
    await Promise.all([
      connection.model(Story.name).deleteMany({}),
      connection.model(StoryDocument.name).deleteMany({}),
      connection.collection('story_revisions').deleteMany({}),
      connection.collection('story_discussions').deleteMany({}),
      connection.collection('story_discussion_messages').deleteMany({}),
      connection.model(StoryBranch.name).deleteMany({}),
      connection.collection('story_reviews').deleteMany({}),
    ]);
  });

  it('passes the document id to restriction checks before revising and records conflict signals', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'The Glass Coast',
      premise: 'A cartographer discovers a coastline that changes overnight.',
    });
    const { document } = await service.createDocument(story.id, actor('a'), {
      kind: 'chapter',
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
      null,
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
      kind: 'chapter',
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
      null,
      document.id,
    );
  });

  it('keeps parallel route edits outside the story mainline restriction while retaining revision history', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'The Glass Coast',
      premise: 'A cartographer discovers a coastline that changes overnight.',
    });
    const { document } = await service.createDocument(story.id, actor('a'), {
      kind: 'chapter',
      title: 'Opening',
      content: 'The coast is quiet.',
      changeSummary: 'Start the chapter.',
    });
    const branch = await service.createBranch(story.id, actor('b'), {
      title: 'The Remembered Coast',
      premise: 'The coastline records every name.',
      sourceDocumentId: document.id,
      sourceRevisionNumber: 1,
    });
    const { document: branchDocument } = await service.createDocument(story.id, actor('b'), {
      branchId: branch.id,
      kind: 'chapter',
      title: 'Opening',
      content: 'Every visitor is remembered.',
      changeSummary: 'Write the parallel opening.',
    });

    await service.reviseDocument(
      branchDocument.id,
      actor('c'),
      {
        expectedVersion: 1,
        content: 'The coast remembers each visitor by name.',
        changeSummary: 'Continue the parallel version.',
      },
      story.id,
    );

    expect(collaborationService.assertAgentCanEdit).toHaveBeenCalledWith(
      story.id,
      'agent-c',
      expect.anything(),
      branch.id,
      branchDocument.id,
    );
    expect(collaborationService.detectAndRecordEditConflict).toHaveBeenCalledWith(
      story.id,
      branchDocument.id,
      actor('c'),
      expect.anything(),
    );
    expect(await service.listDocumentRevisions(branchDocument.id)).toMatchObject({
      items: [
        expect.objectContaining({ revisionNumber: 2 }),
        expect.objectContaining({ revisionNumber: 1 }),
      ],
    });
  });

  afterAll(async () => {
    await moduleRef.close();
    await replicaSet.stop();
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
      kind: 'chapter',
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
          branchId: null,
          kind: 'chapter',
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
        kind: 'chapter',
        title,
        content: 'A tide.',
        changeSummary: 'Add a chapter.',
      });
    }
    await service.createDocument(story.id, actor('a'), {
      kind: 'chapter',
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

    const filters = { q: 'Mira [map]', kind: 'chapter' as const, limit: 1 };
    const firstPage = await service.listDocuments(story.id, null, filters);
    expect(firstPage.items.map((item) => item.title)).toEqual(['Mira [map] I']);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    const secondPage = await service.listDocuments(story.id, null, {
      ...filters,
      cursor: firstPage.nextCursor ?? undefined,
    });
    expect(secondPage.items.map((item) => item.title)).toEqual(['Mira [map] I']);
    expect(secondPage.nextCursor).toEqual(expect.any(String));
    const thirdPage = await service.listDocuments(story.id, null, {
      ...filters,
      cursor: secondPage.nextCursor ?? undefined,
    });
    expect(thirdPage.items.map((item) => item.title)).toEqual(['Mira [map] II']);
    expect(thirdPage.nextCursor).toBeNull();
    await expect(
      service.listDocuments(story.id, null, {
        ...filters,
        q: 'Mira',
        cursor: firstPage.nextCursor ?? undefined,
      }),
    ).rejects.toMatchObject({ response: { code: 'PAGINATION_CURSOR_INVALID' } });
    await expect(service.listDocuments(story.id, null, { q: 'mira [map]' })).resolves.toMatchObject(
      {
        items: [],
        nextCursor: null,
      },
    );
  });

  it('returns linked document summaries in one bounded selection without entering the paged directory mode', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'The Glass Coast',
      premise: 'A coastline changes overnight.',
    });
    const { document: setting } = await service.createDocument(story.id, actor('a'), {
      kind: 'world_setting',
      title: 'Tide rule',
      content: 'Each tide returns a name.',
      changeSummary: 'Establish the tide.',
    });
    const { document: chapter } = await service.createDocument(story.id, actor('b'), {
      kind: 'chapter',
      title: 'The First Map',
      content: 'Mira watches the harbor.',
      changeSummary: 'Write the opening.',
    });
    const { document: otherChapter } = await service.createDocument(story.id, actor('b'), {
      kind: 'chapter',
      title: 'The Alternate Map',
      content: 'A different tide.',
      changeSummary: 'Write an alternate opening.',
    });
    const branch = await service.createBranch(story.id, actor('c'), {
      title: 'The Remembered Coast',
      premise: 'The coast remembers every name.',
      sourceDocumentId: chapter.id,
      sourceRevisionNumber: 1,
    });
    const { document: branchChapter } = await service.createDocument(story.id, actor('c'), {
      branchId: branch.id,
      kind: 'chapter',
      title: 'A Remembered Map',
      content: 'A remembered tide.',
      changeSummary: 'Write the branch opening.',
    });
    const otherBranch = await service.createBranch(story.id, actor('d'), {
      title: 'The Drowned Coast',
      premise: 'The coast has vanished.',
      sourceDocumentId: chapter.id,
      sourceRevisionNumber: 1,
    });
    const { document: otherBranchChapter } = await service.createDocument(story.id, actor('d'), {
      branchId: otherBranch.id,
      kind: 'chapter',
      title: 'The Drowned Map',
      content: 'No tide.',
      changeSummary: 'Write another branch opening.',
    });

    const selected = await service.listDocuments(story.id, null, {
      documentIds: [setting.id, chapter.id],
    });
    expect(selected.items.map((item) => item.id).sort()).toEqual([setting.id, chapter.id].sort());
    expect(selected.nextCursor).toBeNull();
    await expect(service.listDocuments(story.id, null, { documentIds: [] })).rejects.toMatchObject({
      response: { code: 'STORY_DOCUMENT_SELECTOR_INVALID' },
    });
    for (const item of JSON.parse(JSON.stringify(selected.items))) {
      expect(item).not.toHaveProperty('content');
    }
    const branchSelection = await service.listDocuments(story.id, branch.id, {
      documentIds: [
        setting.id,
        chapter.id,
        otherChapter.id,
        branchChapter.id,
        otherBranchChapter.id,
      ],
    });
    expect(branchSelection.items.map((item) => item.id).sort()).toEqual(
      [setting.id, chapter.id, otherChapter.id, branchChapter.id].sort(),
    );
    expect(branchSelection.nextCursor).toBeNull();
    await expect(
      service.listDocuments(story.id, null, {
        documentIds: [setting.id],
        q: 'Tide',
      }),
    ).rejects.toMatchObject({ response: { code: 'STORY_DOCUMENT_SELECTOR_INVALID' } });
  });

  it('summarizes recent activity with its historical title and route instead of full revision snapshots', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'The Glass Coast',
      premise: 'A coastline changes overnight.',
    });
    const { document } = await service.createDocument(story.id, actor('a'), {
      kind: 'chapter',
      title: 'The First Map',
      content: 'A tide.',
      changeSummary: 'Write the opening.',
    });
    const branch = await service.createBranch(story.id, actor('b'), {
      title: 'The Remembered Coast',
      premise: 'The coast remembers names.',
      sourceDocumentId: document.id,
      sourceRevisionNumber: 1,
    });
    await service.createDocument(story.id, actor('b'), {
      branchId: branch.id,
      kind: 'chapter',
      title: 'The Other Map',
      content: 'Another tide.',
      changeSummary: 'Write a parallel opening.',
    });
    await service.reviseDocument(document.id, actor('c'), {
      expectedVersion: 1,
      title: 'The Revised Map',
      changeSummary: 'Clarify the title.',
    });

    const detail = await service.getStory(story.id);
    expect(detail.recentActivity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          storyId: story.id,
          documentId: null,
          targetType: 'story',
          revisionNumber: 1,
          baseVersion: 0,
          title: 'The Glass Coast',
          branchId: null,
          authorAgentId: 'agent-a',
          createdAt: expect.any(Date),
        }),
        expect.objectContaining({
          documentId: document.id,
          revisionNumber: 1,
          title: 'The First Map',
          branchId: null,
        }),
        expect.objectContaining({
          documentId: document.id,
          revisionNumber: 2,
          title: 'The Revised Map',
          branchId: null,
        }),
        expect.objectContaining({ title: 'The Other Map', branchId: branch.id }),
      ]),
    );
    for (const item of detail.recentActivity) expect(item).not.toHaveProperty('diff');
  });

  it('reads latest discussion messages first and binds tie-safe cursors to the requested direction', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'The Glass Coast',
      premise: 'A coastline changes overnight.',
    });
    const { document } = await service.createDocument(story.id, actor('a'), {
      kind: 'chapter',
      title: 'The First Map',
      content: 'A tide.',
      changeSummary: 'Start.',
    });
    const { discussion } = await service.createDiscussion(story.id, actor('a'), {
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
      branchId: null,
    });
    expect(revisions.items[0]).not.toHaveProperty('diff');
    expect(
      await service.compareRevisions({
        documentId: document.id,
        fromRevisionNumber: 1,
        toRevisionNumber: 2,
      }),
    ).toMatchObject({
      fromRevision: {
        diff: { afterDocument: { content: 'Mira is a patient mapmaker.' } },
      },
      toRevision: {
        diff: {
          afterDocument: { content: 'Mira is a patient mapmaker who distrusts fixed borders.' },
        },
      },
    });
  });

  it('allows exactly one of two concurrent edits against the same base version', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'The Glass Coast',
      premise: 'A cartographer discovers a coastline that changes overnight.',
    });
    const { document } = await service.createDocument(story.id, actor('a'), {
      kind: 'chapter',
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
    expect(comparison.changes).toEqual([]);
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
      kind: 'chapter',
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
      kind: 'chapter',
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
      kind: 'chapter',
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
    expect(restored.revision.diff.beforeDocument).toMatchObject({
      content: 'The harbor is silent.\nMira burns the map.\nThe tide turns.',
    });
  });

  it('keeps branches, anchored discussion, and reviews scoped to their story versions', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'The Glass Coast',
      premise: 'A cartographer discovers a coastline that changes overnight.',
    });
    const { document } = await service.createDocument(story.id, actor('a'), {
      kind: 'chapter',
      title: 'The First Map',
      content: 'Mira watches the harbor move.',
      changeSummary: 'Draft the opening chapter.',
    });
    const branch = await service.createBranch(story.id, actor('b'), {
      title: 'The Coast Remembers',
      premise: 'The coastline is responding to forgotten names.',
      sourceDocumentId: document.id,
      sourceRevisionNumber: 1,
    });
    const { document: branchDocument } = await service.createDocument(story.id, actor('b'), {
      branchId: branch.id,
      kind: 'plotline',
      title: 'The remembered coast',
      content: 'The sea returns one lost street each night.',
      changeSummary: 'Open an alternate plotline.',
    });
    const { discussion: thread } = await service.createDiscussion(story.id, actor('c'), {
      documentId: document.id,
      revisionNumber: 1,
      title: 'A question about perception',
      anchorText: 'the harbor move',
      content: 'Is the movement visible to everyone in the scene?',
    });
    const { discussion: branchThread } = await service.createDiscussion(story.id, actor('c'), {
      documentId: branchDocument.id,
      revisionNumber: 1,
      title: 'A question about the alternate coast',
      anchorText: 'one lost street',
      content: 'Does this happen before sunrise?',
    });
    const message = await service.addDiscussionMessage(story.id, thread.id, actor('a'), {
      content: 'Only people looking at the old map notice it.',
    });
    const review = await service.createReview(story.id, actor('d'), {
      documentId: document.id,
      revisionNumber: 1,
      content: 'The scene follows the established coast rule.',
      anchorText: 'Mira watches the harbor move.',
    });

    expect(await service.listDocuments(story.id)).toMatchObject({
      items: [expect.objectContaining({ id: document.id, branchId: null })],
    });
    expect(await service.listDocuments(story.id, branch.id)).toMatchObject({
      items: [expect.objectContaining({ id: branchDocument.id, branchId: branch.id })],
    });
    expect(thread).toMatchObject({
      documentId: document.id,
      revisionNumber: 1,
      anchorText: 'the harbor move',
      branchId: null,
    });
    expect(branchThread).toMatchObject({
      documentId: branchDocument.id,
      revisionNumber: 1,
      branchId: branch.id,
    });
    expect(await service.getDiscussion(story.id, branchThread.id)).toMatchObject({
      id: branchThread.id,
      branchId: branch.id,
    });
    expect(await service.listDiscussions(story.id)).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ id: thread.id, branchId: null }),
        expect.objectContaining({ id: branchThread.id, branchId: branch.id }),
      ]),
    });
    expect(
      await service.listDiscussions(story.id, {
        documentId: branchDocument.id,
        revisionNumber: 1,
      }),
    ).toMatchObject({
      items: [expect.objectContaining({ id: branchThread.id, branchId: branch.id })],
    });
    expect(message).toMatchObject({ discussionId: thread.id, authorAgentId: 'agent-a' });
    expect(review).toMatchObject({
      documentId: document.id,
      revisionNumber: 1,
      authorAgentId: 'agent-d',
      content: 'The scene follows the established coast rule.',
      anchorText: 'Mira watches the harbor move.',
    });
  });

  it('binds discussion cursors to optional document and revision filters', async () => {
    const story = await service.createStory(actor('a'), {
      title: 'The Glass Coast',
      premise: 'A cartographer discovers a coastline that changes overnight.',
    });
    const { document } = await service.createDocument(story.id, actor('a'), {
      kind: 'chapter',
      title: 'The First Map',
      content: 'Mira watches the harbor move.',
      changeSummary: 'Draft the opening chapter.',
    });
    await service.createDiscussion(story.id, actor('b'), {
      documentId: document.id,
      revisionNumber: 1,
      title: 'First question',
      content: 'Should Mira trust the map?',
    });
    await service.createDiscussion(story.id, actor('c'), {
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

  it('notifies a discussion target in the same transaction and records the target on the discussion', async () => {
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

    const result = await service.createDiscussion(story.id, actor('author'), {
      documentId: document.id,
      revisionNumber: 1,
      title: 'Question about Mira',
      content: 'Does this conflict with her earlier motive?',
      anchorText: 'Mira studies the old maps.',
      noticeTargetAgentId: actor('target').agentId,
    });

    expect(result.discussion).toMatchObject({ noticeTargetAgentId: actor('target').agentId });
    expect(notificationService.createStoryDiscussionNotification).toHaveBeenCalledWith(
      {
        discussionId: result.discussion.id,
        storyId: story.id,
        documentId: document.id,
        actorAgentId: actor('author').agentId,
        recipientAgentId: actor('target').agentId,
      },
      expect.anything(),
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
        documentId: document.id,
        revisionNumber: 1,
        title: 'Question about Mira',
        content: 'Does this conflict with her earlier motive?',
        noticeTargetAgentId: actor('author').agentId,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(notificationService.createStoryDiscussionNotification).not.toHaveBeenCalled();
  });

  it('rolls back a discussion when its requested notification cannot be delivered', async () => {
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
    notificationService.createStoryDiscussionNotification.mockResolvedValue(false);

    await expect(
      service.createDiscussion(story.id, actor('author'), {
        documentId: document.id,
        revisionNumber: 1,
        title: 'Question about Mira',
        content: 'Does this conflict with her earlier motive?',
        noticeTargetAgentId: actor('missing').agentId,
      }),
    ).rejects.toMatchObject({ response: { code: 'STORY_DISCUSSION_TARGET_INVALID' } });

    await expect(service.listDiscussions(story.id)).resolves.toMatchObject({ items: [] });
    await expect(
      connection.collection('story_discussion_messages').countDocuments({ storyId: story.id }),
    ).resolves.toBe(0);
  });
});
