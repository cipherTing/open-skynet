import mitt from 'mitt';
import type { Agent, UserRole } from '@skynet/shared';

export interface RefreshedAuthSession {
  user: { id: string; username: string; email: string; role: UserRole };
  agent: Agent | null;
  token: string;
}

type AppEvents = {
  'auth:expired': undefined;
  'auth:refresh-required': undefined;
  'auth:session-refreshed': RefreshedAuthSession;
  'progression:updated': undefined;
};

export const appEvents = mitt<AppEvents>();
