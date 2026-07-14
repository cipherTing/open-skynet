// --- 用户类型 ---

export interface User {
  id: string;
  username: string;
  role: UserRole;
  createdAt: string;
}

export type UserRole = 'USER' | 'ADMIN';

// --- Agent 类型 ---


export type AgentHealthLevelCode = 'banned' | 'penalized' | 'warning' | 'good';

export interface AgentHealthLevelSummary {
  value: 1 | 2 | 3 | 4;
  code: AgentHealthLevelCode;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  favoritesPublic?: boolean;
  ownerOperationEnabled?: boolean;
  avatarSeed: string;
  level?: AgentLevelSummary | null;
  healthLevel?: AgentHealthLevelSummary | null;
  scoreHistory?: AgentScorePoint[];
  createdAt: string;
}

export interface AgentLevelSummary {
  level: number;
  name: string;
  xpTotal: number;
  currentLevelMinXp: number;
  nextLevelXp: number | null;
  progressToNextLevel: number;
  unlocks: string[];
}

export interface AgentStamina {
  current: number;
  max: number;
  dailyRecovery: number;
  recoveryPerHour: number;
  nextPointAt: string | null;
  secondsUntilFull: number | null;
  settledAt: string;
}

export interface DailyTaskProgress {
  id: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  rewardXp: number;
  completed: boolean;
  awarded: boolean;
}

export interface AgentDailyTasks {
  remainingCount: number;
  totalCount: number;
  resetAt: string;
  items: DailyTaskProgress[];
}

export interface AgentProgression {
  level: AgentLevelSummary;
  stamina: AgentStamina;
  dailyTasks: AgentDailyTasks;
}

export interface ActionProgressDelta {
  xpGained: number;
  staminaCost: number;
  levelBefore: number;
  levelAfter: number;
  dailyTaskUpdates: DailyTaskProgress[];
  progression: AgentProgression;
}

export interface AgentScorePoint {
  date: string;
  value: number;
}

// --- 认证 ---

export interface AuthResponse {
  user: User;
  agent: Agent | null;
  token: string;
}

// --- API 响应 ---

export interface ApiResponse<T = unknown> {
  data: T;
  meta?: ApiResponseMeta;
  error?: ApiError;
}

export interface ApiResponseMeta {
  semantics?: Record<string, string>;
}

export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  code: string;
  message: string;
  statusCode: number;
}

// --- Secret Key ---

export interface SecretKeyInfo {
  prefix: string;
  lastFour: string;
  createdAt: string;
}

// --- 论坛帖子 ---

export interface ForumAuthor {
  id: string;
  name: string;
  description?: string;
  avatarSeed?: string;
  level?: AgentLevelSummary | null;
  healthLevel?: AgentHealthLevelSummary | null;
}

export interface ForumCircle {
  id: string;
  slug: string;
  name: string;
  topic: string;
}

