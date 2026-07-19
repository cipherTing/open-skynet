import { ApiError, apiRequest } from '@/lib/api';
import { appEvents } from '@/lib/events';
import type { GovernanceTargetSnapshot, PostTag } from '@skynet/shared';

export type AdminSection =
  | 'overview'
  | 'agents'
  | 'content'
  | 'reviews'
  | 'circles'
  | 'governance'
  | 'announcements'
  | 'publicAccess'
  | 'featureFlags'
  | 'authPolicy'
  | 'invitations'
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

export interface AdminPublicAccessConfig {
  siteOrigin: string;
  apiBaseUrl: string;
  guideUrl: string;
  version: number;
  updatedAt: string | null;
}

export interface AdminAuthPolicy {
  inviteRequired: boolean;
  turnstileEnabled: boolean;
  turnstileSiteKey: string;
  turnstileSecretConfigured: boolean;
  turnstileVerifiedAt: string | null;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: 'NONE' | 'SSL_TLS' | 'STARTTLS';
  smtpSkipTlsVerify: boolean;
  smtpForceAuthLogin: boolean;
  smtpUsername: string;
  smtpFromAddress: string;
  smtpPasswordConfigured: boolean;
  smtpVerifiedAt: string | null;
  version: number;
  updatedAt: string;
}

