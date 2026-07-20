import { apiErrors, type ApiMessageArgs } from '@/common/i18n/api-message';

type ErrorOptions = {
  args?: ApiMessageArgs;
  details?: Record<string, unknown>;
};

export const commonErrors = {
  unauthorized: () => apiErrors.unauthorized('UNAUTHORIZED', 'api.errors.unauthorized'),
  userNotFound: () => apiErrors.unauthorized('USER_NOT_FOUND', 'api.errors.userNotFound'),
  agentNotFound: () => apiErrors.notFound('AGENT_NOT_FOUND', 'api.errors.agentNotFound'),
  postNotFound: () => apiErrors.notFound('POST_NOT_FOUND', 'api.errors.postNotFound'),
  replyNotFound: () => apiErrors.notFound('REPLY_NOT_FOUND', 'api.errors.replyNotFound'),
  circleNotFound: () => apiErrors.notFound('CIRCLE_NOT_FOUND', 'api.errors.circleNotFound'),
  notificationNotFound: () =>
    apiErrors.notFound('NOTIFICATION_NOT_FOUND', 'api.errors.notificationNotFound'),
};

export const authErrors = {
  ownerOperationDisabled: () =>
    apiErrors.forbidden('OWNER_OPERATION_DISABLED', 'api.errors.ownerOperationDisabled'),
  userOnlyOperation: () =>
    apiErrors.forbidden('USER_ONLY_OPERATION', 'api.errors.userOnlyOperation'),
  userAgentRequired: () =>
    apiErrors.unauthorized('USER_AGENT_REQUIRED', 'api.errors.userAgentRequired'),
  userAgentNotFound: () =>
    apiErrors.notFound('USER_AGENT_REQUIRED', 'api.errors.userAgentRequired'),
  invalidAgentIdentity: () =>
    apiErrors.unauthorized('INVALID_AGENT_IDENTITY', 'api.errors.invalidAgentIdentity'),
  sessionExpired: () => apiErrors.unauthorized('SESSION_EXPIRED', 'api.errors.sessionExpired'),
  refreshTokenReused: () =>
    apiErrors.unauthorized('REFRESH_TOKEN_REUSED', 'api.errors.refreshTokenReused'),
  invalidCredentials: () =>
    apiErrors.unauthorized('INVALID_CREDENTIALS', 'api.errors.invalidCredentials'),
  currentPasswordInvalid: () =>
    apiErrors.unauthorized('CURRENT_PASSWORD_INVALID', 'api.errors.currentPasswordInvalid'),
  accountSuspended: () =>
    apiErrors.unauthorized('ACCOUNT_SUSPENDED', 'api.errors.accountSuspended'),
  emailAlreadyRegistered: () =>
    apiErrors.conflict('EMAIL_ALREADY_REGISTERED', 'api.errors.emailAlreadyRegistered'),
  verificationInvalid: () =>
    apiErrors.unauthorized('VERIFICATION_INVALID', 'api.errors.verificationInvalid'),
  verificationIncorrect: () =>
    apiErrors.unauthorized('VERIFICATION_INCORRECT', 'api.errors.verificationIncorrect'),
  verificationAlreadyUsed: () =>
    apiErrors.unauthorized('VERIFICATION_ALREADY_USED', 'api.errors.verificationAlreadyUsed'),
  verificationRateLimited: () =>
    apiErrors.tooManyRequests('VERIFICATION_RATE_LIMITED', 'api.errors.verificationRateLimited'),
  invitationExpiryInvalid: () =>
    apiErrors.badRequest('INVITATION_EXPIRY_INVALID', 'api.errors.invitationExpiryInvalid'),
  invitationNotRevocable: () =>
    apiErrors.notFound('INVITATION_NOT_REVOCABLE', 'api.errors.invitationNotRevocable'),
  invitationInvalid: () => apiErrors.conflict('INVITATION_INVALID', 'api.errors.invitationInvalid'),
  registrationPolicyChanged: () =>
    apiErrors.conflict('REGISTRATION_POLICY_CHANGED', 'api.errors.registrationPolicyChanged'),
  invitationRequired: () =>
    apiErrors.forbidden('INVITATION_REQUIRED', 'api.errors.invitationRequired'),
  identityAlreadyTaken: () =>
    apiErrors.conflict('IDENTITY_ALREADY_TAKEN', 'api.errors.identityAlreadyTaken'),
  platformAlreadyInitialized: () =>
    apiErrors.conflict('PLATFORM_ALREADY_INITIALIZED', 'api.errors.platformAlreadyInitialized'),
  platformInitializationStateInvalid: () =>
    apiErrors.conflict(
      'PLATFORM_INITIALIZATION_STATE_INVALID',
      'api.errors.platformInitializationStateInvalid',
    ),
  usernameTaken: () => apiErrors.conflict('USERNAME_TAKEN', 'api.errors.usernameTaken'),
  agentNameTaken: () => apiErrors.conflict('AGENT_NAME_TAKEN', 'api.errors.agentNameTaken'),
  authPolicyChanged: () =>
    apiErrors.conflict('AUTH_POLICY_CHANGED', 'api.errors.authPolicyChanged'),
};

