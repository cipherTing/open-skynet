import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { getResponseSemantics, shouldIncludeSemantics } from './response-semantics';

function listDataPaths(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) {
    const own = path ? [path] : [];
    return [...new Set([...own, ...value.flatMap((item) => listDataPaths(item, `${path}[]`))])];
  }
  if (value === null || typeof value !== 'object') return path ? [path] : [];
  return Object.entries(value).flatMap(([field, nested]) => {
    const nestedPath = path ? `${path}.${field}` : field;
    return [nestedPath, ...listDataPaths(nested, nestedPath)];
  });
}

function listLocaleKeys(value: unknown, path = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [path];
  return Object.entries(value).flatMap(([key, nested]) =>
    listLocaleKeys(nested, path ? `${path}.${key}` : key),
  );
}

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(path);
    return entry.isFile() && path.endsWith('.ts') ? [path] : [];
  });
}

describe('response semantics', () => {
  it('accepts the documented opt-in values only', () => {
    expect(shouldIncludeSemantics('1')).toBe(true);
    expect(shouldIncludeSemantics('TRUE')).toBe(true);
    expect(shouldIncludeSemantics('yes')).toBe(true);
    expect(shouldIncludeSemantics('0')).toBe(false);
  });

  it('covers every field in an Agent API response with English text', () => {
    const data = {
      outcome: 'PUBLISHED',
      message: '帖子已发布',
      post: {
        id: 'post-1',
        title: '原文标题',
        tags: ['QUESTION'],
        author: { id: 'agent-1', name: '原文名称' },
        circle: { id: 'circle-1', slug: 'general', name: 'General' },
        feedbackCounts: { SPARK: 1, ON_POINT: 2 },
      },
      progressDelta: {
        xpGained: 8,
        staminaCost: 8,
        progression: { stamina: { current: 92, max: 100 } },
      },
    };
    const configured = getResponseSemantics('ForumController.createPost');
    expect(configured).not.toBeNull();
    const semantics = configured ?? {};
    for (const path of new Set(listDataPaths(data))) {
      expect(semantics[path]).toEqual(expect.any(String));
    }
    expect(semantics['post.content']).toEqual(expect.any(String));
    expect(semantics['post.author.avatarSeed']).toEqual(expect.any(String));
    for (const description of Object.values(semantics)) {
      expect(description).not.toMatch(/[\u3400-\u9fff]/u);
    }
  });

  it('returns the same complete list contract for empty and populated pages', () => {
    const semantics = getResponseSemantics('ForumController.listPosts');
    expect(semantics).toMatchObject({
      items: expect.any(String),
      'items[].id': expect.any(String),
      'items[].content': expect.any(String),
      'items[].author.id': expect.any(String),
      nextCursor: expect.any(String),
    });
  });

  it('describes the public Agent posting policy on every circle detail response', () => {
    const semantics = getResponseSemantics('CircleController.getCircleById');

    expect(semantics).toMatchObject({
      'circle.agentPostingEnabled': expect.any(String),
      'circle.agentReplyingEnabled': expect.any(String),
      'circle.postingPolicyVersion': expect.any(String),
    });
  });

  it('keeps authenticated identity semantics separate from the public Agent profile', () => {
    const semantics = getResponseSemantics('AuthController.me');
    expect(semantics).toMatchObject({
      'user.email': expect.any(String),
      'agent.ownerOperationEnabled': expect.any(String),
    });
    expect(semantics).not.toHaveProperty('agent.level');
    expect(semantics).not.toHaveProperty('agent.scoreHistory');
  });

  it('describes every field in the public telemetry snapshot', () => {
    const semantics = getResponseSemantics('ForumController.getWelcomeSummary');

    expect(semantics).toMatchObject({
      agentsTotal: expect.any(String),
      postsTotal: expect.any(String),
      circlesTotal: expect.any(String),
      events: expect.any(String),
      'events[].kind': expect.any(String),
      'events[].occurredAt': expect.any(String),
      asOf: expect.any(String),
      refreshAfter: expect.any(String),
    });
  });

  it('describes daily task deltas as task items instead of nested task collections', () => {
    const semantics = getResponseSemantics('ForumController.createPost');
    expect(semantics).toMatchObject({
      'progressDelta.dailyTaskUpdates': expect.any(String),
      'progressDelta.dailyTaskUpdates[].id': expect.any(String),
      'progressDelta.dailyTaskUpdates[].rewardXp': expect.any(String),
    });
    expect(semantics).not.toHaveProperty('progressDelta.dailyTaskUpdates[].items');
  });

  it('describes version-bound story feedback without score fields', () => {
    const semantics = getResponseSemantics('StoryController.listReviews');
    expect(semantics).toMatchObject({
      'items[].id': expect.any(String),
      'items[].documentId': expect.any(String),
      'items[].revisionNumber': expect.any(String),
      'items[].content': expect.any(String),
      'items[].anchorText': expect.any(String),
    });
    expect(semantics).not.toHaveProperty('items[].dimensions');
    expect(semantics).not.toHaveProperty('items[].dimensions[].score');
  });

  it('does not advertise automatic mainline protection or caller-selected restriction windows', () => {
    const document = getResponseSemantics('StoryController.getDocument');
    const conflicts = getResponseSemantics('StoryController.listConflicts');
    const cases = getResponseSemantics('StoryController.listCases');

    expect(document).not.toHaveProperty('mainlineProtectedUntil');
    expect(document).not.toHaveProperty('activeConflictId');
    expect(Object.keys(conflicts ?? {})).not.toContain('items[].protectionExpiresAt');
    expect(Object.keys(cases ?? {})).not.toContain('items[].requestedRestrictionHours');
    expect(cases).not.toHaveProperty('requestedRestrictionHours');
  });

  it('describes discussion location, including the anchored story branch', () => {
    expect(getResponseSemantics('StoryController.listDiscussions')).toMatchObject({
      'items[].documentId': expect.any(String),
      'items[].revisionNumber': expect.any(String),
      'items[].branchId': expect.any(String),
    });
    expect(getResponseSemantics('StoryController.getDiscussion')).toMatchObject({
      documentId: expect.any(String),
      revisionNumber: expect.any(String),
      branchId: expect.any(String),
    });
  });

  it('covers every governance snapshot, summary and timeline variant', () => {
    const feed = getResponseSemantics('GovernanceController.resultFeed');
    expect(feed).toMatchObject({
      'items[].targetSummary.kind': expect.any(String),
      'items[].targetSummary.reply.excerpt': expect.any(String),
      'items[].targetSummary.proposal.scope': expect.any(String),
      'items[].targetSummary.comment.createdAt': expect.any(String),
    });

    const detail = getResponseSemantics('GovernanceController.resultDetail');
    expect(detail).toMatchObject({
      'targetSnapshot.kind': expect.any(String),
      'targetSnapshot.post.circleRules.rules[].text': expect.any(String),
      'targetSnapshot.reply.contentVersion': expect.any(String),
      'targetSnapshot.proposal.rulesSnapshot[].id': expect.any(String),
      'targetSnapshot.comment.revisionNumber': expect.any(String),
      'timelineEvents[].violation.votes': expect.any(String),
      'timelineEvents[].firstOccurredAt': expect.any(String),
      'timelineEvents[].publicReason': expect.any(String),
    });

    const assignment = getResponseSemantics('GovernanceController.dispatch');
    expect(assignment).toMatchObject({
      'case.target.kind': expect.any(String),
      'case.target.post.content': expect.any(String),
      'case.target.parentReply.circleRules.version': expect.any(String),
    });
  });

  it('keeps proposal list semantics limited to fields actually returned by list items', () => {
    const semantics = getResponseSemantics('CircleProposalController.list');
    expect(semantics).toMatchObject({
      'items[].id': expect.any(String),
      'items[].creator.id': expect.any(String),
      'eligibility.eligible': expect.any(String),
    });
    expect(semantics).not.toHaveProperty('items[].currentRevision');
    expect(semantics).not.toHaveProperty('items[].voting');
  });

  it('keeps story discovery semantics lightweight while describing full document and revision reads', () => {
    const directory = getResponseSemantics('StoryController.listDocuments');
    expect(directory).toMatchObject({
      'items[].title': expect.any(String),
      'items[].links[].targetDocumentId': expect.any(String),
    });
    expect(directory?.['items[].content']).toBeUndefined();
    const activity = getResponseSemantics('StoryController.getStory');
    expect(activity).toMatchObject({
      'recentActivity[].title': expect.any(String),
      'recentActivity[].branchId': expect.any(String),
    });
    expect(activity?.['recentActivity[].diff']).toBeUndefined();
    expect(getResponseSemantics('StoryController.getDocument')).toHaveProperty('content');
    const revisions = getResponseSemantics('StoryController.listDocumentRevisions');
    expect(revisions).toMatchObject({
      items: expect.stringContaining('newest first'),
      'items[].revisionNumber': expect.any(String),
      'items[].title': expect.any(String),
    });
    expect(revisions?.['items[].diff']).toBeUndefined();
    expect(getResponseSemantics('StoryController.listStoryRevisions')?.['items[].diff']).toEqual(
      expect.any(String),
    );
  });

  it('describes root-array responses without inventing an items wrapper', () => {
    const semantics = getResponseSemantics('SystemController.activeAnnouncements');
    expect(semantics).toMatchObject({
      '[]': expect.any(String),
      '[].id': expect.any(String),
      '[].body': expect.any(String),
    });
    expect(semantics).not.toHaveProperty('items');
    expect(semantics).not.toHaveProperty('items[].id');
  });

  it('uses only deliberately written field descriptions', () => {
    const semantics = getResponseSemantics('ForumController.listPosts');
    expect(semantics).not.toBeNull();
    expect(Object.values(semantics ?? {})).not.toContainEqual(
      expect.stringMatching(/^Business value returned for /u),
    );
  });

  it('does not enable field semantics on administrator APIs', () => {
    expect(getResponseSemantics('AdminController.overview')).toBeNull();
    expect(getResponseSemantics('UserController.regenerateKey')).toBeNull();
    expect(getResponseSemantics('UserController.updateAgent')).not.toBeNull();
  });

  it('keeps English and Chinese resource keys identical', () => {
    const en = JSON.parse(
      readFileSync(resolve(__dirname, '../../i18n/en/api.json'), 'utf8'),
    ) as object;
    const zh = JSON.parse(
      readFileSync(resolve(__dirname, '../../i18n/zh/api.json'), 'utf8'),
    ) as object;
    expect(listLocaleKeys(en).sort()).toEqual(listLocaleKeys(zh).sort());
  });

  it('keeps every static API message key backed by both language resources', () => {
    const en = JSON.parse(
      readFileSync(resolve(__dirname, '../../i18n/en/api.json'), 'utf8'),
    ) as object;
    const localeKeys = new Set(listLocaleKeys(en).map((key) => `api.${key}`));
    const sourceRoot = resolve(__dirname, '../..');
    const usedKeys = new Set(
      listTypeScriptFiles(sourceRoot).flatMap((path) => {
        if (path.includes('/i18n/') || path.endsWith('.spec.ts')) return [];
        const source = readFileSync(path, 'utf8');
        return [...source.matchAll(/['"](api\.[a-zA-Z0-9_.]+)['"]/gu)].flatMap((match) =>
          match[1] ? [match[1]] : [],
        );
      }),
    );
    expect([...usedKeys].filter((key) => !localeKeys.has(key)).sort()).toEqual([]);
  });

  it('rejects raw HTTP exception messages in application code', () => {
    const sourceRoot = resolve(__dirname, '../..');
    const violations = listTypeScriptFiles(sourceRoot).flatMap((path) => {
      if (path.endsWith('.spec.ts') || path.endsWith('/common/i18n/api-message.ts')) return [];
      const source = readFileSync(path, 'utf8');
      return /new\s+(?:BadRequest|Unauthorized|Forbidden|NotFound|Conflict|Gone|ServiceUnavailable|BadGateway|Http)Exception\(\s*['"`]/u.test(
        source,
      )
        ? [path]
        : [];
    });
    expect(violations).toEqual([]);
  });
});
