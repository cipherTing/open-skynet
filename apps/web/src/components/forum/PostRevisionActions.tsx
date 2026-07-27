'use client';

import { useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Edit3, History } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import type { CursorPage, ForumPost, PostRevisionHistoryItem } from '@skynet/shared';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
import { TSkeleton, Timecode } from '@/components/ui/terminal';
import { forumApi } from '@/lib/api';
import { ForumRevisionEditorDialog, type RevisionSubmission } from './ForumRevisionEditorDialog';
import { PostTags } from './PostTags';
import { useCursorPaginationRetry } from '@/hooks/useCursorPaginationRetry';

interface PostRevisionActionsProps {
  post: ForumPost;
  canEdit: boolean;
  onUpdated: () => Promise<void>;
}

export function PostRevisionActions({ post, canEdit, onUpdated }: PostRevisionActionsProps) {
  const { t } = useTranslation();
  const [editOpen, setEditOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyQueryKey = ['forum', 'post-revisions', post.id, post.contentVersion] as const;
  const historyQuery = useInfiniteQuery({
    queryKey: historyQueryKey,
    queryFn: ({ pageParam }) =>
      forumApi.listPostRevisions(post.id, { cursor: pageParam, limit: 20 }),
    initialPageParam: null,
    getNextPageParam: (lastPage: CursorPage<PostRevisionHistoryItem>) =>
      lastPage.nextCursor ?? undefined,
    enabled: historyOpen,
  });
  const revisions = useMemo(
    () => historyQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [historyQuery.data?.pages],
  );
  const retryHistory = useCursorPaginationRetry({
    queryKey: historyQueryKey,
    error: historyQuery.error,
    isNextPageError: historyQuery.isFetchNextPageError,
    fetchNextPage: historyQuery.fetchNextPage,
    refetch: historyQuery.refetch,
  });

  const saveRevision = async (values: RevisionSubmission) => {
    await forumApi.revisePost(post.id, {
      expectedVersion: post.contentVersion,
      title: values.title,
      content: values.content,
      tags: values.tags,
      hidePreviousVersion: values.hidePreviousVersion,
      ...(values.hidePreviousVersion ? { hideReason: values.hideReason } : {}),
    });
    await onUpdated();
    setEditOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.15em]">
      {post.contentVersion > 1 ? (
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="inline-flex items-center gap-1 text-[var(--t-faint)] transition-colors [transition-timing-function:steps(2,end)] hover:text-[var(--t-accent)]"
        >
          <History className="h-3 w-3" />
          {t('revisions.editedVersion', { version: post.contentVersion })}
        </button>
      ) : null}
      {canEdit ? (
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="inline-flex items-center gap-1 text-[var(--t-faint)] transition-colors [transition-timing-function:steps(2,end)] hover:text-[var(--t-accent)]"
        >
          <Edit3 className="h-3 w-3" />
          {t('revisions.editPost')}
        </button>
      ) : null}

      {editOpen ? (
        <ForumRevisionEditorDialog
          key={`${post.id}:${post.contentVersion}`}
          kind="post"
          open
          initialTitle={post.title}
          initialContent={post.content}
          initialTags={post.tags}
          onOpenChange={setEditOpen}
          onSave={saveRevision}
        />
      ) : null}

      <TerminalDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        title={t('revisions.postHistory')}
        description={t('revisions.postHistoryDescription')}
        code="HISTORY.POST"
        size="lg"
        contentClassName="t-corner !fixed"
      >
        <div className="space-y-3">
          {historyQuery.isPending ? (
            <div role="status" aria-label={t('revisions.loading')}>
              <TSkeleton rows={4} />
            </div>
          ) : null}
          {revisions.map((revision) => (
            <article key={revision.version} className="border border-border bg-surface-1 p-4">
              <div className="flex items-center justify-between gap-3">
                <strong className="font-mono text-[11px] tracking-[0.12em] text-info">
                  {t('revisions.version', { version: revision.version })}
                </strong>
                <Timecode date={revision.createdAt} withDate />
              </div>
              {revision.content === null ? (
                <p className="mt-3 border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger">
                  {t('revisions.hiddenContent', {
                    reason: revision.publicContentHideReason ?? t('revisions.hiddenReasonFallback'),
                  })}
                </p>
              ) : (
                <>
                  <h3 className="mt-2 text-sm font-semibold text-text-primary">{revision.title}</h3>
                  {revision.tags ? (
                    <div className="mt-2">
                      <PostTags tags={revision.tags} compact />
                    </div>
                  ) : null}
                  <div className="prose-deck mt-3 text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                      {revision.content}
                    </ReactMarkdown>
                  </div>
                </>
              )}
            </article>
          ))}
          {historyQuery.isError ? (
            <p className="text-xs text-danger">{t('revisions.loadFailed')}</p>
          ) : null}
          {historyQuery.hasNextPage || historyQuery.isFetchNextPageError ? (
            <button
              type="button"
              disabled={historyQuery.isFetchingNextPage}
              onClick={() =>
                void (historyQuery.isFetchNextPageError
                  ? retryHistory()
                  : historyQuery.fetchNextPage({ cancelRefetch: false }))
              }
              className="font-mono text-[10px] uppercase tracking-[0.15em] text-info disabled:opacity-50"
            >
              {historyQuery.isFetchNextPageError
                ? t('app.retry')
                : historyQuery.isFetchingNextPage
                  ? t('revisions.loading')
                  : t('revisions.loadMore')}
            </button>
          ) : null}
        </div>
      </TerminalDialog>
    </div>
  );
}
