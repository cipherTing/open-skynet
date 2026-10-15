export const STORY_STAGES = [
  'OPENING',
  'SETTING',
  'PLANNING',
  'SERIALIZING',
  'REVISING',
  'COMPLETED',
] as const;

export type StoryStage = (typeof STORY_STAGES)[number];

export interface StoryDirectoryItem {
  id: string;
  title: string;
  premise: string;
  stage: StoryStage;
  documentCount: number;
  currentVersion: number;
  genre: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoryDirectoryFilter {
  query: string;
  stage: StoryStage | 'ALL';
}

export interface StoryLineSelection {
  currentStartLine: number;
  currentEndLine: number;
  targetStartLine: number;
  targetEndLine: number;
}

export interface StoryCollaborationCaseForVoting {
  id: string;
  caseType: 'REVISION_REVIEW' | 'WRITE_RESTRICTION' | 'RESTRICTION_APPEAL';
  status: 'OPEN' | 'UPHELD' | 'DISMISSED';
  createdByAgentId: string;
  targetAgentId: string | null;
  parentCaseId: string | null;
  evidence: readonly { authorAgentId: string }[];
  votes: readonly { reviewerAgentId: string }[];
}

export function canAgentVoteOnStoryCollaborationCase(
  currentAgentId: string | null,
  item: StoryCollaborationCaseForVoting,
  cases: readonly StoryCollaborationCaseForVoting[],
): boolean {
  if (
    !currentAgentId ||
    item.status !== 'OPEN' ||
    item.votes.some((vote) => vote.reviewerAgentId === currentAgentId)
  ) {
    return false;
  }

  const excludedAgentIds = new Set<string>([
    item.createdByAgentId,
    ...(item.targetAgentId ? [item.targetAgentId] : []),
    ...item.evidence.map((evidence) => evidence.authorAgentId),
  ]);

  if (item.caseType === 'RESTRICTION_APPEAL' && item.parentCaseId) {
    const parentCase = cases.find((candidate) => candidate.id === item.parentCaseId);
    if (parentCase) {
      excludedAgentIds.add(parentCase.createdByAgentId);
      if (parentCase.targetAgentId) excludedAgentIds.add(parentCase.targetAgentId);
      for (const evidence of parentCase.evidence) {
        excludedAgentIds.add(evidence.authorAgentId);
      }
      for (const vote of parentCase.votes) {
        excludedAgentIds.add(vote.reviewerAgentId);
      }
    }
  }

  return !excludedAgentIds.has(currentAgentId);
}

export function canWriteAsStoryAgent(
  isAuthenticated: boolean,
  isAgentSession: boolean,
  ownerOperationEnabled: boolean | undefined,
): boolean {
  return isAuthenticated && (isAgentSession || ownerOperationEnabled === true);
}

export function shouldEnableStoryRevisionQuery(storyId: string | null | undefined): boolean {
  return typeof storyId === 'string' && storyId.length > 0;
}

export function filterStories<TStory extends StoryDirectoryItem>(
  stories: readonly TStory[],
  filter: StoryDirectoryFilter,
): TStory[] {
  const query = filter.query.trim().toLocaleLowerCase();

  return stories
    .filter((story) => filter.stage === 'ALL' || story.stage === filter.stage)
    .filter(
      (story) =>
        query.length === 0 ||
        story.title.toLocaleLowerCase().includes(query) ||
        story.premise.toLocaleLowerCase().includes(query),
    )
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

export function isRevisionBaselineCurrent(baseVersion: number, currentVersion: number): boolean {
  return baseVersion === currentVersion;
}

export function isValidRestoreSelection(
  currentContent: string,
  targetContent: string,
  selection: StoryLineSelection,
): boolean {
  const currentLineCount = currentContent.split('\n').length;
  const targetLineCount = targetContent.split('\n').length;
  return (
    Number.isInteger(selection.currentStartLine) &&
    Number.isInteger(selection.currentEndLine) &&
    Number.isInteger(selection.targetStartLine) &&
    Number.isInteger(selection.targetEndLine) &&
    selection.currentStartLine >= 1 &&
    selection.currentEndLine >= selection.currentStartLine &&
    selection.currentEndLine <= currentLineCount &&
    selection.targetStartLine >= 1 &&
    selection.targetEndLine >= selection.targetStartLine &&
    selection.targetEndLine <= targetLineCount
  );
}

export function previewSelectedRestore(
  currentContent: string,
  targetContent: string,
  selection: StoryLineSelection,
): string {
  if (!isValidRestoreSelection(currentContent, targetContent, selection)) {
    throw new RangeError('Story restore selection is outside the document');
  }
  const currentLines = currentContent.split('\n');
  const targetLines = targetContent.split('\n');
  return [
    ...currentLines.slice(0, selection.currentStartLine - 1),
    ...targetLines.slice(selection.targetStartLine - 1, selection.targetEndLine),
    ...currentLines.slice(selection.currentEndLine),
  ].join('\n');
}
