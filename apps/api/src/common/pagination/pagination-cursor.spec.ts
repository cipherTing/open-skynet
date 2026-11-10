import { HttpException } from '@nestjs/common';
import { CURSOR_PAGINATION_MAX_LENGTH } from '@/common/pagination/pagination.constants';
import {
  decodeHotCursor,
  decodeTimestampCursor,
  encodeHotCursor,
  encodeTimestampCursor,
  PAGINATION_CURSOR_KINDS,
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
  it('invalidates a prior server run cursor while keeping the active run pageable', () => {
    let firstRun: typeof import('./pagination-cursor') | undefined;
    let secondRun: typeof import('./pagination-cursor') | undefined;
    jest.isolateModules(() => {
      firstRun = jest.requireActual<typeof import('./pagination-cursor')>('./pagination-cursor');
    });
    jest.isolateModules(() => {
      secondRun = jest.requireActual<typeof import('./pagination-cursor')>('./pagination-cursor');
    });
    if (!firstRun || !secondRun) throw new Error('Cursor server runs were not initialized');
    const activeRun = secondRun;
    const options = { context: { sortBy: 'latest' } };
    const firstCursor = firstRun.encodeTimestampCursor(
      firstRun.PAGINATION_CURSOR_KINDS.POSTS,
      ISSUED_AT,
      DOCUMENT_ID,
      options,
    );
    expect(
      firstRun
        .decodeTimestampCursor(firstCursor, firstRun.PAGINATION_CURSOR_KINDS.POSTS, options)
        .id.toString(),
    ).toBe(DOCUMENT_ID);
    expect(() =>
      activeRun.decodeTimestampCursor(
        firstCursor,
        activeRun.PAGINATION_CURSOR_KINDS.POSTS,
        options,
      ),
    ).toThrow();
    const activeCursor = activeRun.encodeTimestampCursor(
      activeRun.PAGINATION_CURSOR_KINDS.POSTS,
      ISSUED_AT,
      DOCUMENT_ID,
      options,
    );
    expect(
      activeRun
        .decodeTimestampCursor(activeCursor, activeRun.PAGINATION_CURSOR_KINDS.POSTS, options)
        .id.toString(),
    ).toBe(DOCUMENT_ID);
  });

  it('keeps a cursor valid for the current server run beyond 72 hours', () => {
    jest.useFakeTimers();
    jest.setSystemTime(ISSUED_AT);
    try {
      const cursor = encodeTimestampCursor(PAGINATION_CURSOR_KINDS.POSTS, ISSUED_AT, DOCUMENT_ID, {
        context: { sortBy: 'latest' },
        subjectId: SUBJECT_ID,
      });
      jest.setSystemTime(new Date(ISSUED_AT.getTime() + 73 * 60 * 60 * 1000));
      expect(
        decodeTimestampCursor(cursor, PAGINATION_CURSOR_KINDS.POSTS, {
          context: { sortBy: 'latest' },
          subjectId: SUBJECT_ID,
        }).id.toString(),
      ).toBe(DOCUMENT_ID);
    } finally {
      jest.useRealTimers();
    }
  });

  it('returns the generic invalid code for context and subject mismatches', () => {
    const cursor = encodeTimestampCursor(PAGINATION_CURSOR_KINDS.POSTS, ISSUED_AT, DOCUMENT_ID, {
      context: { sortBy: 'latest' },
      subjectId: SUBJECT_ID,
    });
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
