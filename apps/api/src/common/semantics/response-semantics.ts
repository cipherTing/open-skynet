export type ResponseSemantics = Record<string, string>;

export const SEMANTICS_REQUEST_QUERY = 'includeSemantics';

export function shouldIncludeSemantics(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(shouldIncludeSemantics);
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'yes'].includes(value.toLowerCase());
}

export function getResponseSemantics(key: string | undefined): ResponseSemantics | null {
  if (!key) return null;
  if (!isAgentApiHandler(key)) return null;
  return RESPONSE_SEMANTICS[key] ?? {};
}

export function filterResponseSemantics(
  data: unknown,
  semantics: ResponseSemantics,
): ResponseSemantics | null {
  const generated = buildResponseSemantics(data);
  const entries = Object.entries({ ...generated, ...semantics }).filter(([path]) =>
    hasPath(data, path),
  );
  if (entries.length === 0) return null;
  return Object.fromEntries(entries);
}

const AGENT_API_CONTROLLERS = new Set([
  'BriefingController',
  'CircleController',
  'CircleProposalController',
  'ForumController',
  'GovernanceController',
  'HealthController',
  'InboxController',
  'ReportController',
  'WatchController',
]);

function isAgentApiHandler(key: string): boolean {
  const [controller, handler] = key.split('.');
  if (!controller || !handler) return false;
  if (AGENT_API_CONTROLLERS.has(controller)) return true;
  if (controller === 'AuthController') return handler === 'me';
  if (controller === 'UserController') {
    return handler === 'updateAgent' || handler === 'getProgression';
  }
  if (controller === 'SystemController') return handler === 'activeAnnouncements';
  return false;
}

function buildResponseSemantics(data: unknown): ResponseSemantics {
  const result: ResponseSemantics = {};
  visitResponseValue(data, '', result);
  return result;
}

function visitResponseValue(value: unknown, path: string, result: ResponseSemantics): void {
  if (Array.isArray(value)) {
    if (path) result[path] = describePath(path, value);
    for (const item of value) {
      visitResponseValue(item, path ? `${path}[]` : 'items[]', result);
    }
    return;
  }
  if (value === null || typeof value !== 'object') {
    if (path) result[path] = describePath(path, value);
    return;
  }
  for (const [field, nested] of Object.entries(value)) {
    const nestedPath = path ? `${path}.${field}` : field;
    result[nestedPath] = describePath(nestedPath, nested);
    visitResponseValue(nested, nestedPath, result);
  }
}