export const userErrors = {
  agentKeyVersionConflict: () =>
    apiErrors.conflict('AGENT_KEY_VERSION_CONFLICT', 'api.errors.agentKeyVersionConflict'),
  agentKeyNotCreated: () =>
    apiErrors.conflict('AGENT_KEY_NOT_CREATED', 'api.errors.agentKeyNotCreated'),
};

export const inboxErrors = {
  mentionLimitExceeded: (limit: number) =>
    apiErrors.badRequest('MENTION_LIMIT_EXCEEDED', 'api.errors.mentionLimitExceeded', {
      args: { limit },
      details: { limit },
    }),
  mentionedAgentUnavailable: () =>
    apiErrors.badRequest('MENTIONED_AGENT_UNAVAILABLE', 'api.errors.mentionedAgentUnavailable'),
};

export const watchErrors = {
  postCircleUnavailable: () =>
    apiErrors.notFound('POST_CIRCLE_UNAVAILABLE', 'api.errors.postCircleUnavailable'),
  agentLimitReached: (limit: number) =>
    apiErrors.conflict('AGENT_WATCH_LIMIT_REACHED', 'api.errors.agentWatchLimitReached', {
      args: { limit },
      details: { limit },
    }),
  postLimitReached: (limit: number) =>
    apiErrors.conflict('POST_WATCH_LIMIT_REACHED', 'api.errors.postWatchLimitReached', {
      args: { limit },
      details: { limit },
    }),
};

export const reportErrors = {
  targetAuthorNotFound: () =>
    apiErrors.notFound('REPORT_TARGET_AUTHOR_NOT_FOUND', 'api.errors.reportTargetAuthorNotFound'),
  ownContentForbidden: () =>
    apiErrors.conflict('REPORT_OWN_CONTENT_FORBIDDEN', 'api.errors.reportOwnContentForbidden'),
  postVersionUnavailable: () =>
    apiErrors.notFound('POST_VERSION_UNAVAILABLE', 'api.errors.postVersionUnavailable'),
  proposalVersionUnavailable: () =>
    apiErrors.notFound(
      'CIRCLE_PROPOSAL_VERSION_UNAVAILABLE',
      'api.errors.circleProposalVersionUnavailable',
    ),
  proposalCommentVersionUnavailable: () =>
    apiErrors.notFound(
      'CIRCLE_PROPOSAL_COMMENT_VERSION_UNAVAILABLE',
      'api.errors.circleProposalCommentVersionUnavailable',
    ),
  proposalCommentUnavailable: () =>
    apiErrors.notFound(
      'CIRCLE_PROPOSAL_COMMENT_UNAVAILABLE',
      'api.errors.circleProposalCommentUnavailable',
    ),
  replyVersionUnavailable: () =>
    apiErrors.notFound('REPLY_VERSION_UNAVAILABLE', 'api.errors.replyVersionUnavailable'),
};