export interface AdminInvitationCode {
  id: string;
  prefix: string;
  maskedCode: string;
  code?: string;
  status: 'AVAILABLE' | 'USED' | 'EXPIRED' | 'REVOKED';
  expiresAt: string | null;
  usedAt: string | null;
  usedByUserId: string | null;
  usedByAgentId?: string | null;
  createdAt: string;
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
  emergencyCases: number;
  pendingReviews: number;
  activeProposals: number;
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
  adminBanned: boolean;
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
  tags?: PostTag[];
  content: string;
  authorId: string;
  postId?: string;
  postTitle?: string;
  governanceCaseId: string | null;
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

export interface AdminCircleDetail extends AdminCircleItem {
  activeProposals: Array<{
    id: string;
    scope: 'TOPIC' | 'RULES';
    status: 'DISCUSSION' | 'VOTING';
    currentRevisionNumber: number;
    discussionDeadlineAt: string;
    votingDeadlineAt: string | null;
  }>;
}

export interface AdminGovernanceCaseItem {
  _id: string;
  id?: string;
  targetType: 'POST' | 'REPLY' | 'CIRCLE_PROPOSAL' | 'CIRCLE_PROPOSAL_COMMENT';
  targetId: string;
  targetContentVersion: number;
  status: string;
  triggerScore: number;
  triggerThreshold: number;
  openedAt: string;
  normalDeadlineAt: string;
  emergencyDeadlineAt: string;
  deadlineAt: string;
  resolvedAt: string | null;
  targetSummary: { title: string; excerpt: string; postId?: string };
  resolutionSource: 'COMMUNITY' | 'ADMIN';
  resolutionReason: string | null;
}

export interface AdminGovernanceCaseDetail extends AdminGovernanceCaseItem {
  id: string;
  round: number;
  targetSnapshot: GovernanceTargetSnapshot;
  tally: { violation: number; notViolation: number; participantCount: number };
  reports: Array<{ id: string; reason: string; evidence: string | null; createdAt: string }>;
  votes: Array<{ choice: 'VIOLATION' | 'NOT_VIOLATION'; weight: number; createdAt: string }>;
  firstReviewAt: string;
  corrections: Array<{
    id: string;
    action: 'RESTORE_CONTENT';
    publicReason: string;
    previousRound: number;
    nextRound: number;
    createdAt: string;
  }>;
}

export interface AdminContentReviewItem {
  id: string;
  type: 'POST' | 'CIRCLE';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  payload:
    | { title: string; content: string; circleId: string; tags: PostTag[] }
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
  changes: Record<string, AdminJsonValue>;
  actor: { id: string | null; label: string };
  target: { id: string; type: string; label: string };
  createdAt: string;
}

export type AdminJsonValue =
  | string
  | number
  | boolean
  | null
  | AdminJsonValue[]
  | { [key: string]: AdminJsonValue };

export interface AdminPage<T> {
  items: T[];
  meta: { total: number; page: number; pageSize: number; totalPages: number };
}

async function adminRequest<T>(method: string, endpoint: string, data?: unknown): Promise<T> {
  try {
    return await apiRequest<T>(endpoint, {
      method,
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 403) {
      appEvents.emit('auth:refresh-required');
    }
    throw error;
  }
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
  suspendAgent: (id: string, data: { reason: string }) =>
    adminRequest('POST', `/admin/agents/${id}/suspension`, data),
  unsuspendAgent: (id: string, reason: string) =>
    adminRequest('DELETE', `/admin/agents/${id}/suspension`, { reason }),
  revokeAgentKey: (id: string, reason: string) =>
    adminRequest('DELETE', `/admin/agents/${id}/key`, { reason }),
  adjustAgentXp: (id: string, data: { reason: string; delta: number; idempotencyKey: string }) =>
    adminRequest('POST', `/admin/agents/${id}/xp-adjustments`, data),
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
  circleDetail: (id: string) => adminRequest<AdminCircleDetail>('GET', `/admin/circles/${id}`),
  governanceCases: (query: { page?: number; pageSize?: number; status?: string }) =>
    adminRequest<AdminPage<AdminGovernanceCaseItem>>(
      'GET',
      `/admin/governance/cases${params(query)}`,
    ),
  governanceCaseDetail: (id: string) =>
    adminRequest<AdminGovernanceCaseDetail>('GET', `/admin/governance/cases/${id}`),
  reviews: (query: { page?: number; pageSize?: number; type?: string; status?: string }) =>
    adminRequest<AdminPage<AdminContentReviewItem>>('GET', `/admin/reviews${params(query)}`),
  reviewDetail: (id: string) =>
    adminRequest<
      AdminContentReviewItem & {
        circle?: { id: string; name: string; slug: string; status: string } | null;
        duplicateCircle?: { id: string; name: string; slug: string } | null;
        publishedCircle?: { id: string; name: string; slug: string } | null;
      }
    >('GET', `/admin/reviews/${id}`),
  decideReview: (id: string, data: { decision: 'APPROVE' | 'REJECT'; reason?: string }) =>
    adminRequest('POST', `/admin/reviews/${id}/decision`, data),
  createCircle: (data: { name: string; topic: string; kind: 'NORMAL' | 'OFFICIAL' }) =>
    adminRequest<AdminCircleItem>('POST', '/admin/circles', data),
  updateCircle: (
    id: string,
    data: {
      topic?: { value: string; expectedVersion: number };
      rules?: { value: Array<{ id: string; text: string }>; expectedVersion: number };
      reason: string;
    },
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
  correctGovernanceCase: (id: string, reason: string) =>
    adminRequest('POST', `/admin/governance/cases/${id}/correction`, { reason }),
  auditLogs: (query: {
    page?: number;
    pageSize?: number;
    action?: string;
    targetType?: string;
    from?: string;
    to?: string;
  }) => adminRequest<AdminPage<AdminAuditItem>>('GET', `/admin/audit-logs${params(query)}`),
  auditLogDetail: (id: string) => adminRequest<AdminAuditItem>('GET', `/admin/audit-logs/${id}`),
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
  publicAccessConfig: () =>
    adminRequest<AdminPublicAccessConfig>('GET', '/admin/public-access-config'),
  updatePublicAccessConfig: (data: {
    siteOrigin: string;
    apiBaseUrl: string;
    expectedVersion: number;
  }) => adminRequest<AdminPublicAccessConfig>('PATCH', '/admin/public-access-config', data),
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
  authPolicy: () => adminRequest<AdminAuthPolicy>('GET', '/admin/auth-policy'),
  updateAuthPolicy: (data: {
    expectedVersion: number;
    inviteRequired: boolean;
    turnstileEnabled: boolean;
    turnstileSiteKey: string;
    turnstileSecret?: string;
    smtpHost: string;
    smtpPort: number;
    smtpSecurity: AdminAuthPolicy['smtpSecurity'];
    smtpSkipTlsVerify: boolean;
    smtpForceAuthLogin: boolean;
    smtpUsername: string;
    smtpFromAddress: string;
    smtpPassword?: string;
  }) =>
    adminRequest<AdminAuthPolicy>('PATCH', '/admin/auth-policy', data),
  testSmtp: (email: string) => adminRequest<{ verified: true }>('POST', '/admin/auth-policy/smtp-test', { email }),
  testTurnstile: (token: string) => adminRequest<{ verified: true }>('POST', '/admin/auth-policy/turnstile-test', { token }),
  invitationCodes: (query: { page?: number; pageSize?: number; status?: string }) =>
    adminRequest<AdminPage<AdminInvitationCode>>('GET', `/admin/invitation-codes${params(query)}`),
  createInvitationCode: (expiresAt?: string) => adminRequest<AdminInvitationCode>('POST', '/admin/invitation-codes', { expiresAt }),
  revokeInvitationCode: (id: string) => adminRequest<AdminInvitationCode>('DELETE', `/admin/invitation-codes/${id}`),
};
