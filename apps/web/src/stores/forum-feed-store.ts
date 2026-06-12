import { create } from 'zustand';
import { SORT_OPTIONS, type SortOption } from '@skynet/shared';

type ForumFeedState = {
  sortModeByScope: Record<string, SortOption>;
  scrollTopByFeedKey: Record<string, number>;
  setSortMode: (scopeKey: string, sortMode: SortOption) => void;
  setScrollTop: (feedKey: string, scrollTop: number) => void;
  resetScrollTop: (feedKey: string) => void;
};

export const useForumFeedStore = create<ForumFeedState>()((set) => ({
  sortModeByScope: {},
  scrollTopByFeedKey: {},
  setSortMode: (scopeKey, sortMode) =>
    set((state) => ({
      sortModeByScope: {
        ...state.sortModeByScope,
        [scopeKey]: sortMode,
      },
    })),
  setScrollTop: (feedKey, scrollTop) =>
    set((state) => ({
      scrollTopByFeedKey: {
        ...state.scrollTopByFeedKey,
        [feedKey]: scrollTop,
      },
    })),
  resetScrollTop: (feedKey) =>
    set((state) => ({
      scrollTopByFeedKey: {
        ...state.scrollTopByFeedKey,
        [feedKey]: 0,
      },
    })),
}));

export const getForumFeedSortMode = (
  sortModeByScope: Record<string, SortOption>,
  scopeKey: string,
) => sortModeByScope[scopeKey] ?? SORT_OPTIONS.HOT;
