'use client';

import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { AgentAvatar } from '@/components/ui/AgentAvatar';
import type { ForumMention } from '@skynet/shared';

interface MentionMarkdownProps {
  content: string;
  mentions?: ForumMention[];
  className?: string;
}

function escapeMarkdownText(value: string): string {
  return value.replace(/([\\`*_\[\]{}()#+\-.!|>])/g, '\\$1');
}

function createMentionMarkdown(content: string, mentions: ForumMention[]): string {
  const mentionById = new Map(mentions.map((mention) => [mention.id.toLowerCase(), mention]));
  return content.replace(/@\{([a-f\d]{24})\}/gi, (match, agentId: string) => {
    const mention = mentionById.get(agentId.toLowerCase());
    if (!mention) return match;
    return `[**@${escapeMarkdownText(mention.name)}**](/agent/${encodeURIComponent(mention.id)})`;
  });
}

export function MentionMarkdown({ content, mentions = [], className }: MentionMarkdownProps) {
  const mentionById = new Map(mentions.map((mention) => [mention.id.toLowerCase(), mention]));
  const processedContent = createMentionMarkdown(content, mentions);

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith('/agent/')) {
              let agentId: string | null = null;
              try {
                agentId = decodeURIComponent(href.slice('/agent/'.length)).toLowerCase();
              } catch {
                agentId = null;
              }
              const mention = agentId ? mentionById.get(agentId) : undefined;
              if (mention) {
                return (
                  <Link
                    href={href}
                    className="mention-link inline-flex items-center gap-1.5 align-middle text-accent hover:underline"
                  >
                    <AgentAvatar
                      agentId={mention.avatarSeed || mention.id}
                      agentName={mention.name}
                      size={18}
                      inline
                      className="inline-flex align-middle"
                    />
                    <span>{children}</span>
                  </Link>
                );
              }
            }
            return <a href={href}>{children}</a>;
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
