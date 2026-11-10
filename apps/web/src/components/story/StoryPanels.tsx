'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { BookOpenText } from 'lucide-react';
import { getSkynetSkillResources } from '@skynet/shared';
import { ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import { TButton, TPanel } from '@/components/ui/terminal';
import { PRODUCT_VERSION } from '@/lib/product-version';
import {
  STORY_PAGE_SIZE,
  storyApi,
  type StoryApiDiscussion,
  type StoryApiDiscussionMessage,
  type StoryApiDocumentSnapshot,
  type StoryApiPage,
  type StoryApiRevisionSummary,
  type StoryApiCollaborationCase,
  type StoryApiActivity,
  type StoryApiMetadataSnapshot,
} from '@/lib/story-api';
import { buildStoryHref } from './story-workflow';

const SKILL_RESOURCES = getSkynetSkillResources(PRODUCT_VERSION);
const NOVEL_REFERENCE_URL = new URL('references/novel.md', SKILL_RESOURCES.rootUrl).href;
export const storyLinkClass =
  'break-words text-[var(--t-accent)] underline underline-offset-4 hover:text-white';

export function StorySkillPrompt({
  action = 'contribute',
}: {
  action?: 'contribute' | 'create' | 'discuss' | 'restore' | 'review';
}) {
  const { t } = useTranslation();
  return (
    <aside
      className="border border-[var(--t-noise)] px-3 py-2 font-sans text-[11px] leading-6 text-[var(--t-sub)]"
      aria-label={t('story.reading.skillTitle')}
    >
      <BookOpenText aria-hidden="true" className="mr-2 inline h-3.5 w-3.5 text-[var(--t-accent)]" />
      <span>{t('story.reading.prompts.' + action)}</span>{' '}
      <Link href={NOVEL_REFERENCE_URL} target="_blank" rel="noreferrer" className={storyLinkClass}>
        {t('story.reading.novelReference')}
      </Link>
      <span aria-hidden="true"> · </span>
      <Link
        href={SKILL_RESOURCES.entryUrl}
        target="_blank"
        rel="noreferrer"
        className={storyLinkClass}
      >
        {t('story.reading.skillEntry')}
      </Link>
    </aside>
  );
}

export function StoryMarkdown({ children }: { children: string }) {
  return (
    <article className="prose prose-invert prose-sm max-w-none break-words font-sans leading-8 text-[var(--t-text)] prose-headings:font-semibold prose-a:text-[var(--t-accent)] prose-strong:text-white">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {children}
      </ReactMarkdown>
    </article>
  );
}

export function StoryPager({
  hasMore,
  loading,
  failed = false,
  load,
}: {
  hasMore: boolean;
  loading: boolean;
  failed?: boolean;
  load: () => void;
}) {
  const { t } = useTranslation();
  return hasMore || failed ? (
    <div className="mt-4 border-t border-[var(--t-noise)] pt-3">
      {failed ? (
        <p role="alert" className="mb-2 text-[11px] text-[var(--t-hazard)]">
          {t('story.reading.loadMoreFailed')}
        </p>
      ) : null}
      <TButton size="sm" variant="secondary" disabled={loading} onClick={load}>
        {t(loading ? 'story.reading.loadingMore' : failed ? 'app.retry' : 'story.reading.loadMore')}
      </TButton>
    </div>
  ) : null;
}

export function StoryQueryStatus({
  pending,
  failed,
  retry,
  children,
}: {
  pending: boolean;
  failed: boolean;
  retry: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  if (pending) return <InlineLoading label={t('story.reading.loading')} />;
  if (failed) return <ErrorState message={t('story.reading.loadFailed')} onAction={retry} />;
  return children;
}

export function useStoryPages<T>(
  key: readonly (string | number | null)[],
  load: (cursor: string | undefined) => Promise<StoryApiPage<T>>,
) {
  return useInfiniteQuery({
    queryKey: key,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => load(pageParam),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
}

export function StoryDate({ value }: { value: string }) {
  const { i18n } = useTranslation();
  return (
    <time dateTime={value}>
      {new Intl.DateTimeFormat(i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))}
    </time>
  );
}

export function StoryOpening({ snapshot }: { snapshot: StoryApiMetadataSnapshot }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <h2 className="break-words text-2xl font-semibold text-white">{snapshot.title}</h2>
      <StoryMarkdown>{snapshot.premise}</StoryMarkdown>
      <dl className="grid gap-x-5 gap-y-2 font-sans text-[12px] leading-6 sm:grid-cols-[100px_minmax(0,1fr)]">
        <dt className="text-[var(--t-faint)]">{t('story.reading.phase')}</dt>
        <dd>{t('story.phases.' + snapshot.phase)}</dd>
        {(['genre', 'tone', 'viewpoint', 'targetLength'] as const).map((key) =>
          snapshot[key] ? (
            <div key={key} className="contents">
              <dt className="text-[var(--t-faint)]">{t('story.reading.' + key)}</dt>
              <dd className="break-words">{snapshot[key]}</dd>
            </div>
          ) : null,
        )}
      </dl>
      {snapshot.establishedDirection ? (
        <section>
          <h3 className="mb-2 font-semibold text-white">{t('story.reading.direction')}</h3>
          <StoryMarkdown>{snapshot.establishedDirection}</StoryMarkdown>
        </section>
      ) : null}
      {snapshot.openQuestions.length ? (
        <section>
          <h3 className="mb-2 font-semibold text-white">{t('story.reading.openQuestions')}</h3>
          <ul className="list-inside list-disc space-y-2 font-sans text-[13px] leading-7">
            {snapshot.openQuestions.map((question, index) => (
              <li key={index}>{question}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function StoryRelated({
  storyId,
  documentId,
  snapshot,
}: {
  storyId: string;
  documentId: string;
  snapshot: StoryApiDocumentSnapshot;
}) {
  const { t } = useTranslation();
  const ids = [...new Set(snapshot.links.map((link) => link.targetDocumentId))];
  const targets = useQuery({
    queryKey: ['story', storyId, 'links', ...ids],
    queryFn: async () =>
      (
        await Promise.all(
          Array.from({ length: Math.ceil(ids.length / 50) }, (_, index) =>
            storyApi.listDocuments(storyId, {
              documentIds: ids.slice(index * 50, (index + 1) * 50),
            }),
          ),
        )
      ).flatMap((page) => page.items),
    enabled: ids.length > 0,
    retry: false,
  });
  const references = useStoryPages(['story', storyId, 'references', documentId], (cursor) =>
    storyApi.listReferences(storyId, documentId, { cursor, limit: STORY_PAGE_SIZE }),
  );
  return (
    <div className="space-y-5">
      <TPanel title={t('story.reading.related')}>
        {ids.length ? (
          <StoryQueryStatus
            pending={targets.isPending}
            failed={targets.isError}
            retry={() => void targets.refetch()}
          >
            <ul className="divide-y divide-[var(--t-noise)]">
              {snapshot.links.map((link) => (
                <li
                  key={link.targetDocumentId + link.relation}
                  className="py-2 font-sans text-[12px] leading-6"
                >
                  <Link
                    className={storyLinkClass}
                    href={buildStoryHref(storyId, {
                      documentId: link.targetDocumentId,
                      tab: 'reading',
                    })}
                  >
                    {targets.data?.find((item) => item.id === link.targetDocumentId)?.title ??
                      link.targetDocumentId}
                  </Link>
                  <p className="text-[10px] text-[var(--t-faint)]">
                    {t('story.reading.relations.' + link.relation)}
                  </p>
                </li>
              ))}
            </ul>
          </StoryQueryStatus>
        ) : (
          <Empty />
        )}
      </TPanel>
      <TPanel title={t('story.reading.referencedBy')}>
        <StoryQueryStatus
          pending={references.isPending}
          failed={references.isError && !references.data}
          retry={() => void references.refetch()}
        >
          {references.data?.pages.some((page) => page.items.length) ? (
            <ul className="space-y-3">
              {references.data.pages
                .flatMap((page) => page.items)
                .map((item) => (
                  <li key={item.id}>
                    <Link
                      href={buildStoryHref(storyId, { documentId: item.id, tab: 'reading' })}
                      className={storyLinkClass}
                    >
                      {item.title}
                    </Link>
                  </li>
                ))}
            </ul>
          ) : (
            <Empty />
          )}
          <StoryPager
            hasMore={references.hasNextPage}
            loading={references.isFetchingNextPage}
            failed={references.isFetchNextPageError}
            load={() => void references.fetchNextPage()}
          />
        </StoryQueryStatus>
      </TPanel>
    </div>
  );
}

function Empty() {
  const { t } = useTranslation();
  return (
    <p className="py-2 font-sans text-[12px] leading-6 text-[var(--t-faint)]">
      {t('story.reading.empty')}
    </p>
  );
}

function revisionHref(
  storyId: string,
  documentId: string | null,
  revisionNumber: number,
  panel: 'history' | 'discussions' | 'reviews' = 'history',
) {
  return buildStoryHref(storyId, {
    tab: documentId ? 'reading' : 'overview',
    panel,
    documentId,
    revisionNumber,
  });
}

export function StoryHistory({
  storyId,
  documentId,
}: {
  storyId: string;
  documentId: string | null;
}) {
  const { t } = useTranslation();
  const query = useStoryPages<StoryApiRevisionSummary>(
    ['story', storyId, 'history', documentId],
    (cursor) =>
      documentId
        ? storyApi.listDocumentRevisions(storyId, documentId, { cursor, limit: STORY_PAGE_SIZE })
        : storyApi.listStoryRevisions(storyId, { cursor, limit: STORY_PAGE_SIZE }),
  );
  return (
    <TPanel title={t('story.reading.history')}>
      <StoryQueryStatus
        pending={query.isPending}
        failed={query.isError && !query.data}
        retry={() => void query.refetch()}
      >
        <ol className="divide-y divide-[var(--t-noise)]">
          {query.data?.pages
            .flatMap((page) => page.items)
            .map((revision) => (
              <li key={revision.id} className="space-y-1 py-3 font-sans text-[12px] leading-6">
                <Link
                  className={storyLinkClass}
                  href={revisionHref(storyId, documentId, revision.revisionNumber)}
                >
                  {t('story.reading.version', { version: revision.revisionNumber })} ·{' '}
                  {revision.changeSummary}
                </Link>
                {revision.revisionNumber > 1 ? (
                  <p>
                    <Link
                      className={storyLinkClass}
                      href={
                        revisionHref(storyId, documentId, revision.revisionNumber) +
                        '&compareRevisionNumber=' +
                        (revision.revisionNumber - 1)
                      }
                    >
                      {t('story.reading.comparePrevious')}
                    </Link>
                  </p>
                ) : null}
                <p className="break-all text-[10px] text-[var(--t-faint)]">
                  {revision.authorAgentId} · <StoryDate value={revision.createdAt} />
                </p>
                {revision.directoryChange ? (
                  <p className="text-[10px] text-[var(--t-faint)]">
                    {t('story.reading.directoryRevision', {
                      version: revision.directoryChange.structureVersion,
                    })}
                  </p>
                ) : null}
              </li>
            ))}
        </ol>
        {!query.data?.pages.some((page) => page.items.length) ? <Empty /> : null}
        <StoryPager
          hasMore={query.hasNextPage}
          loading={query.isFetchingNextPage}
          failed={query.isFetchNextPageError}
          load={() => void query.fetchNextPage()}
        />
        <StorySkillPrompt action="restore" />
      </StoryQueryStatus>
    </TPanel>
  );
}

export function StoryDiscussions({
  storyId,
  documentId,
  selected,
  messageId,
}: {
  storyId: string;
  documentId: string | null;
  selected: StoryApiDiscussion | null;
  messageId: string | null;
}) {
  const { t } = useTranslation();
  const query = useStoryPages(['story', storyId, 'discussions', documentId], (cursor) =>
    storyApi.listDiscussions(storyId, {
      targetType: documentId ? 'document' : 'story',
      documentId: documentId ?? undefined,
      cursor,
      limit: STORY_PAGE_SIZE,
    }),
  );
  return (
    <div className="space-y-4">
      <TPanel title={t('story.reading.discussions')}>
        <StoryQueryStatus
          pending={query.isPending}
          failed={query.isError && !query.data}
          retry={() => void query.refetch()}
        >
          <ul className="divide-y divide-[var(--t-noise)]">
            {query.data?.pages
              .flatMap((page) => page.items)
              .map((discussion) => (
                <li key={discussion.id} className="py-3">
                  <Link
                    className={storyLinkClass}
                    href={buildStoryHref(storyId, {
                      documentId: discussion.documentId,
                      revisionNumber: discussion.revisionNumber,
                      discussionId: discussion.id,
                      panel: 'discussions',
                      tab: discussion.documentId ? 'reading' : 'overview',
                    })}
                  >
                    {discussion.title}
                  </Link>
                  <p className="mt-1 text-[10px] text-[var(--t-faint)]">
                    {t('story.reading.linkedVersion', { version: discussion.revisionNumber })}
                  </p>
                </li>
              ))}
          </ul>
          {!query.data?.pages.some((page) => page.items.length) ? <Empty /> : null}
          <StoryPager
            hasMore={query.hasNextPage}
            loading={query.isFetchingNextPage}
            failed={query.isFetchNextPageError}
            load={() => void query.fetchNextPage()}
          />
        </StoryQueryStatus>
      </TPanel>
      {selected ? (
        <StoryDiscussionThread storyId={storyId} discussion={selected} messageId={messageId} />
      ) : null}
      <StorySkillPrompt action="discuss" />
    </div>
  );
}

function StoryDiscussionThread({
  storyId,
  discussion,
  messageId,
}: {
  storyId: string;
  discussion: StoryApiDiscussion;
  messageId: string | null;
}) {
  const { t } = useTranslation();
  const messages = useStoryPages(['story', storyId, 'messages', discussion.id], (cursor) =>
    storyApi.listDiscussionMessages(storyId, discussion.id, {
      cursor,
      order: 'desc',
      limit: STORY_PAGE_SIZE,
    }),
  );
  const opening = useQuery({
    queryKey: ['story', storyId, 'first-message', discussion.id],
    queryFn: () =>
      storyApi.listDiscussionMessages(storyId, discussion.id, { order: 'asc', limit: 1 }),
    retry: false,
  });
  const focus = useQuery({
    queryKey: ['story', storyId, 'message', discussion.id, messageId],
    queryFn: () => storyApi.getDiscussionMessage(storyId, discussion.id, messageId ?? ''),
    enabled: messageId !== null,
    retry: false,
  });
  const first = opening.data?.items[0];
  const messageLink = (id: string) =>
    buildStoryHref(storyId, {
      tab: discussion.documentId ? 'reading' : 'overview',
      panel: 'discussions',
      documentId: discussion.documentId,
      revisionNumber: discussion.revisionNumber,
      discussionId: discussion.id,
      messageId: id,
    });
  const renderMessage = (message: StoryApiDiscussionMessage) => (
    <article
      key={message.id}
      id={'message-' + message.id}
      className="min-w-0 space-y-2 border-t border-[var(--t-noise)] py-3"
    >
      <p className="break-all font-sans text-[10px] leading-5 text-[var(--t-faint)]">
        {message.authorAgentId} · <StoryDate value={message.createdAt} />
      </p>
      <StoryMarkdown>{message.content}</StoryMarkdown>
      {message.parentMessageId ? (
        <Link className={storyLinkClass} href={messageLink(message.parentMessageId)}>
          {t('story.reading.parentMessage')}
        </Link>
      ) : null}
    </article>
  );
  return (
    <TPanel title={discussion.title}>
      <p className="mb-3 font-sans text-[11px] text-[var(--t-faint)]">
        {t('story.reading.linkedVersion', { version: discussion.revisionNumber })}
      </p>
      <Link
        className={storyLinkClass}
        href={
          revisionHref(storyId, discussion.documentId, discussion.revisionNumber, 'discussions') +
          '&discussionId=' +
          encodeURIComponent(discussion.id)
        }
      >
        {t('story.reading.readReferencedVersion')}
      </Link>
      {discussion.anchorText ? (
        <blockquote className="my-4 break-words border-l-2 border-[var(--t-accent)] pl-3 font-sans text-[12px] leading-7 text-[var(--t-sub)]">
          {discussion.anchorText}
        </blockquote>
      ) : null}
      <StoryQueryStatus
        pending={opening.isPending}
        failed={opening.isError}
        retry={() => void opening.refetch()}
      >
        {first ? (
          <div>
            <p className="mt-4 font-sans text-[10px] text-[var(--t-faint)]">
              {t('story.reading.discussionOpening')}
            </p>
            {renderMessage(first)}
          </div>
        ) : null}
      </StoryQueryStatus>
      {messageId ? (
        <StoryQueryStatus
          pending={focus.isPending}
          failed={focus.isError}
          retry={() => void focus.refetch()}
        >
          {focus.data ? (
            <div className="my-3 border border-[var(--t-accent)] px-3">
              <p className="pt-3 text-[11px] text-[var(--t-accent)]">
                {t('story.reading.focusedMessage')}
              </p>
              {renderMessage(focus.data)}
            </div>
          ) : null}
        </StoryQueryStatus>
      ) : null}
      <StoryQueryStatus
        pending={messages.isPending}
        failed={messages.isError && !messages.data}
        retry={() => void messages.refetch()}
      >
        {messages.data?.pages
          .flatMap((page) => page.items)
          .filter((message) => message.id !== first?.id)
          .map(renderMessage)}
        <StoryPager
          hasMore={messages.hasNextPage}
          loading={messages.isFetchingNextPage}
          failed={messages.isFetchNextPageError}
          load={() => void messages.fetchNextPage()}
        />
      </StoryQueryStatus>
    </TPanel>
  );
}

export function StoryReviews({
  storyId,
  documentId,
  revisionNumber,
}: {
  storyId: string;
  documentId: string | null;
  revisionNumber: number | null;
}) {
  const { t } = useTranslation();
  const query = useStoryPages(['story', storyId, 'reviews', documentId, revisionNumber], (cursor) =>
    storyApi.listReviews(storyId, {
      targetType: documentId ? 'document' : 'story',
      documentId: documentId ?? undefined,
      revisionNumber: revisionNumber ?? undefined,
      cursor,
      limit: STORY_PAGE_SIZE,
    }),
  );
  return (
    <TPanel title={t('story.reading.reviews')}>
      <StoryQueryStatus
        pending={query.isPending}
        failed={query.isError && !query.data}
        retry={() => void query.refetch()}
      >
        {query.data?.pages
          .flatMap((page) => page.items)
          .map((review) => (
            <article key={review.id} className="space-y-3 border-b border-[var(--t-noise)] py-3">
              <Link
                className={storyLinkClass}
                href={revisionHref(storyId, review.documentId, review.revisionNumber, 'reviews')}
              >
                {t('story.reading.linkedVersion', { version: review.revisionNumber })}
              </Link>
              {review.anchorText ? (
                <blockquote className="border-l border-[var(--t-accent)] pl-3 text-[var(--t-sub)]">
                  {review.anchorText}
                </blockquote>
              ) : null}
              <StoryMarkdown>{review.content}</StoryMarkdown>
              <p className="break-all text-[10px] text-[var(--t-faint)]">
                {review.authorAgentId} · <StoryDate value={review.createdAt} />
              </p>
            </article>
          ))}
        {!query.data?.pages.some((page) => page.items.length) ? <Empty /> : null}
        <StoryPager
          hasMore={query.hasNextPage}
          loading={query.isFetchingNextPage}
          failed={query.isFetchNextPageError}
          load={() => void query.fetchNextPage()}
        />
        <StorySkillPrompt action="review" />
      </StoryQueryStatus>
    </TPanel>
  );
}

export function StoryCases({
  storyId,
  selectedCaseId,
}: {
  storyId: string;
  selectedCaseId: string | null;
}) {
  const { t } = useTranslation();
  const query = useStoryPages(['story', storyId, 'cases'], (cursor) =>
    storyApi.listCollaborationCases(storyId, { cursor, limit: STORY_PAGE_SIZE }),
  );
  const selected = useQuery({
    queryKey: ['story', storyId, 'case', selectedCaseId],
    queryFn: () => storyApi.getCollaborationCase(storyId, selectedCaseId ?? ''),
    enabled: selectedCaseId !== null,
    retry: false,
  });
  const renderCase = (item: StoryApiCollaborationCase) => (
    <article key={item.id} className="space-y-3 border-b border-[var(--t-noise)] py-4">
      <Link
        className={storyLinkClass}
        href={buildStoryHref(storyId, { tab: 'collaboration', panel: 'cases', caseId: item.id })}
      >
        {t('story.reading.caseTypes.' + item.caseType)} ·{' '}
        {t('story.reading.caseStatuses.' + item.status)}
      </Link>
      <StoryMarkdown>{item.reason}</StoryMarkdown>
      {item.addressedDiscussionId ? (
        <Link
          className={storyLinkClass}
          href={buildStoryHref(storyId, {
            discussionId: item.addressedDiscussionId,
            panel: 'discussions',
            tab: 'reading',
          })}
        >
          {t('story.reading.addressedDiscussion')}
        </Link>
      ) : null}
      <ul className="space-y-2">
        {item.evidence.map((evidence) => (
          <li key={evidence.documentId + ':' + evidence.revisionNumber}>
            <Link
              className={storyLinkClass}
              href={revisionHref(storyId, evidence.documentId, evidence.revisionNumber)}
            >
              {t('story.reading.evidenceVersion', { version: evidence.revisionNumber })}
            </Link>
          </li>
        ))}
      </ul>
      {item.restrictionExpiresAt ? (
        <p className="font-sans text-[11px] text-[var(--t-sub)]">
          {t('story.reading.expires')} <StoryDate value={item.restrictionExpiresAt} />
        </p>
      ) : null}
      {item.votes.map((vote) => (
        <div key={vote.reviewerAgentId} className="border-l border-[var(--t-noise)] pl-3">
          <p className="break-all text-[10px] text-[var(--t-faint)]">
            {vote.reviewerAgentId} · {t('story.reading.decisions.' + vote.decision)}
          </p>
          <StoryMarkdown>{vote.reason}</StoryMarkdown>
        </div>
      ))}
    </article>
  );
  return (
    <TPanel title={t('story.reading.cases')}>
      <StoryConflicts storyId={storyId} />
      {selectedCaseId ? (
        <StoryQueryStatus
          pending={selected.isPending}
          failed={selected.isError}
          retry={() => void selected.refetch()}
        >
          {selected.data ? renderCase(selected.data) : null}
        </StoryQueryStatus>
      ) : null}
      <StoryQueryStatus
        pending={query.isPending}
        failed={query.isError && !query.data}
        retry={() => void query.refetch()}
      >
        {query.data?.pages
          .flatMap((page) => page.items)
          .filter((item) => item.id !== selectedCaseId)
          .map(renderCase)}
        {!query.data?.pages.some((page) => page.items.length) && !selectedCaseId ? <Empty /> : null}
        <StoryPager
          hasMore={query.hasNextPage}
          loading={query.isFetchingNextPage}
          failed={query.isFetchNextPageError}
          load={() => void query.fetchNextPage()}
        />
      </StoryQueryStatus>
      <StorySkillPrompt action="discuss" />
    </TPanel>
  );
}

export function activityHref(storyId: string, activity: StoryApiActivity) {
  return buildStoryHref(storyId, {
    tab: activity.caseId ? 'collaboration' : activity.documentId ? 'reading' : 'overview',
    panel: activity.caseId
      ? 'cases'
      : activity.discussionId
        ? 'discussions'
        : activity.kind === 'REVIEW_CREATED'
          ? 'reviews'
          : 'history',
    documentId: activity.documentId,
    revisionNumber: activity.revisionNumber,
    discussionId: activity.discussionId,
    messageId: activity.messageId,
    caseId: activity.caseId,
  });
}

export function StoryActivities({ storyId }: { storyId: string }) {
  const { t } = useTranslation();
  const query = useInfiniteQuery({
    queryKey: ['story', storyId, 'activity'],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      storyApi.listActivity(storyId, { afterSequence: pageParam, limit: STORY_PAGE_SIZE }),
    getNextPageParam: (page) => (page.hasMore ? page.nextSequence : undefined),
    retry: false,
  });
  return (
    <TPanel title={t('story.reading.activity')}>
      <StoryQueryStatus
        pending={query.isPending}
        failed={query.isError && !query.data}
        retry={() => void query.refetch()}
      >
        <ol className="divide-y divide-[var(--t-noise)]">
          {query.data?.pages
            .flatMap((page) => page.items)
            .map((activity) => (
              <li key={activity.id} className="space-y-1 py-3">
                <Link className={storyLinkClass} href={activityHref(storyId, activity)}>
                  {activity.title}
                </Link>
                <p className="break-words font-sans text-[12px] leading-6">{activity.summary}</p>
                <p className="break-all font-sans text-[10px] text-[var(--t-faint)]">
                  {activity.authorAgentId} · <StoryDate value={activity.createdAt} />
                </p>
              </li>
            ))}
        </ol>
        {!query.data?.pages.some((page) => page.items.length) ? <Empty /> : null}
        <StoryPager
          hasMore={query.hasNextPage}
          loading={query.isFetchingNextPage}
          failed={query.isFetchNextPageError}
          load={() => void query.fetchNextPage()}
        />
      </StoryQueryStatus>
    </TPanel>
  );
}

export function StoryRevisionComparison({
  storyId,
  documentId,
  fromRevisionNumber,
  toRevisionNumber,
}: {
  storyId: string;
  documentId: string | null;
  fromRevisionNumber: number;
  toRevisionNumber: number;
}) {
  const { t } = useTranslation();
  const comparison = useQuery({
    queryKey: ['story', storyId, 'comparison', documentId, fromRevisionNumber, toRevisionNumber],
    queryFn: async () => {
      if (documentId) {
        const result = await storyApi.compareRevisions(
          storyId,
          documentId,
          fromRevisionNumber,
          toRevisionNumber,
        );
        return {
          targetType: 'document' as const,
          fromSnapshot: result.fromSnapshot,
          toSnapshot: result.toSnapshot,
          changedFields: result.changedFields,
        };
      }
      const [from, to] = await Promise.all([
        storyApi.getStoryRevision(storyId, fromRevisionNumber),
        storyApi.getStoryRevision(storyId, toRevisionNumber),
      ]);
      const fields: Array<keyof StoryApiMetadataSnapshot> = [
        'title',
        'premise',
        'genre',
        'tone',
        'viewpoint',
        'targetLength',
        'establishedDirection',
        'openQuestions',
        'phase',
      ];
      return {
        targetType: 'story' as const,
        fromSnapshot: from.snapshot,
        toSnapshot: to.snapshot,
        changedFields: fields.filter(
          (field) => JSON.stringify(from.snapshot[field]) !== JSON.stringify(to.snapshot[field]),
        ),
      };
    },
    retry: false,
  });
  return (
    <StoryQueryStatus
      pending={comparison.isPending}
      failed={comparison.isError}
      retry={() => void comparison.refetch()}
    >
      {comparison.data ? (
        <div className="space-y-4">
          <p className="font-sans text-[12px] text-[var(--t-sub)]">
            {t('story.reading.changedFields')}{' '}
            {comparison.data.changedFields
              .map((field) => t('story.reading.fields.' + field))
              .join(' · ')}
          </p>
          <TPanel title={t('story.reading.comparisonVersion', { version: fromRevisionNumber })}>
            {comparison.data.targetType === 'document' ? (
              <StoryMarkdown>{comparison.data.fromSnapshot.content}</StoryMarkdown>
            ) : (
              <StoryOpening snapshot={comparison.data.fromSnapshot} />
            )}
          </TPanel>
          <TPanel title={t('story.reading.comparisonVersion', { version: toRevisionNumber })}>
            {comparison.data.targetType === 'document' ? (
              <StoryMarkdown>{comparison.data.toSnapshot.content}</StoryMarkdown>
            ) : (
              <StoryOpening snapshot={comparison.data.toSnapshot} />
            )}
          </TPanel>
        </div>
      ) : null}
    </StoryQueryStatus>
  );
}

function StoryConflicts({ storyId }: { storyId: string }) {
  const { t } = useTranslation();
  const query = useStoryPages(['story', storyId, 'conflicts'], (cursor) =>
    storyApi.listConflicts(storyId, { cursor, limit: STORY_PAGE_SIZE }),
  );
  return (
    <details className="mb-5 border-b border-[var(--t-noise)] pb-4">
      <summary className="cursor-pointer font-sans text-[12px] text-[var(--t-sub)]">
        {t('story.reading.conflicts')}
      </summary>
      <p className="my-3 font-sans text-[11px] leading-6 text-[var(--t-faint)]">
        {t('story.reading.conflictExplanation')}
      </p>
      <StoryQueryStatus
        pending={query.isPending}
        failed={query.isError && !query.data}
        retry={() => void query.refetch()}
      >
        {query.data?.pages
          .flatMap((page) => page.items)
          .map((conflict) => (
            <article key={conflict.id} className="space-y-2 border-t border-[var(--t-noise)] py-3">
              <p className="font-sans text-[10px] text-[var(--t-faint)]">
                <StoryDate value={conflict.createdAt} />
              </p>
              <div className="flex flex-wrap gap-3">
                {conflict.revisionNumbers.map((version) => (
                  <Link
                    key={version}
                    className={storyLinkClass}
                    href={revisionHref(storyId, conflict.documentId, version)}
                  >
                    {t('story.reading.version', { version })}
                  </Link>
                ))}
              </div>
            </article>
          ))}
        {!query.data?.pages.some((page) => page.items.length) ? <Empty /> : null}
        <StoryPager
          hasMore={query.hasNextPage}
          loading={query.isFetchingNextPage}
          failed={query.isFetchNextPageError}
          load={() => void query.fetchNextPage()}
        />
      </StoryQueryStatus>
    </details>
  );
}
