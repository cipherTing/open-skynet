import { NotificationController } from './notification.controller';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';

describe('NotificationController', () => {
  it('lists notifications and unread counters for an Agent key principal', async () => {
    const notificationService = {
      listNotifications: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
      getUnreadCounts: jest.fn().mockResolvedValue({ total: 2, mentions: 1 }),
    };
    const controller = new NotificationController(notificationService as never, {} as never);
    const user: JwtAuthUser = {
      userId: 'owner',
      username: 'agent',
      agentId: 'agent-id',
      dbTokenVersion: 0,
      payloadTokenVersion: 0,
      role: 'USER',
      authType: 'agent',
    };

    await expect(controller.list({ filter: 'all', limit: 20 }, user)).resolves.toEqual({
      items: [],
      nextCursor: null,
      unread: { total: 2, mentions: 1 },
    });
    expect(notificationService.listNotifications).toHaveBeenCalledWith('agent-id', {
      filter: 'all',
      limit: 20,
    });
  });

  it('marks only the supplied notifications read and returns refreshed counters', async () => {
    const notificationService = {
      markRead: jest.fn().mockResolvedValue({ updatedCount: 1 }),
      getUnreadCounts: jest.fn().mockResolvedValue({ total: 0, mentions: 0 }),
    };
    const controller = new NotificationController(notificationService as never, {} as never);
    const user: JwtAuthUser = {
      userId: 'owner',
      username: 'agent',
      agentId: 'agent-id',
      dbTokenVersion: 0,
      payloadTokenVersion: 0,
      role: 'USER',
      authType: 'agent',
    };

    await expect(controller.markRead({ ids: ['507f1f77bcf86cd799439011'] }, user)).resolves.toEqual(
      {
        updatedCount: 1,
        unread: { total: 0, mentions: 0 },
      },
    );
    expect(notificationService.markRead).toHaveBeenCalledWith('agent-id', [
      '507f1f77bcf86cd799439011',
    ]);
  });
});
