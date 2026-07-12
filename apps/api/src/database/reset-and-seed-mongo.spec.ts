import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { createConnection, type Connection } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { DATABASE_MODEL_DEFINITIONS } from './database.module';

const execFileAsync = promisify(execFile);

jest.setTimeout(120_000);

function readPath(document: Record<string, unknown>, fieldPath: string): unknown {
  return fieldPath.split('.').reduce<unknown>((value, field) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return (value as Record<string, unknown>)[field];
  }, document);
}

describe('reset-and-seed-mongo', () => {
  let replicaSet: MongoMemoryReplSet;
  let connection: Connection;

  function registeredModels() {
    return DATABASE_MODEL_DEFINITIONS.map(({ name, schema }) => connection.model(name, schema));
  }

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const mongoUri = replicaSet.getUri('skynet');
    const scriptPath = path.resolve(__dirname, '../../scripts/reset-and-seed-mongo.mjs');

    await execFileAsync(process.execPath, [scriptPath], {
      env: {
        ...process.env,
        NODE_ENV: 'development',
        MONGODB_URI: mongoUri,
        SKYNET_CONFIRM_DB_RESET: 'skynet',
        AGENT_KEY_PEPPER: 'test-agent-key-pepper-at-least-32-characters',
      },
    });

    connection = await createConnection(mongoUri, { autoIndex: false }).asPromise();
  });

  afterAll(async () => {
    await connection?.close();
    await replicaSet?.stop();
  });

  it('creates every schema index with matching behavior options', async () => {
    const differences = await Promise.all(
      registeredModels().map(async (model) => ({
        collection: model.collection.collectionName,
        difference: await model.diffIndexes(),
      })),
    );

    expect(differences).toEqual(
      differences.map(({ collection }) => ({
        collection,
        difference: { toDrop: [], toCreate: [] },
      })),
    );
  });

  it('persists all required schema fields in raw seed documents', async () => {
    const seededCollections = new Set([
      'users',
      'agents',
      'circles',
      'circle_rule_revisions',
      'posts',
      'replies',
      'feedbacks',
      'interaction_histories',
      'view_histories',
      'post_favorites',
      'agent_progresses',
      'agent_xp_events',
      'agent_governance_profiles',
    ]);

    for (const model of registeredModels()) {
      if (!seededCollections.has(model.collection.collectionName)) continue;
      const documents = await model.collection.find({}).toArray();
      expect(documents.length).toBeGreaterThan(0);

      for (const document of documents) {
        for (const requiredPath of model.schema.requiredPaths()) {
          expect({
            collection: model.collection.collectionName,
            requiredPath,
            value: readPath(document, requiredPath),
          }).not.toEqual(expect.objectContaining({ value: undefined }));
        }
        await expect(model.hydrate(document).validate()).resolves.toBeUndefined();
      }
    }
  });

  it('leaves administrator creation to the first-run initialization flow', async () => {
    const database = connection.db;
    if (!database) throw new Error('MongoDB database handle is unavailable');

    await expect(database.collection('users').countDocuments({ role: 'ADMIN' })).resolves.toBe(0);
    await expect(database.collection('platform_initializations').countDocuments({})).resolves.toBe(0);
  });

  it('links every post and reply to an existing circle rule revision', async () => {
    const database = connection.db;
    if (!database) throw new Error('MongoDB database handle is unavailable');

    const revisions = await database.collection('circle_rule_revisions').find({}).toArray();
    const revisionKeys = new Set(
      revisions.map((revision) => `${String(revision.circleId)}:${String(revision.version)}`),
    );
    const posts = await database.collection('posts').find({}).toArray();
    const postsById = new Map(posts.map((post) => [String(post._id), post]));

    for (const post of posts) {
      expect(revisionKeys.has(`${String(post.circleId)}:${String(post.circleRulesVersion)}`)).toBe(
        true,
      );
    }

    const replies = await database.collection('replies').find({}).toArray();
    for (const reply of replies) {
      const post = postsById.get(String(reply.postId));
      expect(post).toBeDefined();
      expect(
        revisionKeys.has(`${String(post?.circleId)}:${String(reply.circleRulesVersion)}`),
      ).toBe(true);
    }
  });
});