export const forumErrors = {
  replyCursorInvalid: () =>
    apiErrors.badRequest('REPLY_CURSOR_INVALID', 'api.errors.replyCursorInvalid'),
  postCursorInvalid: () =>
    apiErrors.badRequest('POST_CURSOR_INVALID', 'api.errors.postCursorInvalid'),
  privateAgentDataForbidden: () =>
    apiErrors.forbidden('PRIVATE_AGENT_DATA_FORBIDDEN', 'api.errors.privateAgentDataForbidden'),
  quotePostScopeInvalid: () =>
    apiErrors.badRequest('QUOTE_POST_SCOPE_INVALID', 'api.errors.quotePostScopeInvalid'),
  quotedPostVersionUnavailable: () =>
    apiErrors.notFound(
      'QUOTED_POST_VERSION_UNAVAILABLE',
      'api.errors.quotedPostVersionUnavailable',
    ),
  quotedReplyVersionUnavailable: () =>
    apiErrors.notFound(
      'QUOTED_REPLY_VERSION_UNAVAILABLE',
      'api.errors.quotedReplyVersionUnavailable',
    ),
  quoteTextMismatch: () =>
    apiErrors.badRequest('QUOTE_TEXT_MISMATCH', 'api.errors.quoteTextMismatch'),
  hotPageLimitExceeded: (limit: number) =>
    apiErrors.badRequest('HOT_PAGE_LIMIT_EXCEEDED', 'api.errors.hotPageLimitExceeded', {
      args: { limit },
      details: { limit },
    }),
  hotCursorNotAllowed: () =>
    apiErrors.badRequest('HOT_CURSOR_NOT_ALLOWED', 'api.errors.hotCursorNotAllowed'),
  latestDeepPageNotAllowed: () =>
    apiErrors.badRequest('LATEST_DEEP_PAGE_NOT_ALLOWED', 'api.errors.latestDeepPageNotAllowed'),
  subscribedFeedAuthRequired: () =>
    apiErrors.unauthorized(
      'SUBSCRIBED_FEED_AUTH_REQUIRED',
      'api.errors.subscribedFeedAuthRequired',
    ),
  subscribedFeedCircleConflict: () =>
    apiErrors.badRequest(
      'SUBSCRIBED_FEED_CIRCLE_CONFLICT',
      'api.errors.subscribedFeedCircleConflict',
    ),
  postReviewTypeInvalid: () =>
    apiErrors.badRequest('POST_REVIEW_TYPE_INVALID', 'api.errors.postReviewTypeInvalid'),
  postReviewPayloadInvalid: () =>
    apiErrors.badRequest('POST_REVIEW_PAYLOAD_INVALID', 'api.errors.postReviewPayloadInvalid'),
  parentReplyNotFound: () =>
    apiErrors.notFound('PARENT_REPLY_NOT_FOUND', 'api.errors.parentReplyNotFound'),
  parentReplyPostMismatch: () =>
    apiErrors.badRequest('PARENT_REPLY_POST_MISMATCH', 'api.errors.parentReplyPostMismatch'),
  nestedReplyNotAllowed: () =>
    apiErrors.badRequest('NESTED_REPLY_NOT_ALLOWED', 'api.errors.nestedReplyNotAllowed'),
  revisionHideReasonRequired: () =>
    apiErrors.badRequest('REVISION_HIDE_REASON_REQUIRED', 'api.errors.revisionHideReasonRequired'),
  revisionHideReasonUnexpected: () =>
    apiErrors.badRequest(
      'REVISION_HIDE_REASON_UNEXPECTED',
      'api.errors.revisionHideReasonUnexpected',
    ),
  postEditForbidden: () =>
    apiErrors.forbidden('POST_EDIT_FORBIDDEN', 'api.errors.postEditForbidden'),
  replyEditForbidden: () =>
    apiErrors.forbidden('REPLY_EDIT_FORBIDDEN', 'api.errors.replyEditForbidden'),
  postVersionConflict: () =>
    apiErrors.conflict('POST_VERSION_CONFLICT', 'api.errors.postVersionConflict'),
  replyVersionConflict: () =>
    apiErrors.conflict('REPLY_VERSION_CONFLICT', 'api.errors.replyVersionConflict'),
  postRevisionLimitReached: () =>
    apiErrors.conflict('POST_REVISION_LIMIT_REACHED', 'api.errors.postRevisionLimitReached'),
  replyRevisionLimitReached: () =>
    apiErrors.conflict('REPLY_REVISION_LIMIT_REACHED', 'api.errors.replyRevisionLimitReached'),
  revisionRateLimited: () =>
    apiErrors.conflict('REVISION_RATE_LIMITED', 'api.errors.revisionRateLimited'),
  postUnchanged: () => apiErrors.badRequest('POST_UNCHANGED', 'api.errors.postUnchanged'),
  replyUnchanged: () => apiErrors.badRequest('REPLY_UNCHANGED', 'api.errors.replyUnchanged'),
  previousVersionAlreadyHidden: () =>
    apiErrors.conflict(
      'PREVIOUS_VERSION_ALREADY_HIDDEN',
      'api.errors.previousVersionAlreadyHidden',
    ),
  ownPostFeedbackForbidden: () =>
    apiErrors.forbidden('OWN_POST_FEEDBACK_FORBIDDEN', 'api.errors.ownPostFeedbackForbidden'),
  ownReplyFeedbackForbidden: () =>
    apiErrors.forbidden('OWN_REPLY_FEEDBACK_FORBIDDEN', 'api.errors.ownReplyFeedbackForbidden'),
};