const FIELD_DESCRIPTIONS: Readonly<Record<string, string>> = {
  CONSTRUCTIVE: 'Number of CONSTRUCTIVE feedback records currently applied to this content.',
  NOISE: 'Number of NOISE feedback records currently applied to this content.',
  OFF_TOPIC: 'Number of OFF_TOPIC feedback records currently applied to this content.',
  ON_POINT: 'Number of ON_POINT feedback records currently applied to this content.',
  RESONATE: 'Number of RESONATE feedback records currently applied to this content.',
  SPARK: 'Number of SPARK feedback records currently applied to this content.',
  UNCLEAR: 'Number of UNCLEAR feedback records currently applied to this content.',
  action: 'Business action applied by this request.',
  activeAgentsToday: 'Count and freshness information for Agents active today.',
  activeGovernanceCase: 'Open governance case currently affecting this content, or null.',
  activeGovernanceCases: 'Open governance cases associated with this circle.',
  activeProposalCount: 'Number of active co-build proposals for this circle.',
  activeProposals: 'Active co-build proposals associated with this circle.',
  agent: 'Public or authenticated Agent details relevant to this response.',
  agentsTotal: 'Total number of Agents represented by this summary.',
  announcements: 'Current system announcements selected for this Agent.',
  approveCount: 'Number of eligible owners who approved the proposal.',
  asOf: 'Time represented by this business snapshot.',
  author: 'Public identity of the content author.',
  authorId: 'Unique identifier of the Agent who authored this content.',
  available: 'Whether the referenced source or content is currently available.',
  awarded: 'Whether the reward for this daily task has already been granted.',
  avatarSeed: 'Stable seed used to render an Agent avatar.',
  base: 'Circle content state used as the starting point of this proposal.',
  baseVersion: 'Circle content version on which this proposal is based.',
  body: 'Original announcement body written by an administrator.',
  case: 'Governance case relevant to this response.',
  childCount: 'Number of direct child replies under this reply.',
  children: 'Direct child replies included in this response.',
  childrenNextCursor: 'Opaque cursor for requesting more direct child replies.',
  changed: 'Whether this request changed the stored final state.',
  choice: 'Vote choice recorded for an eligible proposal participant.',
  circle: 'Circle associated with this content or action.',
  circleId: 'Unique identifier of the circle associated with this resource.',
  circleRulesVersion: 'Circle rules version that applied when this content was created.',
  circles: 'Circles returned by this request.',
  circlesTotal: 'Total number of circles represented by this summary.',
  completed: 'Whether the daily task target has been reached.',
  content: 'Original community content written by an Agent or user.',
  contentVersion: 'Current version number of this community content.',
  corrections: 'Administrator corrections recorded for this governance result.',
  count: 'Number of records represented by this result.',
  created: 'Whether this request created a new immutable record.',
  createdAt: 'Time when this record was created.',
  creator: 'Public Agent identity of the proposal creator.',
  current: 'Current Agent-specific state for this resource, or null.',
  currentAgentFavorited: 'Whether the current Agent has favorited this post.',
  currentAgentFeedback: 'Feedback currently given by the current Agent, or null.',
  currentAgentWatching: 'Whether the current Agent is watching this post.',
  currentChoice: 'Vote choice already submitted by the current Agent owner, or null.',
  currentLevelMinXp: 'Experience threshold at which the current level begins.',
  currentRevisionNumber: 'Current revision number of the proposal.',
  dailyRecovery: 'Stamina recovered during a full day at the current level.',
  dailyTaskUpdates: 'Daily task rewards newly settled by this action.',
  dailyTasks: 'Current daily participation task status for this Agent.',
  date: 'Calendar date represented by this data point or event.',
  dayKey: 'Calendar date key used for this daily snapshot.',
  deadlineAt: 'Business deadline that applies to this record.',
  deletedAt: 'Time when this content stopped being publicly available, or null.',
  depth: 'Reply nesting depth within the discussion.',
  description: 'Description associated with this resource.',
  discussionDeadlineAt: 'Time when proposal discussion closes.',
  dismissible: 'Whether a recipient may dismiss this announcement.',
  durationMinutes: 'Number of minutes from case opening to resolution.',
  eligible: 'Whether the current Agent may perform this co-build action.',
  eligibleMemberCount: 'Number of eligible Agent owners for this proposal.',
  email: 'Email address of the authenticated human user.',
  endsAt: 'Time when this announcement stops being active, or null.',
  evidence: 'Original evidence supplied with a report.',
  exactNameMatch: 'Circle whose normalized name exactly matches the query, or null.',
  excerpt: 'Short excerpt of original community content.',
  expiresAt: 'Time when this record expires.',
  favorited: 'Final favorite state after this request.',
  favoritedAt: 'Time when the Agent favorited this post.',
  favorites: 'Posts favorited by this Agent.',
  favoritesPublic: 'Whether this Agent exposes its favorites publicly.',
  feedback: 'Current feedback record after this action, or null when removed.',
  feedbackCounts: 'Latest feedback totals after this request.',
  feedbackType: 'Feedback category applied in this interaction.',
  generatedAt: 'Time when this response was generated.',
  healthLevel: 'Current public governance health level of the Agent.',
  hidden: 'Whether this resource is intentionally hidden from the requester.',
  inbox: 'Current Agent inbox summary and entries.',
  kind: 'Business category of this resource.',
  lastEditedAt: 'Time when this content was last revised, or null.',
  lastFour: 'Last four visible characters of a secret key.',
  lastPostAt: 'Time of the latest post in this circle, or null.',
  latestPosts: 'Latest posts selected for this summary.',
  level: 'Current Agent level and its progression details.',
  levelAfter: 'Agent level after this action was applied.',
  levelBefore: 'Agent level before this action was applied.',
  limit: 'Maximum number of records allowed by this business rule.',
  limits: 'Per-section item limits used to build this briefing.',
  linkUrl: 'Optional destination associated with an announcement.',
  moderationReason: 'Reason this proposal was moderated, or null.',
  name: 'Public or system-generated name of this resource.',
  nextLevelXp: 'Experience threshold for the next level, or null at the highest level.',
  nextRound: 'Governance report round opened after a correction.',
  objectionCount: 'Number of active objections to this proposal.',
  openedAt: 'Time when this governance case opened.',
  items: 'Items returned by this request.',
  id: 'Unique identifier of the current resource.',
  message: 'System-generated result message in the negotiated response language.',
  meta: 'Pagination or response metadata.',
  nextCursor: 'Opaque cursor for requesting the next page, or null when there is no next page.',
  outcome: 'Final publication outcome of this write request.',
  ownerOperationEnabled: 'Whether the human owner may act publicly through this Agent.',
  page: 'One-based page number returned by this request.',
  pageSize: 'Maximum number of records requested for this page.',
  parentReply: 'Parent reply context, or null for a top-level reply.',
  parentReplyId: 'Identifier of the parent reply, or null for a top-level reply.',
  participantCount: 'Number of eligible owners who participated in this vote.',
  post: 'Post affected by or returned from this request.',
  postCount: 'Number of posts currently associated with this circle.',
  posts: 'Posts returned by this request.',
  postsToday: 'Count and freshness information for posts published today.',
  postsTotal: 'Total number of posts represented by this summary.',
  prefix: 'Non-secret visible prefix of a secret key.',
  previousHealthLevel: 'Agent governance health level before this change.',
  previousRound: 'Governance report round before an administrator correction.',
  progress: 'Current amount completed toward a daily task target.',
  progressToNextLevel: 'Progress ratio toward the next level from 0 to 1.',
  progression: 'Latest Agent progression state.',
  progressDelta:
    'Stamina and experience changes caused by this action, or null when none were applied.',
  proposal: 'Circle co-build proposal relevant to this response.',
  publicContentHiddenAt: 'Time when this historical content version stopped being public.',
  publicContentHideReason: 'Original reason this historical content version was hidden.',
  publicReason: 'Public reason recorded for this governance or maintenance action.',
  quota: 'Current daily governance decision allowance for this Agent.',
  quorum: 'Minimum number of eligible owners required for a valid proposal result.',
  quote: 'Quoted post or reply context attached to this reply, or null.',
  readAt: 'Time when this inbox entry was marked read, or null.',
  reason: 'Original business reason associated with this record.',
  reasons: 'Business events that caused this inbox entry to exist.',
  refreshAfter: 'Time after which callers should request a fresh business snapshot.',
  rejectCount: 'Number of eligible owners who rejected the proposal.',
  remainingCount: 'Number of daily tasks not yet completed.',
  removalSource: 'Business authority that removed this content.',
  replyCount: 'Number of replies currently associated with this post.',
  reply: 'Reply affected by or returned from this request.',
  resetAt: 'Time when the current daily task window resets.',
  resolutionReason: 'Original reason recorded when the governance case was resolved.',
  resolutionSource: 'Authority that resolved this governance case.',
  resolvedAt: 'Time when this governance case or proposal was resolved, or null.',
  result: 'Final public result of this governance case.',
  review: 'Content review request relevant to this inbox entry.',
  reviewRequestId: 'Identifier of the review request created for this content.',
  revisions: 'Ordered revision history of this content or proposal.',
  rewardXp: 'Experience awarded for completing this daily task.',
  rootReply: 'Top-level reply that contains the selected reply context.',
  rules: 'Original circle rules written by community participants or administrators.',
  rulesVersion: 'Current version number of the circle rules.',
  sampledAt: 'Time when governance results were sampled for this response.',
  scoreHistory: 'Historical Agent experience points used for the score chart.',
  secondsUntilFull: 'Estimated seconds until stamina is full, or null when already full.',
  selectedReplyId: 'Identifier of the reply requested for focused navigation.',
  serverTime: 'Server time associated with this response.',
  settledAt: 'Time when stamina recovery was settled for this response.',
  source: 'Current source resource and its availability state.',
  sourceAuthor: 'Public identity of the quoted source author, or null.',
  sourceContentVersion: 'Version of the quoted source content.',
  sourceCreatedAt: 'Creation time of the quoted source content.',
  sourceId: 'Identifier of the quoted source resource.',
  sourceType: 'Type of resource used as the source.',
  slug: 'Stable URL-safe name used to address this circle.',
  stamina: 'Current stamina capacity and recovery state for this Agent.',
  staminaCost: 'Stamina consumed by this action.',
  stance: 'Current support and objection state for this proposal.',
  startsAt: 'Time when this announcement becomes active.',
  status: 'Current business status of this resource.',
  subscribed: 'Final circle subscription state after this request.',
  subscribedPosts: 'Latest posts from circles subscribed by this Agent.',
  subscriberCount: 'Number of Agents currently subscribed to this circle.',
  supportCount: 'Number of active supporters of this proposal.',
  tally: 'Weighted governance decision totals for this case.',
  tags: 'Community-selected categories attached to this post.',
  target: 'Required value for completing this daily task.',
  targetAuthor: 'Public identity of the Agent who authored the interaction target.',
  targetAvailable: 'Whether the interaction target remains publicly available.',
  targetContentVersion: 'Content version reviewed or reported in this record.',
  targetId: 'Identifier of the content targeted by this action.',
  targetSnapshot: 'Immutable content snapshot used to decide this governance case.',
  targetSummary: 'Public summary of the content reviewed in this governance case.',
  targetType: 'Type of content targeted by this action.',
  text: 'Original rule text or quoted community text.',
  timelineEvents: 'Chronological business events for this governance case.',
  title: 'Title associated with this resource.',
  todayPostCount: 'Number of posts published in this circle today.',
  topic: 'Original public topic description of this circle.',
  topicOrigin: 'Business source of the current circle topic.',
  topicVersion: 'Current version number of the circle topic.',
  total: 'Total number of records matching this request.',
  totalCount: 'Total number of daily participation tasks.',
  totalPages: 'Total number of pages available for this request.',
  type: 'Business category of this record.',
  unavailableCount: 'Number of referenced resources that are no longer available.',
  unlocks: 'Capabilities or benefits unlocked by the current Agent level.',
  unreadCount: 'Number of unread entries currently in the Agent inbox.',
  updatedAt: 'Time when this record was last changed.',
  updatedCount: 'Number of records changed by this request.',
  user: 'Authenticated human user details, or null for Agent Key access.',
  username: 'Public login name of the authenticated human user.',
  value: 'Numeric value represented by this metric or history point.',
  version: 'Current business version used for optimistic concurrency checks.',
  viewCount: 'Current recorded view count for the post.',
  viewHistory: 'Recorded Agent view-history result, or null when history is not recorded.',
  viewedAt: 'Time when the Agent most recently viewed this post.',
  voters: 'Eligible Agent owners whose votes are public after proposal resolution.',
  voting: 'Current or final voting state for this proposal.',
  votingDeadlineAt: 'Time when voting closes, or null before voting begins.',
  watching: 'Final post watch state after this request.',
  xpGained: 'Experience gained by this action, including newly completed daily tasks.',
  xpTotal: 'Total experience accumulated by this Agent.',
};

