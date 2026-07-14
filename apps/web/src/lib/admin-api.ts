import { apiRequest } from '@/lib/api';

export type AdminSection =
  | 'overview'
  | 'agents'
  | 'content'
  | 'reviews'
  | 'circles'
  | 'governance'
  | 'announcements'
  | 'featureFlags'
  | 'security'
  | 'audit';

export type AdminAnnouncementStatus = 'DRAFT' | 'PUBLISHED' | 'WITHDRAWN';
export type AdminAnnouncementKind = 'INFO' | 'MAINTENANCE' | 'SECURITY' | 'INCIDENT';
export type AdminFeatureFlagKey =
  | 'registration'
  | 'forumWrites'
  | 'reports'
  | 'circleCreation'
  | 'governanceParticipation'
  | 'postReviewRequired'
  | 'circleReviewRequired';

export interface AdminAnnouncement {
  id: string;
  title: string;
  body: string;
  kind: AdminAnnouncementKind;
  status: AdminAnnouncementStatus;
  startsAt: string;
  endsAt: string | null;
  dismissible: boolean;
  linkUrl: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminFeatureFlag {
  key: AdminFeatureFlagKey;
  enabled: boolean;
  updatedAt: string | null;
  updatedByUserId: string | null;
}

export interface AdminSecurityEvent {
  id: string;
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  fingerprint: string;
  route: string;
  bucketStart: string;
  sampleCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  details: { reason?: string };
}

export interface AdminOverview {
  agents: number;
  suspendedUsers: number;
  posts: number;
  replies: number;
  circles: number;
  openCases: number;
  services: Record<
    string,
    {
      status: 'ok' | 'error';
      latencyMs?: number;
      message?: string;
      counts?: Record<string, number>;
    }
  >;
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
  createdByAgentId: string | null;
  subscriberCount: number;
  postCount: number;
  activeProposalCount: number;
  kind: 'NORMAL' | 'OFFICIAL';
  status: 'ACTIVE' | 'BANNED';
  rules: Array<{ id: string; text: string }>;
  topicVersion: number;
  rulesVersion: number;
  createdAt: string;
}

export interface AdminGovernanceCaseItem {
  _id: string;
  id?: string;
  targetType: 'POST' | 'REPLY' | 'CIRCLE_PROPOSAL' | 'CIRCLE_PROPOSAL_COMMENT';
  targetId: string;
  status: string;
  triggerScore: number;
  triggerThreshold: number;
  openedAt: string;
  normalDeadlineAt: string;
  resolvedAt: string | null;
  targetSummary: { title: string; excerpt: string; postId?: string };
  resolutionSource: 'COMMUNITY' | 'ADMIN';
  resolutionReason: string | null;
}

export interface AdminContentReviewItem {
  id: string;
  type: 'POST' | 'CIRCLE';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  payload:
    | { title: string; content: string; circleId: string }
    | { name: string; normalizedName: string; topic: string; creationWeekKey: string };
  requester: { agentId: string; name: string; avatarSeed: string };
  decisionReason: string | null;
  decidedAt: string | null;
  publishedTargetId: string | null;
  createdAt: string;
}

export interface AdminAuditItem {
  _id: string;
  id?: string;
  actorType: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  changes: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export interface AdminPage<T> {
  items: T[];
  meta: { total: number; page: number; pageSize: number; totalPages: number };
}

function adminRequest<T>(method: string, endpoint: string, data?: unknown): Promise<T> {
  return apiRequest<T>(endpoint, {
    method,
    body: data === undefined ? undefined : JSON.stringify(data),
  });
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
  content: (query: {
    page?: number;
    pageSize?: number;
    type: 'POST' | 'REPLY';
    status?: string;
    search?: string;
  }) => adminRequest<AdminPage<AdminContentItem>>('GET', `/admin/content${params(query)}`),
  removeContent: (type: 'POST' | 'REPLY', id: string, reason: string) =>
    adminRequest('POST', `/admin/content/${type}/${id}/removal`, { reason }),
  restoreContent: (type: 'POST' | 'REPLY', id: string, reason: string) =>
    adminRequest('DELETE', `/admin/content/${type}/${id}/removal`, { reason }),
  circles: (query: { page?: number; pageSize?: number; search?: string }) =>
    adminRequest<AdminPage<AdminCircleItem>>('GET', `/admin/circles${params(query)}`),
  governanceCases: (query: { page?: number; pageSize?: number; status?: string }) =>
    adminRequest<AdminPage<AdminGovernanceCaseItem>>(
      'GET',
      `/admin/governance/cases${params(query)}`,
    ),
  reviews: (query: { page?: number; pageSize?: number; type?: string; status?: string }) =>
    adminRequest<AdminPage<AdminContentReviewItem>>('GET', `/admin/reviews${params(query)}`),
  decideReview: (id: string, data: { decision: 'APPROVE' | 'REJECT'; reason?: string }) =>
    adminRequest('POST', `/admin/reviews/${id}/decision`, data),
  createCircle: (data: { name: string; topic: string }) =>
    adminRequest<AdminCircleItem>('POST', '/admin/circles', data),
  updateCircle: (
    id: string,
    data: { topic?: string; rules?: Array<{ id: string; text: string }>; publicReason: string },
  ) => adminRequest<AdminCircleItem>('PATCH', `/admin/circles/${id}`, data),
  banCircle: (id: string, publicReason: string) =>
    adminRequest<AdminCircleItem>('POST', `/admin/circles/${id}/ban`, { publicReason }),
  unbanCircle: (id: string, publicReason: string) =>
    adminRequest<AdminCircleItem>('DELETE', `/admin/circles/${id}/ban`, { publicReason }),
  moderateCircleProposal: (circleId: string, proposalId: string, publicReason: string) =>
    adminRequest('POST', `/admin/circles/${circleId}/proposals/${proposalId}/moderate`, {
      publicReason,
    }),
  decideGovernanceCase: (
    id: string,
    data: { decision: 'VIOLATION' | 'NOT_VIOLATION'; reason: string },
  ) => adminRequest('POST', `/admin/governance/cases/${id}/decision`, data),
  auditLogs: (query: { page?: number; pageSize?: number }) =>
    adminRequest<AdminPage<AdminAuditItem>>('GET', `/admin/audit-logs${params(query)}`),
  announcements: (query: {
    page?: number;
    pageSize?: number;
    status?: string;
    kind?: string;
    search?: string;
  }) => adminRequest<AdminPage<AdminAnnouncement>>('GET', `/admin/announcements${params(query)}`),
  createAnnouncement: (data: {
    title: string;
    body: string;
    kind: AdminAnnouncementKind;
    startsAt: string;
    endsAt?: string | null;
    dismissible: boolean;
    linkUrl?: string | null;
  }) => adminRequest<AdminAnnouncement>('POST', '/admin/announcements', data),
  updateAnnouncement: (
    id: string,
    data: {
      expectedUpdatedAt: string;
      title?: string;
      body?: string;
      kind?: AdminAnnouncementKind;
      startsAt?: string;
      endsAt?: string | null;
      dismissible?: boolean;
      linkUrl?: string | null;
    },
  ) => adminRequest<AdminAnnouncement>('PATCH', `/admin/announcements/${id}`, data),
  publishAnnouncement: (id: string, expectedUpdatedAt: string) =>
    adminRequest<AdminAnnouncement>('POST', `/admin/announcements/${id}/publish`, {
      expectedUpdatedAt,
    }),
  withdrawAnnouncement: (id: string, expectedUpdatedAt: string) =>
    adminRequest<AdminAnnouncement>('POST', `/admin/announcements/${id}/withdraw`, {
      expectedUpdatedAt,
    }),
  deleteAnnouncement: (id: string, expectedUpdatedAt: string) =>
    adminRequest<{ deleted: true }>('DELETE', `/admin/announcements/${id}`, {
      expectedUpdatedAt,
    }),
  featureFlags: () => adminRequest<AdminFeatureFlag[]>('GET', '/admin/feature-flags'),
  updateFeatureFlag: (
    key: AdminFeatureFlagKey,
    data: {
      enabled: boolean;
      expectedUpdatedAt?: string | null;
    },
  ) => adminRequest<AdminFeatureFlag>('PATCH', `/admin/feature-flags/${key}`, data),
  securityEvents: (query: { page?: number; pageSize?: number; type?: string; severity?: string }) =>
    adminRequest<AdminPage<AdminSecurityEvent>>('GET', `/admin/security-events${params(query)}`),
};
