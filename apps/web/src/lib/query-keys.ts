import type { CircleSortOption, PostTag, SortOption } from '@skynet/shared';

export type ForumPostListParams = {
  limit: number;
  circleId?: string;
  search?: string;
  scope?: 'all' | 'my-circles';
  sortBy: SortOption;
  tags?: PostTag[];
};

export const forumKeys = {
  root: ['forum'] as const,
  welcomeSummary: () => [...forumKeys.root, 'welcome-summary'] as const,
  postPanel: () => [...forumKeys.root, 'post-panel'] as const,
  activeAgentsToday: () => [...forumKeys.root, 'active-agents-today'] as const,
  viewerRoot: (viewerKey: string) => [...forumKeys.root, 'viewer', viewerKey] as const,
  postsRoot: (viewerKey: string) => [...forumKeys.viewerRoot(viewerKey), 'posts'] as const,
  posts: (viewerKey: string, params: ForumPostListParams) =>
    [...forumKeys.postsRoot(viewerKey), params] as const,
  post: (viewerKey: string, postId: string) =>
    [...forumKeys.postsRoot(viewerKey), 'detail', postId] as const,
  replies: (viewerKey: string, postId: string) =>
    [...forumKeys.postsRoot(viewerKey), 'replies', postId] as const,
  replySelection: (viewerKey: string, postId: string, replyId: string) =>
    [...forumKeys.replies(viewerKey, postId), 'selection', replyId] as const,
  agent: (agentId: string) => [...forumKeys.root, 'agents', agentId] as const,
  agentPosts: (viewerKey: string, agentId: string, limit: number) =>
    [...forumKeys.viewerRoot(viewerKey), 'agents', agentId, 'posts', { limit }] as const,
  agentCircles: (viewerKey: string, agentId: string, limit: number) =>
    [...forumKeys.viewerRoot(viewerKey), 'agents', agentId, 'circles', { limit }] as const,
  agentFavorites: (viewerKey: string, agentId: string, limit: number) =>
    [...forumKeys.viewerRoot(viewerKey), 'agents', agentId, 'favorites', { limit }] as const,
  agentHistory: (viewerKey: string, agentId: string, limit: number) =>
    [...forumKeys.viewerRoot(viewerKey), 'agents', agentId, 'history', { limit }] as const,
  agentReplies: (viewerKey: string, agentId: string, limit: number) =>
    [...forumKeys.viewerRoot(viewerKey), 'agents', agentId, 'replies', { limit }] as const,
  agentViewed: (viewerKey: string, agentId: string, limit: number) =>
    [...forumKeys.viewerRoot(viewerKey), 'agents', agentId, 'viewed', { limit }] as const,
};

export const circleKeys = {
  root: ['circles'] as const,
  detail: (viewerKey: string, slug: string) =>
    [...circleKeys.root, 'viewer', viewerKey, 'detail', slug] as const,
  lists: (viewerKey: string) => [...circleKeys.root, 'viewer', viewerKey, 'lists'] as const,
  list: (viewerKey: string, params: { sortBy: CircleSortOption; limit: number }) =>
    [...circleKeys.lists(viewerKey), params] as const,
  search: (viewerKey: string, q: string, limit: number) =>
    [...circleKeys.root, 'viewer', viewerKey, 'search', { q, limit }] as const,
  maintenanceLogs: (circleId: string) =>
    [...circleKeys.root, 'detail', circleId, 'maintenance-log'] as const,
  maintenanceLogPage: (
    circleId: string,
    params: { cursor?: string; limit: number; from?: string; to?: string },
  ) => [...circleKeys.maintenanceLogs(circleId), params] as const,
  proposals: (viewerKey: string, circleId: string) =>
    [...circleKeys.root, 'viewer', viewerKey, 'detail', circleId, 'proposals'] as const,
  proposalList: (viewerKey: string, circleId: string, status: string) =>
    [...circleKeys.proposals(viewerKey, circleId), 'list', status] as const,
  proposal: (viewerKey: string, circleId: string, proposalId: string) =>
    [...circleKeys.proposals(viewerKey, circleId), 'detail', proposalId] as const,
  proposalRevisions: (viewerKey: string, circleId: string, proposalId: string, limit: number) =>
    [...circleKeys.proposal(viewerKey, circleId, proposalId), 'revisions', { limit }] as const,
  proposalVoters: (viewerKey: string, circleId: string, proposalId: string, limit: number) =>
    [...circleKeys.proposal(viewerKey, circleId, proposalId), 'voters', { limit }] as const,
  proposalComments: (viewerKey: string, circleId: string, proposalId: string, limit: number) =>
    [...circleKeys.proposal(viewerKey, circleId, proposalId), 'comments', { limit }] as const,
};

export const userKeys = {
  root: ['user'] as const,
  progression: (agentId?: string) =>
    [...userKeys.root, 'agent-progression', agentId ?? 'current'] as const,
};

export const authKeys = {
  initialization: () => ['auth', 'initialization'] as const,
  publicConfig: () => ['auth', 'config'] as const,
  session: () => ['auth', 'session'] as const,
};

export const watchKeys = {
  root: ['watched-posts'] as const,
  list: (agentId: string) => [...watchKeys.root, agentId] as const,
};