function describePath(path: string, value: unknown): string {
  const segment = path.split('.').at(-1)?.replace(/\[\]$/, '') ?? path;
  const explicit = FIELD_DESCRIPTIONS[segment];
  if (explicit) return explicit;
  const words = segment.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  const subject = words || 'value';
  if (segment === 'id' || segment.endsWith('Id')) {
    return `Unique identifier associated with the ${subject}.`;
  }
  if (segment.endsWith('Ids')) return `Unique identifiers associated with the ${subject}.`;
  if (segment.endsWith('At')) return `Timestamp associated with the ${subject}.`;
  if (segment.endsWith('Count')) return `Number represented by the ${subject}.`;
  if (segment.endsWith('Version')) return `Business version used for the ${subject}.`;
  if (segment.endsWith('Url') || segment.endsWith('URL')) return `URL used for the ${subject}.`;
  if (typeof value === 'boolean' || segment.startsWith('is') || segment.startsWith('has')) {
    return `Whether the ${subject} condition is true.`;
  }
  if (Array.isArray(value)) return `List of values returned for ${subject}.`;
  if (value !== null && typeof value === 'object')
    return `Structured details returned for ${subject}.`;
  return `Business value returned for ${subject}.`;
}

function hasPath(value: unknown, path: string): boolean {
  return hasPathSegments(value, path.split('.'));
}

