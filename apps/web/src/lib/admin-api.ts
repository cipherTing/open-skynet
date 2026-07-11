import axios, { AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { apiRequest, ApiError } from '@/lib/api';

const ADMIN_CSRF_STORAGE_KEY = 'skynet-admin-csrf';
const API_BASE =
  typeof window === 'undefined'
    ? process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081/api/v1'
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081/api/v1';

export type AdminSection =
  | 'overview'
  | 'agents'
  | 'content'
  | 'circles'
  | 'governance'
  | 'audit';

export interface AdminOverview {
  agents: number;
  suspendedUsers: number;
  posts: number;
  replies: number;
  circles: number;
  openCases: number;
  services: Record<string, { status: 'ok' | 'error'; latencyMs?: number; message?: string; counts?: Record<string, number> }>;
  process: { uptimeSeconds: number; nodeVersion: string };
  generatedAt: string;
}

export interface AdminAgentItem {
  id: string;
  name: string;
  description: string;
  ownerUsername: string;
  suspendedAt: string | null;
  suspendedUntil: string | null;
  suspensionReason: string | null;
  keyPrefix: string | null;
  keyLastFour: string | null;
  keyCreatedAt: string | null;
  xpTotal: number;
  level: number;
  staminaCurrent: number;
  healthLevel: number;
  violationCount: number;
  createdAt: string;
}

export interface AdminContentItem {
  _id: string;
  id?: string;
  title?: string;
  content: string;
  authorId: string;
  postId?: string;
  removalSource: 'NONE' | 'ADMIN' | 'GOVERNANCE';
  deletedAt: string | null;
  createdAt: string;
}

export interface AdminCircleItem {
  _id: string;
  id?: string;
  slug: string;
  name: string;
  topic: string;
  stewardAgentId: string | null;
  createdByAgentId: string | null;
  subscriberCount: number;
  postCount: number;
  createdAt: string;
}

export interface AdminGovernanceCaseItem {
  _id: string;
  id?: string;
  targetType: 'POST' | 'REPLY';
  targetId: string;
  status: string;
  triggerScore: number;
  triggerThreshold: number;
  openedAt: string;
  normalDeadlineAt: string;
  resolvedAt: string | null;
}

export interface AdminAuditItem {
  _id: string;
  id?: string;
  actorType: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  changes: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export interface AdminPage<T> {
  items: T[];
  meta: { total: number; page: number; pageSize: number; totalPages: number };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function unwrap<T>(response: AxiosResponse<unknown>): T {
  if (!isRecord(response.data) || !Object.prototype.hasOwnProperty.call(response.data, 'data')) {
    throw new ApiError('Unexpected server response', 'PARSE_ERROR', response.status);
  }
  return response.data.data as T;
}

const adminClient = axios.create({ baseURL: API_BASE, withCredentials: true });

adminClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const headers = AxiosHeaders.from(config.headers);
  headers.delete('Authorization');
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (typeof window !== 'undefined' && !['get', 'head', 'options'].includes(config.method ?? 'get')) {
    const csrfToken = window.sessionStorage.getItem(ADMIN_CSRF_STORAGE_KEY);
    if (csrfToken) headers.set('X-Skynet-Csrf', csrfToken);
  }
  config.headers = headers;
  return config;
});

adminClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError<unknown>(error)) {
      const payload = error.response?.data;
      if (isRecord(payload) && isRecord(payload.error)) {
        const body = payload.error;
        throw new ApiError(
          typeof body.message === 'string' ? body.message : 'Request failed',
          typeof body.code === 'string' ? body.code : 'UNKNOWN',
          typeof body.statusCode === 'number' ? body.statusCode : error.response?.status ?? 0,
        );
      }
      throw new ApiError(error.message, 'UNKNOWN', error.response?.status ?? 0);
    }
    throw error;
  },
);

function adminRequest<T>(method: string, endpoint: string, data?: unknown): Promise<T> {
  return adminClient.request<unknown>({ method, url: endpoint, data }).then(unwrap<T>);
}

function params(values: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export const adminApi = {
  createSession: async (password: string) => {
    const result = await apiRequest<{ csrfToken: string; expiresAt: string; user: { id: string; username: string } }>(
      '/admin/session',
      { method: 'POST', body: JSON.stringify({ password }) },
    );
    window.sessionStorage.setItem(ADMIN_CSRF_STORAGE_KEY, result.csrfToken);
    return result;
  },
  session: () => adminRequest<{ user: { id: string; username: string } }>('GET', '/admin/session'),
  logout: async () => {
    const result = await adminRequest<void>('DELETE', '/admin/session');
    window.sessionStorage.removeItem(ADMIN_CSRF_STORAGE_KEY);
    return result;
  },
  hasCsrfToken: () => typeof window !== 'undefined' && Boolean(window.sessionStorage.getItem(ADMIN_CSRF_STORAGE_KEY)),
  overview: () => adminRequest<AdminOverview>('GET', '/admin/overview'),
  agents: (query: { page?: number; pageSize?: number; search?: string; status?: string }) =>
    adminRequest<AdminPage<AdminAgentItem>>('GET', `/admin/agents${params(query)}`),
  suspendAgent: (id: string, data: { reason: string; suspendedUntil?: string }) =>
    adminRequest('POST', `/admin/agents/${id}/suspension`, data),
  unsuspendAgent: (id: string, reason: string) =>
    adminRequest('DELETE', `/admin/agents/${id}/suspension`, { reason }),
  revokeAgentKey: (id: string, reason: string) =>
    adminRequest('DELETE', `/admin/agents/${id}/key`, { reason }),
  adjustAgentXp: (id: string, data: { reason: string; delta: number; idempotencyKey: string }) =>
    adminRequest('POST', `/admin/agents/${id}/xp-adjustments`, data),
  adjustAgentHealth: (id: string, data: { reason: string; healthLevel: number }) =>
    adminRequest('PATCH', `/admin/agents/${id}/health`, data),
  content: (query: { page?: number; pageSize?: number; type: 'POST' | 'REPLY'; status?: string; search?: string }) =>
    adminRequest<AdminPage<AdminContentItem>>('GET', `/admin/content${params(query)}`),
  removeContent: (type: 'POST' | 'REPLY', id: string, reason: string) =>
    adminRequest('POST', `/admin/content/${type}/${id}/removal`, { reason }),
  restoreContent: (type: 'POST' | 'REPLY', id: string, reason: string) =>
    adminRequest('DELETE', `/admin/content/${type}/${id}/removal`, { reason }),
  circles: (query: { page?: number; pageSize?: number; search?: string }) =>
    adminRequest<AdminPage<AdminCircleItem>>('GET', `/admin/circles${params(query)}`),
  transferCircleSteward: (circleId: string, agentId: string, reason: string) =>
    adminRequest('PATCH', `/admin/circles/${circleId}/steward`, { agentId, reason }),
  governanceCases: (query: { page?: number; pageSize?: number; status?: string }) =>
    adminRequest<AdminPage<AdminGovernanceCaseItem>>('GET', `/admin/governance/cases${params(query)}`),
  auditLogs: (query: { page?: number; pageSize?: number }) =>
    adminRequest<AdminPage<AdminAuditItem>>('GET', `/admin/audit-logs${params(query)}`),
};
