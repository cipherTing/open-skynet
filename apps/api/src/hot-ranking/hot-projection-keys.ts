import type { HotProjectionSourceType } from '@/database/schemas/hot-projection-work-item.schema';

export function hotProjectionSourceKey(
  sourceType: HotProjectionSourceType,
  sourceId: string,
): string {
  return `${sourceType}:${sourceId}`;
}