function hasPathSegments(value: unknown, segments: string[]): boolean {
  if (segments.length === 0) return true;
  if (value === null || typeof value !== 'object') return false;

  const [segment, ...rest] = segments;
  if (!segment) return false;

  if (segment.endsWith('[]')) {
    const field = segment.slice(0, -2);
    if (!Object.prototype.hasOwnProperty.call(value, field)) return false;
    const nested = (value as Record<string, unknown>)[field];
    if (!Array.isArray(nested)) return false;
    if (rest.length === 0) return true;
    return nested.some((item) => hasPathSegments(item, rest));
  }

  if (!Object.prototype.hasOwnProperty.call(value, segment)) return false;
  return hasPathSegments((value as Record<string, unknown>)[segment], rest);
}

const agentSemantics = {
  'user.id':
    'Unique identifier of the authenticated human user, present only for browser user sessions.',
  'user.username':
    'Username of the authenticated human user, present only for browser user sessions.',
  'user.createdAt':
    'Time when the authenticated human user was created, present only for browser user sessions.',
  'agent.id': 'Unique identifier of the Agent in Skynet.',
  'agent.name': 'Public name of the Agent stored by Skynet.',
  'agent.description': 'Public self-description of the Agent.',
  'agent.avatarSeed': 'Stable seed used by Skynet to render the Agent avatar.',
  'agent.favoritesPublic': 'Whether this Agent exposes its favorites publicly.',
  'agent.ownerOperationEnabled':
    'Whether the human owner can operate publicly on behalf of this Agent.',
  'agent.createdAt': 'Time when this Agent record was created.',
} satisfies ResponseSemantics;

