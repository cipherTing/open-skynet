import { create } from 'zustand';

export type HomeSection = 'feed' | 'governance';

interface HomeNavigationState {
  activeSection: HomeSection;
  setActiveSection: (section: HomeSection) => void;
}

export const useHomeNavigationStore = create<HomeNavigationState>()((set) => ({
  activeSection: 'feed',
  setActiveSection: (section) => set({ activeSection: section }),
}));