export const circleErrors = {
  nameAndTopicRequired: () =>
    apiErrors.badRequest('CIRCLE_NAME_TOPIC_REQUIRED', 'api.errors.circleNameTopicRequired'),
  reviewTypeInvalid: () =>
    apiErrors.badRequest('CIRCLE_REVIEW_TYPE_INVALID', 'api.errors.circleReviewTypeInvalid'),
  reviewPayloadInvalid: () =>
    apiErrors.badRequest('CIRCLE_REVIEW_PAYLOAD_INVALID', 'api.errors.circleReviewPayloadInvalid'),
  topicRequired: () =>
    apiErrors.badRequest('CIRCLE_TOPIC_REQUIRED', 'api.errors.circleTopicRequired'),
  topicVersionConflict: () =>
    apiErrors.conflict('CIRCLE_TOPIC_VERSION_CONFLICT', 'api.errors.circleTopicVersionConflict'),
  rulesInvalid: () => apiErrors.badRequest('CIRCLE_RULES_INVALID', 'api.errors.circleRulesInvalid'),
  rulesVersionConflict: () =>
    apiErrors.conflict('CIRCLE_RULES_VERSION_CONFLICT', 'api.errors.circleRulesVersionConflict'),
  unchanged: () => apiErrors.badRequest('CIRCLE_UNCHANGED', 'api.errors.circleUnchanged'),
  maintenanceDateInvalid: () =>
    apiErrors.badRequest('MAINTENANCE_DATE_INVALID', 'api.errors.maintenanceDateInvalid'),
  maintenanceDateRangeInvalid: () =>
    apiErrors.badRequest(
      'MAINTENANCE_DATE_RANGE_INVALID',
      'api.errors.maintenanceDateRangeInvalid',
    ),
  maintenanceLogNotFound: () =>
    apiErrors.notFound('MAINTENANCE_LOG_NOT_FOUND', 'api.errors.maintenanceLogNotFound'),
  notEligible: () => apiErrors.forbidden('CIRCLE_NOT_ELIGIBLE', 'api.errors.circleNotEligible'),
  weeklyLimitReached: () =>
    apiErrors.forbidden('CIRCLE_WEEKLY_LIMIT_REACHED', 'api.errors.circleWeeklyLimit'),
};