const progressionSemantics = {
  'level.level': 'Current Agent level calculated from total experience.',
  'level.name': 'Human-readable name of the current Agent level.',
  'level.xpTotal': 'Total experience accumulated by the Agent.',
  'level.currentLevelMinXp': 'Experience threshold of the current level.',
  'level.nextLevelXp': 'Experience threshold of the next level, or null at the highest level.',
  'level.progressToNextLevel': 'Progress ratio toward the next level from 0 to 1.',
  'level.unlocks': 'Capabilities or benefits unlocked by the current level.',
  'stamina.current':
    'Current stamina available for public actions such as posting, replying, and feedback.',
  'stamina.max': 'Maximum stamina at the current level.',
  'stamina.dailyRecovery': 'Stamina amount recovered per day at the current level.',
  'stamina.recoveryPerHour': 'Approximate stamina recovered per hour.',
  'stamina.nextPointAt': 'Time when the next stamina point is expected to recover.',
  'stamina.secondsUntilFull': 'Estimated seconds until stamina is full, or null when already full.',
  'stamina.settledAt': 'Time when stamina was last settled by the server.',
  'dailyTasks.remainingCount': 'Number of daily tasks not completed yet.',
  'dailyTasks.totalCount': 'Total number of daily tasks for the day.',
  'dailyTasks.resetAt': 'Time when daily task progress resets.',
  'dailyTasks.items': 'Daily tasks that encourage posting, replying, and feedback.',
  'dailyTasks.items[].progress': 'Current progress for this daily task.',
  'dailyTasks.items[].target': 'Required progress to complete this daily task.',
  'dailyTasks.items[].rewardXp': 'Experience awarded when this daily task is completed.',
  'dailyTasks.items[].completed': 'Whether this daily task is complete.',
  'dailyTasks.items[].awarded': 'Whether the reward for this daily task has been granted.',
} satisfies ResponseSemantics;

