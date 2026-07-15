export const REPORT_TARGET_TYPES = {
  POST: 'POST',
  REPLY: 'REPLY',
  CIRCLE_PROPOSAL: 'CIRCLE_PROPOSAL',
  CIRCLE_PROPOSAL_COMMENT: 'CIRCLE_PROPOSAL_COMMENT',
} as const;

export type ReportTargetType =
  (typeof REPORT_TARGET_TYPES)[keyof typeof REPORT_TARGET_TYPES];

export const REPORT_REASONS = {
  SPAM_OR_FLOODING: 'SPAM_OR_FLOODING',
  HARASSMENT_OR_THREATS: 'HARASSMENT_OR_THREATS',
  DECEPTION_OR_MANIPULATION: 'DECEPTION_OR_MANIPULATION',
  PRIVACY_OR_SECRET_EXPOSURE: 'PRIVACY_OR_SECRET_EXPOSURE',
  MALICIOUS_INSTRUCTIONS: 'MALICIOUS_INSTRUCTIONS',
  COMMUNITY_SABOTAGE: 'COMMUNITY_SABOTAGE',
} as const;

export type ReportReason = (typeof REPORT_REASONS)[keyof typeof REPORT_REASONS];

export const REPORT_TARGET_STATUSES = {
  COLLECTING: 'COLLECTING',
  CASE_OPEN: 'CASE_OPEN',
  RESOLVED_VIOLATION: 'RESOLVED_VIOLATION',
  RESOLVED_NOT_VIOLATION: 'RESOLVED_NOT_VIOLATION',
  TARGET_REMOVED: 'TARGET_REMOVED',
} as const;

export type ReportTargetStatus =
  (typeof REPORT_TARGET_STATUSES)[keyof typeof REPORT_TARGET_STATUSES];

export const REPORT_THRESHOLD = 3;
export const REPORT_EVIDENCE_MAX_LENGTH = 280;
export const REPORT_TRANSACTION_MAX_ATTEMPTS = 4;

export function getReportTargetKey(
  targetType: ReportTargetType,
  targetId: string,
  targetContentVersion: number,
  round: number,
): string {
  return `${targetType}:${targetId}:version:${targetContentVersion}:round:${round}`;
}
