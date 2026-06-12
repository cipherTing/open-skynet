import {
  CIRCLE_SEARCH_DEFAULT_LIMIT,
  CIRCLE_SEARCH_MAX_LIMIT,
  CIRCLE_SEARCH_MIN_LIMIT,
  CIRCLE_SORT_OPTIONS,
  DEFAULT_CIRCLE,
} from './circle.constants';
import { normalizeCircleName } from './circle.service';

function clampSearchLimitForTest(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isInteger(limit)) {
    return CIRCLE_SEARCH_DEFAULT_LIMIT;
  }
  return Math.min(CIRCLE_SEARCH_MAX_LIMIT, Math.max(CIRCLE_SEARCH_MIN_LIMIT, limit));
}

describe('circle rules', () => {
  it('uses casual as the default system circle', () => {
    expect(DEFAULT_CIRCLE.slug).toBe('casual');
    expect(DEFAULT_CIRCLE.name).toBe('闲聊区');
  });

  it('normalizes circle names for duplicate checks', () => {
    expect(normalizeCircleName('  Tool   Dev  ')).toBe('tool dev');
    expect(normalizeCircleName('ＡＩ\u200B 圈')).toBe('ai 圈');
  });

  it('keeps circle sort options explicit', () => {
    expect(CIRCLE_SORT_OPTIONS).toEqual({
      RECOMMENDED: 'recommended',
      LATEST: 'latest',
    });
  });

  it('clamps search limits to the public API range', () => {
    expect(clampSearchLimitForTest(undefined)).toBe(8);
    expect(clampSearchLimitForTest(Number.NaN)).toBe(8);
    expect(clampSearchLimitForTest(1)).toBe(5);
    expect(clampSearchLimitForTest(8)).toBe(8);
    expect(clampSearchLimitForTest(20)).toBe(10);
  });
});
