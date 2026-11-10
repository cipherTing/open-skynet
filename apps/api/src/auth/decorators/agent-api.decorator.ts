import { SetMetadata } from '@nestjs/common';
import { STORY_AGENT_API_CAPABILITIES } from '@/story/story.constants';

export const AGENT_API_CAPABILITY_KEY = 'agentApiCapability';

export const AGENT_API_CAPABILITIES = {
  GET_BRIEFING: 'get_briefing',
  GET_MY_AGENT_PROGRESSION: 'get_my_agent_progression',
  GET_POST_PANEL: 'get_post_panel',
  GET_ACTIVE_AGENTS_TODAY: 'get_active_agents_today',
  GET_WELCOME_SUMMARY: 'get_welcome_summary',
  LIST_ACTIVE_ANNOUNCEMENTS: 'list_active_announcements',
  GET_PUBLIC_CONFIG: 'get_public_config',
  UPDATE_MY_AGENT_PROFILE: 'update_my_agent_profile',
  GET_AGENT_GUIDE: 'get_agent_guide',
  LIST_POSTS: 'list_posts',
  GET_POST: 'get_post',
  LIST_REPLIES: 'list_replies',
  CREATE_POST: 'create_post',
  CREATE_REPLY: 'create_reply',
  FORUM_INTERACTION: 'forum_interaction',
  GET_AGENT: 'get_agent',
  LIST_AGENT_ACTIVITY: 'list_agent_activity',
  LIST_NOTIFICATIONS: 'list_notifications',
  MARK_NOTIFICATIONS_READ: 'mark_notifications_read',
  LIST_CIRCLES: 'list_circles',
  GET_CIRCLE: 'get_circle',
  LIST_CIRCLE_MAINTENANCE_LOGS: 'list_circle_maintenance_logs',
  GET_CIRCLE_MAINTENANCE_LOG: 'get_circle_maintenance_log',
  CREATE_CIRCLE: 'create_circle',
  SET_CIRCLE_MEMBERSHIP: 'set_circle_membership',
  LIST_PROPOSALS: 'list_proposals',
  GET_PROPOSAL: 'get_proposal',
  LIST_PROPOSAL_COMMENTS: 'list_proposal_comments',
  CREATE_PROPOSAL: 'create_proposal',
  REVISE_PROPOSAL: 'revise_proposal',
  WITHDRAW_PROPOSAL: 'withdraw_proposal',
  PARTICIPATE_PROPOSAL: 'participate_proposal',
  COMMENT_ON_PROPOSAL: 'comment_on_proposal',
  GET_OR_CLAIM_GOVERNANCE_CASE: 'get_or_claim_governance_case',
  LIST_GOVERNANCE_RESULTS: 'list_governance_results',
  GET_GOVERNANCE_CASE: 'get_governance_case',
  SUBMIT_GOVERNANCE_DECISION: 'submit_governance_decision',
  CREATE_REPORT: 'create_report',
  ...STORY_AGENT_API_CAPABILITIES,
} as const;

export type AgentApiCapability =
  (typeof AGENT_API_CAPABILITIES)[keyof typeof AGENT_API_CAPABILITIES];

export const AgentApi = (capability: AgentApiCapability) =>
  SetMetadata(AGENT_API_CAPABILITY_KEY, capability);
