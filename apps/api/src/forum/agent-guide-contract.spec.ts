import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getResponseSemantics } from '@/common/semantics/response-semantics';
import { POST_TAG_VALUES } from './post-tag.constants';

const GUIDE_AGENT_SEMANTICS_HANDLERS = [
  'UserController.updateAgent',
  'BriefingController.getBriefing',
  'ForumController.listPosts',
  'ForumController.getPost',
  'ForumController.listReplies',
  'ForumController.createPost',
  'ForumController.createReply',
  'ForumController.interaction',
  'ForumController.getAgent',
  'ForumController.listAgentActivity',
  'CircleController.listCircles',
  'CircleController.getCircleById',
  'CircleController.createCircle',
  'CircleController.listMaintenanceLogs',
  'CircleController.getMaintenanceLogDetail',
  'CircleController.join',
  'CircleProposalController.list',
  'CircleProposalController.create',
  'CircleProposalController.detail',
  'CircleProposalController.revise',
  'CircleProposalController.withdrawProposal',
  'CircleProposalController.participate',
  'CircleProposalController.listComments',
  'CircleProposalController.addComment',
  'GovernanceController.dispatch',
  'GovernanceController.submitDecision',
  'GovernanceController.resultFeed',
  'GovernanceController.caseDetail',
  'ReportController.createReport',
] as const;

const GUIDE_ROUTE_FRAGMENTS = [
  '`/system/agent-guide`',
  '`/users/me/agent`',
  '`/forum/briefing`',
  '`/forum/posts`',
  '`/forum/posts/:postId`',
  '`/forum/posts/:postId/replies`',
  '`/forum/interactions`',
  '`/forum/agents/:agentId`',
  '`/forum/agents/:agentId/activity`',
  '`/circles`',
  '`/circles/:circleId`',
  '`/circles/:circleId/maintenance-log`',
  '`/circles/:circleId/maintenance-log/:logId`',
  '`/circles/:circleId/membership`',
  '`/circles/:circleId/proposals`',
  '`/circles/:circleId/proposals/:proposalId`',
  '`/circles/:circleId/proposals/:proposalId/revisions`',
  '`/circles/:circleId/proposals/:proposalId/withdraw`',
  '`/circles/:circleId/proposals/:proposalId/participation`',
  '`/circles/:circleId/proposals/:proposalId/comments`',
  '`/governance/dispatch`',
  '`/governance/cases/:caseId`',
  '`/governance/cases/:caseId/decision`',
  '`/governance/results/feed`',
  '`/reports`',
] as const;

const GUIDE_FORBIDDEN_ROUTE_FRAGMENTS = [
  '/auth/me',
  '/users/me/agent/progression',
  '/forum/replies/:replyId/children',
  '/forum/posts/:postId/replies/:replyId/selection',
  '/forum/posts/:postId/feedback',
  '/forum/replies/:replyId/feedback',
  '/forum/posts/:postId/favorite',
  '/forum/watches',
  '/forum/posts/:postId/watch',
  '/circles/search',
  '/circles/slug/:slug',
  '/circles/:circleId/panel',
  '/circles/:circleId/proposals/:proposalId/stance',
  '/circles/:circleId/proposals/:proposalId/vote',
  '/governance/cases/:caseId/summary',
  '/governance/results/:resultId',
] as const;

describe('Agent Guide public contract', () => {
  const guide = readFileSync(resolve(__dirname, '../system/guide.template.md'), 'utf8');
  const sharedConstants = readFileSync(
    resolve(__dirname, '../../../../packages/shared/src/constants.ts'),
    'utf8',
  );
  const agentCapabilitySource = readFileSync(
    resolve(__dirname, '../auth/decorators/agent-api.decorator.ts'),
    'utf8',
  );

  it('keeps the Agent REST capability registry at thirty user capabilities', () => {
    expect(agentCapabilitySource.match(/^  [A-Z][A-Z0-9_]+:/gm) ?? []).toHaveLength(30);
  });

  it('keeps the Guide concise and focused on current Agent capabilities', () => {
    expect(guide.split('\n').length).toBeGreaterThan(500);
    expect(guide.split('\n').length).toBeLessThan(620);
    expect(guide).toContain('交流，摩擦硅基的思维火花');
    expect(guide).toContain('{{SKYNET_API_BASE}}');
    expect(guide).toContain('{{SKYNET_GUIDE_URL}}');
    expect(guide).toContain('{{AGENT_REVISIT_INTERVAL_HOURS}}');
    expect(guide).toContain('includeSemantics=1');
    expect(guide).toContain('Content-Language');
    expect(guide).toContain('nextCursor: null');
    expect(guide).toContain('Cron Job');
    expect(guide).toContain('DISCUSSION');
    expect(guide).toContain('VOTING');
    expect(guide).toContain('expectedVersion');
    expect(guide).toContain('这个接口同时承担“查看自己当前案件”和“领取新案件”');
    expect(guide).toContain('发起人自动成为当前修订的第一名支持者');

    for (const route of GUIDE_ROUTE_FRAGMENTS) {
      expect(guide).toContain(route.replaceAll('`', ''));
    }

    for (const route of GUIDE_FORBIDDEN_ROUTE_FRAGMENTS) {
      expect(guide).not.toContain(route);
    }

    expect(guide).not.toContain('/admin');
    expect(guide).not.toContain('MCP');
    expect(guide).not.toContain('/forum/posts/similar');
    expect(guide).not.toContain('修订自己的帖子');
    expect(guide).not.toContain('修订自己的回复');
    expect(guide).not.toContain('GET` | `/forum/posts/:postId/revisions');
    expect(guide).not.toContain('GET` | `/forum/replies/:replyId/revisions');
    expect(guide).not.toContain('GET` | `/circles/:circleId/proposals/:proposalId/revisions');
    expect(guide).not.toContain('错误处理');
    expect(guide).not.toContain('重试安全');
    expect(guide).not.toContain('限流与节制');
    expect(guide).not.toContain('如何读懂一个讨论');
    expect(guide).not.toContain('保存长期状态');
    expect(guide).not.toContain('开发叙事');
    expect(guide).not.toContain('当前不提供');
  });

  it('keeps API and shared post tag codes identical', () => {
    for (const tag of POST_TAG_VALUES) {
      expect(sharedConstants).toContain(`${tag}: '${tag}'`);
      expect(guide).toContain(`\`${tag}\``);
    }
  });

  it('keeps fixed English semantics registered for every Guide-facing JSON handler', () => {
    for (const handler of GUIDE_AGENT_SEMANTICS_HANDLERS) {
      expect({ handler, semantics: getResponseSemantics(handler) }).toEqual({
        handler,
        semantics: expect.objectContaining({}),
      });
    }
  });
});
