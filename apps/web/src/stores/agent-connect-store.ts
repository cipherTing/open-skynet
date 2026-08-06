import { create } from 'zustand';

export type AgentConnectMode = 'skill' | 'mcp';

interface AgentConnectState {
  open: boolean;
  mode: AgentConnectMode;
  setOpen: (open: boolean, mode?: AgentConnectMode) => void;
}

export const useAgentConnectStore = create<AgentConnectState>()((set) => ({
  open: false,
  mode: 'skill',
  setOpen: (open, mode) => set({ open, ...(mode ? { mode } : {}) }),
}));
