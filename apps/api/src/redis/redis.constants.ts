export const REDIS_SET_EXPIRATION_UNITS = {
  SECONDS: 'EX',
  MILLISECONDS: 'PX',
} as const;

export const REDIS_SET_CONDITIONS = {
  IF_NOT_EXISTS: 'NX',
} as const;

export const REDIS_SET_RESULTS = {
  STORED: 'OK',
} as const;
