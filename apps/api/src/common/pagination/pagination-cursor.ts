import { createHash } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { Types } from 'mongoose';
import { commonErrors } from '@/common/errors/business-errors';
import { decryptSecret, encryptSecret } from '@/common/security/encrypted-secret';

export const PAGINATION_CURSOR_TTL_SECONDS = 72 * 60 * 60;

const PAGINATION_CURSOR_VERSION = 1;
const PAGINATION_CURSOR_PURPOSE = 'pagination-cursor';
const MILLISECONDS_PER_SECOND = 1000;

export const PAGINATION_CURSOR_KINDS = {
  POSTS: 'POSTS',
  POST_REPLIES: 'POST_REPLIES',
  REPLY_CHILDREN: 'REPLY_CHILDREN',
  POST_REVISIONS: 'POST_REVISIONS',
  REPLY_REVISIONS: 'REPLY_REVISIONS',
  CIRCLES: 'CIRCLES',
  CIRCLE_MAINTENANCE_LOGS: 'CIRCLE_MAINTENANCE_LOGS',
  CIRCLE_PROPOSALS: 'CIRCLE_PROPOSALS',
  CIRCLE_PROPOSAL_COMMENTS: 'CIRCLE_PROPOSAL_COMMENTS',
  CIRCLE_PROPOSAL_REVISIONS: 'CIRCLE_PROPOSAL_REVISIONS',
  CIRCLE_PROPOSAL_VOTERS: 'CIRCLE_PROPOSAL_VOTERS',
  AGENT_POSTS: 'AGENT_POSTS',
  AGENT_REPLIES: 'AGENT_REPLIES',
  AGENT_CIRCLES: 'AGENT_CIRCLES',
  AGENT_FAVORITES: 'AGENT_FAVORITES',
  AGENT_INTERACTIONS: 'AGENT_INTERACTIONS',
  AGENT_VIEW_HISTORY: 'AGENT_VIEW_HISTORY',
} as const;

export type PaginationCursorKind =
  (typeof PAGINATION_CURSOR_KINDS)[keyof typeof PAGINATION_CURSOR_KINDS];

export type PaginationContextValue = string | number | boolean | null | readonly string[];
export type PaginationContext = Readonly<Record<string, PaginationContextValue>>;
export type PaginationCursorScalar = string | number | boolean | null;

type TimestampAndIdPosition = {
  type: 'TIMESTAMP_AND_ID';
  timestamp: string;
  id: string;
};

type OrdinalPosition = {
  type: 'ORDINAL';
  ordinal: number;
};

type CompositePosition = {
  type: 'COMPOSITE';
  values: PaginationCursorScalar[];
};

type HotPosition = {
  type: 'HOT';
  start: string;
  current: string | null;
  wrapped: boolean;
};

type PaginationCursorPosition =
  | TimestampAndIdPosition
  | OrdinalPosition
  | CompositePosition
  | HotPosition;

type PaginationCursorPayload = {
  version: typeof PAGINATION_CURSOR_VERSION;
  kind: PaginationCursorKind;
  contextHash: string;
  subjectHash: string | null;
  issuedAt: string;
  expiresAt: string;
  position: PaginationCursorPosition;
};

export interface TimestampCursorPosition {
  timestamp: Date;
  id: Types.ObjectId;
}

export interface HotCursorPosition {
  start: string;
  current: string | null;
  wrapped: boolean;
}

type CursorCodecOptions = {
  context?: PaginationContext;
  subjectId?: string;
  now?: Date;
};

function canonicalizeContext(context: PaginationContext): string {
  const normalized = Object.entries(context)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]);
  return JSON.stringify(normalized);
}

function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

function hashContext(context: PaginationContext | undefined): string {
  return hashValue(canonicalizeContext(context ?? {}));
}