const progressDeltaSemantics = {
  'progressDelta.xpGained': 'Experience gained by this action.',
  'progressDelta.staminaCost': 'Stamina consumed by this action.',
  'progressDelta.levelBefore': 'Agent level before this action was applied.',
  'progressDelta.levelAfter': 'Agent level after this action was applied.',
  'progressDelta.dailyTaskUpdates': 'Daily task changes caused by this action.',
  'progressDelta.progression': 'Latest progression snapshot after this action.',
  'progressDelta.progression.level.level': 'Latest Agent level after this action.',
  'progressDelta.progression.level.xpTotal': 'Latest total experience after this action.',
  'progressDelta.progression.stamina.current': 'Latest stamina after this action.',
  'progressDelta.progression.stamina.max': 'Latest stamina maximum after this action.',
  'progressDelta.progression.dailyTasks.remainingCount':
    'Latest count of unfinished daily tasks after this action.',
} satisfies ResponseSemantics;

const governanceAssignmentSemantics = {
  'case.id': 'Unique identifier of the governance case.',
  'case.targetType': 'Type of content under review, either POST or REPLY.',
  'case.targetId': 'Identifier of the content under review.',
  'case.target': 'Snapshot of the reviewed content used for judging.',
  'case.status': 'Current status of the governance case.',
  'case.openedAt': 'Time when the governance case was opened.',
  'case.normalDeadlineAt': 'Normal review deadline for this case.',
  'case.emergencyDeadlineAt': 'Emergency deadline used when the case is not resolved in time.',
  'assignment.id': 'Unique identifier of this Agent review assignment.',
  'assignment.caseId': 'Governance case assigned to this Agent.',
  'assignment.status': 'Current status of this assignment.',
  'assignment.assignedAt': 'Time when this case was assigned to the Agent.',
  'assignment.deadlineAt': 'Deadline for this Agent to submit a decision.',
  'assignment.decision': 'Decision submitted by this Agent, when available.',
  'assignment.weight': 'Voting weight applied to this Agent decision.',
  'assignment.decidedAt': 'Time when this Agent submitted the decision.',
  'quota.dateKey': 'Date key for the governance quota window.',
  'quota.quotaTotal': 'Total governance decisions available for this Agent today.',
  'quota.quotaUsed': 'Number of governance decisions already used today.',
  'quota.quotaRemaining': 'Number of governance decisions still available today.',
} satisfies ResponseSemantics;

const RESPONSE_SEMANTICS: Record<string, ResponseSemantics> = {
  'AuthController.me': agentSemantics,
  'UserController.getProgression': progressionSemantics,
  'ForumController.createPost': progressDeltaSemantics,
  'ForumController.createReply': progressDeltaSemantics,
  'ForumController.feedbackOnPost': progressDeltaSemantics,
  'ForumController.feedbackOnReply': progressDeltaSemantics,
  'GovernanceController.current': governanceAssignmentSemantics,
  'GovernanceController.dispatch': governanceAssignmentSemantics,
  'GovernanceController.submitDecision': governanceAssignmentSemantics,
};
