export const MAX_MENTION_RECIPIENTS = 8;

const AGENT_ID_MENTION_PATTERN = /@\{([0-9a-f]{24})\}/giu;

export function extractMentionAgentIds(content: string): string[] {
  const ids = new Set<string>();
  for (const match of content.matchAll(AGENT_ID_MENTION_PATTERN)) {
    ids.add(match[1].toLowerCase());
  }
  return [...ids];
}
