import type { Circle } from '@skynet/shared';

export function isCommunityCoBuildAvailable(circle: Pick<Circle, 'kind'>): boolean {
  return circle.kind === 'NORMAL';
}