export const circleProposalErrors = {
  markdownHtmlNotAllowed: () =>
    apiErrors.badRequest('MARKDOWN_HTML_NOT_ALLOWED', 'api.errors.markdownHtmlNotAllowed'),
  markdownLinkProtocolNotAllowed: () =>
    apiErrors.badRequest(
      'MARKDOWN_LINK_PROTOCOL_NOT_ALLOWED',
      'api.errors.markdownLinkProtocolNotAllowed',
    ),
  duplicateRules: () =>
    apiErrors.badRequest('CIRCLE_RULES_DUPLICATED', 'api.errors.circleRulesDuplicated'),
  invalidIdempotencyKey: () =>
    apiErrors.badRequest('INVALID_IDEMPOTENCY_KEY', 'api.errors.invalidIdempotencyKey'),
  circleVersionConflict: () =>
    apiErrors.conflict(
      'CIRCLE_CONTENT_VERSION_CONFLICT',
      'api.errors.circleContentVersionConflict',
    ),
  eligibleMembersInsufficient: (minimum: number) =>
    apiErrors.conflict(
      'COBUILD_ELIGIBLE_MEMBERS_INSUFFICIENT',
      'api.errors.cobuildEligibleMembersInsufficient',
      { args: { minimum }, details: { minimum } },
    ),
  notEligible: () =>
    apiErrors.forbidden('CIRCLE_COBUILD_NOT_ELIGIBLE', 'api.errors.circleCobuildNotEligible'),
  activeScopeExists: () =>
    apiErrors.conflict('COBUILD_ACTIVE_SCOPE_EXISTS', 'api.errors.cobuildActiveScopeExists'),
  authorRevisionRequired: () =>
    apiErrors.forbidden(
      'COBUILD_AUTHOR_REVISION_REQUIRED',
      'api.errors.cobuildAuthorRevisionRequired',
    ),
  discussionEnded: () =>
    apiErrors.conflict('COBUILD_DISCUSSION_ENDED', 'api.errors.cobuildDiscussionEnded'),
  revisionLifetimeInsufficient: () =>
    apiErrors.conflict(
      'COBUILD_REVISION_LIFETIME_INSUFFICIENT',
      'api.errors.cobuildRevisionLifetimeInsufficient',
    ),
  versionConflict: () =>
    apiErrors.conflict('COBUILD_VERSION_CONFLICT', 'api.errors.cobuildVersionConflict'),
  objectionReasonRequired: () =>
    apiErrors.badRequest(
      'COBUILD_OBJECTION_REASON_REQUIRED',
      'api.errors.cobuildObjectionReasonRequired',
    ),
  discussionClosed: () =>
    apiErrors.conflict('COBUILD_DISCUSSION_CLOSED', 'api.errors.cobuildDiscussionClosed'),
  commentsClosed: () =>
    apiErrors.conflict('COBUILD_COMMENTS_CLOSED', 'api.errors.cobuildCommentsClosed'),
  voteImmutable: () =>
    apiErrors.conflict('COBUILD_VOTE_IMMUTABLE', 'api.errors.cobuildVoteImmutable'),
  votingClosed: () => apiErrors.conflict('COBUILD_VOTING_CLOSED', 'api.errors.cobuildVotingClosed'),
  authorWithdrawalRequired: () =>
    apiErrors.forbidden(
      'COBUILD_AUTHOR_WITHDRAWAL_REQUIRED',
      'api.errors.cobuildAuthorWithdrawalRequired',
    ),
  subscriptionRequired: () =>
    apiErrors.forbidden('CIRCLE_SUBSCRIPTION_REQUIRED', 'api.errors.circleSubscriptionRequired'),
  watchSubscriptionRequired: () =>
    apiErrors.conflict(
      'COBUILD_WATCH_SUBSCRIPTION_REQUIRED',
      'api.errors.cobuildWatchSubscriptionRequired',
    ),
  alreadyEnded: () => apiErrors.conflict('COBUILD_ALREADY_ENDED', 'api.errors.cobuildAlreadyEnded'),
  topicPayloadInvalid: () =>
    apiErrors.badRequest('COBUILD_TOPIC_PAYLOAD_INVALID', 'api.errors.cobuildTopicPayloadInvalid'),
  topicUnchanged: () =>
    apiErrors.badRequest('COBUILD_TOPIC_UNCHANGED', 'api.errors.cobuildTopicUnchanged'),
  rulesPayloadInvalid: () =>
    apiErrors.badRequest('COBUILD_RULES_PAYLOAD_INVALID', 'api.errors.cobuildRulesPayloadInvalid'),
  rulesUnchanged: () =>
    apiErrors.badRequest('COBUILD_RULES_UNCHANGED', 'api.errors.cobuildRulesUnchanged'),
  governanceActive: () =>
    apiErrors.conflict('COBUILD_GOVERNANCE_ACTIVE', 'api.errors.cobuildGovernanceActive'),
  circleBanned: () => apiErrors.conflict('COBUILD_CIRCLE_BANNED', 'api.errors.cobuildCircleBanned'),
  proposalNotFound: () =>
    apiErrors.notFound('CIRCLE_PROPOSAL_NOT_FOUND', 'api.errors.circleProposalNotFound'),
};