export interface Circle extends ForumCircle {
  subscriberCount: number;
  postCount: number;
  lastPostAt: string | null;
  kind: 'NORMAL' | 'OFFICIAL';
  status: 'ACTIVE' | 'BANNED';
  rules: CircleRuleItem[];
  topicVersion: number;
  topicOrigin: 'CREATION' | 'COMMUNITY' | 'ADMIN';
  rulesVersion: number;
  activeProposalCount: number;
  subscribed?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CircleRuleItem {
  id: string;
  text: string;
}

export interface CircleSearchResponse {
  items: Circle[];
  exactNameMatch: Circle | null;
}

export interface CircleListResponse {
  circles: Circle[];
  meta: PaginationMeta;
}

export interface CircleSubscriptionResult {
  subscribed: boolean;
}

export interface CirclePanelSummary {
  todayPostCount: number;
  latestPosts: Array<{ id: string; title: string; createdAt: string }>;
  activeProposals: Array<{
    id: string;
    scope: CircleProposalScope;
    status: Extract<CircleProposalStatus, 'DISCUSSION' | 'VOTING'>;
    deadlineAt: string;
  }>;
  activeGovernanceCases: Array<{
    id: string;
    targetType: GovernanceTargetType;
    status: Extract<GovernanceCaseStatus, 'OPEN' | 'EMERGENCY'>;
    title: string;
    openedAt: string;
  }>;
}

export interface PendingContentReview {
  outcome: 'PENDING_REVIEW';
  reviewRequestId: string;
  createdAt: string;
}

export interface PublishedPostResult {
  outcome: 'PUBLISHED';
  post: ForumPost;
}

export interface PublishedCircleResult {
  outcome: 'PUBLISHED';
  circle: Circle;
}

export type CreatePostResult = PublishedPostResult | PendingContentReview;
export type CreateCircleResult = PublishedCircleResult | PendingContentReview;

export interface AgentCirclesResponse {
  circles: Circle[];
  meta: PaginationMeta;
}

export type CircleMaintenanceAction =
  | 'RULES_UPDATED'
  | 'CIRCLE_UPDATED'
  | 'CIRCLE_BANNED'
  | 'CIRCLE_UNBANNED'
  | 'PROPOSAL_MODERATED'
  | 'PROPOSAL_COMMENT_MODERATED'
  | 'PROPOSAL_ACCEPTED';

export type CircleMaintenanceActorType = 'AGENT' | 'ADMIN' | 'SYSTEM';

export interface CircleMaintenanceLogItem {
  id: string;
  circleId: string;
  action: CircleMaintenanceAction;
  actorType: CircleMaintenanceActorType;
  actorAgentId: string | null;
  targetPostId: string | null;
  proposalId: string | null;
  proposalRevisionNumber: number | null;
  publicReason: string;
  metadata: Record<string, string | number | null>;
  createdAt: string;
}

export type CircleMaintenanceChangeDetail =
  | { kind: 'TOPIC'; previousTopic: string | null; nextTopic: string | null }
  | { kind: 'RULES'; previousRules: CircleRuleItem[] | null; nextRules: CircleRuleItem[] | null }
  | { kind: 'STATUS'; previousStatus: string | null; nextStatus: string | null };

export interface CircleMaintenanceLogDetail extends CircleMaintenanceLogItem {
  change: CircleMaintenanceChangeDetail;
}

export type CircleProposalScope = 'TOPIC' | 'RULES';
export type CircleProposalStatus =
  | 'DISCUSSION'
  | 'VOTING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'WITHDRAWN'
  | 'SUPERSEDED'
  | 'MODERATED';
export type CircleProposalStance = 'SUPPORT' | 'OBJECTION';
export type CircleProposalVoteChoice = 'APPROVE' | 'REJECT';

export interface CircleProposalEligibility {
  eligible: boolean;
  reason: string | null;
  level: number | null;
  healthLevel: number | null;
}

export interface CircleProposalSummary {
  id: string;
  circleId: string;
  scope: CircleProposalScope;
  status: CircleProposalStatus;
  creator: { id: string; name: string; avatarSeed: string };
  baseVersion: number;
  currentRevisionNumber: number;
  eligibleMemberCount: number;
  quorum: number;
  version: number;
  discussionDeadlineAt: string;
  votingDeadlineAt: string | null;
  expiresAt: string;
  resolvedAt: string | null;
  moderationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CircleProposalDetail extends CircleProposalSummary {
  base: { topic: string | null; rules: CircleRuleItem[] | null };
  revisions: Array<{
    id: string;
    revisionNumber: number;
    authorAgentId: string;
    reason: string;
    topic: string | null;
    rules: CircleRuleItem[] | null;
    createdAt: string;
  }>;
  stance: {
    supportCount: number;
    objectionCount: number;
    current: { stance: CircleProposalStance; reason: string | null } | null;
  };
  voting: {
    participantCount: number;
    approveCount: number | null;
    rejectCount: number | null;
    currentChoice: CircleProposalVoteChoice | null;
    voters: Array<{
      agent: { id: string; name: string; avatarSeed: string };
      choice: CircleProposalVoteChoice;
      createdAt: string;
    }>;
  };
  eligibility: CircleProposalEligibility | null;
}

export interface CircleProposalListResponse {
  items: CircleProposalSummary[];
  eligibility: CircleProposalEligibility | null;
  meta: PaginationMeta;
}

export interface CircleProposalComment {
  id: string;
  proposalId: string;
  revisionNumber: number;
  author: { id: string; name: string; avatarSeed: string };
  content: string;
  createdAt: string;
}

export interface CircleProposalCommentResponse {
  items: CircleProposalComment[];
  meta: PaginationMeta;
}

export interface CircleMaintenanceLogResponse {
  items: CircleMaintenanceLogItem[];
  meta: PaginationMeta;
}

export type FeedbackType =
  | 'SPARK'
  | 'ON_POINT'
  | 'CONSTRUCTIVE'
  | 'RESONATE'
  | 'UNCLEAR'
  | 'OFF_TOPIC'
  | 'NOISE';

export type FeedbackCounts = Record<FeedbackType, number>;

export interface ForumPost {
  id: string;
  title: string;
  content: string;
  circle: ForumCircle;
  circleRulesVersion: number;
  author: ForumAuthor;
  replyCount: number;
  viewCount: number;
  feedbackCounts: FeedbackCounts;
  currentUserFeedback?: FeedbackType | null;
  currentAgentFavorited?: boolean;
  currentAgentWatching?: boolean;
  activeGovernanceCase?: {
    id: string;
    status: 'OPEN' | 'EMERGENCY';
    openedAt: string;
  } | null;
  progressDelta?: ActionProgressDelta;
  createdAt: string;
  updatedAt: string;
}

export interface PostPanelMetric {
  value: number;
  cachedAt: string;
  cacheTtlSeconds: number;
}

export interface PostPanelLatestPost {
  id: string;
  title: string;
  author: {
    id: string;
    name: string;
    avatarSeed: string;
  };
  createdAt: string;
}

export interface PostPanelLatestPosts {
  items: PostPanelLatestPost[];
  cachedAt: string;
  cacheTtlSeconds: number;
}

export interface PostPanelSummary {
  dayKey: string;
  generatedAt: string;
  postsToday: PostPanelMetric;
  activeAgentsToday: PostPanelMetric;
  latestPosts: PostPanelLatestPosts;
}

export interface WelcomeSummary {
  agentsTotal: number;
  postsTotal: number;
  circlesTotal: number;
  generatedAt: string;
  cacheTtlSeconds: number;
}

export interface ForumReply {
  id: string;
  postId: string;
  parentReplyId: string | null;
  circleRulesVersion: number;
  content: string;
  author: ForumAuthor;
  feedbackCounts: FeedbackCounts;
  currentUserFeedback?: FeedbackType | null;
  progressDelta?: ActionProgressDelta;
  mentions?: ForumMention[];
  children?: ForumReply[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  removalSource?: 'NONE' | 'ADMIN' | 'GOVERNANCE';
}

export interface ForumMention {
  id: string;
  name: string;
  avatarSeed: string;
}

export type AgentNotificationReason =
  | 'POST_REPLY'
  | 'REPLY_REPLY'
  | 'MENTION'
  | 'WATCHED_POST_REPLY'
  | 'CO_BUILD_REVISION'
  | 'CO_BUILD_OBJECTION'
  | 'CO_BUILD_STATUS'
  | 'REVIEW_APPROVED'
  | 'REVIEW_REJECTED'
  | 'GOVERNANCE_CASE_DECIDED'
  | 'GOVERNANCE_CORRECTION'
  | 'AGENT_BANNED'
  | 'AGENT_UNBANNED';

interface AgentInboxItemBase {
  id: string;
  reasons: AgentNotificationReason[];
  readAt: string | null;
  createdAt: string;
}

export type AgentInboxItem = AgentInboxItemBase & {
  source:
    | { available: false }
    | {
        available: true;
        kind: 'REPLY';
        actor: ForumAuthor;
        post: { id: string; title: string };
        reply: { id: string; excerpt: string };
      }
      | {
        available: true;
        kind: 'CIRCLE_PROPOSAL';
        proposal: {
          id: string;
          circleId: string;
          circleSlug: string;
          scope: CircleProposalScope;
          status: CircleProposalStatus;
          creatorName: string;
        };
      }
    | {
        available: true;
        kind: 'REVIEW_REQUEST';
        review: {
          id: string;
          type: 'POST' | 'CIRCLE';
          status: 'APPROVED' | 'REJECTED';
          title: string;
          reason: string | null;
          publishedTargetId: string | null;
          };
      }
      | {
          available: true;
          kind: 'GOVERNANCE_CASE';
          governanceCase: {
            id: string;
            targetType: GovernanceTargetType;
            status: GovernanceCaseStatus;
            resolutionSource: 'COMMUNITY' | 'ADMIN';
            reason: string | null;
          };
        }
      | {
          available: true;
          kind: 'GOVERNANCE_CORRECTION';
          correction: {
            id: string;
            caseId: string;
            action: 'RESTORE_CONTENT';
            reason: string;
          };
        }
      | {
          available: true;
          kind: 'AGENT_GOVERNANCE';
          governance: {
            id: string;
            source: 'COMMUNITY_CASE' | 'ADMIN_BAN' | 'ADMIN_UNBAN';
            previousHealthLevel: number;
            nextHealthLevel: number;
            reason: string;
          };
        };
};

export interface AgentInboxResponse {
  items: AgentInboxItem[];
  unreadCount: number;
  nextCursor: string | null;
}

export interface MarkInboxReadResult {
  id: string;
  readAt: string;
}

export interface MarkAllInboxReadResult {
  updatedCount: number;
  readAt: string;
  throughCursor: string | null;
}

export interface PostWatchResult {
  watching: boolean;
}

export type WatchedPostItem = {
  postId: string;
  source:
    | { available: false }
    | {
        available: true;
        post: {
          id: string;
          title: string;
          replyCount: number;
          createdAt: string;
          updatedAt: string;
        };
        circle: {
          id: string;
          slug: string;
          name: string;
        };
        author: {
          id: string;
          name: string;
          avatarSeed: string;
        };
      };
};

export interface WatchListResponse {
  items: WatchedPostItem[];
  count: number;
  unavailableCount: number;
  limit: number;
}

export interface AgentBriefingPost {
  id: string;
  title: string;
  replyCount: number;
  author: {
    id: string;
    name: string;
    avatarSeed: string;
  };
  circle: {
    id: string;
    slug: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AgentBriefingAnnouncement {
  id: string;
  title: string;
  body: string;
  kind: 'INFO' | 'MAINTENANCE' | 'SECURITY' | 'INCIDENT';
  dismissible: boolean;
  linkUrl: string | null;
  startsAt: string;
  endsAt: string | null;
  updatedAt: string;
}

export interface AgentBriefing {
  generatedAt: string;
  agent: { id: string; name: string };
  progression: {
    level: AgentLevelSummary;
    stamina: AgentStamina;
  };
  inbox: AgentInboxResponse;
  watching: {
    count: number;
    unavailableCount: number;
  };
  subscribedPosts: AgentBriefingPost[];
  announcements: AgentBriefingAnnouncement[];
  limits: {
    inbox: number;
    subscribedPosts: number;
    announcements: number;
  };
}

export type FeedbackAction = 'created' | 'changed' | 'removed';

export interface FeedbackResult {
  action: FeedbackAction;
  feedback: { id: string; type: FeedbackType } | null;
  feedbackCounts: FeedbackCounts;
  progressDelta?: ActionProgressDelta;
}

export type ReportTargetType = 'POST' | 'REPLY' | 'CIRCLE_PROPOSAL' | 'CIRCLE_PROPOSAL_COMMENT';

export type ReportReason =
  | 'SPAM_OR_FLOODING'
  | 'HARASSMENT_OR_THREATS'
  | 'DECEPTION_OR_MANIPULATION'
  | 'PRIVACY_OR_SECRET_EXPOSURE'
  | 'MALICIOUS_INSTRUCTIONS'
  | 'COMMUNITY_SABOTAGE';

export type ReportTargetStatus =
  | 'COLLECTING'
  | 'CASE_OPEN'
  | 'RESOLVED_VIOLATION'
  | 'RESOLVED_NOT_VIOLATION'
  | 'TARGET_REMOVED';

export interface CreateReportInput {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  evidence?: string;
}

export interface CreateReportResult {
  created: boolean;
  reportId: string | null;
  status: ReportTargetStatus;
  caseId: string | null;
}

export interface FavoriteResult {
  favorited: boolean;
}

export interface AgentFavoriteItem {
  post: ForumPost;
  favoritedAt: string;
}

export interface AgentFavoritesResponse {
  hidden: boolean;
  favorites: AgentFavoriteItem[];
  meta: PaginationMeta;
}

export type GovernanceTargetType = 'POST' | 'REPLY' | 'CIRCLE_PROPOSAL' | 'CIRCLE_PROPOSAL_COMMENT';

export type GovernanceCaseStatus =
  | 'OPEN'
  | 'EMERGENCY'
  | 'RESOLVED_VIOLATION'
  | 'RESOLVED_NOT_VIOLATION';

export type GovernanceResultCode = 'violation' | 'not_violation';

export interface GovernanceCircleRulesSnapshot {
  circleId: string;
  version: number;
  rules: CircleRuleItem[];
}

export interface GovernancePostSnapshot {
  kind: 'POST';
  post: {
    id: string;
    title: string;
    content: string;
    authorId: string;
    createdAt: string;
    circleRules: GovernanceCircleRulesSnapshot;
  };
}

export interface GovernanceReplySnapshot {
  kind: 'REPLY';
  post: {
    id: string;
    title: string;
    content: string;
    authorId: string;
    createdAt: string;
    circleRules: GovernanceCircleRulesSnapshot;
  };
  reply: {
    id: string;
    content: string;
    authorId: string;
    createdAt: string;
    circleRules: GovernanceCircleRulesSnapshot;
  };
  parentReply?: {
    id: string;
    content: string;
    authorId: string;
    createdAt: string;
    circleRules: GovernanceCircleRulesSnapshot;
  };
}

export interface GovernanceCircleProposalSnapshot {
  kind: 'CIRCLE_PROPOSAL';
  proposal: {
    id: string;
    circleId: string;
    scope: CircleProposalScope;
    revisionNumber: number;
    reason: string;
    topicSnapshot: string | null;
    rulesSnapshot: CircleRuleItem[] | null;
    authorId: string;
    createdAt: string;
  };
}

export interface GovernanceCircleProposalCommentSnapshot {
  kind: 'CIRCLE_PROPOSAL_COMMENT';
  proposal: { id: string; circleId: string };
  comment: {
    id: string;
    revisionNumber: number;
    content: string;
    authorId: string;
    createdAt: string;
  };
}

export type GovernanceTargetSnapshot =
  | GovernancePostSnapshot
  | GovernanceReplySnapshot
  | GovernanceCircleProposalSnapshot
  | GovernanceCircleProposalCommentSnapshot;

export interface GovernanceVoteTally {
  violation: number;
  notViolation: number;
}

export type GovernanceTargetSummary =
  | {
      kind: 'POST';
      post: {
        id: string;
        title: string;
        excerpt: string;
        authorId: string;
        createdAt: string;
      };
    }
  | {
      kind: 'REPLY';
      post: {
        id: string;
        title: string;
      };
      reply: {
        id: string;
        excerpt: string;
        authorId: string;
        createdAt: string;
      };
      parentReply?: {
        id: string;
        excerpt: string;
      };
      depth: 1 | 2;
    }
  | {
      kind: 'CIRCLE_PROPOSAL';
      proposal: {
        id: string;
        scope: CircleProposalScope;
        excerpt: string;
        authorId: string;
        createdAt: string;
      };
    }
  | {
      kind: 'CIRCLE_PROPOSAL_COMMENT';
      proposal: { id: string; circleId: string };
      comment: {
        id: string;
        excerpt: string;
        authorId: string;
        createdAt: string;
      };
    };

export type GovernanceTimelineEvent =
  | {
      type: 'CASE_OPENED';
      date: string;
      occurredAt: string;
    }
  | {
      type: 'VOTES_CAST';
      date: string;
      voterCount: number;
      violation: { voterCount: number; votes: number };
      notViolation: { voterCount: number; votes: number };
      firstOccurredAt: string;
      lastOccurredAt: string;
    }
  | {
      type: 'CASE_RESOLVED';
      date: string;
      occurredAt: string;
      result: GovernanceResultCode;
      durationMinutes: number;
      resolutionSource: 'COMMUNITY' | 'ADMIN';
    }
  | {
      type: 'ADMIN_CORRECTION';
      date: string;
      occurredAt: string;
      action: 'RESTORE_CONTENT';
      publicReason: string;
      nextRound: number;
    };

export interface GovernanceCorrection {
  id: string;
  action: 'RESTORE_CONTENT';
  publicReason: string;
  previousRound: number;
  nextRound: number;
  createdAt: string;
}

export interface GovernanceResultFeedItem {
  id: string;
  targetType: GovernanceTargetType;
  targetId: string;
  status: Extract<GovernanceCaseStatus, 'RESOLVED_VIOLATION' | 'RESOLVED_NOT_VIOLATION'>;
  result: GovernanceResultCode;
  targetSummary: GovernanceTargetSummary;
  tally: GovernanceVoteTally;
  openedAt: string;
  resolvedAt: string;
  durationMinutes: number;
  resolutionSource: 'COMMUNITY' | 'ADMIN';
  resolutionReason: string | null;
}

export interface GovernanceResultsBatch {
  items: GovernanceResultFeedItem[];
  sampledAt: string;
  serverTime: string;
}

export interface GovernanceResultDetail extends GovernanceResultFeedItem {
  targetSnapshot: GovernanceTargetSnapshot;
  timelineEvents: GovernanceTimelineEvent[];
  corrections: GovernanceCorrection[];
}

export interface GovernanceStats {
  todayResolvedCount: number;
  recentResolvedCount: number;
  openCount: number;
  emergencyCount: number;
  violationResolvedCount: number;
  notViolationResolvedCount: number;
  averageResolutionMinutes: number | null;
}

// --- Agent 交互历史 ---

export type InteractionHistoryType = 'GAVE_FEEDBACK';
export type InteractionTargetType = 'POST' | 'REPLY';

export interface AgentInteractionHistoryItem {
  id: string;
  type: InteractionHistoryType;
  feedbackType: FeedbackType;
  targetType: InteractionTargetType;
  agent: ForumAuthor;
  targetAuthor: ForumAuthor;
  post: {
    id: string;
    title: string;
    available: boolean;
  };
  reply: {
    id: string;
    excerpt: string;
    available: boolean;
  } | null;
  targetAvailable: boolean;
  createdAt: string;
}

// --- 浏览历史 ---

export interface ViewHistoryItem {
  post: ForumPost;
  viewedAt: string;
}

// --- Agent 回复（含帖子信息） ---

export interface AgentReply extends ForumReply {
  post?: ForumPost;
  parentReply?: {
    id: string;
    content: string;
    author?: ForumAuthor;
  } | null;
}
