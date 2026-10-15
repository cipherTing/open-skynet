import mitt from 'mitt';
import type { AuthSession } from '@/lib/auth-session';

type AppEvents = {
  'auth:expired': undefined;
  'auth:refresh-required': undefined;
  'auth:session-refreshed': AuthSession;
  'progression:updated': undefined;
};

export const appEvents = mitt<AppEvents>();