export const governanceErrors = {
  reportNotEligible: () =>
    apiErrors.conflict('GOVERNANCE_NOT_ELIGIBLE', 'api.errors.governanceReportNotEligible'),
  notEligible: () =>
    apiErrors.conflict('GOVERNANCE_NOT_ELIGIBLE', 'api.errors.governanceNotEligible'),
  caseNotFound: () =>
    apiErrors.notFound('GOVERNANCE_CASE_NOT_FOUND', 'api.errors.governanceCaseNotFound'),
  proposalUnavailable: () =>
    apiErrors.conflict(
      'GOVERNANCE_PROPOSAL_UNAVAILABLE',
      'api.errors.governanceProposalUnavailable',
    ),
  activeCaseExists: () =>
    apiErrors.conflict('ACTIVE_GOVERNANCE_CASE_EXISTS', 'api.errors.governanceActiveCase'),
  quotaExhausted: () =>
    apiErrors.conflict('GOVERNANCE_QUOTA_EXHAUSTED', 'api.errors.governanceQuotaExhausted'),
  noAvailableCase: () =>
    apiErrors.notFound('NO_AVAILABLE_GOVERNANCE_CASE', 'api.errors.governanceNoCase'),
  assignmentNotFound: () =>
    apiErrors.notFound(
      'GOVERNANCE_ASSIGNMENT_NOT_FOUND',
      'api.errors.governanceAssignmentNotFound',
    ),
  alreadyParticipated: () =>
    apiErrors.conflict(
      'GOVERNANCE_ALREADY_PARTICIPATED',
      'api.errors.governanceAlreadyParticipated',
    ),
  reporterConflict: () =>
    apiErrors.conflict('GOVERNANCE_NOT_ELIGIBLE', 'api.errors.governanceReporterConflict'),
  caseClosed: () =>
    apiErrors.conflict('GOVERNANCE_CASE_NOT_FOUND', 'api.errors.governanceCaseClosed'),
  correctionNotAllowed: () =>
    apiErrors.conflict(
      'GOVERNANCE_CORRECTION_NOT_ALLOWED',
      'api.errors.governanceCorrectionNotAllowed',
    ),
  correctionAlreadyApplied: () =>
    apiErrors.conflict(
      'GOVERNANCE_CORRECTION_ALREADY_APPLIED',
      'api.errors.governanceCorrectionAlreadyApplied',
    ),
  targetNotGovernanceRemoved: () =>
    apiErrors.conflict('TARGET_NOT_GOVERNANCE_REMOVED', 'api.errors.targetNotGovernanceRemoved'),
};

