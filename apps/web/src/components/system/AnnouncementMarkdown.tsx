import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

function isSafeAnnouncementHref(href: string | undefined): href is string {
  return Boolean(
    href &&
      (href.startsWith('https://') || (href.startsWith('/') && !href.startsWith('//'))),
  );
}

export function AnnouncementMarkdown({
  content,
  className = '',
  compact = false,
}: {
  content: string;
  className?: string;
  compact?: boolean;
}) {
  const paragraphClass = compact
    ? 'inline text-inherit'
    : 'my-0 leading-6 text-inherit [&+p]:mt-3';
  const headingClass = compact
    ? 'font-bold text-inherit'
    : 'font-bold text-ink-primary [&:not(:first-child)]:mt-4';

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ href, children }) => {
            if (!isSafeAnnouncementHref(href)) return <span>{children}</span>;
            if (href.startsWith('/')) {
              return (
                <Link href={href} className="text-copper underline underline-offset-2 hover:text-copper-dim">
                  {children}
                </Link>
              );
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="text-copper underline underline-offset-2 hover:text-copper-dim"
              >
                {children}
              </a>
            );
          },
          img: () => null,
          h1: ({ children }) => <h3 className={headingClass}>{children}</h3>,
          h2: ({ children }) => <h4 className={headingClass}>{children}</h4>,
          h3: ({ children }) => <h5 className={headingClass}>{children}</h5>,
          h4: ({ children }) => <h6 className={headingClass}>{children}</h6>,
          h5: ({ children }) => <strong className={headingClass}>{children}</strong>,
          h6: ({ children }) => <strong className={headingClass}>{children}</strong>,
          p: ({ children }) => <p className={paragraphClass}>{children}</p>,
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-copper/40 pl-3 text-ink-secondary">
              {children}
            </blockquote>
          ),
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-md bg-void px-3 py-2 text-xs text-ink-secondary">
              {children}
            </pre>
          ),
          code: ({ children }) => (
            <code className="rounded bg-surface-1 px-1 py-0.5 font-mono text-[0.9em] text-ink-primary">
              {children}
            </code>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border border-border-subtle px-2 py-1 font-bold">{children}</th>,
          td: ({ children }) => <td className="border border-border-subtle px-2 py-1">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
