import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const uri =
  process.env.PERF_MONGODB_URI || 'mongodb://localhost:27017/skynet_perf?directConnection=true';
const confirmation = process.env.SKYNET_CONFIRM_PERF_RESET;
const HOT_HISTORY_SCALES = [100, 10_000, 100_000];
const HOT_EXPIRED_STATE_COUNT = 10_000;
const DEFAULT_HOT_CANDIDATE_COUNT = 100_000;
const DEFAULT_POST_COUNT = DEFAULT_HOT_CANDIDATE_COUNT + HOT_EXPIRED_STATE_COUNT;
const DEFAULT_CIRCLE_PROPOSAL_STANCE_COUNT = 10_000;
const DEFAULT_AGENT_INTERACTION_COUNT = 100_000;
const DEADLINE_QUERY_DISTRACTOR_COUNT = 5_000;
const HOT_ACTIVE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const HOT_HISTORY_PARTICIPANT_AGENT_INDEX = 10;
const HOT_HISTORY_FEEDBACK_AGENT_INDEX = 11;
const configuredPostCount = Number(process.env.PERF_POST_COUNT || DEFAULT_POST_COUNT);
const counts = {
  agents: Number(process.env.PERF_AGENT_COUNT || 1_000),
  posts: configuredPostCount,
  hotCandidates: Number(
    process.env.PERF_HOT_CANDIDATE_COUNT ||
      Math.min(DEFAULT_HOT_CANDIDATE_COUNT, configuredPostCount - HOT_EXPIRED_STATE_COUNT),
  ),
  replies: Number(process.env.PERF_REPLY_COUNT || 150_000),
  governanceCases: Number(process.env.PERF_GOVERNANCE_CASE_COUNT || 10_000),
  circleProposals: Number(process.env.PERF_CIRCLE_PROPOSAL_COUNT || 10_000),
  circleProposalStances: Number(
    process.env.PERF_CIRCLE_PROPOSAL_STANCE_COUNT || DEFAULT_CIRCLE_PROPOSAL_STANCE_COUNT,
  ),
  deadlineDistractors: DEADLINE_QUERY_DISTRACTOR_COUNT,
  auditLogs: Number(process.env.PERF_AUDIT_LOG_COUNT || 50_000),
  agentInteractions: Number(
    process.env.PERF_AGENT_INTERACTION_COUNT || DEFAULT_AGENT_INTERACTION_COUNT,
  ),
};
const HOT_SOURCE_TYPES = { REPLY: 'REPLY', FEEDBACK: 'FEEDBACK' };
const FEEDBACK_TARGET_TYPES = { REPLY: 'REPLY' };
const POSITIVE_FEEDBACK_TYPE = 'SPARK';
const PERFORMANCE_REPLY_FEEDBACK_COUNTS = {
  SPARK: 1,
  ON_POINT: 0,
  CONSTRUCTIVE: 0,
  RESONATE: 0,
  UNCLEAR: 0,
  OFF_TOPIC: 0,
  NOISE: 0,
};
const ACTIVE_GOVERNANCE_STATUS = 'OPEN';
const ACTIVE_PROPOSAL_STATUS = 'DISCUSSION';
const CIRCLE_PROPOSAL_STANCES = { SUPPORT: 'SUPPORT', OBJECTION: 'OBJECTION' };
const GOVERNANCE_DECISIONS = {
  VIOLATION: 'VIOLATION',
  NOT_VIOLATION: 'NOT_VIOLATION',
};
const batchSize = 2_000;
const dedicatedHotHistoryReplyCount = HOT_HISTORY_SCALES.reduce(
  (total, historySize) => total + historySize,
  0,
);
const LARGE_REPLY_BRANCH_HISTORY_SIZE = Math.max(...HOT_HISTORY_SCALES);
const POST_VIEW_COUNTER_SHARD_COUNT = 32;
const POST_VIEW_COUNTER_POST_COUNT = 20;
const POST_DISTRIBUTION_CIRCLE_COUNT = 50;
const SUBSCRIPTION_PROFILE_CIRCLE_COUNT = 10_000;
const GOVERNANCE_DISPATCH_PARTICIPATION_COUNT = 10_000;
const GOVERNANCE_DISPATCH_ACTIVE_PARTICIPATION_COUNT = 60;
const GOVERNANCE_DISPATCH_EXPIRED_PARTICIPATION_COUNT =
  GOVERNANCE_DISPATCH_PARTICIPATION_COUNT - GOVERNANCE_DISPATCH_ACTIVE_PARTICIPATION_COUNT;
const GOVERNANCE_TIMELINE_VOTE_COUNT = 10_000;
const GOVERNANCE_TIMELINE_DAY_COUNT = 2;
const PERFORMANCE_FUTURE_OFFSET_MS = 60 * 60 * 1000;

