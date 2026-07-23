import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const HOT_DISPATCH_SCAN_LIMIT = 20;
const HOT_PROJECTION_WORK_BATCH_SIZE = 12;
const HOT_CANDIDATE_REBUILD_BATCH_SIZE = 250;
const HOT_CANDIDATE_REBUILD_INDEX = 'eligible_1_postVisible_1_circleVisible_1__id_1';
const POST_VISIBILITY_DISPATCH_BATCH_SIZE = 10;
const POST_VISIBILITY_POST_BATCH_SIZE = 250;
const POST_VISIBILITY_DISPATCH_INDEX = 'dirty_1_dispatchAt_1__id_1_claimedUntil_1';
const POST_VISIBILITY_POST_INDEX = 'circleId_1_circleVisibilityVersion_1__id_1';
const TOP_REPLY_PAGE_SIZE = 21;
const CHILD_REPLY_PAGE_SIZE = 4;
const CHILD_REPLY_PAGE_INDEX = 'postId_1_parentReplyId_1_createdAt_1__id_1';
const POST_VIEW_COUNTER_SHARD_COUNT = 32;
const POST_VIEW_COUNTER_POST_COUNT = 20;
const POST_VIEW_COUNTER_PAGE_LIMIT = POST_VIEW_COUNTER_SHARD_COUNT * POST_VIEW_COUNTER_POST_COUNT;
const POST_VIEW_COUNTER_INDEX = 'postId_1_shard_1';
const SUBSCRIPTION_PAGE_SIZE = 20;
const SUBSCRIPTION_RELATION_INDEX = 'agentId_1_circleId_1';
const SUBSCRIBED_LATEST_POST_INDEX = 'circleId_1_circleVisible_1_createdAt_-1__id_-1';
const AGENT_INTERACTION_PAGE_SIZE = 20;
const AGENT_INTERACTION_INDEX = 'agentId_1_createdAt_-1__id_-1';
const GOVERNANCE_DEADLINE_BATCH_SIZE = 50;
const GOVERNANCE_DEADLINE_PUBLISH_INDEX = 'status_1_deadlineScheduleDispatchAt_1__id_1';
const GOVERNANCE_DEADLINE_COMPENSATION_INDEX = 'status_1_deadlineCompensationDispatchAt_1__id_1';
const GOVERNANCE_DISPATCH_INDEX =
  'status_1_emergencyDeadlineAt_1_normalDeadlineAt_1_openedAt_1__id_1';
const GOVERNANCE_ASSIGNMENT_PARTICIPATION_INDEX = 'caseId_1_agentOwnerUserIdSnapshot_1';
const GOVERNANCE_VOTE_PARTICIPATION_INDEX = 'caseId_1_voterOwnerUserIdSnapshot_1';
const GOVERNANCE_VOTE_TIMELINE_INDEX = 'caseId_1_choice_1';
const GOVERNANCE_DECISIONS = {
  VIOLATION: 'VIOLATION',
  NOT_VIOLATION: 'NOT_VIOLATION',
};
const GOVERNANCE_TIMEZONE = 'Asia/Shanghai';
const GOVERNANCE_DISPATCH_SORT = {
  status: 1,
  emergencyDeadlineAt: 1,
  normalDeadlineAt: 1,
  openedAt: 1,
  _id: 1,
};
const CIRCLE_PROPOSAL_DEADLINE_BATCH_SIZE = 50;
const CIRCLE_PROPOSAL_DEADLINE_PUBLISH_INDEX =
  'status_1_activeGovernanceCaseId_1_deadlineScheduleDispatchAt_1__id_1';
const CIRCLE_PROPOSAL_DEADLINE_COMPENSATION_INDEX =
  'status_1_activeGovernanceCaseId_1_deadlineCompensationDispatchAt_1__id_1';
const CIRCLE_PROPOSAL_STANCE_SETTLEMENT_INDEX =
  'proposalId_1_revisionNumber_1_withdrawnAt_1_stance_1__id_1';
const CIRCLE_SUBSCRIPTION_BY_CIRCLE_INDEX = 'circleId_1_createdAt_-1__id_-1';
const AGENT_RELATION_INDEX = 'agentId_1';
const CIRCLE_PROPOSAL_MINIMUM_XP = 5_000;
const CIRCLE_PROPOSAL_MINIMUM_HEALTH_LEVEL = 3;
const CIRCLE_PROPOSAL_DEFAULT_HEALTH_LEVEL = 4;
const CIRCLE_PROPOSAL_ELIGIBILITY_COLLECTIONS = {
  AGENTS: 'agents',
  AGENT_PROGRESS: 'agent_progresses',
  AGENT_GOVERNANCE_PROFILES: 'agent_governance_profiles',
};
const CIRCLE_PROPOSAL_STANCES = { SUPPORT: 'SUPPORT', OBJECTION: 'OBJECTION' };

function parseHotHistoryProfiles(metadata) {
  if (!metadata || !Array.isArray(metadata.profiles)) {
    throw new Error('Performance fixture is missing hot-history profiles');
  }
  const profiles = metadata.profiles.map((profile) => {
    if (
      !profile ||
      typeof profile !== 'object' ||
      typeof profile.historySize !== 'number' ||
      !Number.isInteger(profile.historySize) ||
      profile.historySize < 1 ||
      typeof profile.postId !== 'string' ||
      typeof profile.participantOwnerUserId !== 'string' ||
      typeof profile.topLevelReplyCount !== 'number' ||
      !Number.isInteger(profile.topLevelReplyCount) ||
      profile.topLevelReplyCount < 1
    ) {
      throw new Error('Performance fixture contains an invalid hot-history profile');
    }
    return {
      historySize: profile.historySize,
      postId: profile.postId,
      participantOwnerUserId: profile.participantOwnerUserId,
      topLevelReplyCount: profile.topLevelReplyCount,
    };
  });
  if (profiles.length !== 3) {
    throw new Error('Performance fixture must contain three hot-history profiles');
  }
  return profiles;
}

function parseLargeReplyBranch(metadata) {
  const branch = metadata?.largeReplyBranch;
  if (
    !branch ||
    typeof branch !== 'object' ||
    typeof branch.postId !== 'string' ||
    typeof branch.rootReplyId !== 'string' ||
    typeof branch.childCount !== 'number' ||
    !Number.isInteger(branch.childCount) ||
    branch.childCount < CHILD_REPLY_PAGE_SIZE
  ) {
    throw new Error('Performance fixture contains an invalid large reply branch');
  }
  return branch;
}

