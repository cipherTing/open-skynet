import { HttpException } from '@nestjs/common';
import { CURSOR_PAGINATION_MAX_LENGTH } from '@/common/pagination/pagination.constants';
import {
  decodeHotCursor,
  decodeTimestampCursor,
  encodeHotCursor,
  encodeTimestampCursor,
  PAGINATION_CURSOR_KINDS,
  PAGINATION_CURSOR_TTL_SECONDS,
} from '@/common/pagination/pagination-cursor';

const DOCUMENT_ID = '507f1f77bcf86cd799439012';
const SUBJECT_ID = '507f1f77bcf86cd799439013';
const ISSUED_AT = new Date('2026-07-26T00:00:00.000Z');

function readErrorCode(action: () => void): string {
  try {
    action();
  } catch (error: unknown) {
    if (!(error instanceof HttpException)) throw error;
    const response: unknown = error.getResponse();
    if (
      response === null ||
      typeof response !== 'object' ||
      !('code' in response) ||
      typeof response.code !== 'string'
    ) {
      throw new Error('分页游标错误缺少稳定错误码');
    }
    return response.code;
  }
  throw new Error('分页游标操作未按预期失败');
}

describe('pagination cursor', () => {
  it('expires after the shared 72-hour lifetime', () => {
    const cursor = encodeTimestampCursor(
      PAGINATION_CURSOR_KINDS.POSTS,
      ISSUED_AT,
      DOCUMENT_ID,
      { context: { sortBy: 'latest' }, subjectId: SUBJECT_ID, now: ISSUED_AT },
    );
    const beforeExpiry = new Date(
      ISSUED_AT.getTime() + PAGINATION_CURSOR_TTL_SECONDS * 1000 - 1,
    );
    expect(
      decodeTimestampCursor(cursor, PAGINATION_CURSOR_KINDS.POSTS, {
        context: { sortBy: 'latest' },
        subjectId: SUBJECT_ID,
        now: beforeExpiry,
      }).id.toString(),
    ).toBe(DOCUMENT_ID);
    expect(
      readErrorCode(() =>
        decodeTimestampCursor(cursor, PAGINATION_CURSOR_KINDS.POSTS, {
          context: { sortBy: 'latest' },
          subjectId: SUBJECT_ID,
          now: new Date(beforeExpiry.getTime() + 1),
        }),
      ),
    ).toBe('PAGINATION_CURSOR_EXPIRED');
  });

  it('returns the generic invalid code for context and subject mismatches', () => {
    const cursor = encodeTimestampCursor(
      PAGINATION_CURSOR_KINDS.POSTS,
      ISSUED_AT,
      DOCUMENT_ID,
      { context: { sortBy: 'latest' }, subjectId: SUBJECT_ID },
    );
    expect(
      readErrorCode(() =>
        decodeTimestampCursor(cursor, PAGINATION_CURSOR_KINDS.POSTS, {
          context: { sortBy: 'hot' },
          subjectId: SUBJECT_ID,
        }),
      ),
    ).toBe('PAGINATION_CURSOR_INVALID');
    expect(
      readErrorCode(() =>
        decodeTimestampCursor(cursor, PAGINATION_CURSOR_KINDS.POSTS, {
          context: { sortBy: 'latest' },
          subjectId: DOCUMENT_ID,
        }),
      ),
    ).toBe('PAGINATION_CURSOR_INVALID');
  });

  it('keeps the largest hot-feed cursor inside the validated request limit', () => {
    const candidate = `${'a'.repeat(64)}:${DOCUMENT_ID}`;
    const cursor = encodeHotCursor(
      { start: candidate, current: candidate, wrapped: true },
      {
        context: {
          sortBy: 'hot',
          scope: 'my-circles',
          search: 'x'.repeat(200),
          circleId: DOCUMENT_ID,
          tags: ['QUESTION', 'VERIFY', 'SOLICIT'],
        },
        subjectId: SUBJECT_ID,
      },
    );
    expect(cursor.length).toBeLessThanOrEqual(CURSOR_PAGINATION_MAX_LENGTH);
    expect(
      decodeHotCursor(cursor, {
        context: {
          sortBy: 'hot',
          scope: 'my-circles',
          search: 'x'.repeat(200),
          circleId: DOCUMENT_ID,
          tags: ['QUESTION', 'VERIFY', 'SOLICIT'],
        },
        subjectId: SUBJECT_ID,
      }),
    ).toEqual({ start: candidate, current: candidate, wrapped: true });
  });
});
