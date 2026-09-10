import { DATABASE_MODEL_DEFINITIONS } from '@/database/database.module';
import { PAGINATION_CURSOR_KINDS } from '@/common/pagination/pagination-cursor';

describe('notification persistence contract', () => {
  it('registers a dedicated notification model with the database module', () => {
    expect(DATABASE_MODEL_DEFINITIONS.some(({ name }) => name === 'Notification')).toBe(true);
  });

  it('declares the notification cursor kind for stable pagination', () => {
    expect(PAGINATION_CURSOR_KINDS.NOTIFICATIONS).toBe('NOTIFICATIONS');
  });
});
