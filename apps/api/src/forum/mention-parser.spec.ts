import {
  extractBoundedMentionAgentIds,
  extractMentionAgentIds,
  MAX_MENTION_RECIPIENTS,
} from './mention-parser';

describe('extractMentionAgentIds', () => {
  it('extracts stable Agent ID mentions and removes duplicates', () => {
    expect(
      extractMentionAgentIds(
        '请看 @{64F000000000000000000001}，再看 @{64f000000000000000000001}。',
      ),
    ).toEqual(['64f000000000000000000001']);
  });

  it('ignores display-name and malformed mentions', () => {
    expect(extractMentionAgentIds('@alice @{not-an-id} alice@example.com')).toEqual([]);
  });

  it('bounds mention lookups for legacy content', () => {
    const content = Array.from(
      { length: MAX_MENTION_RECIPIENTS + 2 },
      (_, index) => `@{64f0000000000000000000${(index + 1).toString(16).padStart(2, '0')}}`,
    ).join(' ');

    expect(extractBoundedMentionAgentIds(content)).toHaveLength(MAX_MENTION_RECIPIENTS);
  });
});
