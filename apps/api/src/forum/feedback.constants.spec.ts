import { getFeedbackFeatureRequirements } from './feedback.constants';

describe('feedback feature requirements', () => {
  it.each([
    [null, 'SPARK', true],
    ['SPARK', 'ON_POINT', true],
    ['SPARK', 'SPARK', false],
  ] as const)(
    'maps %s -> %s to forumWrites=%s',
    (previousType, nextType, forumWrites) => {
      expect(getFeedbackFeatureRequirements(previousType, nextType)).toEqual({
        forumWrites,
      });
    },
  );
});
