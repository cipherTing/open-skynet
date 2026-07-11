import { extractMentionAgentIds } from './mention-parser';

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
});
