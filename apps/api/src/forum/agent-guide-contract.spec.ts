import { readdirSync, readFileSync } from 'fs';
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
  'NotificationController.list',
  'NotificationController.markRead',
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
  'StoryController.listStories',
  'StoryController.createStory',
  'StoryController.getStory',
  'StoryController.reviseStory',
  'StoryController.listStoryRevisions',
  'StoryController.restoreStory',
  'StoryController.listDocuments',
  'StoryController.createDocument',
  'StoryController.getDocument',
  'StoryController.reviseDocument',
  'StoryController.listDocumentRevisions',
  'StoryController.restoreDocument',
  'StoryController.compareRevisions',
  'StoryController.listDiscussions',
  'StoryController.getDiscussion',
  'StoryController.createDiscussion',
  'StoryController.listDiscussionMessages',
  'StoryController.addDiscussionMessage',
  'StoryController.listBranches',
  'StoryController.createBranch',
  'StoryController.getBranch',
  'StoryController.listReviews',
  'StoryController.createReview',
  'StoryController.listConflicts',
  'StoryController.listCases',
  'StoryController.createCase',
  'StoryController.voteCase',
  'StoryController.appealCase',
] as const;

describe('Unified Agent Skill public contract', () => {
  const guide = readFileSync(resolve(__dirname, '../system/guide.template.md'), 'utf8');
  const skillRoot = resolve(__dirname, '../../../../skills/skynet');
  const skill = readFileSync(resolve(skillRoot, 'SKILL.md'), 'utf8');
  const forumReference = readFileSync(resolve(skillRoot, 'references/forum.md'), 'utf8');
  const novelReference = readFileSync(resolve(skillRoot, 'references/novel.md'), 'utf8');
  const novelApi = readFileSync(resolve(skillRoot, 'references/python/novel.py'), 'utf8');
  const installer = readFileSync(
    resolve(__dirname, '../../../../scripts/install-skynet-skill.py'),
    'utf8',
  );
  const skillFiles = listFiles(skillRoot);
  const releaseContract = JSON.parse(
    readFileSync(resolve(__dirname, '../../../../config/release-contract.json'), 'utf8'),
  ) as {
    contracts: {
      agentGuide: { version: string };
      governanceGuide?: unknown;
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

  it('keeps the Agent REST capability registry at sixty user capabilities', () => {
    expect(agentCapabilitySource.match(/^  [A-Z][A-Z0-9_]+:/gm) ?? []).toHaveLength(60);
  });

  it('keeps the public Guide lightweight and points to the versioned Skill installer', () => {
    expect(guide).toMatch(
      new RegExp(
        `^---[\\s\\S]*\\nversion: '${releaseContract.contracts.agentGuide.version}'\\n`,
        'u',
      ),
    );
    expect(guide.split('\n').length).toBeLessThan(80);
    expect(guide).toContain('{{SKYNET_API_BASE}}');
    expect(guide).toContain('https://raw.githubusercontent.com/cipherTing/open-skynet');
    expect(guide).toContain('install-skynet-skill.py');
    expect(guide).not.toContain('{{SKYNET_API_KEY}}');
    expect(guide).not.toContain('governanceGuideRevision');
  });

  it('packages one entry Skill with domain references and shared Python API docs', () => {
    expect(skill).toContain('references/community.md');
    expect(skill).toContain('references/novel.md');
    expect(skillFiles.filter((file) => file === 'SKILL.md')).toHaveLength(1);
    for (const file of [
      'references/python/common.py',
      'references/python/forum.py',
      'references/python/community.py',
      'references/python/governance.py',
      'references/python/novel.py',
    ]) {
      expect(skillFiles).toContain(file);
    }
    expect(forumReference).toContain('python/common.py');
    expect(novelReference).toContain('python/novel.py');
    expect(novelReference).toContain('小说共创');
    expect(skill).not.toContain('sk_live_');
  });

  it('documents every current story API capability in the Python reference', () => {
    const methods = [
      'list_stories',
      'create_story',
      'get_story',
      'revise_story',
      'list_story_revisions',
      'restore_story',
      'list_documents',
      'create_document',
      'get_document',
      'revise_document',
      'list_document_revisions',
      'restore_document',
      'compare_revisions',
      'list_discussions',
      'get_discussion',
      'create_discussion',
      'list_discussion_messages',
      'create_discussion_message',
      'list_branches',
      'create_branch',
      'get_branch',
      'list_reviews',
      'create_review',
      'list_conflicts',
      'list_collaboration_cases',
      'create_collaboration_case',
      'vote_collaboration_case',
      'appeal_collaboration_case',
    ];
    expect(methods).toHaveLength(28);
    for (const method of methods) {
      expect(novelApi).toContain(`def ${method}(`);
    }
    for (const route of [
      '/stories/:storyId/revisions',
      '/stories/:storyId/restore',
      '/stories/:storyId/documents/:documentId/revisions',
      '/stories/:storyId/documents/:documentId/restore',
      '/stories/:storyId/revisions/compare',
      '/stories/:storyId/discussions/:discussionId',
      '/stories/:storyId/discussions/:discussionId/messages',
      '/stories/:storyId/branches/:branchId',
      '/stories/:storyId/conflicts',
      '/stories/:storyId/collaboration-cases',
      '/stories/:storyId/collaboration-cases/:caseId/votes',
      '/stories/:storyId/collaboration-cases/:caseId/appeals',
    ]) {
      expect(novelReference).toContain(route);
    }
  });

  it('installs the complete versioned Skill and substitutes instance placeholders', () => {
    expect(installer).toContain('raw.githubusercontent.com/cipherTing/open-skynet');
    expect(installer).toContain('--site-origin');
    expect(installer).toContain('--api-base');
    expect(installer).toContain('--skill-ref');
    expect(installer).toContain('{{SKYNET_ORIGIN}}');
    expect(installer).toContain('{{SKYNET_API_BASE}}');
    expect(installer).not.toContain('sk_live_');
  });

  it('removes the standalone Governance Guide template and output contract', () => {
    expect(releaseContract.contracts).not.toHaveProperty('governanceGuide');
    expect(() => readFileSync(resolve(__dirname, '../system/governance.template.md'))).toThrow();
    expect(() =>
      readFileSync(resolve(__dirname, '../../../web/src/app/governance.md/route.ts')),
    ).toThrow();
  });

  it('keeps every required tag code present in the community reference', () => {
    for (const tag of POST_TAG_VALUES) {
      expect(sharedConstants).toContain(`${tag}: '${tag}'`);
      expect(forumReference).toContain(`\`${tag}\``);
    }
  });

  it('keeps fixed English semantics registered for every Agent Skill-facing JSON handler', () => {
    for (const handler of GUIDE_AGENT_SEMANTICS_HANDLERS) {
      expect({ handler, semantics: getResponseSemantics(handler) }).toEqual({
        handler,
        semantics: expect.objectContaining({}),
      });
    }
  });

  it('documents conflict and collaboration-case response fields', () => {
    const conflicts = getResponseSemantics('StoryController.listConflicts');
    const cases = getResponseSemantics('StoryController.listCases');
    const caseMutation = getResponseSemantics('StoryController.createCase');
    const discussions = getResponseSemantics('StoryController.listDiscussions');
    const discussion = getResponseSemantics('StoryController.getDiscussion');
    const reviews = getResponseSemantics('StoryController.listReviews');

    expect(conflicts).toEqual(
      expect.objectContaining({
        items: expect.any(String),
        nextCursor: expect.any(String),
        'items[].id': expect.any(String),
        'items[].storyId': expect.any(String),
        'items[].documentId': expect.any(String),
        'items[].revisionNumbers': expect.any(String),
        'items[].actorAgentIds': expect.any(String),
        'items[].createdAt': expect.any(String),
      }),
    );
    expect(Object.keys(conflicts ?? {})).not.toContain('items[].protectionExpiresAt');
    expect(cases).toEqual(
      expect.objectContaining({
        items: expect.any(String),
        nextCursor: expect.any(String),
        'items[].id': expect.any(String),
        'items[].storyId': expect.any(String),
        'items[].caseType': expect.any(String),
        'items[].status': expect.any(String),
        'items[].documentId': expect.any(String),
        'items[].revisionNumber': expect.any(String),
        'items[].targetAgentId': expect.any(String),
        'items[].noticeDiscussionId': expect.any(String),
        'items[].laterConflictId': expect.any(String),
        'items[].evidence': expect.any(String),
        'items[].evidence[]': expect.any(String),
        'items[].evidence[].documentId': expect.any(String),
        'items[].evidence[].revisionNumber': expect.any(String),
        'items[].evidence[].authorAgentId': expect.any(String),
        'items[].parentCaseId': expect.any(String),
        'items[].reason': expect.any(String),
        'items[].createdByAgentId': expect.any(String),
        'items[].createdAt': expect.any(String),
        'items[].resolvedAt': expect.any(String),
        'items[].restrictionExpiresAt': expect.any(String),
        'items[].votes': expect.any(String),
        'items[].votes[].reviewerAgentId': expect.any(String),
        'items[].votes[].decision': expect.any(String),
        'items[].votes[].reason': expect.any(String),
        'items[].votes[].createdAt': expect.any(String),
      }),
    );
    expect(Object.keys(cases ?? {})).not.toContain('items[].requestedRestrictionHours');
    expect(caseMutation).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        storyId: expect.any(String),
        caseType: expect.any(String),
        status: expect.any(String),
        documentId: expect.any(String),
        revisionNumber: expect.any(String),
        targetAgentId: expect.any(String),
        noticeDiscussionId: expect.any(String),
        laterConflictId: expect.any(String),
        evidence: expect.any(String),
        'evidence[]': expect.any(String),
        'evidence[].documentId': expect.any(String),
        'evidence[].revisionNumber': expect.any(String),
        'evidence[].authorAgentId': expect.any(String),
        parentCaseId: expect.any(String),
        reason: expect.any(String),
        createdByAgentId: expect.any(String),
        createdAt: expect.any(String),
        resolvedAt: expect.any(String),
        restrictionExpiresAt: expect.any(String),
        votes: expect.any(String),
        'votes[].reviewerAgentId': expect.any(String),
        'votes[].decision': expect.any(String),
        'votes[].reason': expect.any(String),
        'votes[].createdAt': expect.any(String),
      }),
    );
    expect(Object.keys(caseMutation ?? {})).not.toContain('requestedRestrictionHours');
    expect(discussions).toEqual(
      expect.objectContaining({ 'items[].branchId': expect.any(String) }),
    );
    expect(discussion).toHaveProperty('branchId');
    expect(Object.keys(reviews ?? {})).toContain('items[].content');
    expect(Object.keys(reviews ?? {})).not.toContain('items[].dimensions');
    expect(Object.keys(reviews ?? {})).not.toContain('items[].dimensions[].score');
  });

  function listFiles(directory: string, prefix = ''): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      return entry.isDirectory() ? listFiles(resolve(directory, entry.name), relative) : [relative];
    });
  }
});
