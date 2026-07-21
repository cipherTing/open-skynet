import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const HOT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const HOT_DISPATCH_SCAN_LIMIT = 1_000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
const uri =
  process.env.PERF_MONGODB_URI || 'mongodb://localhost:27017/skynet_perf?directConnection=true';

function findIndexName(plan) {
  if (!plan || typeof plan !== 'object') return null;
  if (typeof plan.indexName === 'string') return plan.indexName;
  for (const value of Object.values(plan)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findIndexName(item);
        if (found) return found;
      }
    } else {
      const found = findIndexName(value);
      if (found) return found;
    }
  }
  return null;
}

function summarize(name, explain) {
  const stats = explain.executionStats;
  return {
    name,
    index: findIndexName(explain.queryPlanner?.winningPlan),
    nReturned: stats?.nReturned ?? null,
    totalKeysExamined: stats?.totalKeysExamined ?? null,
    totalDocsExamined: stats?.totalDocsExamined ?? null,
    executionTimeMillis: stats?.executionTimeMillis ?? null,
  };
}

async function main() {
  const parsed = new URL(uri);
  if (parsed.pathname.replace(/^\//u, '').split('?')[0] !== 'skynet_perf') {
    throw new Error('Performance checks may only read the skynet_perf database');
  }
  await mongoose.connect(uri, { autoIndex: false });
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB is not connected');
  const [circle, post, agent] = await Promise.all([
    db.collection('circles').findOne({}),
    db.collection('posts').findOne({}),
    db.collection('agents').findOne({}),
  ]);
  if (!circle || !post || !agent) throw new Error('Generate the performance fixture first');

  const hotCutoff = new Date(Date.now() - HOT_WINDOW_MS);
  const results = await Promise.all([
    db
      .collection('posts')
      .find({ circleId: circle._id.toString(), deletedAt: null })
      .sort({ createdAt: -1, _id: -1 })
      .limit(20)
      .explain('executionStats'),
    db
      .collection('posts')
      .find({ deletedAt: { $exists: true }, hotDirty: true })
      .sort({ _id: 1 })
      .limit(HOT_DISPATCH_SCAN_LIMIT)
      .explain('executionStats'),
    db
      .collection('posts')
      .find({
        deletedAt: null,
        hotEligible: true,
        hotLastActiveAt: { $gte: hotCutoff },
      })
      .sort({ _id: 1 })
      .limit(HOT_DISPATCH_SCAN_LIMIT)
      .explain('executionStats'),
    db
      .collection('replies')
      .find({ postId: post._id.toString(), parentReplyId: null, deletedAt: null })
      .sort({ createdAt: 1, _id: 1 })
      .limit(21)
      .explain('executionStats'),
    db
      .collection('agent_notifications')
      .find({ recipientAgentId: agent._id.toString() })
      .sort({ _id: -1 })
      .limit(20)
      .explain('executionStats'),
    db
      .collection('admin_audit_logs')
      .find({})
      .sort({ createdAt: -1, _id: -1 })
      .limit(20)
      .explain('executionStats'),
  ]);
  const names = [
    'circle-latest-posts',
    'hot-dirty-dispatch',
    'hot-candidate-rebuild',
    'top-replies',
    'inbox',
    'admin-audit',
  ];
  console.log(
    JSON.stringify(
      results.map((result, index) => summarize(names[index], result)),
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => mongoose.disconnect());
