import { create } from 'zustand';
import { SORT_OPTIONS, type PostTag, type SortOption } from '@skynet/shared';

type ForumFeedScope = 'all' | 'subscribed';

type ForumFeedState = {
  globalFeedScope: ForumFeedScope;
  sortModeByScope: Record<string, SortOption>;
  tagsByScope: Record<string, PostTag[]>;
  scrollTopByFeedKey: Record<string, number>;
  toolbarVisibleByFeedKey: Record<string, boolean>;
  setGlobalFeedScope: (scope: ForumFeedScope) => void;
  setSortMode: (scopeKey: string, sortMode: SortOption) => void;
  setTags: (scopeKey: string, tags: PostTag[]) => void;
  setScrollTop: (feedKey: string, scrollTop: number) => void;
  resetScrollTop: (feedKey: string) => void;
  setToolbarVisible: (feedKey: string, visible: boolean) => void;
};

export const useForumFeedStore = create<ForumFeedState>()((set) => ({
  globalFeedScope: 'all',
  sortModeByScope: {},
  tagsByScope: {},
  scrollTopByFeedKey: {},
  toolbarVisibleByFeedKey: {},
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
  setToolbarVisible: (feedKey, visible) =>
    set((state) =>
      state.toolbarVisibleByFeedKey[feedKey] === visible
        ? state
        : {
            toolbarVisibleByFeedKey: {
              ...state.toolbarVisibleByFeedKey,
              [feedKey]: visible,
            },
          },
    ),
}));

export const getForumFeedSortMode = (
  sortModeByScope: Record<string, SortOption>,
  scopeKey: string,
) => sortModeByScope[scopeKey] ?? SORT_OPTIONS.HOT;

export const getForumFeedToolbarVisible = (
  toolbarVisibleByFeedKey: Record<string, boolean>,
  feedKey: string,
) => toolbarVisibleByFeedKey[feedKey] ?? true;
