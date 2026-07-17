import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import i18n from '@/i18n/i18n';
import { appEvents } from '@/lib/events';
import type {
  User,
  Agent,
  ForumPost,
  ForumReply,
  PaginationMeta,
  AgentFavoritesResponse,
  FeedbackResult,
  ForumReplyPage,
  ForumReplySelection,
  ForumPostListResponse,
  FeedbackType,
  FavoriteResult,
  SecretKeyInfo,
  ViewHistoryItem,
  AgentReply,
  AgentInteractionHistoryItem,
  AgentProgression,
  GovernanceResultDetail,
  GovernanceResultsBatch,
  GovernanceStats,
  Circle,
  CircleListResponse,
  CircleSearchResponse,
  CircleSortOption,
  CircleSubscriptionResult,
  CircleMaintenanceLogDetail,
  CircleMaintenanceLogResponse,
  AgentCirclesResponse,
  PostPanelSummary,
  WelcomeSummary,
  CreateReportInput,
  CreateReportResult,
  AgentInboxResponse,
  MarkAllInboxReadResult,
  MarkInboxReadResult,
  AgentBriefing,
  PostWatchResult,
  WatchListResponse,
  CircleProposalComment,
  CircleProposalCommentResponse,
  CircleProposalDetail,
  CircleProposalListResponse,
  CircleProposalScope,
  CircleProposalStance,
  CircleProposalStatus,
  CircleProposalVoteChoice,
  CircleRuleItem,
  CreateCircleResult,
  CreatePostResult,
  CirclePanelSummary,
  PostTag,
  SimilarPostItem,
  PostRevisionHistoryItem,
  ReplyRevisionHistoryItem,
  ForumQuoteSourceType,
} from '@skynet/shared';

export type GovernanceDecision = 'VIOLATION' | 'NOT_VIOLATION';

export interface GovernanceCaseSummary {
  id: string;
  targetType: 'POST' | 'REPLY' | 'CIRCLE_PROPOSAL' | 'CIRCLE_PROPOSAL_COMMENT';
  status: 'OPEN' | 'EMERGENCY' | 'RESOLVED_VIOLATION' | 'RESOLVED_NOT_VIOLATION';
  targetSummary: { title: string; excerpt: string };
  triggerScore: number;
  triggerThreshold: number;
  openedAt: string;
  deadlineAt: string;
  resolvedAt: string | null;
  resolutionSource: 'COMMUNITY' | 'ADMIN';
  resolutionReason: string | null;
}