function resolveReplyFixtureTarget(replyIndex, postCount) {
  let profileStart = 0;
  for (const [profileIndex, historySize] of HOT_HISTORY_SCALES.entries()) {
    const profileEnd = profileStart + historySize;
    if (replyIndex < profileEnd) {
      return {
        postIndex: profileIndex,
        historySize,
        positionInHistory: replyIndex - profileStart,
        dedicated: true,
      };
    }
    profileStart = profileEnd;
  }
  const generalPostCount = postCount - HOT_HISTORY_SCALES.length;
  return {
    postIndex:
      HOT_HISTORY_SCALES.length + ((replyIndex - dedicatedHotHistoryReplyCount) % generalPostCount),
    historySize: null,
    positionInHistory: null,
    dedicated: false,
  };
}

function assertSafeTarget() {
  const parsed = new URL(uri);
  const databaseName = parsed.pathname.replace(/^\//u, '').split('?')[0];
  const allowedHosts = new Set(['mongo', 'localhost', '127.0.0.1', '[::1]', '::1']);
  if (
    parsed.protocol !== 'mongodb:' ||
    databaseName !== 'skynet_perf' ||
    !allowedHosts.has(parsed.hostname)
  ) {
    throw new Error('Performance fixtures may only write to the local skynet_perf database');
  }
  if (confirmation !== 'skynet_perf') {
    throw new Error('SKYNET_CONFIRM_PERF_RESET=skynet_perf is required');
  }
  for (const [name, value] of Object.entries(counts)) {
    if (!Number.isInteger(value) || value < 1)
      throw new Error(`${name} must be a positive integer`);
  }
  if (counts.agents <= HOT_HISTORY_FEEDBACK_AGENT_INDEX) {
    throw new Error('PERF_AGENT_COUNT is too small for dedicated hot-history actors');
  }
  if (counts.posts <= HOT_HISTORY_SCALES.length) {
    throw new Error('PERF_POST_COUNT must leave posts outside dedicated hot-history profiles');
  }
  if (counts.hotCandidates + HOT_EXPIRED_STATE_COUNT > counts.posts) {
    throw new Error('PERF_POST_COUNT must cover hot candidates and expired hot states');
  }
  if (counts.replies < dedicatedHotHistoryReplyCount) {
    throw new Error('PERF_REPLY_COUNT must cover all dedicated hot-history profiles');
  }
  if (counts.circleProposalStances < 21) {
    throw new Error('PERF_CIRCLE_PROPOSAL_STANCE_COUNT must be at least 21');
  }
  if (counts.governanceCases < GOVERNANCE_DISPATCH_EXPIRED_PARTICIPATION_COUNT) {
    throw new Error(
      `PERF_GOVERNANCE_CASE_COUNT must be at least ${GOVERNANCE_DISPATCH_EXPIRED_PARTICIPATION_COUNT}`,
    );
  }
}

function objectId() {
  return new mongoose.Types.ObjectId();
}

function getMongoConnectionOptions() {
  const username = process.env.MONGO_USERNAME?.trim();
  const password = process.env.MONGO_PASSWORD?.trim();
  if (!username || !password) {
    throw new Error('MONGO_USERNAME and MONGO_PASSWORD are required');
  }
  return {
    autoIndex: false,
    auth: { username, password },
    authSource: 'admin',
  };
}

async function insertBatches(collection, values) {
  for (let offset = 0; offset < values.length; offset += batchSize) {
    await collection.insertMany(values.slice(offset, offset + batchSize), { ordered: false });
  }
}

async function createIndexes(db) {
  await Promise.all([
    db.collection('agents').createIndex({ userId: 1 }, { unique: true }),
    db.collection('agent_progresses').createIndex({ agentId: 1 }, { unique: true }),
    db.collection('agent_governance_profiles').createIndex({ agentId: 1 }, { unique: true }),
    db
      .collection('circle_subscriptions')
      .createIndex({ agentId: 1, circleId: 1 }, { unique: true }),
    db.collection('circle_subscriptions').createIndex({ circleId: 1, createdAt: -1, _id: -1 }),
    db
      .collection('posts')
      .createIndex(
        { circleId: 1, circleVisible: 1, createdAt: -1, _id: -1 },
        { partialFilterExpression: { deletedAt: null } },
      ),
    db
      .collection('posts')
      .createIndex(
        { circleVisible: 1, createdAt: -1, _id: -1 },
        { partialFilterExpression: { deletedAt: null } },
      ),
    db
      .collection('posts')
      .createIndex({ createdAt: -1 }, { partialFilterExpression: { deletedAt: null } }),
    db
      .collection('replies')
      .createIndex(
        { postId: 1, parentReplyId: 1, createdAt: 1, _id: 1 },
        { partialFilterExpression: { deletedAt: null } },
      ),
    db.collection('replies').createIndex({ postId: 1, parentReplyId: 1, _id: 1 }),
    db
      .collection('post_view_counter_shards')
      .createIndex({ postId: 1, shard: 1 }, { unique: true }),
    db
      .collection('replies')
      .createIndex(
        { postId: 1, authorId: 1, createdAt: -1, _id: -1 },
        { partialFilterExpression: { deletedAt: null } },
      ),
    db.collection('post_hot_states').createIndex({ postId: 1 }, { unique: true }),
    db
      .collection('post_hot_states')
      .createIndex(
        { projectionDirty: 1, projectionDispatchAt: 1, _id: 1, projectionClaimedUntil: 1 },
        { partialFilterExpression: { projectionDirty: true } },
      ),
    db
      .collection('post_hot_states')
      .createIndex(
        { candidateDirty: 1, candidateDispatchAt: 1, _id: 1, candidateClaimedUntil: 1 },
        { partialFilterExpression: { candidateDirty: true } },
      ),
    db
      .collection('post_hot_states')
      .createIndex(
        { eligible: 1, expiresAt: 1, _id: 1 },
        { partialFilterExpression: { eligible: true } },
      ),
    db
      .collection('post_hot_states')
      .createIndex(
        { eligible: 1, postVisible: 1, circleVisible: 1, _id: 1 },
        { partialFilterExpression: { eligible: true, postVisible: true, circleVisible: true } },
      ),
    db.collection('posts').createIndex({ circleId: 1, circleVisibilityVersion: 1, _id: 1 }),
    db.collection('circle_post_visibility_states').createIndex({ circleId: 1 }, { unique: true }),
    db
      .collection('circle_post_visibility_states')
      .createIndex(
        { dirty: 1, dispatchAt: 1, _id: 1, claimedUntil: 1 },
        { partialFilterExpression: { dirty: true } },
      ),
    db
      .collection('hot_projection_work_items')
      .createIndex(
        { postId: 1, dirty: 1, _id: 1, claimedUntil: 1 },
        { partialFilterExpression: { dirty: true } },
      ),
    db.collection('hot_projection_work_items').createIndex(
      {
        postId: 1,
        participantOwnerUserId: 1,
        sourceType: 1,
        projectedActive: 1,
        projectedActivityAt: -1,
        _id: -1,
      },
      { partialFilterExpression: { projectedActive: true } },
    ),
    db
      .collection('hot_reply_feedback_fanouts')
      .createIndex(
        { postId: 1, dirty: 1, _id: 1, claimedUntil: 1 },
        { partialFilterExpression: { dirty: true } },
      ),
    db.collection('hot_reply_feedback_fanouts').createIndex({ replyId: 1 }, { unique: true }),
    db
      .collection('hot_reply_branch_fanouts')
      .createIndex(
        { postId: 1, dirty: 1, _id: 1, claimedUntil: 1 },
        { partialFilterExpression: { dirty: true } },
      ),
    db.collection('hot_reply_branch_fanouts').createIndex({ rootReplyId: 1 }, { unique: true }),
    db
      .collection('post_hot_participants')
      .createIndex({ postId: 1, ownerUserId: 1 }, { unique: true }),
    db.collection('post_hot_participants').createIndex({ postId: 1, lastActiveAt: -1 }),
    db.collection('feedbacks').createIndex({ targetType: 1, replyId: 1, type: 1, _id: 1 }),
    db.collection('governance_cases').createIndex({
      status: 1,
      emergencyDeadlineAt: 1,
      normalDeadlineAt: 1,
      openedAt: 1,
      _id: 1,
    }),
    db.collection('governance_cases').createIndex({ status: 1, nextTransitionAt: 1, _id: 1 }),
    db
      .collection('governance_cases')
      .createIndex({ status: 1, deadlineScheduleDispatchAt: 1, _id: 1 }),
    db
      .collection('governance_cases')
      .createIndex({ status: 1, deadlineCompensationDispatchAt: 1, _id: 1 }),
    db
      .collection('governance_assignments')
      .createIndex({ caseId: 1, agentOwnerUserIdSnapshot: 1 }, { unique: true }),
    db
      .collection('governance_votes')
      .createIndex({ caseId: 1, voterOwnerUserIdSnapshot: 1 }, { unique: true }),
    db.collection('governance_votes').createIndex({ caseId: 1, choice: 1 }),
    db.collection('circle_proposals').createIndex({
      status: 1,
      activeGovernanceCaseId: 1,
      deadlineCompensationDispatchAt: 1,
      _id: 1,
    }),
    db.collection('circle_proposals').createIndex({
      status: 1,
      activeGovernanceCaseId: 1,
      deadlineScheduleDispatchAt: 1,
      _id: 1,
    }),
    db
      .collection('circle_proposal_stances')
      .createIndex({ proposalId: 1, revisionNumber: 1, agentId: 1 }, { unique: true }),
    db
      .collection('circle_proposal_stances')
      .createIndex({ proposalId: 1, revisionNumber: 1, ownerUserIdSnapshot: 1 }, { unique: true }),
    db.collection('circle_proposal_stances').createIndex({
      proposalId: 1,
      revisionNumber: 1,
      withdrawnAt: 1,
      stance: 1,
      _id: 1,
    }),
    db.collection('circle_proposal_stances').createIndex({ createdAt: -1 }),
    db.collection('hot_candidate_generations').createIndex({ generationId: 1 }, { unique: true }),
    db.collection('interaction_histories').createIndex({ agentId: 1, createdAt: -1, _id: -1 }),
    db.collection('admin_audit_logs').createIndex({ createdAt: -1, _id: -1 }),
  ]);
}

async function main() {
  assertSafeTarget();
  await mongoose.connect(uri, getMongoConnectionOptions());
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB is not connected');
  await db.dropDatabase();
  await createIndexes(db);

  const now = Date.now();
  const agentIds = Array.from({ length: counts.agents }, () => objectId());
  const ownerIds = agentIds.map(() => objectId().toString());
  const ownerByAgentId = new Map(agentIds.map((id, index) => [id.toString(), ownerIds[index]]));
  const circleIds = Array.from({ length: SUBSCRIPTION_PROFILE_CIRCLE_COUNT }, () => objectId());
  await insertBatches(
    db.collection('agents'),
    agentIds.map((id, index) => ({
      _id: id,
      name: `PerfAgent-${index}`,
      description: '性能验证 Agent',
      userId: ownerIds[index],
      deletedAt: null,
      createdAt: new Date(now - index * 1_000),
      updatedAt: new Date(now - index * 1_000),
    })),
  );
  await insertBatches(
    db.collection('agent_progresses'),
    agentIds.map((agentId, index) => ({
      _id: objectId(),
      agentId: agentId.toString(),
      xpTotal: 5_000,
      staminaCurrent: 100,
      staminaLastSettledAt: new Date(now),
      dailyProgressDate: '2026-07-23',
      dailyCounters: { posts: 0, replies: 0, childReplies: 0, feedbacks: 0 },
      awardedDailyTaskIds: [],
      createdAt: new Date(now - index * 1_000),
      updatedAt: new Date(now - index * 1_000),
    })),
  );
  await insertBatches(
    db.collection('agent_governance_profiles'),
    agentIds.map((agentId, index) => ({
      _id: objectId(),
      agentId: agentId.toString(),
      healthLevel: 4,
      violationCount: 0,
      lastPenaltyAt: null,
      activeAdminBanRecordId: null,
      adminBanRestoreHealthLevel: null,
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
      status: index === 0 ? 'BANNED' : 'ACTIVE',
      visibilityVersion: index === 0 ? 2 : 1,
      deletedAt: null,
      createdAt: new Date(now - index * 60_000),
      updatedAt: new Date(now - index * 60_000),
    })),
  );
  await insertBatches(db.collection('circle_subscriptions'), [
    ...circleIds.map((circleId, index) => ({
      _id: objectId(),
      agentId: agentIds[0].toString(),
      circleId: circleId.toString(),
      createdAt: new Date(now - index),
      updatedAt: new Date(now - index),
    })),
    ...agentIds.slice(1).map((agentId, index) => ({
      _id: objectId(),
      agentId: agentId.toString(),
      circleId: circleIds[1].toString(),
      createdAt: new Date(now - circleIds.length - index),
      updatedAt: new Date(now - circleIds.length - index),
    })),
  ]);

  const posts = Array.from({ length: counts.posts }, (_, index) => ({
    _id: objectId(),
    title: `性能帖子 ${index}`,
    content: `固定性能验证正文 ${index}`,
    tags: ['DISCUSSION'],
    authorId: agentIds[index % agentIds.length].toString(),
    circleId: circleIds[index % POST_DISTRIBUTION_CIRCLE_COUNT].toString(),
    circleVisible: true,
    circleVisibilityVersion: 1,
    replyCount: 5,
    viewCount: (index * 17) % 10_000,
    deletedAt: null,
    createdAt: new Date(now - index * 10_000),
    updatedAt: new Date(now - index * 10_000),
  }));
  const postCountByCircle = new Map();
  for (const post of posts) {
    postCountByCircle.set(post.circleId, (postCountByCircle.get(post.circleId) ?? 0) + 1);
  }
  await insertBatches(db.collection('posts'), posts);
  const viewCounterPosts = posts.slice(0, POST_VIEW_COUNTER_POST_COUNT);
  await insertBatches(
    db.collection('post_view_counter_shards'),
    viewCounterPosts.flatMap((post) =>
      Array.from({ length: POST_VIEW_COUNTER_SHARD_COUNT }, (_, shard) => ({
        _id: objectId(),
        postId: post._id.toString(),
        shard,
        count: shard + 1,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })),
    ),
  );
  await insertBatches(
    db.collection('circle_post_visibility_states'),
    circleIds.map((circleId, index) => ({
      _id: objectId(),
      circleId: circleId.toString(),
      desiredVisible: index !== 0,
      visibilityVersion: index === 0 ? 2 : 1,
      processedVisibilityVersion: 1,
      postWriteVersion: postCountByCircle.get(circleId.toString()) ?? 0,
      processedPostWriteVersion: postCountByCircle.get(circleId.toString()) ?? 0,
      dirty: index === 0,
      dispatchAt: index === 0 ? new Date(now) : null,
      claimToken: null,
      claimedUntil: null,
      dispatchAttempts: 0,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })),
  );
  await insertBatches(
    db.collection('post_hot_states'),
    posts.map((post, index) => {
      const expiredCandidate = index < HOT_EXPIRED_STATE_COUNT;
      const activeCandidate =
        index >= HOT_EXPIRED_STATE_COUNT && index < HOT_EXPIRED_STATE_COUNT + counts.hotCandidates;
      const eligible = activeCandidate || expiredCandidate;
      return {
        _id: objectId(),
        postId: post._id.toString(),
        circleId: post.circleId,
        authorAgentId: post.authorId,
        authorOwnerUserId: ownerByAgentId.get(post.authorId),
        postCreatedAt: post.createdAt,
        postVisible: true,
        circleVisible: true,
        circleVisibilityVersion: 1,
        participantCount: 0,
        positiveOwnerCount: 0,
        effectiveReplyCount: 0,
        score: 0,
        lastActiveAt: post.createdAt,
        eligible,
        expiresAt: activeCandidate
          ? new Date(now + HOT_ACTIVE_EXPIRY_MS)
          : expiredCandidate
            ? new Date(now - 60_000)
            : null,
        signalVersion: 1,
        projectionVersion: 0,
        projectionDirty: index % 2 === 0,
        projectionDispatchAt: null,
        projectionClaimedUntil: null,
        projectionDispatchAttempts: 0,
        candidateVersion: eligible ? 1 : 0,
        candidateSyncedVersion: 0,
        candidateDirty: eligible,
        candidateDispatchAt: null,
        candidateClaimedUntil: null,
        candidateDispatchAttempts: 0,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      };
    }),
  );

  const largeReplyBranchRootId = objectId();
  await db.collection('performance_fixture_metadata').insertOne({
    _id: 'hot-history-profiles',
    profiles: HOT_HISTORY_SCALES.map((historySize, profileIndex) => ({
      historySize,
      postId: posts[profileIndex]._id.toString(),
      participantOwnerUserId: ownerIds[HOT_HISTORY_PARTICIPANT_AGENT_INDEX],
      topLevelReplyCount: historySize === LARGE_REPLY_BRANCH_HISTORY_SIZE ? 1 : historySize,
    })),
    largeReplyBranch: {
      postId: posts[HOT_HISTORY_SCALES.length - 1]._id.toString(),
      rootReplyId: largeReplyBranchRootId.toString(),
      childCount: LARGE_REPLY_BRANCH_HISTORY_SIZE - 1,
    },
    viewCounterPostIds: viewCounterPosts.map((post) => post._id.toString()),
    subscriptionProfile: {
      agentId: agentIds[0].toString(),
      ownerUserId: ownerIds[0],
      circleCount: circleIds.length,
      activeCircleCount: circleIds.length - 1,
    },
    circleProposalEligibilityProfile: {
      circleId: circleIds[1].toString(),
      actorOwnerUserId: ownerIds[0],
      subscriberCount: agentIds.length,
      eligibleMemberCount: agentIds.length,
    },
    agentInteractionProfile: {
      agentId: agentIds[0].toString(),
      count: counts.agentInteractions,
    },
    hotCandidateCount: counts.hotCandidates,
    hotExpiredStateCount: HOT_EXPIRED_STATE_COUNT,
    deadlineDistractorCount: counts.deadlineDistractors,
    createdAt: new Date(now),
  });

  const replies = [];
  const hotWorkItems = [];
  const feedbacks = [];
  const fanouts = [];
  for (let index = 0; index < counts.replies; index += 1) {
    const target = resolveReplyFixtureTarget(index, posts.length);
    const post = posts[target.postIndex];
    const replyAgentIndex = target.dedicated
      ? HOT_HISTORY_PARTICIPANT_AGENT_INDEX
      : (index + 1) % agentIds.length;
    const feedbackAgentIndex = target.dedicated
      ? HOT_HISTORY_FEEDBACK_AGENT_INDEX
      : (index + 2) % agentIds.length;
    const isPendingInteraction =
      target.dedicated && target.positionInHistory === target.historySize - 1;
    const projectedActive = target.dedicated && !isPendingInteraction;
    const isLargeBranch = target.historySize === LARGE_REPLY_BRANCH_HISTORY_SIZE;
    const isLargeBranchRoot = isLargeBranch && target.positionInHistory === 0;
    const replyObjectId = isLargeBranchRoot ? largeReplyBranchRootId : objectId();
    replies.push({
      _id: replyObjectId,
      postId: post._id.toString(),
      parentReplyId: isLargeBranch && !isLargeBranchRoot ? largeReplyBranchRootId.toString() : null,
      childReplyCount: isLargeBranchRoot ? LARGE_REPLY_BRANCH_HISTORY_SIZE - 1 : 0,
      authorId: agentIds[replyAgentIndex].toString(),
      authorOwnerUserIdSnapshot: ownerIds[replyAgentIndex],
      content: `性能回复 ${index}`,
      feedbackCounts: PERFORMANCE_REPLY_FEEDBACK_COUNTS,
      deletedAt: null,
      createdAt: new Date(post.createdAt.getTime() + ((index % 50) + 1) * 1_000),
      updatedAt: new Date(post.createdAt.getTime() + ((index % 50) + 1) * 1_000),
    });
    const replyId = replies.at(-1)._id.toString();
    hotWorkItems.push({
      _id: objectId(),
      sourceKey: `${HOT_SOURCE_TYPES.REPLY}:${replyId}`,
      sourceType: HOT_SOURCE_TYPES.REPLY,
      sourceId: replyId,
      postId: post._id.toString(),
      participantAgentId: replies.at(-1).authorId,
      participantOwnerUserId: replies.at(-1).authorOwnerUserIdSnapshot,
      desiredActive: true,
      desiredSourceExists: true,
      desiredActivityAt: replies.at(-1).createdAt,
      projectedActive,
      projectedActivityAt: projectedActive ? replies.at(-1).createdAt : null,
      version: 1,
      processedVersion: projectedActive ? 1 : 0,
      dirty: !projectedActive,
      claimedUntil: null,
      createdAt: replies.at(-1).createdAt,
      updatedAt: replies.at(-1).updatedAt,
    });
    const feedbackId = objectId();
    feedbacks.push({
      _id: feedbackId,
      targetType: FEEDBACK_TARGET_TYPES.REPLY,
      replyId,
      contextPostId: post._id.toString(),
      postId: null,
      agentId: agentIds[feedbackAgentIndex].toString(),
      agentOwnerUserIdSnapshot: ownerIds[feedbackAgentIndex],
      type: POSITIVE_FEEDBACK_TYPE,
      createdAt: replies.at(-1).createdAt,
      updatedAt: replies.at(-1).updatedAt,
    });
    fanouts.push({
      _id: objectId(),
      replyId,
      postId: post._id.toString(),
      version: 1,
      processedVersion: 0,
      cursorFeedbackId: null,
      dirty: true,
      claimedUntil: null,
      createdAt: replies.at(-1).createdAt,
      updatedAt: replies.at(-1).updatedAt,
    });
    if (replies.length >= batchSize) {
      await db.collection('replies').insertMany(replies, { ordered: false });
      replies.length = 0;
    }
    if (hotWorkItems.length >= batchSize) {
      await db.collection('hot_projection_work_items').insertMany(hotWorkItems, { ordered: false });
      hotWorkItems.length = 0;
    }
    if (feedbacks.length >= batchSize) {
      await db.collection('feedbacks').insertMany(feedbacks, { ordered: false });
      feedbacks.length = 0;
    }
    if (fanouts.length >= batchSize) {
      await db.collection('hot_reply_feedback_fanouts').insertMany(fanouts, { ordered: false });
      fanouts.length = 0;
    }
  }
  if (replies.length) await db.collection('replies').insertMany(replies, { ordered: false });
  if (hotWorkItems.length) {
    await db.collection('hot_projection_work_items').insertMany(hotWorkItems, { ordered: false });
  }
  if (feedbacks.length) await db.collection('feedbacks').insertMany(feedbacks, { ordered: false });
  if (fanouts.length) {
    await db.collection('hot_reply_feedback_fanouts').insertMany(fanouts, { ordered: false });
  }
  await db.collection('hot_reply_branch_fanouts').insertOne({
    _id: objectId(),
    rootReplyId: largeReplyBranchRootId.toString(),
    postId: posts[HOT_HISTORY_SCALES.length - 1]._id.toString(),
    version: 1,
    processedVersion: 0,
    cursorReplyId: null,
    dirty: true,
    claimedUntil: null,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  });

  const deadlineNow = new Date(now - 60_000);
  const deadlineFuture = new Date(now + PERFORMANCE_FUTURE_OFFSET_MS);
  const governanceCases = Array.from({ length: counts.governanceCases }, () => ({
    _id: objectId(),
    status: ACTIVE_GOVERNANCE_STATUS,
    nextTransitionAt: deadlineNow,
    deadlineScheduleDispatchAt: deadlineNow,
    deadlineCompensationDispatchAt: deadlineNow,
    deadlineVersion: 1,
    deadlinePublishedVersion: 0,
    targetType: 'POST',
    targetId: posts[0]._id.toString(),
    targetContentVersion: 1,
    round: 1,
    activeKey: `PERF:${objectId().toString()}`,
    openedAt: deadlineNow,
    normalDeadlineAt: deadlineNow,
    emergencyDeadlineAt: deadlineFuture,
  }));
  const dispatchGovernanceCases = Array.from(
    { length: counts.deadlineDistractors },
    (_, index) => ({
      _id: objectId(),
      status: ACTIVE_GOVERNANCE_STATUS,
      nextTransitionAt: deadlineFuture,
      deadlineScheduleDispatchAt: null,
      deadlineCompensationDispatchAt: deadlineFuture,
      deadlineVersion: 1,
      deadlinePublishedVersion: 1,
      targetType: 'POST',
      targetId: posts[0]._id.toString(),
      targetContentVersion: 1,
      round: 1,
      targetAuthorId: agentIds[1].toString(),
      targetAuthorOwnerUserId: ownerIds[1],
      reporterAgentIds: agentIds.slice(2, 5).map((agentId) => agentId.toString()),
      reporterOwnerUserIds: ownerIds.slice(2, 5),
      activeKey: `PERF:${objectId().toString()}`,
      openedAt: new Date(deadlineNow.getTime() + index),
      normalDeadlineAt: deadlineNow,
      emergencyDeadlineAt: deadlineFuture,
    }),
  );
  governanceCases.push(...dispatchGovernanceCases);
  await insertBatches(db.collection('governance_cases'), governanceCases);

  const governanceDispatchParticipatedCases = [
    ...governanceCases.slice(0, GOVERNANCE_DISPATCH_EXPIRED_PARTICIPATION_COUNT),
    ...dispatchGovernanceCases.slice(0, GOVERNANCE_DISPATCH_ACTIVE_PARTICIPATION_COUNT),
  ];
  const governanceDispatchAssignments = [];
  const governanceDispatchVotes = [];
  for (const [index, governanceCase] of governanceDispatchParticipatedCases.entries()) {
    if (index % 2 === 0) {
      governanceDispatchAssignments.push({
        _id: objectId(),
        caseId: governanceCase._id.toString(),
        agentId: agentIds[0].toString(),
        agentOwnerUserIdSnapshot: ownerIds[0],
        status: 'SUBMITTED',
        decision: 'NOT_VIOLATION',
        weight: 1,
        agentLevelSnapshot: 4,
        healthLevelSnapshot: 4,
        assignedAt: deadlineNow,
        deadlineAt: deadlineFuture,
        decidedAt: deadlineNow,
        statusReason: null,
        createdAt: deadlineNow,
        updatedAt: deadlineNow,
      });
      continue;
    }
    governanceDispatchVotes.push({
      _id: objectId(),
      caseId: governanceCase._id.toString(),
      voterAgentId: agentIds[0].toString(),
      voterOwnerUserIdSnapshot: ownerIds[0],
      targetType: governanceCase.targetType,
      targetId: governanceCase.targetId,
      choice: 'NOT_VIOLATION',
      weight: 1,
      voterLevel: 4,
      voterHealthLevel: 4,
      createdAt: deadlineNow,
      updatedAt: deadlineNow,
    });
  }
  await insertBatches(db.collection('governance_assignments'), governanceDispatchAssignments);
  await insertBatches(db.collection('governance_votes'), governanceDispatchVotes);
  const governanceTimelineCase = governanceCases[counts.governanceCases - 1];
  const governanceTimelineDayOne = new Date('2026-07-20T04:00:00.000Z');
  const governanceTimelineDayTwo = new Date('2026-07-21T04:00:00.000Z');
  const governanceTimelineVotes = Array.from(
    { length: GOVERNANCE_TIMELINE_VOTE_COUNT },
    (_, index) => ({
      _id: objectId(),
      caseId: governanceTimelineCase._id.toString(),
      voterAgentId: `perf-timeline-agent-${index}`,
      voterOwnerUserIdSnapshot: `perf-timeline-owner-${index}`,
      targetType: governanceTimelineCase.targetType,
      targetId: governanceTimelineCase.targetId,
      choice:
        index % GOVERNANCE_TIMELINE_DAY_COUNT === 0
          ? GOVERNANCE_DECISIONS.VIOLATION
          : GOVERNANCE_DECISIONS.NOT_VIOLATION,
      weight: index % 2 === 0 ? 1 : 1.5,
      voterLevel: 4,
      voterHealthLevel: 4,
      createdAt: index % 2 === 0 ? governanceTimelineDayOne : governanceTimelineDayTwo,
      updatedAt: index % 2 === 0 ? governanceTimelineDayOne : governanceTimelineDayTwo,
    }),
  );
  await insertBatches(db.collection('governance_votes'), governanceTimelineVotes);
  await db.collection('performance_fixture_metadata').updateOne(
    { _id: 'hot-history-profiles' },
    {
      $set: {
        governanceDispatchProfile: {
          agentId: agentIds[0].toString(),
          ownerUserId: ownerIds[0],
          participationCount: governanceDispatchParticipatedCases.length,
          activeParticipationCount: GOVERNANCE_DISPATCH_ACTIVE_PARTICIPATION_COUNT,
          activeCandidateCount: dispatchGovernanceCases.length,
          expectedCaseId:
            dispatchGovernanceCases[GOVERNANCE_DISPATCH_ACTIVE_PARTICIPATION_COUNT]._id.toString(),
        },
        governanceTimelineProfile: {
          caseId: governanceTimelineCase._id.toString(),
          voteCount: governanceTimelineVotes.length,
          dayCount: GOVERNANCE_TIMELINE_DAY_COUNT,
        },
      },
    },
  );

  const circleProposals = Array.from({ length: counts.circleProposals }, () => ({
    _id: objectId(),
    status: ACTIVE_PROPOSAL_STATUS,
    activeGovernanceCaseId: null,
    nextTransitionAt: deadlineNow,
    deadlineScheduleDispatchAt: deadlineNow,
    deadlineCompensationDispatchAt: deadlineNow,
    deadlineVersion: 1,
    deadlinePublishedVersion: 0,
    circleId: circleIds[0].toString(),
    discussionDeadlineAt: deadlineNow,
    votingDeadlineAt: null,
    expiresAt: deadlineFuture,
    currentRevisionNumber: 1,
    eligibleMemberCountSnapshot: 20,
    quorumSnapshot: 20,
    version: 1,
    participationVersion: 0,
    activeKey: null,
    idempotencyKey: `PERF:${objectId().toString()}`,
    creatorAgentId: agentIds[0].toString(),
    creatorOwnerUserIdSnapshot: ownerIds[0],
  }));
  circleProposals.push(
    ...Array.from({ length: counts.deadlineDistractors }, () => ({
      _id: objectId(),
      status: ACTIVE_PROPOSAL_STATUS,
      activeGovernanceCaseId: null,
      nextTransitionAt: deadlineFuture,
      deadlineScheduleDispatchAt: null,
      deadlineCompensationDispatchAt: deadlineFuture,
      deadlineVersion: 1,
      deadlinePublishedVersion: 1,
      circleId: circleIds[0].toString(),
      discussionDeadlineAt: deadlineNow,
      votingDeadlineAt: null,
      expiresAt: deadlineFuture,
      currentRevisionNumber: 1,
      eligibleMemberCountSnapshot: 20,
      quorumSnapshot: 20,
      version: 1,
      participationVersion: 0,
      activeKey: null,
      idempotencyKey: `PERF:${objectId().toString()}`,
      creatorAgentId: agentIds[0].toString(),
      creatorOwnerUserIdSnapshot: ownerIds[0],
    })),
  );
  await insertBatches(db.collection('circle_proposals'), circleProposals);

  const stanceProposal = circleProposals[0];
  const proposalStances = Array.from({ length: counts.circleProposalStances }, (_, index) => ({
    _id: objectId(),
    proposalId: stanceProposal._id.toString(),
    revisionNumber: stanceProposal.currentRevisionNumber,
    agentId: `perf-stance-agent-${index}`,
    ownerUserIdSnapshot: `perf-stance-owner-${index}`,
    agentNameSnapshot: `Perf stance agent ${index}`,
    agentAvatarSeedSnapshot: `perf-stance-avatar-${index}`,
    stance:
      index === counts.circleProposalStances - 1
        ? CIRCLE_PROPOSAL_STANCES.OBJECTION
        : CIRCLE_PROPOSAL_STANCES.SUPPORT,
    reason: null,
    withdrawnAt: null,
    createdAt: new Date(now - index),
    updatedAt: new Date(now - index),
  }));
  await insertBatches(db.collection('circle_proposal_stances'), proposalStances);
  await db.collection('performance_fixture_metadata').updateOne(
    { _id: 'hot-history-profiles' },
    {
      $set: {
        proposalStanceProfile: {
          proposalId: stanceProposal._id.toString(),
          revisionNumber: stanceProposal.currentRevisionNumber,
          quorum: stanceProposal.quorumSnapshot,
          count: counts.circleProposalStances,
        },
      },
    },
  );
  await db.collection('hot_candidate_generations').insertOne({
    _id: objectId(),
    generationId: 'perf-generation',
    status: 'ACTIVE',
    cursorStateId: null,
    version: 1,
    claimedUntil: null,
    activatedAt: new Date(now),
    createdAt: new Date(now),
    updatedAt: new Date(now),
  });

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

  const agentInteractions = Array.from({ length: counts.agentInteractions }, (_, index) => ({
    _id: objectId(),
    agentId: agentIds[0].toString(),
    agentNameSnapshot: 'PerfAgent-0',
    agentAvatarSeedSnapshot: 'perf-agent-0',
    type: 'FEEDBACK_GIVEN',
    feedbackType: POSITIVE_FEEDBACK_TYPE,
    targetType: 'POST',
    targetAuthorId: agentIds[1].toString(),
    targetAuthorNameSnapshot: 'PerfAgent-1',
    targetAuthorAvatarSeedSnapshot: 'perf-agent-1',
    postId: posts[index % posts.length]._id.toString(),
    postTitleSnapshot: posts[index % posts.length].title,
    replyId: null,
    replyExcerptSnapshot: null,
    createdAt: new Date(now - index),
    updatedAt: new Date(now - index),
  }));
  await insertBatches(db.collection('interaction_histories'), agentInteractions);

  console.log(JSON.stringify({ database: 'skynet_perf', counts }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => mongoose.disconnect());
