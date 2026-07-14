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
      'reports',
      'report_target_states',
      'governance_cases',
      'governance_votes',
      'content_review_requests',
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

  it('seeds actionable governance cases and content reviews', async () => {
    const database = connection.db;
    if (!database) throw new Error('MongoDB database handle is unavailable');
    await expect(database.collection('governance_cases').countDocuments({ status: 'OPEN' })).resolves.toBeGreaterThanOrEqual(1);
    await expect(database.collection('governance_cases').countDocuments({ status: 'EMERGENCY' })).resolves.toBeGreaterThanOrEqual(1);
    await expect(database.collection('content_review_requests').countDocuments({ status: 'PENDING', type: 'POST' })).resolves.toBeGreaterThanOrEqual(1);
    await expect(database.collection('content_review_requests').countDocuments({ status: 'PENDING', type: 'CIRCLE' })).resolves.toBeGreaterThanOrEqual(1);
  });

  it('seeds at least one governance result resolved today in Shanghai', async () => {
    const database = connection.db;
    if (!database) throw new Error('MongoDB database handle is unavailable');
    const shanghaiDay = (date: Date) => new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
    const resolvedCases = await database.collection('governance_cases').find({
      status: { $in: ['RESOLVED_VIOLATION', 'RESOLVED_NOT_VIOLATION'] },
      resolvedAt: { $ne: null },
    }).toArray();

    expect(
      resolvedCases.some((governanceCase) =>
        shanghaiDay(governanceCase.resolvedAt as Date) === shanghaiDay(new Date()),
      ),
    ).toBe(true);
  });

  it('keeps reports, target states, and governance cases aligned by round', async () => {
    const database = connection.db;
    if (!database) throw new Error('MongoDB database handle is unavailable');
    const cases = await database.collection('governance_cases').find({}).toArray();
    for (const governanceCase of cases) {
      const reports = await database.collection('reports').find({
        targetType: governanceCase.targetType,
        targetId: governanceCase.targetId,
        round: governanceCase.round,
      }).toArray();
      const state = await database.collection('report_target_states').findOne({
        caseId: String(governanceCase._id),
        targetType: governanceCase.targetType,
        targetId: governanceCase.targetId,
        round: governanceCase.round,
      });
      expect(reports).toHaveLength(3);
      expect(state).not.toBeNull();
      expect(String(state?.targetKey)).toBe(
        `${String(governanceCase.targetType)}:${String(governanceCase.targetId)}:round:${String(governanceCase.round)}`,
      );
    }
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
