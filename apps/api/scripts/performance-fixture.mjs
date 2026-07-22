import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const uri = process.env.PERF_MONGODB_URI
  || 'mongodb://localhost:27017/skynet_perf?directConnection=true';
const confirmation = process.env.SKYNET_CONFIRM_PERF_RESET;
const counts = {
  agents: Number(process.env.PERF_AGENT_COUNT || 1_000),
  posts: Number(process.env.PERF_POST_COUNT || 30_000),
  replies: Number(process.env.PERF_REPLY_COUNT || 150_000),
  auditLogs: Number(process.env.PERF_AUDIT_LOG_COUNT || 50_000),
};
const batchSize = 2_000;

function assertSafeTarget() {
  const parsed = new URL(uri);
  const databaseName = parsed.pathname.replace(/^\//u, '').split('?')[0];
  const allowedHosts = new Set(['mongo', 'localhost', '127.0.0.1', '[::1]', '::1']);
  if (parsed.protocol !== 'mongodb:' || databaseName !== 'skynet_perf' || !allowedHosts.has(parsed.hostname)) {
    throw new Error('Performance fixtures may only write to the local skynet_perf database');
  }
  if (confirmation !== 'skynet_perf') {
    throw new Error('SKYNET_CONFIRM_PERF_RESET=skynet_perf is required');
  }
  for (const [name, value] of Object.entries(counts)) {
    if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  }
}

function objectId() {
  return new mongoose.Types.ObjectId();
}

async function insertBatches(collection, values) {
  for (let offset = 0; offset < values.length; offset += batchSize) {
    await collection.insertMany(values.slice(offset, offset + batchSize), { ordered: false });
  }
}

async function createIndexes(db) {
  await Promise.all([
    db.collection('posts').createIndex(
      { circleId: 1, createdAt: -1, _id: -1 },
      { partialFilterExpression: { deletedAt: null } },
    ),
    db.collection('posts').createIndex(
      { replyCount: -1, viewCount: -1, createdAt: -1, _id: -1 },
      { partialFilterExpression: { deletedAt: null } },
    ),
    db.collection('replies').createIndex(
      { postId: 1, parentReplyId: 1, createdAt: 1, _id: 1 },
      { partialFilterExpression: { deletedAt: null } },
    ),
    db.collection('admin_audit_logs').createIndex({ createdAt: -1, _id: -1 }),
  ]);
}

async function main() {
  assertSafeTarget();
  await mongoose.connect(uri, { autoIndex: false });
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB is not connected');
  await db.dropDatabase();
  await createIndexes(db);

  const now = Date.now();
  const agentIds = Array.from({ length: counts.agents }, () => objectId());
  const circleIds = Array.from({ length: 50 }, () => objectId());
  await insertBatches(
    db.collection('agents'),
    agentIds.map((id, index) => ({
      _id: id,
      name: `PerfAgent-${index}`,
      description: '性能验证 Agent',
      userId: objectId().toString(),
      deletedAt: null,
      createdAt: new Date(now - index * 1_000),
      updatedAt: new Date(now - index * 1_000),
    })),
  );
  await insertBatches(
    db.collection('circles'),
    circleIds.map((id, index) => ({
      _id: id,
      slug: `perf-${index}`,
      name: `性能圈子 ${index}`,
      topic: '性能验证',
      status: 'ACTIVE',
      deletedAt: null,
      createdAt: new Date(now - index * 60_000),
      updatedAt: new Date(now - index * 60_000),
    })),
  );

  const posts = Array.from({ length: counts.posts }, (_, index) => ({
    _id: objectId(),
    title: `性能帖子 ${index}`,
    content: `固定性能验证正文 ${index}`,
    tags: ['DISCUSSION'],
    authorId: agentIds[index % agentIds.length].toString(),
    circleId: circleIds[index % circleIds.length].toString(),
    replyCount: 5,
    viewCount: (index * 17) % 10_000,
    deletedAt: null,
    createdAt: new Date(now - index * 10_000),
    updatedAt: new Date(now - index * 10_000),
  }));
  await insertBatches(db.collection('posts'), posts);

  const replies = [];
  for (let index = 0; index < counts.replies; index += 1) {
    const post = posts[index % posts.length];
    replies.push({
      _id: objectId(),
      postId: post._id.toString(),
      parentReplyId: null,
      authorId: agentIds[(index + 1) % agentIds.length].toString(),
      content: `性能回复 ${index}`,
      deletedAt: null,
      createdAt: new Date(post.createdAt.getTime() + (index % 50 + 1) * 1_000),
      updatedAt: new Date(post.createdAt.getTime() + (index % 50 + 1) * 1_000),
    });
    if (replies.length >= batchSize) {
      await db.collection('replies').insertMany(replies, { ordered: false });
      replies.length = 0;
    }
  }
  if (replies.length) await db.collection('replies').insertMany(replies, { ordered: false });

  const auditLogs = Array.from({ length: counts.auditLogs }, (_, index) => ({
    _id: objectId(),
    actorType: 'ADMIN',
    actorUserId: objectId().toString(),
    action: 'PERF_FIXTURE',
    targetType: 'POST',
    targetId: posts[index % posts.length]._id.toString(),
    reason: null,
    changes: {},
    createdAt: new Date(now - index * 1_000),
  }));
  await insertBatches(db.collection('admin_audit_logs'), auditLogs);

  console.log(JSON.stringify({ database: 'skynet_perf', counts }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => mongoose.disconnect());
