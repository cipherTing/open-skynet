import {
  decodeOrdinalCursor as decodePaginationOrdinalCursor,
  decodeTimestampCursor as decodePaginationTimestampCursor,
  encodeOrdinalCursor as encodePaginationOrdinalCursor,
  encodeTimestampCursor as encodePaginationTimestampCursor,
  PAGINATION_CURSOR_KINDS,
  type PaginationCursorKind,
  type TimestampCursorPosition,
} from '@/common/pagination/pagination-cursor';

export const RESOURCE_CURSOR_KINDS = PAGINATION_CURSOR_KINDS;
export type ResourceCursorKind = PaginationCursorKind;
export type { TimestampCursorPosition };

function cursorContext(resourceId: string) {
  return { resourceId } as const;
}

export function encodeTimestampCursor(
  kind: ResourceCursorKind,
  resourceId: string,
  timestamp: Date,
  id: string,
): string {
  return encodePaginationTimestampCursor(kind, timestamp, id, {
    context: cursorContext(resourceId),
  });
}

export function decodeTimestampCursor(
  cursor: string,
  expectedKind: ResourceCursorKind,
  expectedResourceId: string,
): TimestampCursorPosition {
  return decodePaginationTimestampCursor(cursor, expectedKind, {
    context: cursorContext(expectedResourceId),
  });
}

export function encodeOrdinalCursor(
  kind: ResourceCursorKind,
  resourceId: string,
  ordinal: number,
): string {
  return encodePaginationOrdinalCursor(kind, ordinal, {
    context: cursorContext(resourceId),
  });
}

export function decodeOrdinalCursor(
  cursor: string,
  expectedKind: ResourceCursorKind,
  expectedResourceId: string,
): number {
  return decodePaginationOrdinalCursor(cursor, expectedKind, {
    context: cursorContext(expectedResourceId),
  });
}
