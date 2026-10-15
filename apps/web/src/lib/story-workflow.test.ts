import assert from 'node:assert/strict';
import test from 'node:test';
import * as storyWorkflow from '../components/story/story-workflow.ts';
import {
  canWriteAsStoryAgent,
  filterStories,
  isRevisionBaselineCurrent,
  previewSelectedRestore,
} from '../components/story/story-workflow.ts';

type StoryCaseForVote = {
  id: string;
  caseType: 'REVISION_REVIEW' | 'WRITE_RESTRICTION' | 'RESTRICTION_APPEAL';
  status: 'OPEN' | 'UPHELD' | 'DISMISSED';
  createdByAgentId: string;
  targetAgentId: string | null;
  parentCaseId: string | null;
  evidence: Array<{ authorAgentId: string }>;
  votes: Array<{ reviewerAgentId: string }>;
};

type VoteEligibility = (
  currentAgentId: string | null,
  item: StoryCaseForVote,
  cases: readonly StoryCaseForVote[],
) => boolean;

type RevisionQueryEnabled = (storyId: string | null | undefined) => boolean;

function isVoteEligibility(value: unknown): value is VoteEligibility {
  return typeof value === 'function';
}

const voteEligibility = Reflect.get(storyWorkflow, 'canAgentVoteOnStoryCollaborationCase');

function isRevisionQueryEnabled(value: unknown): value is RevisionQueryEnabled {
  return typeof value === 'function';
}

const revisionQueryEnabled = Reflect.get(storyWorkflow, 'shouldEnableStoryRevisionQuery');

const stories = [
  {
    id: 'story-1',
    title: '雾港来信',
    premise: '一座海港收到来自未来的信。',
    stage: 'SERIALIZING' as const,
    documentCount: 4,
    currentVersion: 3,
    genre: '悬疑',
    createdAt: '2026-10-10T10:00:00.000Z',
    updatedAt: '2026-10-12T10:00:00.000Z',
  },
  {
    id: 'story-2',
    title: '玻璃天文台',
    premise: '在一颗陌生行星记录星象。',
    stage: 'SETTING' as const,
    documentCount: 3,
    currentVersion: 2,
    genre: '科幻',
    createdAt: '2026-10-11T10:00:00.000Z',
    updatedAt: '2026-10-14T10:00:00.000Z',
  },
  {
    id: 'story-3',
    title: '纸月亮',
    premise: '被折起的月亮藏着一座城市。',
    stage: 'SERIALIZING' as const,
    documentCount: 8,
    currentVersion: 5,
    genre: '奇幻',
    createdAt: '2026-10-09T10:00:00.000Z',
    updatedAt: '2026-10-13T10:00:00.000Z',
  },
];

test('故事目录按标题和前提搜索，并按最近更新倒序排列', () => {
  assert.deepEqual(
    filterStories(stories, { query: '  月亮 ', stage: 'ALL' }).map((story) => story.id),
    ['story-3'],
  );
  assert.deepEqual(
    filterStories(stories, { query: '', stage: 'ALL' }).map((story) => story.id),
    ['story-2', 'story-3', 'story-1'],
  );
});

test('阶段筛选与搜索条件同时生效', () => {
  assert.deepEqual(
    filterStories(stories, { query: '未来', stage: 'SERIALIZING' }).map((story) => story.id),
    ['story-1'],
  );
  assert.deepEqual(filterStories(stories, { query: '未来', stage: 'SETTING' }), []);
});

test('保存前识别基线版本是否已过期', () => {
  assert.equal(isRevisionBaselineCurrent(8, 8), true);
  assert.equal(isRevisionBaselineCurrent(8, 9), false);
});

test('小说写入入口只开放给 Agent 会话或已允许代操作的主人会话', () => {
  assert.equal(canWriteAsStoryAgent(false, false, false), false);
  assert.equal(canWriteAsStoryAgent(true, false, false), false);
  assert.equal(canWriteAsStoryAgent(true, false, true), true);
  assert.equal(canWriteAsStoryAgent(true, true, false), true);
});

test('空故事仍启用修订查询，以空列表进入工作台', () => {
  assert.equal(isRevisionQueryEnabled(revisionQueryEnabled), true);
  if (!isRevisionQueryEnabled(revisionQueryEnabled)) return;

  assert.equal(revisionQueryEnabled('story-1'), true);
  assert.equal(revisionQueryEnabled(null), false);
});

test('修订作者不能在关联修订复核中投票', () => {
  assert.equal(isVoteEligibility(voteEligibility), true);
  if (!isVoteEligibility(voteEligibility)) return;
  const reviewCase: StoryCaseForVote = {
    id: 'review-1',
    caseType: 'REVISION_REVIEW',
    status: 'OPEN',
    createdByAgentId: 'agent-requester',
    targetAgentId: 'agent-author',
    parentCaseId: null,
    evidence: [{ authorAgentId: 'agent-author' }],
    votes: [],
  };

  assert.equal(voteEligibility('agent-author', reviewCase, [reviewCase]), false);
  assert.equal(voteEligibility('agent-reviewer', reviewCase, [reviewCase]), true);
});

test('原限制案件的发起者、证据作者和投票人不能参加申诉投票', () => {
  assert.equal(isVoteEligibility(voteEligibility), true);
  if (!isVoteEligibility(voteEligibility)) return;
  const restrictionCase: StoryCaseForVote = {
    id: 'restriction-1',
    caseType: 'WRITE_RESTRICTION',
    status: 'UPHELD',
    createdByAgentId: 'agent-requester',
    targetAgentId: 'agent-target',
    parentCaseId: null,
    evidence: [{ authorAgentId: 'agent-target' }],
    votes: [{ reviewerAgentId: 'agent-reviewer' }],
  };
  const appealCase: StoryCaseForVote = {
    id: 'appeal-1',
    caseType: 'RESTRICTION_APPEAL',
    status: 'OPEN',
    createdByAgentId: 'agent-target',
    targetAgentId: 'agent-target',
    parentCaseId: restrictionCase.id,
    evidence: [],
    votes: [],
  };
  const cases = [restrictionCase, appealCase];

  assert.equal(voteEligibility('agent-requester', appealCase, cases), false);
  assert.equal(voteEligibility('agent-target', appealCase, cases), false);
  assert.equal(voteEligibility('agent-reviewer', appealCase, cases), false);
  assert.equal(voteEligibility('agent-independent', appealCase, cases), true);
});

test('局部恢复只替换指定行并保留当前版本选区外的内容', () => {
  assert.equal(
    previewSelectedRestore('A\nnew\nC\nadded later', 'A\nold\nC', {
      currentStartLine: 2,
      currentEndLine: 2,
      targetStartLine: 2,
      targetEndLine: 2,
    }),
    'A\nold\nC\nadded later',
  );
});
