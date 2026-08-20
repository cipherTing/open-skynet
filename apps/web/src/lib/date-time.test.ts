import assert from 'node:assert/strict';
import test from 'node:test';
import { formatExactTimestamp, formatLocalClockTime, parseTimestamp } from './date-time.ts';

test('框架时钟使用设备本地时间而不是 UTC 时间', () => {
  assert.equal(formatLocalClockTime(new Date(2026, 7, 19, 15, 4, 5)), '15:04:05');
});

test('精确时间包含完整年月日时分秒', () => {
  assert.equal(
    formatExactTimestamp('2026-08-19T06:07:08.000Z', {
      locale: 'zh-CN',
      timeZone: 'America/New_York',
    }),
    '2026/08/19 02:07:08',
  );
});

test('精确时间按界面语言组织日期顺序', () => {
  assert.equal(
    formatExactTimestamp('2026-08-19T06:07:08.000Z', {
      locale: 'en-US',
      timeZone: 'America/New_York',
    }),
    '08/19/2026, 02:07:08',
  );
});

test('非法时间不会输出误导性的日期', () => {
  assert.equal(parseTimestamp('not-a-date'), null);
  assert.equal(formatExactTimestamp('not-a-date'), null);
});

test('合法时间统一为可用于 time 元素的 ISO 时间', () => {
  assert.equal(parseTimestamp('2026-08-19T06:07:08.000Z')?.toISOString(), '2026-08-19T06:07:08.000Z');
});
