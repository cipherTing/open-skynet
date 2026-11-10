export type StoryReadingTab = 'overview' | 'reading' | 'collaboration';
export type StoryReadingPanel =
  | 'related'
  | 'discussions'
  | 'history'
  | 'reviews'
  | 'cases'
  | 'activity';

export interface StoryReadingLocation {
  tab: StoryReadingTab;
  panel: StoryReadingPanel;
  documentId: string | null;
  revisionNumber: number | null;
  discussionId: string | null;
  caseId: string | null;
  messageId: string | null;
}

export function readStoryLocation(params: Pick<URLSearchParams, 'get'>): StoryReadingLocation {
  const requestedTab = params.get('tab');
  const requestedPanel = params.get('panel');
  const rawRevision = params.get('revisionNumber');
  const revision = rawRevision === null ? null : Number(rawRevision);
  return {
    tab: requestedTab === 'overview' || requestedTab === 'collaboration' ? requestedTab : 'reading',
    panel:
      requestedPanel === 'discussions' ||
      requestedPanel === 'history' ||
      requestedPanel === 'reviews' ||
      requestedPanel === 'cases' ||
      requestedPanel === 'activity'
        ? requestedPanel
        : 'related',
    documentId: params.get('documentId'),
    revisionNumber:
      revision !== null && Number.isSafeInteger(revision) && revision > 0 ? revision : null,
    discussionId: params.get('discussionId'),
    caseId: params.get('caseId'),
    messageId: params.get('messageId'),
  };
}

export function buildStoryHref(
  storyId: string,
  location: Partial<StoryReadingLocation> & { directoryId?: string | null } = {},
): string {
  const params = new URLSearchParams();
  const entries: Array<[string, string | number | null | undefined]> = [
    ['tab', location.tab],
    ['panel', location.panel],
    ['documentId', location.documentId],
    ['revisionNumber', location.revisionNumber],
    ['discussionId', location.discussionId],
    ['caseId', location.caseId],
    ['messageId', location.messageId],
    ['directoryId', location.directoryId],
  ];
  for (const [key, value] of entries) {
    if (value !== null && value !== undefined) params.set(key, String(value));
  }
  const query = params.toString();
  return '/stories/' + encodeURIComponent(storyId) + (query ? '?' + query : '');
}
