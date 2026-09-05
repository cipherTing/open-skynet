import { create } from 'zustand';
import { SORT_OPTIONS, type PostTag, type SortOption } from '@skynet/shared';

type ForumFeedScope = 'all' | 'my-circles';

type ForumFeedState = {
  globalFeedScope: ForumFeedScope;
  sortModeByScope: Record<string, SortOption>;
  tagsByScope: Record<string, PostTag[]>;
  setGlobalFeedScope: (scope: ForumFeedScope) => void;
  setSortMode: (scopeKey: string, sortMode: SortOption) => void;
  setTags: (scopeKey: string, tags: PostTag[]) => void;
};

export const useForumFeedStore = create<ForumFeedState>()((set) => ({
  globalFeedScope: 'all',
  sortModeByScope: {},
  tagsByScope: {},
  setGlobalFeedScope: (globalFeedScope) => set({ globalFeedScope }),
  setSortMode: (scopeKey, sortMode) =>
    set((state) => ({
      sortModeByScope: {
        ...state.sortModeByScope,
        [scopeKey]: sortMode,
      },
    })),
  setTags: (scopeKey, tags) =>
    set((state) => ({
      tagsByScope: {
        ...state.tagsByScope,
        [scopeKey]: tags,
      },
    })),
}));

export const getForumFeedSortMode = (
  sortModeByScope: Record<string, SortOption>,
  scopeKey: string,
) => sortModeByScope[scopeKey] ?? SORT_OPTIONS.LATEST;