function hashSubject(subjectId: string | undefined): string | null {
  return subjectId ? hashValue(subjectId) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCursorScalar(value: unknown): value is PaginationCursorScalar {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function parsePosition(value: unknown): PaginationCursorPosition {
  if (!isRecord(value) || typeof value['type'] !== 'string') {
    throw commonErrors.paginationCursorInvalid();
  }
  if (value['type'] === 'TIMESTAMP_AND_ID') {
    if (
      typeof value['timestamp'] !== 'string' ||
      typeof value['id'] !== 'string' ||
      !Types.ObjectId.isValid(value['id'])
    ) {
      throw commonErrors.paginationCursorInvalid();
    }
    const timestamp = new Date(value['timestamp']);
    if (Number.isNaN(timestamp.getTime())) throw commonErrors.paginationCursorInvalid();
    return { type: value['type'], timestamp: timestamp.toISOString(), id: value['id'] };
  }
  if (value['type'] === 'ORDINAL') {
    if (
      typeof value['ordinal'] !== 'number' ||
      !Number.isInteger(value['ordinal']) ||
      value['ordinal'] < 0
    ) {
      throw commonErrors.paginationCursorInvalid();
    }
    return { type: value['type'], ordinal: value['ordinal'] };
  }
  if (value['type'] === 'COMPOSITE') {
    if (!Array.isArray(value['values']) || !value['values'].every(isCursorScalar)) {
      throw commonErrors.paginationCursorInvalid();
    }
    return { type: value['type'], values: value['values'] };
  }
  if (value['type'] === 'HOT') {
    if (
      typeof value['start'] !== 'string' ||
      (value['current'] !== null && typeof value['current'] !== 'string') ||
      typeof value['wrapped'] !== 'boolean'
    ) {
      throw commonErrors.paginationCursorInvalid();
    }
    return {
      type: value['type'],
      start: value['start'],
      current: value['current'],
      wrapped: value['wrapped'],
    };
  }
  throw commonErrors.paginationCursorInvalid();
}

function parsePayload(value: unknown): PaginationCursorPayload {
  if (!isRecord(value) || !isRecord(value['position'])) {
    throw commonErrors.paginationCursorInvalid();
  }
  const kind = value['kind'];
  if (!Object.values(PAGINATION_CURSOR_KINDS).some((candidate) => candidate === kind)) {
    throw commonErrors.paginationCursorInvalid();
  }
  if (
    value['version'] !== PAGINATION_CURSOR_VERSION ||
    typeof value['contextHash'] !== 'string' ||
    (value['subjectHash'] !== null && typeof value['subjectHash'] !== 'string') ||
    typeof value['issuedAt'] !== 'string' ||
    typeof value['expiresAt'] !== 'string'
  ) {
    throw commonErrors.paginationCursorInvalid();
  }
  const issuedAt = new Date(value['issuedAt']);
  const expiresAt = new Date(value['expiresAt']);
  const expectedDuration = PAGINATION_CURSOR_TTL_SECONDS * MILLISECONDS_PER_SECOND;
  if (
    Number.isNaN(issuedAt.getTime()) ||
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt.getTime() - issuedAt.getTime() !== expectedDuration
  ) {
    throw commonErrors.paginationCursorInvalid();
  }
  return {
    version: PAGINATION_CURSOR_VERSION,
    kind: kind as PaginationCursorKind,
    contextHash: value['contextHash'],
    subjectHash: value['subjectHash'],
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    position: parsePosition(value['position']),
  };
}

function encodeCursor(
  kind: PaginationCursorKind,
  position: PaginationCursorPosition,
  options: CursorCodecOptions,
): string {
  const issuedAt = options.now ?? new Date();
  const expiresAt = new Date(
    issuedAt.getTime() + PAGINATION_CURSOR_TTL_SECONDS * MILLISECONDS_PER_SECOND,
  );
  const payload: PaginationCursorPayload = {
    version: PAGINATION_CURSOR_VERSION,
    kind,
    contextHash: hashContext(options.context),
    subjectHash: hashSubject(options.subjectId),
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    position,
  };
  return encryptSecret(JSON.stringify(payload), PAGINATION_CURSOR_PURPOSE, kind);
}

function decodeCursor(
  cursor: string,
  expectedKind: PaginationCursorKind,
  options: CursorCodecOptions,
): PaginationCursorPosition {
  let payload: PaginationCursorPayload;
  try {
    payload = parsePayload(
      JSON.parse(decryptSecret(cursor, PAGINATION_CURSOR_PURPOSE, expectedKind)) as unknown,
    );
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw commonErrors.paginationCursorInvalid();
  }
  if (
    payload.kind !== expectedKind ||
    payload.contextHash !== hashContext(options.context) ||
    payload.subjectHash !== hashSubject(options.subjectId)
  ) {
    throw commonErrors.paginationCursorInvalid();
  }
  const now = options.now ?? new Date();
  if (now.getTime() >= new Date(payload.expiresAt).getTime()) {
    throw commonErrors.paginationCursorExpired();
  }
  return payload.position;
}

export function encodeTimestampCursor(
  kind: PaginationCursorKind,
  timestamp: Date,
  id: string,
  options: CursorCodecOptions = {},
): string {
  return encodeCursor(
    kind,
    { type: 'TIMESTAMP_AND_ID', timestamp: timestamp.toISOString(), id },
    options,
  );
}

export function decodeTimestampCursor(
  cursor: string,
  expectedKind: PaginationCursorKind,
  options: CursorCodecOptions = {},
): TimestampCursorPosition {
  const position = decodeCursor(cursor, expectedKind, options);
  if (position.type !== 'TIMESTAMP_AND_ID') throw commonErrors.paginationCursorInvalid();
  return { timestamp: new Date(position.timestamp), id: new Types.ObjectId(position.id) };
}

export function encodeOrdinalCursor(
  kind: PaginationCursorKind,
  ordinal: number,
  options: CursorCodecOptions = {},
): string {
  return encodeCursor(kind, { type: 'ORDINAL', ordinal }, options);
}

export function decodeOrdinalCursor(
  cursor: string,
  expectedKind: PaginationCursorKind,
  options: CursorCodecOptions = {},
): number {
  const position = decodeCursor(cursor, expectedKind, options);
  if (position.type !== 'ORDINAL') throw commonErrors.paginationCursorInvalid();
  return position.ordinal;
}

export function encodeCompositeCursor(
  kind: PaginationCursorKind,
  values: PaginationCursorScalar[],
  options: CursorCodecOptions = {},
): string {
  return encodeCursor(kind, { type: 'COMPOSITE', values }, options);
}

export function decodeCompositeCursor(
  cursor: string,
  expectedKind: PaginationCursorKind,
  options: CursorCodecOptions = {},
): PaginationCursorScalar[] {
  const position = decodeCursor(cursor, expectedKind, options);
  if (position.type !== 'COMPOSITE') throw commonErrors.paginationCursorInvalid();
  return position.values;
}

export function encodeHotCursor(
  position: HotCursorPosition,
  options: CursorCodecOptions = {},
): string {
  return encodeCursor(PAGINATION_CURSOR_KINDS.POSTS, { type: 'HOT', ...position }, options);
}

export function decodeHotCursor(
  cursor: string,
  options: CursorCodecOptions = {},
): HotCursorPosition {
  const position = decodeCursor(cursor, PAGINATION_CURSOR_KINDS.POSTS, options);
  if (position.type !== 'HOT') throw commonErrors.paginationCursorInvalid();
  return { start: position.start, current: position.current, wrapped: position.wrapped };
}
