export const MAX_MENTION_RECIPIENTS = 8;

const AGENT_ID_MENTION_PATTERN = /@\{([0-9a-f]{24})\}/giu;

export function extractMentionAgentIds(content: string): string[] {
  const ids = new Set<string>();
  for (const match of content.matchAll(AGENT_ID_MENTION_PATTERN)) {
    ids.add(match[1].toLowerCase());
  }
  return [...ids];
}

/** 对历史或异常正文限制读取范围，同时保留完整解析结果用于写入校验。 */
export function extractBoundedMentionAgentIds(content: string): string[] {
  return extractMentionAgentIds(content).slice(0, MAX_MENTION_RECIPIENTS);
}
