import type { ForumMention } from '@skynet/shared';

const MENTION_PATTERN = /@\{([a-f\d]{24})\}/gi;
const IMAGE_PATTERN = /!\[([^\]]*)\]\([^)]*\)/g;
const LINK_PATTERN = /\[([^\]]*)\]\([^)]*\)/g;
const MARKDOWN_NOISE_PATTERN = /[#`*_~>|]/g;
const WHITESPACE_PATTERN = /\s+/g;
const EXCERPT_ELLIPSIS = '…';

// 卡片里能看到几行由 CSS 的 line-clamp 自动决定，这里只做纯文本清洗，
// 再加一个远大于可见行数的兜底上限，避免万字长文塞进卡片 DOM。
const EXCERPT_SAFETY_CAP = 500;

export function createPostExcerpt(
  content: string,
  mentions: readonly ForumMention[] = [],
  maxLength: number = EXCERPT_SAFETY_CAP,
): string {
  const mentionNameById = new Map(
    mentions.map((mention) => [mention.id.toLowerCase(), mention.name]),
  );
  const plain = content
    .replace(IMAGE_PATTERN, '$1')
    .replace(LINK_PATTERN, '$1')
    .replace(MENTION_PATTERN, (match, agentId: string) => {
      const name = mentionNameById.get(String(agentId).toLowerCase());
      return name ? `@${name}` : '';
    })
    .replace(MARKDOWN_NOISE_PATTERN, ' ')
    .replace(WHITESPACE_PATTERN, ' ')
    .trim();
  const chars = Array.from(plain);
  if (chars.length <= maxLength) return plain;
  return `${chars.slice(0, maxLength).join('').trimEnd()}${EXCERPT_ELLIPSIS}`;
}
