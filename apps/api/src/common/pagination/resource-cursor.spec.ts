import { HttpException } from '@nestjs/common';
import {
  decodeOrdinalCursor,
  decodeTimestampCursor,
  encodeOrdinalCursor,
  encodeTimestampCursor,
  RESOURCE_CURSOR_KINDS,
} from './resource-cursor';

const RESOURCE_ID = '507f1f77bcf86cd799439011';
const DOCUMENT_ID = '507f1f77bcf86cd799439012';

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
      throw new Error('资源游标错误缺少稳定错误码');
    }
    return response.code;
  }
  throw new Error('资源游标操作未按预期失败');
}

describe('resource cursor', () => {
  it('round-trips a timestamp cursor and binds it to kind and resource', () => {
    const timestamp = new Date('2026-07-24T00:00:00.000Z');
    const cursor = encodeTimestampCursor(
      RESOURCE_CURSOR_KINDS.AGENT_POSTS,
      RESOURCE_ID,
      timestamp,
      DOCUMENT_ID,
    );

    const decoded = decodeTimestampCursor(cursor, RESOURCE_CURSOR_KINDS.AGENT_POSTS, RESOURCE_ID);
    expect(decoded.timestamp).toEqual(timestamp);
    expect(decoded.id.toString()).toBe(DOCUMENT_ID);
    expect(
      readErrorCode(() =>
        decodeTimestampCursor(cursor, RESOURCE_CURSOR_KINDS.AGENT_REPLIES, RESOURCE_ID),
      ),
    ).toBe('PAGINATION_CURSOR_INVALID');
    expect(
      readErrorCode(() =>
        decodeTimestampCursor(cursor, RESOURCE_CURSOR_KINDS.AGENT_POSTS, DOCUMENT_ID),
      ),
    ).toBe('PAGINATION_CURSOR_INVALID');
  });

  it('round-trips a story directory cursor and binds it to the active filters', () => {
    const filterContext = JSON.stringify({ phase: 'opening', genre: null });
    const cursor = encodeTimestampCursor(
      RESOURCE_CURSOR_KINDS.STORIES,
      filterContext,
      new Date('2026-10-14T08:00:00.000Z'),
      DOCUMENT_ID,
    );

    const decoded = decodeTimestampCursor(cursor, RESOURCE_CURSOR_KINDS.STORIES, filterContext);
    expect(decoded.timestamp).toEqual(new Date('2026-10-14T08:00:00.000Z'));
    expect(decoded.id.toString()).toBe(DOCUMENT_ID);
    expect(() =>
      decodeTimestampCursor(
        cursor,
        RESOURCE_CURSOR_KINDS.STORIES,
        JSON.stringify({ phase: 'setting', genre: null }),
      ),
    ).toThrow();
  });

  it('binds story conflict and collaboration case cursors to distinct resource kinds', () => {
    const context = `${RESOURCE_ID}:collaboration`;
    const timestamp = new Date('2026-10-14T08:00:00.000Z');
    const conflictCursor = encodeTimestampCursor(
      RESOURCE_CURSOR_KINDS.STORY_CONFLICTS,
      context,
      timestamp,
      DOCUMENT_ID,
    );
    const caseCursor = encodeTimestampCursor(
      RESOURCE_CURSOR_KINDS.STORY_COLLABORATION_CASES,
      context,
      timestamp,
      DOCUMENT_ID,
    );

    expect(
      decodeTimestampCursor(
        conflictCursor,
        RESOURCE_CURSOR_KINDS.STORY_CONFLICTS,
        context,
      ).timestamp,
    ).toEqual(timestamp);
    expect(
      readErrorCode(() =>
        decodeTimestampCursor(
          conflictCursor,
          RESOURCE_CURSOR_KINDS.STORY_COLLABORATION_CASES,
          context,
        ),
      ),
    ).toBe('PAGINATION_CURSOR_INVALID');
    expect(
      readErrorCode(() =>
        decodeTimestampCursor(
          caseCursor,
          RESOURCE_CURSOR_KINDS.STORY_CONFLICTS,
          context,
        ),
      ),
    ).toBe('PAGINATION_CURSOR_INVALID');
  });

  it('round-trips an ordinal cursor and rejects malformed payloads', () => {
    const cursor = encodeOrdinalCursor(
      RESOURCE_CURSOR_KINDS.CIRCLE_PROPOSAL_REVISIONS,
      RESOURCE_ID,
      12,
    );

    expect(
      decodeOrdinalCursor(cursor, RESOURCE_CURSOR_KINDS.CIRCLE_PROPOSAL_REVISIONS, RESOURCE_ID),
    ).toBe(12);
    expect(() =>
      decodeOrdinalCursor(
        'not-a-cursor',
        RESOURCE_CURSOR_KINDS.CIRCLE_PROPOSAL_REVISIONS,
        RESOURCE_ID,
      ),
    ).toThrow();
  });

  it('rejects a cursor whose encrypted payload was changed', () => {
    const cursor = encodeTimestampCursor(
      RESOURCE_CURSOR_KINDS.AGENT_POSTS,
      RESOURCE_ID,
      new Date('2026-07-24T00:00:00.000Z'),
      DOCUMENT_ID,
    );
    const finalCharacter = cursor.at(-1);
    if (!finalCharacter) throw new Error('测试游标为空');
    const tamperedCursor = `${cursor.slice(0, -1)}${finalCharacter === 'A' ? 'B' : 'A'}`;

    expect(
      readErrorCode(() =>
        decodeTimestampCursor(tamperedCursor, RESOURCE_CURSOR_KINDS.AGENT_POSTS, RESOURCE_ID),
      ),
    ).toBe('PAGINATION_CURSOR_INVALID');
  });
});
