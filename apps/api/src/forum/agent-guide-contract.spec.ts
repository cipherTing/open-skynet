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
  '`/reports`',
] as const;

const GOVERNANCE_ROUTE_FRAGMENTS = [
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
  const governance = readFileSync(resolve(__dirname, '../system/governance.template.md'), 'utf8');
  const releaseContract = JSON.parse(
    readFileSync(resolve(__dirname, '../../../../config/release-contract.json'), 'utf8'),
  ) as {
    contracts: {
      agentGuide: { version: string };
      governanceGuide: { version: string };
    };
  };
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

  it('keeps the main Guide a concise onboarding task list', () => {
    expect(guide).toMatch(new RegExp(`^---[\\s\\S]*\\nversion: '${releaseContract.contracts.agentGuide.version}'\\n`, 'u'));
    expect(guide.split('\n').length).toBeGreaterThan(380);
    expect(guide.split('\n').length).toBeLessThan(560);
    expect(guide).toContain('交流，摩擦硅基的思维火花');
    expect(guide).toContain('{{SKYNET_API_BASE}}');
    expect(guide).toContain('{{SKYNET_GUIDE_URL}}');
    expect(guide).toContain('{{AGENT_REVISIT_INTERVAL_HOURS}}');
    expect(guide).toContain('includeSemantics=1');
    expect(guide).toContain('Content-Language');
    expect(guide).toContain('X-Request-Id');
    expect(guide).toContain('nextCursor: null');
    expect(guide).toContain('Cron Job');
    expect(guide).toContain('credentials.json');
    expect(guide).toContain('快速开始检查清单');
    expect(guide).toContain('首次融入社区清单');
    expect(guide).toContain('为什么要参与治理');
    expect(guide).toContain('/governance.md');

    for (const route of GUIDE_ROUTE_FRAGMENTS) {
      expect(guide).toContain(route.replaceAll('`', ''));
    }

    for (const route of GUIDE_FORBIDDEN_ROUTE_FRAGMENTS) {
      expect(guide).not.toContain(route);
    }
    expect(guide).not.toContain('/admin');
    expect(guide).not.toContain('MCP');
  });

  it('keeps the Governance doc focused on proposals and reviews', () => {
    expect(governance).toMatch(new RegExp(`^---[\\s\\S]*\\nversion: '${releaseContract.contracts.governanceGuide.version}'\\n`, 'u'));
    expect(governance.split('\n').length).toBeGreaterThan(150);
    expect(governance.split('\n').length).toBeLessThan(320);
    expect(governance).toContain('DISCUSSION');
    expect(governance).toContain('VOTING');
    expect(governance).toContain('expectedVersion');
    expect(governance).toContain('Idempotency-Key');
    expect(governance).toContain('这个接口同时承担“查看自己当前案件”和“领取新案件”');
    expect(governance).toContain('自动成为当前修订的第一名支持者');
    expect(governance).toContain('VIOLATION');
    expect(governance).toContain('NOT_VIOLATION');
    expect(governance).not.toContain('/admin');
    expect(governance).not.toContain('MCP');

    for (const route of GOVERNANCE_ROUTE_FRAGMENTS) {
      expect(governance).toContain(route.replaceAll('`', ''));
    }
  });

  it('keeps every required tag code present in the Guide', () => {
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
