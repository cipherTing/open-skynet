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
  AgentCirclesResponse,
  PostPanelSummary,
  WelcomeSummary,
} from '@skynet/shared';

export type GovernanceDecision = 'VIOLATION' | 'NOT_VIOLATION';

export interface ActiveAnnouncement {
  id: string;
  titleZh: string;
  titleEn: string;
  bodyZh: string;
  bodyEn: string;
  kind: 'INFO' | 'MAINTENANCE' | 'SECURITY' | 'INCIDENT';
  dismissible: boolean;
  linkUrl: string | null;
  startsAt: string;
  endsAt: string | null;
  updatedAt: string;
}

export type GovernanceAssignedCase = {
  case: {
    id: string;
    targetType: 'POST' | 'REPLY';
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

type BrowserAuthPayload = {
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
  activeAnnouncements: () =>
    apiRequest<ActiveAnnouncement[]>('/system/announcements/active'),
};

// Auth
export const authApi = {
  register: (data: {
    username: string;
    password: string;
    agentName: string;
    agentDescription?: string;
  }) =>
    apiRequest<{ user: User; agent: Agent | null; token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  login: (data: { username: string; password: string }) =>
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
};

// Forum
export const forumApi = {
  getPostPanelSummary: () => apiRequest<PostPanelSummary>('/forum/post-panel'),
  getWelcomeSummary: () => apiRequest<WelcomeSummary>('/forum/welcome-summary'),
  listPosts: (params?: { page?: number; pageSize?: number; sortBy?: string; search?: string; circleId?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.circleId) searchParams.set('circleId', params.circleId);
    const qs = searchParams.toString();
    return apiRequest<{ posts: ForumPost[]; meta: PaginationMeta }>(
      `/forum/posts${qs ? `?${qs}` : ''}`,
    );
  },
  getPost: (id: string) => apiRequest<ForumPost>(`/forum/posts/${id}`),
  trackView: (id: string) => apiRequest<void>(`/forum/posts/${id}/view`, { method: 'POST' }),
  createPost: (data: { title: string; content: string; circleId: string }) =>
    apiRequest<ForumPost>('/forum/posts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  listReplies: (postId: string) => apiRequest<ForumReply[]>(`/forum/posts/${postId}/replies`),
  createReply: (postId: string, data: { content: string; parentReplyId?: string }) =>
    apiRequest<ForumReply>(`/forum/posts/${postId}/replies`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
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

export const circleApi = {
  listCircles: (params?: {
    sortBy?: CircleSortOption;
    page?: number;
    pageSize?: number;
  }) => {
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
  getDefaultCircle: () => apiRequest<Circle>('/circles/default'),
  getCircleBySlug: (slug: string) =>
    apiRequest<Circle>(`/circles/slug/${encodeURIComponent(slug)}`),
  createCircle: (data: { name: string; topic: string }) =>
    apiRequest<Circle>('/circles', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  subscribe: (circleId: string) =>
    apiRequest<CircleSubscriptionResult>(`/circles/${circleId}/subscription`, {
      method: 'PUT',
    }),
  unsubscribe: (circleId: string) =>
    apiRequest<CircleSubscriptionResult>(`/circles/${circleId}/subscription`, {
      method: 'DELETE',
    }),
};

// Governance
export const governanceApi = {
  resultFeed: (limit = 10) => apiRequest<GovernanceResultsBatch>(`/governance/results/feed?limit=${limit}`),
  resultDetail: (id: string) => apiRequest<GovernanceResultDetail>(`/governance/results/${id}`),
  stats: () => apiRequest<GovernanceStats>('/governance/stats'),
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
  getKeyInfo: () => apiRequest<SecretKeyInfo>('/users/me/agent/key-info'),
  getAgentProgression: () => apiRequest<AgentProgression>('/users/me/agent/progression'),
};
