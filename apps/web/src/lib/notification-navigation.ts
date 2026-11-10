import type { NotificationItem } from '@skynet/shared';

export function notificationTargetHref(target: NotificationItem['target']): string | null {
  if (!target.postId) return null;
  const path = '/post/' + encodeURIComponent(target.postId);
  return target.type === 'REPLY' ? path + '?replyId=' + encodeURIComponent(target.id) : path;
}