function parseViewCounterPostIds(metadata) {
  const postIds = metadata?.viewCounterPostIds;
  if (
    !Array.isArray(postIds) ||
    postIds.length !== POST_VIEW_COUNTER_POST_COUNT ||
    !postIds.every((postId) => typeof postId === 'string')
  ) {
    throw new Error('Performance fixture contains invalid view-counter post IDs');
  }
  return postIds;
}

function parseProposalStanceProfile(metadata) {
  const profile = metadata?.proposalStanceProfile;
  if (
    !profile ||
    typeof profile !== 'object' ||
    typeof profile.proposalId !== 'string' ||
    typeof profile.revisionNumber !== 'number' ||
    !Number.isInteger(profile.revisionNumber) ||
    profile.revisionNumber < 1 ||
    typeof profile.quorum !== 'number' ||
    !Number.isInteger(profile.quorum) ||
    profile.quorum < 1 ||
    typeof profile.count !== 'number' ||
    !Number.isInteger(profile.count) ||
    profile.count <= profile.quorum
  ) {
    throw new Error('Performance fixture contains an invalid proposal-stance profile');
  }
  return profile;
}

function parseSubscriptionProfile(metadata) {
  const profile = metadata?.subscriptionProfile;
  if (
    !profile ||
    typeof profile !== 'object' ||
    typeof profile.agentId !== 'string' ||
    typeof profile.ownerUserId !== 'string' ||
    typeof profile.circleCount !== 'number' ||
    !Number.isInteger(profile.circleCount) ||
    profile.circleCount < SUBSCRIPTION_PAGE_SIZE ||
    typeof profile.activeCircleCount !== 'number' ||
    !Number.isInteger(profile.activeCircleCount) ||
    profile.activeCircleCount !== profile.circleCount - 1
  ) {
    throw new Error('Performance fixture contains an invalid subscription profile');
  }
  return profile;
}

function parseAgentInteractionProfile(metadata) {
  const profile = metadata?.agentInteractionProfile;
  if (
    !profile ||
    typeof profile !== 'object' ||
    typeof profile.agentId !== 'string' ||
    typeof profile.count !== 'number' ||
    !Number.isInteger(profile.count) ||
    profile.count < AGENT_INTERACTION_PAGE_SIZE * 2
  ) {
    throw new Error('Performance fixture contains an invalid Agent interaction profile');
  }
  return profile;
}

function parseCircleProposalEligibilityProfile(metadata) {
  const profile = metadata?.circleProposalEligibilityProfile;
  if (
    !profile ||
    typeof profile !== 'object' ||
    typeof profile.circleId !== 'string' ||
    typeof profile.actorOwnerUserId !== 'string' ||
    typeof profile.subscriberCount !== 'number' ||
    !Number.isInteger(profile.subscriberCount) ||
    profile.subscriberCount < 3 ||
    typeof profile.eligibleMemberCount !== 'number' ||
    !Number.isInteger(profile.eligibleMemberCount) ||
    profile.eligibleMemberCount < 3
  ) {
    throw new Error('Performance fixture contains an invalid circle-proposal eligibility profile');
  }
  return profile;
}

function parseGovernanceDispatchProfile(metadata) {
  const profile = metadata?.governanceDispatchProfile;
  if (
    !profile ||
    typeof profile !== 'object' ||
    typeof profile.agentId !== 'string' ||
    typeof profile.ownerUserId !== 'string' ||
    typeof profile.participationCount !== 'number' ||
    !Number.isInteger(profile.participationCount) ||
    profile.participationCount < 1 ||
    typeof profile.activeParticipationCount !== 'number' ||
    !Number.isInteger(profile.activeParticipationCount) ||
    profile.activeParticipationCount < 1 ||
    typeof profile.activeCandidateCount !== 'number' ||
    !Number.isInteger(profile.activeCandidateCount) ||
    profile.activeCandidateCount < 1 ||
    profile.activeParticipationCount >= profile.activeCandidateCount ||
    typeof profile.expectedCaseId !== 'string'
  ) {
    throw new Error('Performance fixture contains an invalid governance dispatch profile');
  }
  return profile;
}

function parseGovernanceTimelineProfile(metadata) {
  const profile = metadata?.governanceTimelineProfile;
  if (
    !profile ||
    typeof profile !== 'object' ||
    typeof profile.caseId !== 'string' ||
    typeof profile.voteCount !== 'number' ||
    !Number.isInteger(profile.voteCount) ||
    profile.voteCount < 1 ||
    typeof profile.dayCount !== 'number' ||
    !Number.isInteger(profile.dayCount) ||
    profile.dayCount < 1
  ) {
    throw new Error('Performance fixture contains an invalid governance timeline profile');
  }
  return profile;
}

function collectIndexNames(value, result = new Set()) {
  if (!value || typeof value !== 'object') return result;
  if (typeof value.indexName === 'string') result.add(value.indexName);
  if (Array.isArray(value.indexesUsed)) {
    for (const indexName of value.indexesUsed) {
      if (typeof indexName === 'string') result.add(indexName);
    }
  }
  for (const nested of Object.values(value)) {
    if (Array.isArray(nested)) {
      for (const item of nested) collectIndexNames(item, result);
    } else {
      collectIndexNames(nested, result);
    }
  }
  return result;
}

function collectLookupExecutionStats(value, result = []) {
  if (!value || typeof value !== 'object') return result;
  if ('$lookup' in value && value.$lookup && typeof value.$lookup === 'object') {
    result.push({
      from: typeof value.$lookup.from === 'string' ? value.$lookup.from : 'unknown',
      totalKeysExamined:
        typeof value.totalKeysExamined === 'number' ? value.totalKeysExamined : null,
      totalDocsExamined:
        typeof value.totalDocsExamined === 'number' ? value.totalDocsExamined : null,
      collectionScans: typeof value.collectionScans === 'number' ? value.collectionScans : null,
      indexes: Array.isArray(value.indexesUsed) ? value.indexesUsed : [],
    });
  }
  for (const nested of Object.values(value)) {
    if (Array.isArray(nested)) {
      for (const item of nested) collectLookupExecutionStats(item, result);
    } else {
      collectLookupExecutionStats(nested, result);
    }
  }
  return result;
}

