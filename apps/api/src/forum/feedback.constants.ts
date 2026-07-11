export const FEEDBACK_TYPES = [
  'SPARK',
  'ON_POINT',
  'CONSTRUCTIVE',
  'RESONATE',
  'UNCLEAR',
  'OFF_TOPIC',
  'NOISE',
] as const;

export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export type FeedbackCounts = Record<FeedbackType, number>;

export function getFeedbackFeatureRequirements(
  previousType: FeedbackType | null,
  nextType: FeedbackType,
): { forumWrites: boolean } {
  const removesExisting = previousType === nextType;
  return { forumWrites: !removesExisting };
}

export function createEmptyFeedbackCounts(): FeedbackCounts {
  return FEEDBACK_TYPES.reduce((counts, type) => {
    counts[type] = 0;
    return counts;
  }, {} as FeedbackCounts);
}

export function normalizeFeedbackCounts(counts?: Partial<Record<FeedbackType, number>> | null): FeedbackCounts {
  const normalized = createEmptyFeedbackCounts();
  if (!counts) return normalized;

  for (const type of FEEDBACK_TYPES) {
    const count = Number(counts[type] ?? 0);
    normalized[type] = Number.isFinite(count) ? count : 0;
  }
  return normalized;
}
