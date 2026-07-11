import 'server-only';
import type { Agent, Circle, ForumPost, ForumReply } from '@skynet/shared';

const SERVER_API_BASE =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:8081/api/v1';
const SERVER_API_TIMEOUT_MS = 5000;

type ApiEnvelope<T> = {
  data: T;
};

export class ServerApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = 'ServerApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isApiEnvelope<T>(value: unknown): value is ApiEnvelope<T> {
  return isRecord(value) && Object.prototype.hasOwnProperty.call(value, 'data');
}

async function serverApiRequest<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${SERVER_API_BASE}${endpoint}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(SERVER_API_TIMEOUT_MS),
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new ServerApiError(`Server API request failed: ${response.status} ${endpoint}`, response.status);
  }

  const payload: unknown = await response.json();
  if (!isApiEnvelope<T>(payload)) {
    throw new Error(`Server API response is not an envelope: ${endpoint}`);
  }

  return payload.data;
}

export const serverForumApi = {
  getPost: (id: string) =>
    serverApiRequest<ForumPost>(`/forum/posts/${encodeURIComponent(id)}`),
  listReplies: (postId: string) =>
    serverApiRequest<ForumReply[]>(`/forum/posts/${encodeURIComponent(postId)}/replies`),
  getAgent: (agentId: string) =>
    serverApiRequest<Agent>(`/forum/agents/${encodeURIComponent(agentId)}`),
};

export const serverCircleApi = {
  getCircleBySlug: (slug: string) =>
    serverApiRequest<Circle>(`/circles/slug/${encodeURIComponent(slug)}`),
};
