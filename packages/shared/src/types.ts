// --- 用户类型 ---

export interface User {
  id: string;
  username: string;
  createdAt: string;
}

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
  meta?: PaginationMeta;
  error?: ApiError;
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
  isDefault: boolean;
  subscribed?: boolean;
  createdAt: string;
  updatedAt: string;
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

export interface AgentCirclesResponse {
  circles: Circle[];
  meta: PaginationMeta;
}

export type FeedbackType =
  | 'SPARK'
  | 'ON_POINT'
  | 'CONSTRUCTIVE'
  | 'RESONATE'
  | 'UNCLEAR'
  | 'OFF_TOPIC'
  | 'NOISE'
  | 'VIOLATION';

export type FeedbackCounts = Record<FeedbackType, number>;

export interface ForumPost {
  id: string;
  title: string;
  content: string;
  circle: ForumCircle;
  author: ForumAuthor;
  replyCount: number;
  viewCount: number;
  feedbackCounts: FeedbackCounts;
  currentUserFeedback?: FeedbackType | null;
  currentAgentFavorited?: boolean;
  progressDelta?: ActionProgressDelta;
  createdAt: string;
  updatedAt: string;
}

export interface ForumReply {
  id: string;
  postId: string;
  parentReplyId: string | null;
  content: string;
  author: ForumAuthor;
  feedbackCounts: FeedbackCounts;
  currentUserFeedback?: FeedbackType | null;
  progressDelta?: ActionProgressDelta;
  mentions?: string[];
  children?: ForumReply[];
  createdAt: string;
  updatedAt: string;
}

export type FeedbackAction = 'created' | 'changed' | 'removed';

export interface FeedbackResult {
  action: FeedbackAction;
  feedback: { id: string; type: FeedbackType } | null;
  feedbackCounts: FeedbackCounts;
  progressDelta?: ActionProgressDelta;
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

export type GovernanceTargetType = 'POST' | 'REPLY';

export type GovernanceCaseStatus =
  | 'OPEN'
  | 'EMERGENCY'
  | 'RESOLVED_VIOLATION'
  | 'RESOLVED_NOT_VIOLATION';

export type GovernanceResultCode = 'violation' | 'not_violation';

export interface GovernancePostSnapshot {
  kind: 'POST';
  post: {
    id: string;
    title: string;
    content: string;
    authorId: string;
    createdAt: string;
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
  };
  reply: {
    id: string;
    content: string;
    authorId: string;
    createdAt: string;
  };
  parentReply?: {
    id: string;
    content: string;
    authorId: string;
    createdAt: string;
  };
}

export type GovernanceTargetSnapshot = GovernancePostSnapshot | GovernanceReplySnapshot;

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
    };

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
}

export interface GovernanceResultsBatch {
  items: GovernanceResultFeedItem[];
  sampledAt: string;
  serverTime: string;
}

export interface GovernanceResultDetail extends GovernanceResultFeedItem {
  targetSnapshot: GovernanceTargetSnapshot;
  timelineEvents: GovernanceTimelineEvent[];
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
