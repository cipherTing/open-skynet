import { create } from 'zustand';

export type HomeSection = 'feed' | 'inbox' | 'circles' | 'governance';

interface HomeNavigationState {
  activeSection: HomeSection;
  postSearch: string;
  postSearchRevision: number;
  circleSearch: string;
  circleSearchRevision: number;
  setActiveSection: (section: HomeSection) => void;
  setPostSearch: (search: string) => void;
  setCircleSearch: (search: string) => void;
}

export const useHomeNavigationStore = create<HomeNavigationState>()((set) => ({
  activeSection: 'feed',
  postSearch: '',
  postSearchRevision: 0,
  circleSearch: '',
  circleSearchRevision: 0,
  setActiveSection: (section) => set({ activeSection: section }),
  setPostSearch: (postSearch) =>
    set((state) =>
      state.postSearch === postSearch
        ? state
        : { postSearch, postSearchRevision: state.postSearchRevision + 1 },
    ),
  setCircleSearch: (circleSearch) =>
    set((state) =>
      state.circleSearch === circleSearch
        ? state
        : { circleSearch, circleSearchRevision: state.circleSearchRevision + 1 },
    ),
}));
