import mongoose, { type Connection, type Model } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import {
  StoryDocument,
  StoryDocumentSchema,
  StoryRevision,
  StoryRevisionSchema,
} from './schemas/story.schema';

describe('story content persistence boundary', () => {
  jest.setTimeout(60_000);
  let replicaSet: MongoMemoryReplSet;
  let connection: Connection;
  let documents: Model<StoryDocument>;
  let revisions: Model<StoryRevision>;
  const documentInput = {
    storyId: 'story-a',
    kind: 'world_setting',
    title: 'Unwritten world',
    createdByAgentId: 'agent-a',
    createdByOwnerUserIdSnapshot: 'owner-a',
  };
  const revisionInput = {
    storyId: 'story-a',
    documentId: 'document-a',
    targetType: 'document',
    revisionNumber: 1,
    baseVersion: 0,
    authorAgentId: 'agent-a',
    authorOwnerUserIdSnapshot: 'owner-a',
    changeSummary: 'Start an outline.',
  };

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const instance = new mongoose.Mongoose();
    connection = await instance.createConnection(replicaSet.getUri()).asPromise();
    documents = connection.model(StoryDocument.name, StoryDocumentSchema);
    revisions = connection.model(StoryRevision.name, StoryRevisionSchema);
    await Promise.all([documents.init(), revisions.init()]);
  });
  beforeEach(async () => {
    await Promise.all([
      documents.deleteMany({}),
      connection.collection('story_revisions').deleteMany({}),
    ]);
  });
  afterAll(async () => {
    await connection.close();
    await replicaSet.stop();
  });

  it('persists an empty body in both the current document and its revision snapshot', async () => {
    const document = await documents.create({ ...documentInput, content: '' });
    const revision = await revisions.create({
      ...revisionInput,
      diff: {
        afterDocument: {
          kind: 'world_setting',
          title: 'Unwritten world',
          content: '',
          links: [],
          archived: false,
        },
      },
    });
    expect((await documents.findById(document.id).exec())?.content).toBe('');
    expect((await revisions.findById(revision.id).exec())?.diff.afterDocument?.content).toBe('');
  });

  it('allows a validated update to clear existing text without removing the body field', async () => {
    const document = await documents.create({ ...documentInput, content: 'Temporary wording.' });
    const updated = await documents
      .findOneAndUpdate(
        { _id: document._id },
        { $set: { content: '' } },
        { new: true, runValidators: true },
      )
      .exec();
    expect(updated?.content).toBe('');
    expect((await documents.findById(document.id).exec())?.content).toBe('');
    await expect(
      documents
        .findOneAndUpdate(
          { _id: document._id },
          { $unset: { content: 1 } },
          { runValidators: true },
        )
        .exec(),
    ).rejects.toThrow('content');
  });

  it.each(['潮', '🌊'])(
    'persists more than 50000 %s characters in documents and snapshots',
    async (character) => {
      const content = character.repeat(60_000);
      const document = await documents.create({ ...documentInput, content });
      expect((await documents.findById(document.id).exec())?.content).toBe(content);
      const revision = await revisions.create({
        ...revisionInput,
        diff: {
          afterDocument: {
            kind: 'world_setting',
            title: 'Long memory',
            content,
            links: [],
            archived: false,
          },
        },
      });
      expect((await revisions.findById(revision.id).exec())?.diff.afterDocument?.content).toBe(
        content,
      );
    },
  );

  it.each([undefined, null])(
    'rejects a missing/null body in documents and snapshots: %s',
    async (content) => {
      await expect(documents.create({ ...documentInput, content })).rejects.toThrow('content');
      await expect(
        revisions.create({
          ...revisionInput,
          diff: {
            afterDocument: {
              kind: 'world_setting',
              title: 'Unwritten world',
              content,
              links: [],
              archived: false,
            },
          },
        }),
      ).rejects.toThrow('content');
    },
  );
});