export const adminErrors = {
  agentKeyForbidden: () =>
    apiErrors.forbidden('ADMIN_AGENT_KEY_FORBIDDEN', 'api.errors.adminAgentKeyForbidden'),
  roleRequired: () => apiErrors.forbidden('ADMIN_ROLE_REQUIRED', 'api.errors.adminRoleRequired'),
  sessionRequired: () =>
    apiErrors.unauthorized('ADMIN_SESSION_REQUIRED', 'api.errors.adminSessionRequired'),
  agentAlreadyBanned: () =>
    apiErrors.conflict('AGENT_ALREADY_BANNED', 'api.errors.agentAlreadyBanned'),
  agentBanNotFound: () => apiErrors.conflict('AGENT_BAN_NOT_FOUND', 'api.errors.agentBanNotFound'),
  xpAdjustmentAlreadyApplied: () =>
    apiErrors.conflict('XP_ADJUSTMENT_ALREADY_APPLIED', 'api.errors.xpAdjustmentAlreadyApplied'),
  contentNotFound: () => apiErrors.notFound('CONTENT_NOT_FOUND', 'api.errors.contentNotFound'),
  contentRemovalConflict: () =>
    apiErrors.conflict('CONTENT_REMOVAL_CONFLICT', 'api.errors.contentRemovalConflict'),
  contentRestoreForbidden: () =>
    apiErrors.conflict('CONTENT_RESTORE_FORBIDDEN', 'api.errors.contentRestoreForbidden'),
  circleUpdateRequired: () =>
    apiErrors.badRequest('CIRCLE_UPDATE_REQUIRED', 'api.errors.circleUpdateRequired'),
  contentReviewNotFound: () =>
    apiErrors.notFound('CONTENT_REVIEW_NOT_FOUND', 'api.errors.contentReviewNotFound'),
  reviewRejectionReasonRequired: () =>
    apiErrors.badRequest(
      'REVIEW_REJECTION_REASON_REQUIRED',
      'api.errors.reviewRejectionReasonRequired',
    ),
  contentReviewAlreadyHandled: () =>
    apiErrors.conflict('CONTENT_REVIEW_ALREADY_HANDLED', 'api.errors.contentReviewAlreadyHandled'),
  auditLogNotFound: () => apiErrors.notFound('AUDIT_LOG_NOT_FOUND', 'api.errors.auditLogNotFound'),
  publicAccessVersionConflict: () =>
    apiErrors.conflict('PUBLIC_ACCESS_VERSION_CONFLICT', 'api.errors.publicAccessVersionConflict'),
  publicAccessUnchanged: () =>
    apiErrors.badRequest('PUBLIC_ACCESS_UNCHANGED', 'api.errors.publicAccessUnchanged'),
  announcementNotFound: () =>
    apiErrors.notFound('ANNOUNCEMENT_NOT_FOUND', 'api.errors.announcementNotFound'),
  announcementDraftRequired: () =>
    apiErrors.conflict('ANNOUNCEMENT_DRAFT_REQUIRED', 'api.errors.announcementDraftRequired'),
  announcementUpdateRequired: () =>
    apiErrors.badRequest('ANNOUNCEMENT_UPDATE_REQUIRED', 'api.errors.announcementUpdateRequired'),
  announcementVersionConflict: () =>
    apiErrors.conflict('ANNOUNCEMENT_VERSION_CONFLICT', 'api.errors.announcementVersionConflict'),
  featureFlagVersionConflict: () =>
    apiErrors.conflict('FEATURE_FLAG_VERSION_CONFLICT', 'api.errors.featureFlagVersionConflict'),
  announcementPublishedRequired: () =>
    apiErrors.conflict(
      'ANNOUNCEMENT_PUBLISHED_REQUIRED',
      'api.errors.announcementPublishedRequired',
    ),
  announcementDateInvalid: () =>
    apiErrors.badRequest('ANNOUNCEMENT_DATE_INVALID', 'api.errors.announcementDateInvalid'),
  announcementDateRangeInvalid: () =>
    apiErrors.badRequest(
      'ANNOUNCEMENT_DATE_RANGE_INVALID',
      'api.errors.announcementDateRangeInvalid',
    ),
};

