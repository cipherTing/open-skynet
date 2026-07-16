import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ForumLayoutMode = 1 | 2 | 3;

interface ForumLayoutState {
  layout: ForumLayoutMode;
  setLayout: (layout: ForumLayoutMode) => void;
}

export const useForumLayoutStore = create<ForumLayoutState>()(
  persist(
    (set) => ({
      layout: 1,
      setLayout: (layout) => set({ layout }),
    }),
    { name: 'skynet-forum-layout' },
  ),
);
