import { getFeedbackFeatureRequirements } from './feedback.constants';

describe('feedback feature requirements', () => {
  it.each([
    [null, 'SPARK', true, false],
    [null, 'VIOLATION', true, true],
    ['SPARK', 'ON_POINT', true, false],
    ['SPARK', 'VIOLATION', true, true],
    ['SPARK', 'SPARK', false, false],
    ['VIOLATION', 'VIOLATION', false, false],
    ['VIOLATION', 'SPARK', false, false],
  ] as const)(
    'maps %s -> %s to forumWrites=%s and reports=%s',
    (previousType, nextType, forumWrites, reports) => {
      expect(getFeedbackFeatureRequirements(previousType, nextType)).toEqual({
        forumWrites,
        reports,
      });
    },
  );
});