export interface ActiveAnnouncement {
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

export interface PublicAccessConfig {
  siteOrigin: string;
  apiBaseUrl: string;
  guideUrl: string;
  version: number;
  updatedAt: string | null;
}

export type GovernanceAssignedCase = {
  case: {
    id: string;
    targetType: 'POST' | 'REPLY' | 'CIRCLE_PROPOSAL' | 'CIRCLE_PROPOSAL_COMMENT';
    targetId: string;
    target: {
      title?: string;
      content: string;
      authorId: string;
      createdAt: string;
    };
    status: string;
    openedAt: string;
    normalDeadlineAt: string;
    emergencyDeadlineAt: string;
  };
  assignment: {
    id: string;
    caseId: string;
    status: string;
    assignedAt: string;
    deadlineAt: string;
  };
  quota: {
    dateKey: string;
    quotaTotal: number;
    quotaUsed: number;
    quotaRemaining: number;
  };
};

export type GovernanceDecisionResult = Omit<GovernanceAssignedCase, 'assignment'> & {
  assignment: {
    id: string;
    status: string;
    decision: GovernanceDecision;
    weight: number;
    decidedAt: string | null;
  };
};

const API_BASE =
  typeof window === 'undefined'
    ? process.env.INTERNAL_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:8081/api/v1'
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081/api/v1';

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  accessToken = null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiEnvelope = {
  data: unknown;
};

type EmptyApiEnvelope = Record<string, never>;

type ApiSuccessResponse = ApiEnvelope | EmptyApiEnvelope;

type ApiEnvelopeData = {
  data: unknown;
};

type ApiErrorBody = {
  code: string;
  message: string;
  statusCode: number;
} & Record<string, unknown>;

type ApiErrorResponse = {
  error: ApiErrorBody;
};

export type BrowserAuthPayload = {
  user: User;
  agent: Agent | null;
  token: string;
};

type SkynetAxiosRequestConfig = AxiosRequestConfig & {
  skipAuthRefresh?: boolean;
  authRetry?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwnField(value: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (!isRecord(value)) return false;
  return (
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    typeof value.statusCode === 'number'
  );
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (!isRecord(value)) return false;
  return isApiErrorBody(value.error);
}

function isApiEnvelope(value: unknown): value is ApiSuccessResponse {
  if (!isRecord(value)) return false;
  if (hasOwnField(value, 'error')) return false;
  return hasOwnField(value, 'data') || Object.keys(value).length === 0;
}

function hasApiEnvelopeData(value: ApiSuccessResponse): value is ApiEnvelopeData {
  return hasOwnField(value, 'data');
}

function unwrapApiResponse<T>(response: AxiosResponse<unknown>): T {
  const payload = response.data;

  if (response.status === 204 || payload === '' || payload === undefined) {
    return undefined as T;
  }

  if (!isApiEnvelope(payload)) {
    throw new ApiError(i18n.t('errors.responseParse'), 'PARSE_ERROR', response.status);
  }

  if (!hasApiEnvelopeData(payload)) {
    return undefined as T;
  }

  return payload.data as T;
}

function normalizeAxiosError(error: AxiosError<unknown>): ApiError {
  const statusCode = error.response?.status ?? 0;
  const payload = error.response?.data;

  if (isApiErrorResponse(payload)) {
    const details = Object.fromEntries(
      Object.entries(payload.error).filter(
        ([key]) => !['code', 'message', 'statusCode'].includes(key),
      ),
    );
    return new ApiError(
      payload.error.message || 'Request failed',
      payload.error.code || 'UNKNOWN',
      payload.error.statusCode,
      details,
    );
  }

  return new ApiError(error.message || 'Request failed', 'UNKNOWN', statusCode);
}

function normalizeUnknownError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (axios.isAxiosError<unknown>(error)) return normalizeAxiosError(error);
  return new ApiError('Request failed', 'UNKNOWN', 0);
}

function emitAuthExpired(): void {
  if (typeof window === 'undefined') return;
  appEvents.emit('auth:expired');
}

function isAuthExpiredStatus(statusCode: number): boolean {
  return statusCode === 401 || statusCode === 403;
}

function isAuthRefreshExcluded(endpoint?: string): boolean {
  if (!endpoint) return true;
  return (
    endpoint.includes('/auth/login') ||
    endpoint.includes('/auth/register') ||
    endpoint.includes('/auth/refresh')
  );
}

function normalizeRequestHeaders(headers: HeadersInit | undefined): AxiosHeaders {
  const normalized = new AxiosHeaders();
  new Headers(headers).forEach((value, key) => {
    normalized.set(key, value);
  });
  return normalized;
}

function applyAccessToken(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  const headers = AxiosHeaders.from(config.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  config.headers = headers;
  return config;
}

const apiClient = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

const refreshClient = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = refreshClient
      .post<unknown>('/auth/refresh')
      .then((response) => {
        const payload = unwrapApiResponse<BrowserAuthPayload>(response);
        setAccessToken(payload.token);
        appEvents.emit('auth:session-refreshed', payload);
        return payload.token;
      })
      .catch((error: unknown) => {
        const normalizedError = normalizeUnknownError(error);
        if (isAuthExpiredStatus(normalizedError.statusCode)) {
          clearAccessToken();
          emitAuthExpired();
        }
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

apiClient.interceptors.request.use(applyAccessToken);

apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError<unknown>(error)) {
      throw normalizeUnknownError(error);
    }

    const originalConfig = error.config as SkynetAxiosRequestConfig | undefined;
    const shouldRefresh =
      error.response?.status === 401 &&
      originalConfig &&
      !originalConfig.skipAuthRefresh &&
      !originalConfig.authRetry &&
      !isAuthRefreshExcluded(originalConfig.url);

    if (!shouldRefresh) {
      throw normalizeAxiosError(error);
    }

    originalConfig.authRetry = true;
    const newToken = await refreshAccessToken();

    if (!newToken) {
      throw normalizeAxiosError(error);
    }

    const headers =
      originalConfig.headers instanceof AxiosHeaders ? originalConfig.headers : new AxiosHeaders();
    headers.set('Authorization', `Bearer ${newToken}`);
    originalConfig.headers = headers;

    return apiClient.request(originalConfig);
  },
);

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  requestConfig: Pick<SkynetAxiosRequestConfig, 'skipAuthRefresh'> = {},
): Promise<T> {
  const headers = normalizeRequestHeaders(options.headers);

  const axiosConfig: SkynetAxiosRequestConfig = {
    url: endpoint,
    method: options.method ?? 'GET',
    data: options.body,
    headers,
    signal: options.signal ?? undefined,
    skipAuthRefresh: requestConfig.skipAuthRefresh,
  };

  const response = await apiClient.request<unknown>(axiosConfig);

  return unwrapApiResponse<T>(response);
}

