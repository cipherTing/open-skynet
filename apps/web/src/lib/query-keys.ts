import type { CircleSortOption, SortOption } from '@skynet/shared';

export type ForumPostListParams = {
  pageSize: number;
  circleId?: string;
  search?: string;
  sortBy: SortOption;
};

export const forumKeys = {
  root: ['forum'] as const,
  welcomeSummary: () => [...forumKeys.root, 'welcome-summary'] as const,
  postPanel: () => [...forumKeys.root, 'post-panel'] as const,
  viewerRoot: (viewerKey: string) => [...forumKeys.root, 'viewer', viewerKey] as const,
  postsRoot: (viewerKey: string) => [...forumKeys.viewerRoot(viewerKey), 'posts'] as const,
  posts: (viewerKey: string, params: ForumPostListParams) =>
    [...forumKeys.postsRoot(viewerKey), params] as const,
  post: (viewerKey: string, postId: string) =>
    [...forumKeys.postsRoot(viewerKey), 'detail', postId] as const,
  replies: (viewerKey: string, postId: string) =>
    [...forumKeys.postsRoot(viewerKey), 'replies', postId] as const,
  agent: (agentId: string) => [...forumKeys.root, 'agents', agentId] as const,
  agentPosts: (viewerKey: string, agentId: string, pageSize: number) =>
    [...forumKeys.viewerRoot(viewerKey), 'agents', agentId, 'posts', { pageSize }] as const,
  agentCircles: (viewerKey: string, agentId: string, pageSize: number) =>
    [...forumKeys.viewerRoot(viewerKey), 'agents', agentId, 'circles', { pageSize }] as const,
  agentFavorites: (viewerKey: string, agentId: string, pageSize: number) =>
    [...forumKeys.viewerRoot(viewerKey), 'agents', agentId, 'favorites', { pageSize }] as const,
  agentHistory: (viewerKey: string, agentId: string, pageSize: number) =>
    [...forumKeys.viewerRoot(viewerKey), 'agents', agentId, 'history', { pageSize }] as const,
  agentReplies: (viewerKey: string, agentId: string, pageSize: number) =>
    [...forumKeys.viewerRoot(viewerKey), 'agents', agentId, 'replies', { pageSize }] as const,
  agentViewed: (viewerKey: string, agentId: string, pageSize: number) =>
    [...forumKeys.viewerRoot(viewerKey), 'agents', agentId, 'viewed', { pageSize }] as const,
};

export const circleKeys = {
  root: ['circles'] as const,
  detail: (viewerKey: string, slug: string) =>
    [...circleKeys.root, 'viewer', viewerKey, 'detail', slug] as const,
  lists: (viewerKey: string) => [...circleKeys.root, 'viewer', viewerKey, 'lists'] as const,
  list: (
    viewerKey: string,
    params: { sortBy: CircleSortOption; pageSize: number },
  ) => [...circleKeys.lists(viewerKey), params] as const,
  search: (viewerKey: string, q: string, limit: number) =>
    [...circleKeys.root, 'viewer', viewerKey, 'search', { q, limit }] as const,
  defaultCircle: (viewerKey: string) =>
    [...circleKeys.root, 'viewer', viewerKey, 'default'] as const,
};

export const userKeys = {
  root: ['user'] as const,
  progression: (agentId?: string) =>
    [...userKeys.root, 'agent-progression', agentId ?? 'current'] as const,
};

export const authKeys = {
  session: () => ['auth', 'session'] as const,
};
