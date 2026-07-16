import { create } from 'zustand';

interface AgentConnectState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useAgentConnectStore = create<AgentConnectState>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