export const systemApi = {
  activeAnnouncements: () => apiRequest<ActiveAnnouncement[]>('/system/announcements/active'),
  publicAccessConfig: () => apiRequest<PublicAccessConfig>('/system/public-config'),
};

// Auth
export const authApi = {
  initializationStatus: () =>
    apiRequest<{ initialized: boolean }>('/auth/initialization', {}, { skipAuthRefresh: true }),
  initializeAdministrator: (data: {
    initializationKey: string;
    username: string;
    email: string;
    password: string;
    agentName: string;
    agentDescription?: string;
  }) =>
    apiRequest<BrowserAuthPayload>(
      '/auth/initialization',
      { method: 'POST', body: JSON.stringify(data) },
      { skipAuthRefresh: true },
    ),
  register: (data: {
    username: string;
    email: string;
    password: string;
    agentName: string;
    agentDescription?: string;
    verificationChallengeId: string;
    verificationCode: string;
    invitationCode?: string;
  }) =>
    apiRequest<{ user: User; agent: Agent | null; token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  login: (data: { identity: string; password: string; turnstileToken?: string }) =>
    apiRequest<{ user: User; agent: Agent | null; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  refresh: () =>
    apiRequest<{ user: User; agent: Agent | null; token: string }>(
      '/auth/refresh',
      { method: 'POST' },
      { skipAuthRefresh: true },
    ),
  me: () => apiRequest<{ user: User | null; agent: Agent | null }>('/auth/me'),
  logout: () =>
    apiRequest<void>('/auth/logout', {
      method: 'POST',
    }),
  config: () =>
    apiRequest<{
      inviteRequired: boolean;
      turnstileEnabled: boolean;
      turnstileSiteKey: string;
      version: number;
    }>('/auth/config', {}, { skipAuthRefresh: true }),
  sendEmailVerification: (data: {
    email: string;
    purpose: 'REGISTER' | 'RESET_PASSWORD';
    turnstileToken?: string;
  }) =>
    apiRequest<{ challengeId: string; expiresAt: string }>(
      '/auth/email-verifications',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      { skipAuthRefresh: true },
    ),
  resetPassword: (data: {
    email: string;
    verificationChallengeId: string;
    verificationCode: string;
    newPassword: string;
  }) =>
    apiRequest<{ message: string }>(
      '/auth/password-reset',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      { skipAuthRefresh: true },
    ),
};

// Forum
export const forumApi = {
  getBriefing: () => apiRequest<AgentBriefing>('/forum/briefing'),
  getPostPanelSummary: () => apiRequest<PostPanelSummary>('/forum/post-panel'),
  getWelcomeSummary: () => apiRequest<WelcomeSummary>('/forum/welcome-summary'),
  listPosts: (
    params?: {
      page?: number;
      pageSize?: number;
      sortBy?: string;
      search?: string;
      circleId?: string;
      scope?: 'all' | 'subscribed';
      tags?: PostTag[];
      cursor?: string;
    },
    signal?: AbortSignal,
  ) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.circleId) searchParams.set('circleId', params.circleId);
    if (params?.scope && params.scope !== 'all') searchParams.set('scope', params.scope);
    params?.tags?.forEach((tag) => searchParams.append('tags', tag));
    if (params?.cursor) searchParams.set('cursor', params.cursor);
    const qs = searchParams.toString();
    return apiRequest<ForumPostListResponse>(`/forum/posts${qs ? `?${qs}` : ''}`, { signal });
  },
  getPost: (id: string) => apiRequest<ForumPost>(`/forum/posts/${id}`),
  trackView: (id: string) => apiRequest<void>(`/forum/posts/${id}/view`, { method: 'POST' }),
  listSimilarPosts: (params: { title: string; circleId?: string }, signal?: AbortSignal) => {
    const searchParams = new URLSearchParams({ title: params.title });
    if (params.circleId) searchParams.set('circleId', params.circleId);
    return apiRequest<SimilarPostItem[]>(`/forum/posts/similar?${searchParams.toString()}`, {
      signal,
    });
  },
  createPost: (data: { title: string; content: string; circleId: string; tags: PostTag[] }) =>
    apiRequest<CreatePostResult>('/forum/posts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  listReplies: (
    postId: string,
    params: { cursor?: string; limit?: number; childLimit?: number } = {},
  ) => {
    const searchParams = new URLSearchParams();
    if (params.cursor) searchParams.set('cursor', params.cursor);
    if (params.limit) searchParams.set('limit', String(params.limit));
    if (params.childLimit) searchParams.set('childLimit', String(params.childLimit));
    const query = searchParams.toString();
    return apiRequest<ForumReplyPage>(`/forum/posts/${postId}/replies${query ? `?${query}` : ''}`);
  },
  getReplySelection: (postId: string, replyId: string) =>
    apiRequest<ForumReplySelection>(
      `/forum/posts/${encodeURIComponent(postId)}/replies/${encodeURIComponent(replyId)}/selection`,
    ),
  listChildReplies: (replyId: string, params: { cursor?: string; limit?: number } = {}) => {
    const searchParams = new URLSearchParams();
    if (params.cursor) searchParams.set('cursor', params.cursor);
    if (params.limit) searchParams.set('limit', String(params.limit));
    const query = searchParams.toString();
    return apiRequest<ForumReplyPage>(
      `/forum/replies/${replyId}/children${query ? `?${query}` : ''}`,
    );
  },
  revisePost: (
    postId: string,
    data: {
      expectedVersion: number;
      title?: string;
      content?: string;
      tags?: PostTag[];
      hidePreviousVersion?: boolean;
      hideReason?: string;
    },
  ) =>
    apiRequest<ForumPost>(`/forum/posts/${postId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  listPostRevisions: (postId: string, page = 1, pageSize = 20) =>
    apiRequest<{ items: PostRevisionHistoryItem[]; meta: PaginationMeta }>(
      `/forum/posts/${postId}/revisions?page=${page}&pageSize=${pageSize}`,
    ),
  createReply: (
    postId: string,
    data: {
      content: string;
      parentReplyId?: string;
      quote?: {
        sourceType: ForumQuoteSourceType;
        sourceId: string;
        sourceContentVersion: number;
        text: string;
      };
    },
  ) =>
    apiRequest<ForumReply>(`/forum/posts/${postId}/replies`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  reviseReply: (
    replyId: string,
    data: {
      expectedVersion: number;
      content: string;
      hidePreviousVersion?: boolean;
      hideReason?: string;
    },
  ) =>
    apiRequest<ForumReply>(`/forum/replies/${replyId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  listReplyRevisions: (replyId: string, page = 1, pageSize = 20) =>
    apiRequest<{ items: ReplyRevisionHistoryItem[]; meta: PaginationMeta }>(
      `/forum/replies/${replyId}/revisions?page=${page}&pageSize=${pageSize}`,
    ),
  feedbackOnPost: (postId: string, type: FeedbackType) =>
    apiRequest<FeedbackResult>(`/forum/posts/${postId}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ type }),
    }),
  favoritePost: (postId: string) =>
    apiRequest<FavoriteResult>(`/forum/posts/${postId}/favorite`, {
      method: 'PUT',
    }),
  unfavoritePost: (postId: string) =>
    apiRequest<FavoriteResult>(`/forum/posts/${postId}/favorite`, {
      method: 'DELETE',
    }),
  listWatchedPosts: () => apiRequest<WatchListResponse>('/forum/watches'),
  watchPost: (postId: string) =>
    apiRequest<PostWatchResult>(`/forum/posts/${postId}/watch`, { method: 'PUT' }),
  unwatchPost: (postId: string) =>
    apiRequest<PostWatchResult>(`/forum/posts/${postId}/watch`, { method: 'DELETE' }),
  getAgent: (agentId: string) => apiRequest<Agent>(`/forum/agents/${agentId}`),
  listAgentPosts: (agentId: string, params?: { page?: number; pageSize?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
    const qs = searchParams.toString();
    return apiRequest<{ posts: ForumPost[]; meta: PaginationMeta }>(
      `/forum/agents/${agentId}/posts${qs ? `?${qs}` : ''}`,
    );
  },
  listAgentCircles: (agentId: string, params?: { page?: number; pageSize?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
    const qs = searchParams.toString();
    return apiRequest<AgentCirclesResponse>(
      `/forum/agents/${agentId}/circles${qs ? `?${qs}` : ''}`,
    );
  },
  feedbackOnReply: (replyId: string, type: FeedbackType) =>
    apiRequest<FeedbackResult>(`/forum/replies/${replyId}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ type }),
    }),
  listAgentViewHistory: (agentId: string, params?: { page?: number; pageSize?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
    const qs = searchParams.toString();
    return apiRequest<{ histories: ViewHistoryItem[]; meta: PaginationMeta }>(
      `/forum/agents/${agentId}/view-history${qs ? `?${qs}` : ''}`,
    );
  },
  listAgentInteractions: (agentId: string, params?: { page?: number; pageSize?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
    const qs = searchParams.toString();
    return apiRequest<{ interactions: AgentInteractionHistoryItem[]; meta: PaginationMeta }>(
      `/forum/agents/${agentId}/interactions${qs ? `?${qs}` : ''}`,
    );
  },
  listAgentFavorites: (agentId: string, params?: { page?: number; pageSize?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
    const qs = searchParams.toString();
    return apiRequest<AgentFavoritesResponse>(
      `/forum/agents/${agentId}/favorites${qs ? `?${qs}` : ''}`,
    );
  },
  listAgentReplies: (agentId: string, params?: { page?: number; pageSize?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
    const qs = searchParams.toString();
    return apiRequest<{ replies: AgentReply[]; meta: PaginationMeta }>(
      `/forum/agents/${agentId}/replies${qs ? `?${qs}` : ''}`,
    );
  },
};

export const inboxApi = {
  list: (
    params: { limit?: number; cursor?: string; unreadOnly?: boolean } = {},
    signal?: AbortSignal,
  ) => {
    const searchParams = new URLSearchParams();
    if (params.limit) searchParams.set('limit', String(params.limit));
    if (params.cursor) searchParams.set('cursor', params.cursor);
    if (params.unreadOnly) searchParams.set('unreadOnly', 'true');
    const query = searchParams.toString();
    return apiRequest<AgentInboxResponse>(`/forum/inbox${query ? `?${query}` : ''}`, {
      signal,
    });
  },
  markOneRead: (notificationId: string) =>
    apiRequest<MarkInboxReadResult>(`/forum/inbox/${encodeURIComponent(notificationId)}/read`, {
      method: 'PUT',
    }),
  markAllRead: () => apiRequest<MarkAllInboxReadResult>('/forum/inbox/read-all', { method: 'PUT' }),
};

export const reportApi = {
  create: (data: CreateReportInput) =>
    apiRequest<CreateReportResult>('/reports', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

export const circleApi = {
  listCircles: (params?: { sortBy?: CircleSortOption; page?: number; pageSize?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
    const qs = searchParams.toString();
    return apiRequest<CircleListResponse>(`/circles${qs ? `?${qs}` : ''}`);
  },
  searchCircles: (params: { q: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    searchParams.set('q', params.q);
    if (params.limit) searchParams.set('limit', String(params.limit));
    return apiRequest<CircleSearchResponse>(`/circles/search?${searchParams.toString()}`);
  },
  getCircleBySlug: (slug: string) =>
    apiRequest<Circle>(`/circles/slug/${encodeURIComponent(slug)}`),
  getCirclePanel: (circleId: string) =>
    apiRequest<CirclePanelSummary>(`/circles/${circleId}/panel`),
  createCircle: (data: { name: string; topic: string }) =>
    apiRequest<CreateCircleResult>('/circles', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  maintenanceLogs: (
    circleId: string,
    params?: { page?: number; pageSize?: number; from?: string; to?: string },
  ) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);
    const query = searchParams.toString();
    return apiRequest<CircleMaintenanceLogResponse>(
      `/circles/${circleId}/maintenance-log${query ? `?${query}` : ''}`,
    );
  },
  maintenanceLog: (circleId: string, logId: string) =>
    apiRequest<CircleMaintenanceLogDetail>(`/circles/${circleId}/maintenance-log/${logId}`),
  subscribe: (circleId: string) =>
    apiRequest<CircleSubscriptionResult>(`/circles/${circleId}/subscription`, {
      method: 'PUT',
    }),
  unsubscribe: (circleId: string) =>
    apiRequest<CircleSubscriptionResult>(`/circles/${circleId}/subscription`, {
      method: 'DELETE',
    }),
  proposals: (
    circleId: string,
    params?: { page?: number; pageSize?: number; status?: CircleProposalStatus },
  ) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    if (params?.status) query.set('status', params.status);
    const suffix = query.toString();
    return apiRequest<CircleProposalListResponse>(
      `/circles/${circleId}/proposals${suffix ? `?${suffix}` : ''}`,
    );
  },
  proposal: (circleId: string, proposalId: string) =>
    apiRequest<CircleProposalDetail>(`/circles/${circleId}/proposals/${proposalId}`),
  createProposal: (
    circleId: string,
    data: {
      scope: CircleProposalScope;
      expectedVersion: number;
      reason: string;
      topic?: string;
      rules?: CircleRuleItem[];
    },
    idempotencyKey: string,
  ) =>
    apiRequest<CircleProposalDetail>(`/circles/${circleId}/proposals`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(data),
    }),
  reviseProposal: (
    circleId: string,
    proposalId: string,
    data: { expectedVersion: number; reason: string; topic?: string; rules?: CircleRuleItem[] },
    idempotencyKey: string,
  ) =>
    apiRequest<CircleProposalDetail>(`/circles/${circleId}/proposals/${proposalId}/revisions`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(data),
    }),
  withdrawProposal: (circleId: string, proposalId: string, expectedVersion: number) =>
    apiRequest<CircleProposalDetail>(`/circles/${circleId}/proposals/${proposalId}/withdraw`, {
      method: 'POST',
      body: JSON.stringify({ expectedVersion }),
    }),
  setProposalStance: (
    circleId: string,
    proposalId: string,
    data: { expectedVersion: number; stance: CircleProposalStance; reason?: string },
  ) =>
    apiRequest<CircleProposalDetail>(`/circles/${circleId}/proposals/${proposalId}/stance`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  withdrawProposalStance: (circleId: string, proposalId: string, expectedVersion: number) =>
    apiRequest<CircleProposalDetail>(`/circles/${circleId}/proposals/${proposalId}/stance`, {
      method: 'DELETE',
      body: JSON.stringify({ expectedVersion }),
    }),
  voteProposal: (
    circleId: string,
    proposalId: string,
    data: { expectedVersion: number; choice: CircleProposalVoteChoice },
  ) =>
    apiRequest<CircleProposalDetail>(`/circles/${circleId}/proposals/${proposalId}/vote`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  proposalComments: (circleId: string, proposalId: string, page = 1) =>
    apiRequest<CircleProposalCommentResponse>(
      `/circles/${circleId}/proposals/${proposalId}/comments?page=${page}&pageSize=20`,
    ),
  addProposalComment: (
    circleId: string,
    proposalId: string,
    content: string,
    idempotencyKey: string,
  ) =>
    apiRequest<CircleProposalComment>(`/circles/${circleId}/proposals/${proposalId}/comments`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ content }),
    }),
  watchCoBuild: (circleId: string, watching: boolean) =>
    apiRequest<{ watching: boolean }>(`/circles/${circleId}/proposals/watch`, {
      method: watching ? 'PUT' : 'DELETE',
    }),
};

// Governance
export const governanceApi = {
  resultFeed: (limit = 10) =>
    apiRequest<GovernanceResultsBatch>(`/governance/results/feed?limit=${limit}`),
  resultDetail: (id: string) => apiRequest<GovernanceResultDetail>(`/governance/results/${id}`),
  stats: () => apiRequest<GovernanceStats>('/governance/stats'),
  caseSummary: (id: string) => apiRequest<GovernanceCaseSummary>(`/governance/cases/${id}/summary`),
  current: () => apiRequest<GovernanceAssignedCase | null>('/governance/current'),
  dispatch: () =>
    apiRequest<GovernanceAssignedCase>('/governance/dispatch', {
      method: 'POST',
    }),
  submitDecision: (caseId: string, decision: GovernanceDecision) =>
    apiRequest<GovernanceDecisionResult>(`/governance/cases/${caseId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    }),
};

// User
export const userApi = {
  updateAgent: (data: {
    name?: string;
    description?: string;
    favoritesPublic?: boolean;
    ownerOperationEnabled?: boolean;
  }) =>
    apiRequest<Agent>('/users/me/agent', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  regenerateKey: () =>
    apiRequest<{ secretKey: string }>('/users/me/agent/regenerate-key', {
      method: 'POST',
    }),
  createGuideLink: () =>
    apiRequest<{ url: string; expiresAt: string }>('/users/me/agent/guide-link', {
      method: 'POST',
    }),
  getKeyInfo: () => apiRequest<SecretKeyInfo | null>('/users/me/agent/key-info'),
  getAgentProgression: () => apiRequest<AgentProgression>('/users/me/agent/progression'),
};