function findExecutionStatsUsingIndex(value, expectedIndexName) {
  if (!value || typeof value !== 'object') return null;
  if (
    value.queryPlanner &&
    value.executionStats &&
    collectIndexNames(value.queryPlanner).has(expectedIndexName)
  ) {
    return value.executionStats;
  }
  for (const nested of Object.values(value)) {
    if (Array.isArray(nested)) {
      for (const item of nested) {
        const found = findExecutionStatsUsingIndex(item, expectedIndexName);
        if (found) return found;
      }
    } else {
      const found = findExecutionStatsUsingIndex(nested, expectedIndexName);
      if (found) return found;
    }
  }
  return null;
}

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

function assertExecutionBound(
  summary,
  expectedReturned,
  maximumDocumentsExamined,
  expectedIndexName,
) {
  if (summary.index === null) {
    throw new Error(`${summary.name} did not use an index`);
  }
  if (expectedIndexName && summary.index !== expectedIndexName) {
    throw new Error(`${summary.name} used ${summary.index}; expected ${expectedIndexName}`);
  }
  if (summary.nReturned !== expectedReturned) {
    throw new Error(`${summary.name} returned ${summary.nReturned}; expected ${expectedReturned}`);
  }
  if (
    typeof summary.totalDocsExamined !== 'number' ||
    summary.totalDocsExamined > maximumDocumentsExamined
  ) {
    throw new Error(
      `${summary.name} examined ${summary.totalDocsExamined} documents; maximum is ${maximumDocumentsExamined}`,
    );
  }
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

async function main() {
  const parsed = new URL(uri);
  if (parsed.pathname.replace(/^\//u, '').split('?')[0] !== 'skynet_perf') {
    throw new Error('Performance checks may only read the skynet_perf database');
  }
  await mongoose.connect(uri, getMongoConnectionOptions());
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB is not connected');
  const [circle, hotState, governanceCase, circleProposal, visibilityState, fixtureMetadata] =
    await Promise.all([
      db.collection('circles').findOne({}),
      db.collection('post_hot_states').findOne({}),
      db.collection('governance_cases').findOne({}),
      db.collection('circle_proposals').findOne({}),
      db.collection('circle_post_visibility_states').findOne({ dirty: true }),
      db.collection('performance_fixture_metadata').findOne({ _id: 'hot-history-profiles' }),
    ]);
  if (!circle || !hotState || !governanceCase || !circleProposal || !visibilityState) {
    throw new Error('Generate the performance fixture first');
  }
  const hotHistoryProfiles = parseHotHistoryProfiles(fixtureMetadata);
  const largeReplyBranch = parseLargeReplyBranch(fixtureMetadata);
  const viewCounterPostIds = parseViewCounterPostIds(fixtureMetadata);
  const proposalStanceProfile = parseProposalStanceProfile(fixtureMetadata);
  const subscriptionProfile = parseSubscriptionProfile(fixtureMetadata);
  const agentInteractionProfile = parseAgentInteractionProfile(fixtureMetadata);
  const circleProposalEligibilityProfile = parseCircleProposalEligibilityProfile(fixtureMetadata);
  const governanceDispatchProfile = parseGovernanceDispatchProfile(fixtureMetadata);
  const governanceTimelineProfile = parseGovernanceTimelineProfile(fixtureMetadata);
  if (
    typeof fixtureMetadata.hotCandidateCount !== 'number' ||
    !Number.isInteger(fixtureMetadata.hotCandidateCount) ||
    fixtureMetadata.hotCandidateCount < 1
  ) {
    throw new Error('Performance fixture contains an invalid hot-candidate count');
  }
  if (
    typeof fixtureMetadata.hotExpiredStateCount !== 'number' ||
    !Number.isInteger(fixtureMetadata.hotExpiredStateCount) ||
    fixtureMetadata.hotExpiredStateCount < HOT_CANDIDATE_REBUILD_BATCH_SIZE
  ) {
    throw new Error('Performance fixture contains too few expired hot states');
  }
  if (
    typeof fixtureMetadata.deadlineDistractorCount !== 'number' ||
    !Number.isInteger(fixtureMetadata.deadlineDistractorCount) ||
    fixtureMetadata.deadlineDistractorCount < GOVERNANCE_DEADLINE_BATCH_SIZE
  ) {
    throw new Error('Performance fixture contains too few deadline-query distractors');
  }
  const now = new Date();
  const activeHotCandidateCount = await db.collection('post_hot_states').countDocuments({
    postVisible: true,
    circleVisible: true,
    eligible: true,
    expiresAt: { $gt: now },
  });
  if (activeHotCandidateCount !== fixtureMetadata.hotCandidateCount) {
    throw new Error(
      `Performance fixture has ${activeHotCandidateCount} active candidates; expected ${fixtureMetadata.hotCandidateCount}`,
    );
  }
  const expiredHotStateCount = await db.collection('post_hot_states').countDocuments({
    postVisible: true,
    circleVisible: true,
    eligible: true,
    expiresAt: { $lte: now },
  });
  if (expiredHotStateCount !== fixtureMetadata.hotExpiredStateCount) {
    throw new Error(
      `Performance fixture has ${expiredHotStateCount} expired hot states; expected ${fixtureMetadata.hotExpiredStateCount}`,
    );
  }
  const firstRebuildBatch = await db
    .collection('post_hot_states')
    .find({ postVisible: true, circleVisible: true, eligible: true })
    .sort({ _id: 1 })
    .limit(HOT_CANDIDATE_REBUILD_BATCH_SIZE)
    .project({ expiresAt: 1 })
    .toArray();
  if (
    firstRebuildBatch.length !== HOT_CANDIDATE_REBUILD_BATCH_SIZE ||
    firstRebuildBatch.some(
      (state) => !(state.expiresAt instanceof Date) || state.expiresAt.getTime() > now.getTime(),
    )
  ) {
    throw new Error('Performance fixture must place expired states at the rebuild cursor head');
  }
  const [governanceDeadlineDistractors, proposalDeadlineDistractors] = await Promise.all([
    db.collection('governance_cases').countDocuments({
      status: 'OPEN',
      deadlineScheduleDispatchAt: null,
      deadlinePublishedVersion: 1,
    }),
    db.collection('circle_proposals').countDocuments({
      status: 'DISCUSSION',
      deadlineScheduleDispatchAt: null,
      deadlinePublishedVersion: 1,
    }),
  ]);
  if (
    governanceDeadlineDistractors !== fixtureMetadata.deadlineDistractorCount ||
    proposalDeadlineDistractors !== fixtureMetadata.deadlineDistractorCount
  ) {
    throw new Error('Performance fixture deadline-query distractors are incomplete');
  }
  const largestHistoryProfile = hotHistoryProfiles.at(-1);
  if (!largestHistoryProfile) throw new Error('Performance fixture has no hot-history profile');
  const largestHistoryPost = await db
    .collection('posts')
    .findOne({ _id: new mongoose.Types.ObjectId(largestHistoryProfile.postId) });
  if (!largestHistoryPost) throw new Error('Performance fixture hot-history post is missing');
  const subscriptionCircleIds = (
    await db
      .collection('circle_subscriptions')
      .find({ agentId: subscriptionProfile.agentId })
      .project({ circleId: 1 })
      .toArray()
  ).map((subscription) => subscription.circleId);
  if (subscriptionCircleIds.length !== subscriptionProfile.circleCount) {
    throw new Error(
      `Performance fixture has ${subscriptionCircleIds.length} subscriptions; expected ${subscriptionProfile.circleCount}`,
    );
  }
  const subscriptionCircleObjectIds = subscriptionCircleIds.map(
    (circleId) => new mongoose.Types.ObjectId(circleId),
  );
  const activeSubscriptionCircles = await db
    .collection('circles')
    .find({
      _id: { $in: subscriptionCircleObjectIds },
      deletedAt: null,
      status: 'ACTIVE',
    })
    .project({ _id: 1 })
    .toArray();
  if (activeSubscriptionCircles.length !== subscriptionProfile.activeCircleCount) {
    throw new Error(
      `Performance fixture has ${activeSubscriptionCircles.length} active subscribed circles; expected ${subscriptionProfile.activeCircleCount}`,
    );
  }
  const activeSubscriptionCircleIds = activeSubscriptionCircles.map((circle) =>
    circle._id.toString(),
  );
  const subscriptionPageCircleIds = activeSubscriptionCircleIds.slice(0, SUBSCRIPTION_PAGE_SIZE);
  const hotHistoryQueries = [];
  const hotHistoryQueryNames = [];
  for (const profile of hotHistoryProfiles) {
    hotHistoryQueries.push(
      db
        .collection('hot_projection_work_items')
        .find({ postId: profile.postId, dirty: true })
        .sort({ _id: 1 })
        .limit(HOT_PROJECTION_WORK_BATCH_SIZE)
        .explain('executionStats'),
      db
        .collection('hot_projection_work_items')
        .find({
          postId: profile.postId,
          participantOwnerUserId: profile.participantOwnerUserId,
          sourceType: 'REPLY',
          projectedActive: true,
        })
        .sort({ projectedActivityAt: -1, _id: -1 })
        .limit(1)
        .explain('executionStats'),
      db
        .collection('replies')
        .find({ postId: profile.postId, parentReplyId: null, deletedAt: null })
        .sort({ createdAt: 1, _id: 1 })
        .limit(TOP_REPLY_PAGE_SIZE)
        .explain('executionStats'),
      db
        .collection('hot_reply_feedback_fanouts')
        .find({ postId: profile.postId, dirty: true, claimedUntil: null })
        .sort({ _id: 1 })
        .limit(HOT_DISPATCH_SCAN_LIMIT)
        .explain('executionStats'),
    );
    hotHistoryQueryNames.push(
      `hot-work-items-history-${profile.historySize}`,
      `hot-latest-activity-history-${profile.historySize}`,
      `top-replies-history-${profile.historySize}`,
      `hot-reply-fanout-history-${profile.historySize}`,
    );
  }

  const circleProposalEligibilityPipeline = [
    { $match: { circleId: circleProposalEligibilityProfile.circleId } },
    { $group: { _id: '$agentId' } },
    {
      $set: {
        agentObjectId: {
          $convert: { input: '$_id', to: 'objectId', onError: null, onNull: null },
        },
      },
    },
    { $match: { agentObjectId: { $ne: null } } },
    {
      $lookup: {
        from: CIRCLE_PROPOSAL_ELIGIBILITY_COLLECTIONS.AGENTS,
        localField: 'agentObjectId',
        foreignField: '_id',
        as: 'agent',
      },
    },
    { $unwind: '$agent' },
    { $match: { 'agent.deletedAt': null } },
    {
      $lookup: {
        from: CIRCLE_PROPOSAL_ELIGIBILITY_COLLECTIONS.AGENT_PROGRESS,
        localField: '_id',
        foreignField: 'agentId',
        as: 'progress',
      },
    },
    {
      $lookup: {
        from: CIRCLE_PROPOSAL_ELIGIBILITY_COLLECTIONS.AGENT_GOVERNANCE_PROFILES,
        localField: '_id',
        foreignField: 'agentId',
        as: 'governanceProfile',
      },
    },
    {
      $set: {
        xpTotal: { $ifNull: [{ $arrayElemAt: ['$progress.xpTotal', 0] }, 0] },
        healthLevel: {
          $ifNull: [
            { $arrayElemAt: ['$governanceProfile.healthLevel', 0] },
            CIRCLE_PROPOSAL_DEFAULT_HEALTH_LEVEL,
          ],
        },
      },
    },
    {
      $match: {
        xpTotal: { $gte: CIRCLE_PROPOSAL_MINIMUM_XP },
        healthLevel: { $gte: CIRCLE_PROPOSAL_MINIMUM_HEALTH_LEVEL },
      },
    },
    { $group: { _id: '$agent.userId' } },
    {
      $group: {
        _id: null,
        eligibleMemberCount: { $sum: 1 },
        actorIncludedValue: {
          $max: {
            $cond: [{ $eq: ['$_id', circleProposalEligibilityProfile.actorOwnerUserId] }, 1, 0],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        eligibleMemberCount: 1,
        actorIncluded: { $eq: ['$actorIncludedValue', 1] },
      },
    },
  ];
  const eligibilityStartedAt = Date.now();
  const [circleProposalEligibility] = await db
    .collection('circle_subscriptions')
    .aggregate(circleProposalEligibilityPipeline)
    .toArray();
  const circleProposalEligibilityDurationMs = Date.now() - eligibilityStartedAt;
  if (
    circleProposalEligibility?.eligibleMemberCount !==
      circleProposalEligibilityProfile.eligibleMemberCount ||
    circleProposalEligibility.actorIncluded !== true
  ) {
    throw new Error('Circle proposal eligibility aggregation returned an incorrect snapshot');
  }
  const circleProposalEligibilityExplain = await db
    .collection('circle_subscriptions')
    .aggregate(circleProposalEligibilityPipeline)
    .explain('executionStats');
  const circleProposalEligibilityIndexes = [
    ...collectIndexNames(circleProposalEligibilityExplain),
  ].sort();
  for (const expectedIndex of [CIRCLE_SUBSCRIPTION_BY_CIRCLE_INDEX, '_id_', AGENT_RELATION_INDEX]) {
    if (!circleProposalEligibilityIndexes.includes(expectedIndex)) {
      throw new Error(
        `Circle proposal eligibility aggregation did not use ${expectedIndex}: ${circleProposalEligibilityIndexes.join(', ')}`,
      );
    }
  }
  const subscriptionExecutionStats = findExecutionStatsUsingIndex(
    circleProposalEligibilityExplain,
    CIRCLE_SUBSCRIPTION_BY_CIRCLE_INDEX,
  );
  if (
    !subscriptionExecutionStats ||
    subscriptionExecutionStats.totalDocsExamined >
      circleProposalEligibilityProfile.subscriberCount ||
    subscriptionExecutionStats.nReturned !== circleProposalEligibilityProfile.subscriberCount
  ) {
    throw new Error('Circle proposal eligibility subscription scan exceeded its subscriber bound');
  }

  const governanceDispatchFilter = {
    status: { $in: ['OPEN', 'EMERGENCY'] },
    nextTransitionAt: { $gt: now },
    targetAuthorId: { $ne: governanceDispatchProfile.agentId },
    targetAuthorOwnerUserId: { $ne: governanceDispatchProfile.ownerUserId },
    reporterAgentIds: { $ne: governanceDispatchProfile.agentId },
    reporterOwnerUserIds: { $ne: governanceDispatchProfile.ownerUserId },
  };
  const governanceDispatchPipeline = [
    { $match: governanceDispatchFilter },
    { $sort: GOVERNANCE_DISPATCH_SORT },
    { $set: { dispatchCaseId: { $toString: '$_id' } } },
    {
      $lookup: {
        from: 'governance_assignments',
        localField: 'dispatchCaseId',
        foreignField: 'caseId',
        pipeline: [
          {
            $match: {
              agentOwnerUserIdSnapshot: governanceDispatchProfile.ownerUserId,
            },
          },
          { $limit: 1 },
          { $project: { _id: 1 } },
        ],
        as: 'previousAssignments',
      },
    },
    { $match: { 'previousAssignments.0': { $exists: false } } },
    {
      $lookup: {
        from: 'governance_votes',
        localField: 'dispatchCaseId',
        foreignField: 'caseId',
        pipeline: [
          {
            $match: {
              voterOwnerUserIdSnapshot: governanceDispatchProfile.ownerUserId,
            },
          },
          { $limit: 1 },
          { $project: { _id: 1 } },
        ],
        as: 'previousVotes',
      },
    },
    { $match: { 'previousVotes.0': { $exists: false } } },
    { $limit: 1 },
    { $project: { _id: 1 } },
  ];
  const governanceDispatchStartedAt = Date.now();
  const [governanceDispatchCandidate] = await db
    .collection('governance_cases')
    .aggregate(governanceDispatchPipeline)
    .toArray();
  const governanceDispatchDurationMs = Date.now() - governanceDispatchStartedAt;
  if (governanceDispatchCandidate?._id.toString() !== governanceDispatchProfile.expectedCaseId) {
    throw new Error(
      `Governance dispatch aggregation returned ${governanceDispatchCandidate?._id.toString() ?? 'no candidate'}; expected ${governanceDispatchProfile.expectedCaseId}`,
    );
  }
  const governanceDispatchExplain = await db
    .collection('governance_cases')
    .aggregate(governanceDispatchPipeline)
    .explain('executionStats');
  const governanceDispatchIndexes = [...collectIndexNames(governanceDispatchExplain)].sort();
  const governanceDispatchLookupStats = collectLookupExecutionStats(governanceDispatchExplain);
  for (const expectedIndex of [
    GOVERNANCE_DISPATCH_INDEX,
    GOVERNANCE_ASSIGNMENT_PARTICIPATION_INDEX,
    GOVERNANCE_VOTE_PARTICIPATION_INDEX,
  ]) {
    if (!governanceDispatchIndexes.includes(expectedIndex)) {
      throw new Error(
        `Governance dispatch aggregation did not use ${expectedIndex}: ${governanceDispatchIndexes.join(', ')}`,
      );
    }
  }
  const governanceDispatchExecutionStats = findExecutionStatsUsingIndex(
    governanceDispatchExplain,
    GOVERNANCE_DISPATCH_INDEX,
  );
  if (
    !governanceDispatchExecutionStats ||
    governanceDispatchExecutionStats.totalDocsExamined >
      governanceDispatchProfile.activeCandidateCount
  ) {
    throw new Error(
      `Governance dispatch candidate scan examined ${governanceDispatchExecutionStats?.totalDocsExamined ?? 'unknown'} documents for ${governanceDispatchProfile.activeCandidateCount} active candidates`,
    );
  }

  const governanceTimelinePipeline = [
    {
      $match: {
        caseId: governanceTimelineProfile.caseId,
        choice: {
          $in: [GOVERNANCE_DECISIONS.VIOLATION, GOVERNANCE_DECISIONS.NOT_VIOLATION],
        },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            date: '$createdAt',
            format: '%Y-%m-%d',
            timezone: GOVERNANCE_TIMEZONE,
          },
        },
        voterCount: { $sum: 1 },
        violationVoterCount: {
          $sum: {
            $cond: [{ $eq: ['$choice', GOVERNANCE_DECISIONS.VIOLATION] }, 1, 0],
          },
        },
        violationVotes: {
          $sum: {
            $cond: [{ $eq: ['$choice', GOVERNANCE_DECISIONS.VIOLATION] }, '$weight', 0],
          },
        },
        notViolationVoterCount: {
          $sum: {
            $cond: [{ $eq: ['$choice', GOVERNANCE_DECISIONS.NOT_VIOLATION] }, 1, 0],
          },
        },
        notViolationVotes: {
          $sum: {
            $cond: [{ $eq: ['$choice', GOVERNANCE_DECISIONS.NOT_VIOLATION] }, '$weight', 0],
          },
        },
        firstOccurredAt: { $min: '$createdAt' },
        lastOccurredAt: { $max: '$createdAt' },
      },
    },
    { $sort: { _id: 1 } },
  ];
  const governanceTimelineStartedAt = Date.now();
  const governanceTimeline = await db
    .collection('governance_votes')
    .aggregate(governanceTimelinePipeline)
    .toArray();
  const governanceTimelineDurationMs = Date.now() - governanceTimelineStartedAt;
  const governanceTimelineVoteCount = governanceTimeline.reduce(
    (total, group) => total + group.voterCount,
    0,
  );
  if (
    governanceTimeline.length !== governanceTimelineProfile.dayCount ||
    governanceTimelineVoteCount !== governanceTimelineProfile.voteCount
  ) {
    throw new Error('Governance timeline aggregation returned an incorrect summary');
  }
  const governanceTimelineExplain = await db
    .collection('governance_votes')
    .aggregate(governanceTimelinePipeline)
    .explain('executionStats');
  const governanceTimelineIndexes = [...collectIndexNames(governanceTimelineExplain)].sort();
  if (!governanceTimelineIndexes.includes(GOVERNANCE_VOTE_TIMELINE_INDEX)) {
    throw new Error(
      `Governance timeline aggregation did not use ${GOVERNANCE_VOTE_TIMELINE_INDEX}: ${governanceTimelineIndexes.join(', ')}`,
    );
  }

  const results = await Promise.all([
    db
      .collection('posts')
      .find({ circleId: circle._id.toString(), circleVisible: true, deletedAt: null })
      .sort({ createdAt: -1, _id: -1 })
      .limit(20)
      .explain('executionStats'),
    db
      .collection('post_hot_states')
      .find({
        projectionDirty: true,
        projectionDispatchAt: null,
        projectionClaimedUntil: null,
      })
      .sort({ projectionDispatchAt: 1, _id: 1 })
      .limit(HOT_DISPATCH_SCAN_LIMIT)
      .explain('executionStats'),
    db
      .collection('post_hot_states')
      .find({
        candidateDirty: true,
        candidateDispatchAt: null,
        candidateClaimedUntil: null,
      })
      .sort({ candidateDispatchAt: 1, _id: 1 })
      .limit(HOT_DISPATCH_SCAN_LIMIT)
      .explain('executionStats'),
    db
      .collection('post_hot_states')
      .find({ eligible: true, expiresAt: { $lte: new Date() } })
      .sort({ expiresAt: 1, _id: 1 })
      .limit(HOT_DISPATCH_SCAN_LIMIT)
      .explain('executionStats'),
    db
      .collection('post_hot_states')
      .find({
        postVisible: true,
        circleVisible: true,
        eligible: true,
      })
      .sort({ _id: 1 })
      .limit(HOT_CANDIDATE_REBUILD_BATCH_SIZE)
      .explain('executionStats'),
    db
      .collection('circle_post_visibility_states')
      .find({
        dirty: true,
        dispatchAt: { $lte: now },
        $or: [{ claimedUntil: null }, { claimedUntil: { $lte: now } }],
      })
      .sort({ dispatchAt: 1, _id: 1 })
      .limit(POST_VISIBILITY_DISPATCH_BATCH_SIZE)
      .explain('executionStats'),
    db
      .collection('posts')
      .find({
        circleId: visibilityState.circleId,
        circleVisibilityVersion: { $lt: visibilityState.visibilityVersion },
      })
      .sort({ circleVisibilityVersion: 1, _id: 1 })
      .limit(POST_VISIBILITY_POST_BATCH_SIZE)
      .explain('executionStats'),
    db
      .collection('circle_proposal_stances')
      .find({
        proposalId: proposalStanceProfile.proposalId,
        revisionNumber: proposalStanceProfile.revisionNumber,
        withdrawnAt: null,
        stance: CIRCLE_PROPOSAL_STANCES.SUPPORT,
      })
      .sort({ _id: 1 })
      .limit(proposalStanceProfile.quorum)
      .explain('executionStats'),
    db
      .collection('circle_proposal_stances')
      .find({
        proposalId: proposalStanceProfile.proposalId,
        revisionNumber: proposalStanceProfile.revisionNumber,
        withdrawnAt: null,
        stance: CIRCLE_PROPOSAL_STANCES.OBJECTION,
      })
      .limit(1)
      .explain('executionStats'),
    db
      .collection('replies')
      .find({
        postId: largeReplyBranch.postId,
        parentReplyId: largeReplyBranch.rootReplyId,
        deletedAt: null,
      })
      .sort({ createdAt: 1, _id: 1 })
      .limit(CHILD_REPLY_PAGE_SIZE)
      .explain('executionStats'),
    db
      .collection('post_view_counter_shards')
      .find({ postId: { $in: viewCounterPostIds } })
      .sort({ postId: 1, shard: 1 })
      .limit(POST_VIEW_COUNTER_PAGE_LIMIT)
      .explain('executionStats'),
    db
      .collection('circle_subscriptions')
      .find({ agentId: subscriptionProfile.agentId })
      .sort({ circleId: 1 })
      .explain('executionStats'),
    db
      .collection('circle_subscriptions')
      .find({
        agentId: subscriptionProfile.agentId,
        circleId: { $in: subscriptionPageCircleIds },
      })
      .sort({ circleId: 1 })
      .limit(SUBSCRIPTION_PAGE_SIZE)
      .explain('executionStats'),
    db
      .collection('circles')
      .find({
        _id: { $in: subscriptionCircleObjectIds },
        deletedAt: null,
        status: 'ACTIVE',
      })
      .explain('executionStats'),
    db
      .collection('posts')
      .find({
        circleId: { $in: activeSubscriptionCircleIds },
        circleVisible: true,
        deletedAt: null,
      })
      .sort({ createdAt: -1, _id: -1 })
      .limit(SUBSCRIPTION_PAGE_SIZE + 1)
      .explain('executionStats'),
    db
      .collection('interaction_histories')
      .find({ agentId: agentInteractionProfile.agentId })
      .sort({ createdAt: -1, _id: -1 })
      .limit(AGENT_INTERACTION_PAGE_SIZE)
      .explain('executionStats'),
    db
      .collection('interaction_histories')
      .find({ agentId: agentInteractionProfile.agentId })
      .sort({ createdAt: -1, _id: -1 })
      .skip(agentInteractionProfile.count - AGENT_INTERACTION_PAGE_SIZE)
      .limit(AGENT_INTERACTION_PAGE_SIZE)
      .explain('executionStats'),
    ...hotHistoryQueries,
    db
      .collection('governance_cases')
      .find({
        status: { $in: ['OPEN', 'EMERGENCY'] },
        nextTransitionAt: { $ne: null },
        deadlineScheduleDispatchAt: { $lte: now },
        $expr: { $lt: ['$deadlinePublishedVersion', '$deadlineVersion'] },
        $or: [
          { deadlineScheduleClaimExpiresAt: null },
          { deadlineScheduleClaimExpiresAt: { $lte: now } },
        ],
      })
      .sort({ deadlineScheduleDispatchAt: 1, _id: 1 })
      .limit(GOVERNANCE_DEADLINE_BATCH_SIZE)
      .explain('executionStats'),
    db
      .collection('governance_cases')
      .find({
        status: { $in: ['OPEN', 'EMERGENCY'] },
        nextTransitionAt: { $lte: now },
        deadlineCompensationDispatchAt: { $lte: now },
        $and: [
          {
            $or: [{ deadlineClaimExpiresAt: null }, { deadlineClaimExpiresAt: { $lte: now } }],
          },
          {
            $or: [
              { deadlineCompensationClaimExpiresAt: null },
              { deadlineCompensationClaimExpiresAt: { $lte: now } },
            ],
          },
        ],
      })
      .sort({ deadlineCompensationDispatchAt: 1, _id: 1 })
      .limit(GOVERNANCE_DEADLINE_BATCH_SIZE)
      .explain('executionStats'),
    db
      .collection('circle_proposals')
      .find({
        status: { $in: ['DISCUSSION', 'VOTING'] },
        activeGovernanceCaseId: null,
        nextTransitionAt: { $ne: null },
        deadlineScheduleDispatchAt: { $lte: now },
        $expr: { $lt: ['$deadlinePublishedVersion', '$deadlineVersion'] },
        $or: [
          { deadlineScheduleClaimExpiresAt: null },
          { deadlineScheduleClaimExpiresAt: { $lte: now } },
        ],
      })
      .sort({ deadlineScheduleDispatchAt: 1, _id: 1 })
      .limit(CIRCLE_PROPOSAL_DEADLINE_BATCH_SIZE)
      .explain('executionStats'),
    db
      .collection('circle_proposals')
      .find({
        status: { $in: ['DISCUSSION', 'VOTING'] },
        activeGovernanceCaseId: null,
        nextTransitionAt: { $lte: now },
        $and: [
          {
            $or: [{ deadlineClaimExpiresAt: null }, { deadlineClaimExpiresAt: { $lte: now } }],
          },
          { deadlineCompensationDispatchAt: { $lte: now } },
          {
            $or: [
              { deadlineCompensationClaimExpiresAt: null },
              { deadlineCompensationClaimExpiresAt: { $lte: now } },
            ],
          },
        ],
      })
      .sort({ deadlineCompensationDispatchAt: 1, _id: 1 })
      .limit(CIRCLE_PROPOSAL_DEADLINE_BATCH_SIZE)
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
    'hot-projection-dispatch',
    'hot-candidate-dispatch',
    'hot-expiry',
    'hot-candidate-rebuild',
    'post-visibility-dispatch',
    'post-visibility-project-batch',
    'circle-proposal-support-quorum',
    'circle-proposal-objection-exists',
    'large-reply-branch-page',
    'post-view-counter-page',
    'subscription-all-relations',
    'subscription-current-page-state',
    'subscription-active-circle-filter',
    'subscription-latest-posts',
    'agent-interactions-first-page',
    'agent-interactions-deep-page',
    ...hotHistoryQueryNames,
    'governance-deadline-publish',
    'governance-deadline-compensation',
    'circle-proposal-deadline-publish',
    'circle-proposal-deadline-compensation',
    'admin-audit',
  ];
  const summaries = results.map((result, index) => summarize(names[index], result));
  const summaryByName = new Map(summaries.map((summary) => [summary.name, summary]));
  const requireSummary = (name) => {
    const summary = summaryByName.get(name);
    if (!summary) throw new Error(`Performance result is missing: ${name}`);
    return summary;
  };

  assertExecutionBound(requireSummary('circle-latest-posts'), 20, 20);
  assertExecutionBound(requireSummary('hot-projection-dispatch'), 20, 20);
  assertExecutionBound(requireSummary('hot-candidate-dispatch'), 20, 20);
  assertExecutionBound(requireSummary('hot-expiry'), 20, 20);
  assertExecutionBound(
    requireSummary('hot-candidate-rebuild'),
    HOT_CANDIDATE_REBUILD_BATCH_SIZE,
    HOT_CANDIDATE_REBUILD_BATCH_SIZE,
    HOT_CANDIDATE_REBUILD_INDEX,
  );
  assertExecutionBound(
    requireSummary('post-visibility-dispatch'),
    1,
    POST_VISIBILITY_DISPATCH_BATCH_SIZE,
    POST_VISIBILITY_DISPATCH_INDEX,
  );
  assertExecutionBound(
    requireSummary('post-visibility-project-batch'),
    POST_VISIBILITY_POST_BATCH_SIZE,
    POST_VISIBILITY_POST_BATCH_SIZE,
    POST_VISIBILITY_POST_INDEX,
  );
  assertExecutionBound(
    requireSummary('circle-proposal-support-quorum'),
    proposalStanceProfile.quorum,
    proposalStanceProfile.quorum,
    CIRCLE_PROPOSAL_STANCE_SETTLEMENT_INDEX,
  );
  assertExecutionBound(
    requireSummary('circle-proposal-objection-exists'),
    1,
    1,
    CIRCLE_PROPOSAL_STANCE_SETTLEMENT_INDEX,
  );
  assertExecutionBound(
    requireSummary('large-reply-branch-page'),
    CHILD_REPLY_PAGE_SIZE,
    CHILD_REPLY_PAGE_SIZE,
    CHILD_REPLY_PAGE_INDEX,
  );
  assertExecutionBound(
    requireSummary('post-view-counter-page'),
    POST_VIEW_COUNTER_PAGE_LIMIT,
    POST_VIEW_COUNTER_PAGE_LIMIT,
    POST_VIEW_COUNTER_INDEX,
  );
  assertExecutionBound(
    requireSummary('subscription-all-relations'),
    subscriptionProfile.circleCount,
    subscriptionProfile.circleCount,
    SUBSCRIPTION_RELATION_INDEX,
  );
  assertExecutionBound(
    requireSummary('subscription-current-page-state'),
    SUBSCRIPTION_PAGE_SIZE,
    SUBSCRIPTION_PAGE_SIZE,
    SUBSCRIPTION_RELATION_INDEX,
  );
  assertExecutionBound(
    requireSummary('subscription-active-circle-filter'),
    subscriptionProfile.activeCircleCount,
    subscriptionProfile.circleCount,
    '_id_',
  );
  assertExecutionBound(
    requireSummary('subscription-latest-posts'),
    SUBSCRIPTION_PAGE_SIZE + 1,
    SUBSCRIPTION_PAGE_SIZE + 1,
    SUBSCRIBED_LATEST_POST_INDEX,
  );
  assertExecutionBound(
    requireSummary('agent-interactions-first-page'),
    AGENT_INTERACTION_PAGE_SIZE,
    AGENT_INTERACTION_PAGE_SIZE,
    AGENT_INTERACTION_INDEX,
  );
  assertExecutionBound(
    requireSummary('agent-interactions-deep-page'),
    AGENT_INTERACTION_PAGE_SIZE,
    AGENT_INTERACTION_PAGE_SIZE,
    AGENT_INTERACTION_INDEX,
  );
  for (const profile of hotHistoryProfiles) {
    assertExecutionBound(requireSummary(`hot-work-items-history-${profile.historySize}`), 1, 1);
    assertExecutionBound(
      requireSummary(`hot-latest-activity-history-${profile.historySize}`),
      1,
      1,
    );
    assertExecutionBound(
      requireSummary(`top-replies-history-${profile.historySize}`),
      Math.min(TOP_REPLY_PAGE_SIZE, profile.topLevelReplyCount),
      Math.min(TOP_REPLY_PAGE_SIZE, profile.topLevelReplyCount),
    );
    assertExecutionBound(
      requireSummary(`hot-reply-fanout-history-${profile.historySize}`),
      HOT_DISPATCH_SCAN_LIMIT,
      HOT_DISPATCH_SCAN_LIMIT,
    );
  }
  assertExecutionBound(
    requireSummary('governance-deadline-publish'),
    GOVERNANCE_DEADLINE_BATCH_SIZE,
    GOVERNANCE_DEADLINE_BATCH_SIZE,
    GOVERNANCE_DEADLINE_PUBLISH_INDEX,
  );
  assertExecutionBound(
    requireSummary('governance-deadline-compensation'),
    GOVERNANCE_DEADLINE_BATCH_SIZE,
    GOVERNANCE_DEADLINE_BATCH_SIZE,
    GOVERNANCE_DEADLINE_COMPENSATION_INDEX,
  );
  assertExecutionBound(
    requireSummary('circle-proposal-deadline-publish'),
    CIRCLE_PROPOSAL_DEADLINE_BATCH_SIZE,
    CIRCLE_PROPOSAL_DEADLINE_BATCH_SIZE,
    CIRCLE_PROPOSAL_DEADLINE_PUBLISH_INDEX,
  );
  assertExecutionBound(
    requireSummary('circle-proposal-deadline-compensation'),
    CIRCLE_PROPOSAL_DEADLINE_BATCH_SIZE,
    CIRCLE_PROPOSAL_DEADLINE_BATCH_SIZE,
    CIRCLE_PROPOSAL_DEADLINE_COMPENSATION_INDEX,
  );
  assertExecutionBound(requireSummary('admin-audit'), 20, 20);

  console.log(
    JSON.stringify(
      {
        hotCandidateCount: fixtureMetadata.hotCandidateCount,
        hotExpiredStateCount: fixtureMetadata.hotExpiredStateCount,
        hotHistorySizes: hotHistoryProfiles.map((profile) => profile.historySize),
        largeReplyBranchChildCount: largeReplyBranch.childCount,
        subscriptionCircleCount: subscriptionProfile.circleCount,
        agentInteractionCount: agentInteractionProfile.count,
        circleProposalEligibility: {
          subscriberCount: circleProposalEligibilityProfile.subscriberCount,
          eligibleMemberCount: circleProposalEligibility.eligibleMemberCount,
          executionTimeMillis: circleProposalEligibilityDurationMs,
          indexes: circleProposalEligibilityIndexes,
        },
        governanceDispatch: {
          participationCount: governanceDispatchProfile.participationCount,
          activeParticipationCount: governanceDispatchProfile.activeParticipationCount,
          activeCandidateCount: governanceDispatchProfile.activeCandidateCount,
          executionTimeMillis: governanceDispatchDurationMs,
          indexes: governanceDispatchIndexes,
          lookupStages: governanceDispatchLookupStats,
        },
        governanceTimeline: {
          voteCount: governanceTimelineProfile.voteCount,
          returnedDayCount: governanceTimeline.length,
          executionTimeMillis: governanceTimelineDurationMs,
          indexes: governanceTimelineIndexes,
        },
        proposalStanceCount: proposalStanceProfile.count,
        deadlineDistractorCount: fixtureMetadata.deadlineDistractorCount,
        queries: summaries,
      },
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
