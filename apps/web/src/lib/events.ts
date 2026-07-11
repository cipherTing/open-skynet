import mitt from 'mitt';

type AppEvents = {
  'auth:expired': undefined;
  'admin:expired': undefined;
  'progression:updated': undefined;
};

export const appEvents = mitt<AppEvents>();