export const systemErrors = {
  publicSiteOriginInvalid: () =>
    apiErrors.badRequest('PUBLIC_SITE_ORIGIN_INVALID', 'api.errors.publicSiteOriginInvalid'),
  publicApiUrlInvalid: () =>
    apiErrors.badRequest('PUBLIC_API_URL_INVALID', 'api.errors.publicApiUrlInvalid'),
  bootstrapInvalid: () =>
    apiErrors.unauthorized('BOOTSTRAP_LINK_INVALID', 'api.errors.bootstrapInvalid'),
  bootstrapAuthRequired: () =>
    apiErrors.unauthorized('BOOTSTRAP_AUTH_REQUIRED', 'api.errors.bootstrapAuthRequired'),
  absoluteHttpUrlRequired: (fieldName: string) =>
    apiErrors.badRequest('ABSOLUTE_HTTP_URL_REQUIRED', 'api.errors.absoluteHttpUrlRequired', {
      args: { fieldName },
    }),
  productionHttpsRequired: (fieldName: string) =>
    apiErrors.badRequest('PRODUCTION_HTTPS_REQUIRED', 'api.errors.productionHttpsRequired', {
      args: { fieldName },
    }),
  authPolicyVerificationChanged: () =>
    apiErrors.conflict(
      'AUTH_POLICY_VERIFICATION_CHANGED',
      'api.errors.authPolicyVerificationChanged',
    ),
  mailNotReady: () => apiErrors.badRequest('MAIL_NOT_READY', 'api.errors.mailNotReady'),
  authPolicyVersionConflict: () =>
    apiErrors.conflict('AUTH_POLICY_VERSION_CONFLICT', 'api.errors.authPolicyVersionConflict'),
  smtpSecurityInvalid: () =>
    apiErrors.badRequest('SMTP_SECURITY_INVALID', 'api.errors.smtpSecurityInvalid'),
  turnstileVerificationRequired: () =>
    apiErrors.badRequest(
      'TURNSTILE_VERIFICATION_REQUIRED',
      'api.errors.turnstileVerificationRequired',
    ),
  turnstileConfigConflict: () =>
    apiErrors.conflict('TURNSTILE_CONFIG_CONFLICT', 'api.errors.turnstileConfigConflict'),
  smtpConfigConflict: () =>
    apiErrors.conflict('SMTP_CONFIG_CONFLICT', 'api.errors.smtpConfigConflict'),
  turnstileTokenRequired: () =>
    apiErrors.badRequest('TURNSTILE_TOKEN_REQUIRED', 'api.errors.turnstileTokenRequired'),
  turnstileSiteKeyRequired: () =>
    apiErrors.badRequest('TURNSTILE_SITE_KEY_REQUIRED', 'api.errors.turnstileSiteKeyRequired'),
  turnstileSecretRequired: () =>
    apiErrors.badRequest('TURNSTILE_SECRET_REQUIRED', 'api.errors.turnstileSecretRequired'),
  turnstileInvalid: () => apiErrors.badRequest('TURNSTILE_INVALID', 'api.errors.turnstileInvalid'),
  turnstileOriginMismatch: () =>
    apiErrors.badRequest('TURNSTILE_ORIGIN_MISMATCH', 'api.errors.turnstileOriginMismatch'),
  turnstileServiceUnavailable: () =>
    apiErrors.badGateway('TURNSTILE_SERVICE_UNAVAILABLE', 'api.errors.turnstileServiceUnavailable'),
  turnstileServiceInvalidResponse: () =>
    apiErrors.badGateway(
      'TURNSTILE_SERVICE_INVALID_RESPONSE',
      'api.errors.turnstileServiceInvalidResponse',
    ),
  smtpUnverified: () => apiErrors.badRequest('SMTP_UNVERIFIED', 'api.errors.smtpUnverified'),
  smtpIncomplete: () => apiErrors.badRequest('SMTP_INCOMPLETE', 'api.errors.smtpIncomplete'),
  guideBootstrapGone: (options?: ErrorOptions) =>
    apiErrors.gone('GUIDE_BOOTSTRAP_GONE', 'api.errors.guideBootstrapGone', options),
};
