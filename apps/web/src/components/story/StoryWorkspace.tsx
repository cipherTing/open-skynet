'use client';

import Link from 'next/link';
import { useDeferredValue, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { TPanel, TTag } from '@/components/ui/terminal';
import { ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import {
  STORY_PAGE_SIZE,
  storyApi,
  type StoryApiDocument,
  type StoryApiDocumentSummary,
  type StoryApiDocumentSnapshot,
  type StoryApiMetadataSnapshot,
} from '@/lib/story-api';
import {
  buildStoryHref,
  readStoryLocation,
  type StoryReadingPanel,
  type StoryReadingTab,
} from './story-workflow';
import {
  StoryActivities,
  StoryCases,
  StoryDiscussions,
  StoryHistory,
  StoryMarkdown,
  StoryOpening,
  StoryPager,
  StoryQueryStatus,
  StoryRelated,
  StoryReviews,
  StoryRevisionComparison,
  StorySkillPrompt,
  storyLinkClass,
  useStoryPages,
  activityHref,
} from './StoryPanels';

const tabs: StoryReadingTab[] = ['overview', 'reading', 'collaboration'];
const panels: StoryReadingPanel[] = ['related', 'discussions', 'history', 'reviews'];

export function StoryWorkspace({ storyId }: { storyId: string }) {
  const { t } = useTranslation();
  const params = useSearchParams();
  const location = readStoryLocation(params);
  const requestedComparison = Number(params.get('compareRevisionNumber'));
  const comparisonVersion =
    Number.isSafeInteger(requestedComparison) && requestedComparison > 0
      ? requestedComparison
      : null;
  const detail = useQuery({
    queryKey: ['story', storyId, 'detail'],
    queryFn: () => storyApi.getStory(storyId),
    retry: false,
  });
  const discussion = useQuery({
    queryKey: ['story', storyId, 'discussion', location.discussionId],
    queryFn: () => storyApi.getDiscussion(storyId, location.discussionId ?? ''),
    enabled: location.discussionId !== null,
    retry: false,
  });
  const requestedRevision = location.revisionNumber ?? discussion.data?.revisionNumber ?? null;
  const readingStart = useInfiniteQuery({
    queryKey: ['story', storyId, 'reading-start'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      storyApi.getReadingStart(storyId, { cursor: pageParam, limit: STORY_PAGE_SIZE }),
    getNextPageParam: (page) => (page.document ? undefined : (page.nextCursor ?? undefined)),
    enabled: location.tab === 'reading' && !location.documentId && !location.discussionId,
    retry: false,
  });
  const firstChapter = readingStart.data?.pages.find((page) => page.document)?.document ?? null;
  const continueReadingStart = readingStart.fetchNextPage;
  useEffect(() => {
    if (
      location.tab === 'reading' &&
      !location.documentId &&
      !location.discussionId &&
      readingStart.hasNextPage &&
      !readingStart.isFetching &&
      !readingStart.isFetchNextPageError
    )
      void continueReadingStart();
  }, [
    continueReadingStart,
    location.tab,
    location.documentId,
    location.discussionId,
    readingStart.hasNextPage,
    readingStart.isFetching,
    readingStart.isFetchNextPageError,
  ]);
  const documentId = discussion.data
    ? discussion.data.documentId
    : (location.documentId ?? (location.tab === 'reading' ? (firstChapter?.id ?? null) : null));
  const currentDocument = useQuery({
    queryKey: ['story', storyId, 'document', documentId],
    queryFn: () => storyApi.getDocument(storyId, documentId ?? ''),
    enabled: documentId !== null,
    retry: false,
  });
  const documentRevision = useQuery({
    queryKey: ['story', storyId, 'document-revision', documentId, requestedRevision],
    queryFn: () => storyApi.getDocumentRevision(storyId, documentId ?? '', requestedRevision ?? 1),
    enabled: documentId !== null && requestedRevision !== null && comparisonVersion === null,
    retry: false,
  });
  const storyRevision = useQuery({
    queryKey: ['story', storyId, 'metadata-revision', requestedRevision],
    queryFn: () => storyApi.getStoryRevision(storyId, requestedRevision ?? 1),
    enabled:
      documentId === null &&
      requestedRevision !== null &&
      (!location.discussionId || discussion.isSuccess),
    retry: false,
  });
  const documentLocation = useQuery({
    queryKey: ['story', storyId, 'location', documentId],
    queryFn: () => storyApi.getDocumentLocation(storyId, documentId ?? ''),
    enabled: Boolean(
      currentDocument.data &&
      !currentDocument.data.archived &&
      isNarrative(currentDocument.data.kind),
    ),
    retry: false,
  });
  const revisionNumber =
    requestedRevision ??
    currentDocument.data?.currentVersion ??
    detail.data?.story.currentVersion ??
    null;
  const snapshot: StoryApiDocumentSnapshot | null = requestedRevision
    ? (documentRevision.data?.snapshot ?? null)
    : (currentDocument.data ?? null);
  const metadata: StoryApiMetadataSnapshot | null =
    requestedRevision && !documentId
      ? (storyRevision.data?.snapshot ?? null)
      : (detail.data?.story ?? null);
  const activeTab =
    discussion.data?.targetType === 'story'
      ? 'overview'
      : location.tab === 'reading' &&
          readingStart.isSuccess &&
          !readingStart.hasNextPage &&
          !documentId &&
          !location.documentId &&
          !location.discussionId
        ? 'overview'
        : location.tab;
  const currentHref = buildStoryHref(storyId, {
    tab: documentId ? 'reading' : 'overview',
    panel: location.panel,
    documentId,
  });
  const panelHref = (panel: StoryReadingPanel) =>
    buildStoryHref(storyId, {
      tab: documentId ? 'reading' : 'overview',
      panel,
      documentId,
      revisionNumber: requestedRevision,
    });

  if (detail.isPending) return <InlineLoading label={t('story.reading.loading')} />;
  if (detail.isError || !detail.data)
    return (
      <div className="p-6">
        <ErrorState
          message={t('story.reading.loadFailed')}
          onAction={() => void detail.refetch()}
        />
      </div>
    );
  const story = detail.data.story;
  const panelDocumentId = activeTab === 'overview' && !discussion.data ? null : documentId;
  const renderPanel = () => {
    if (location.panel === 'discussions')
      return (
        <StoryDiscussions
          storyId={storyId}
          documentId={panelDocumentId}
          selected={discussion.data ?? null}
          messageId={location.messageId}
        />
      );
    if (location.panel === 'history')
      return <StoryHistory storyId={storyId} documentId={panelDocumentId} />;
    if (location.panel === 'reviews')
      return (
        <StoryReviews
          storyId={storyId}
          documentId={panelDocumentId}
          revisionNumber={revisionNumber}
        />
      );
    if (panelDocumentId && snapshot)
      return <StoryRelated storyId={storyId} documentId={panelDocumentId} snapshot={snapshot} />;
    return null;
  };
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex min-h-12 flex-none items-center justify-between gap-4 border-b border-[var(--t-noise)] px-4 py-2 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/stories"
            className="shrink-0 text-[var(--t-sub)]"
            aria-label={t('story.reading.back')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="truncate text-[14px] font-semibold text-white">{story.title}</h1>
          <TTag color="accent">{t('story.phases.' + story.phase)}</TTag>
        </div>
        <LanguageToggle />
      </header>
      <div className="flex-none px-4 py-2 sm:px-6">
        <StorySkillPrompt />
      </div>
      <nav
        aria-label={t('story.reading.tabsLabel')}
        className="flex flex-none gap-1 border-b border-[var(--t-noise)] px-4"
      >
        {tabs.map((tab) => (
          <Link
            key={tab}
            href={buildStoryHref(storyId, {
              tab,
              panel: tab === 'collaboration' ? 'activity' : undefined,
            })}
            aria-current={activeTab === tab ? 'page' : undefined}
            className={
              'border-b-2 px-4 py-3 font-sans text-[12px] ' +
              (activeTab === tab
                ? 'border-[var(--t-accent)] text-white'
                : 'border-transparent text-[var(--t-sub)]')
            }
          >
            {t('story.reading.tabs.' + tab)}
          </Link>
        ))}
      </nav>
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-7xl space-y-5">
          {location.tab === 'reading' &&
          !location.documentId &&
          !location.discussionId &&
          !firstChapter ? (
            <StoryQueryStatus
              pending={readingStart.isPending}
              failed={readingStart.isError && !readingStart.data}
              retry={() => void readingStart.refetch()}
            >
              <StoryPager
                hasMore={readingStart.hasNextPage}
                loading={readingStart.isFetchingNextPage}
                failed={readingStart.isFetchNextPageError}
                load={() => void readingStart.fetchNextPage()}
              />
            </StoryQueryStatus>
          ) : null}
          {location.discussionId && (discussion.isPending || discussion.isError) ? (
            <StoryQueryStatus
              pending={discussion.isPending}
              failed={discussion.isError}
              retry={() => void discussion.refetch()}
            >
              {null}
            </StoryQueryStatus>
          ) : null}
          {activeTab === 'collaboration' ? (
            <div className="space-y-4">
              <nav className="flex flex-wrap gap-4 font-sans text-[12px]">
                <Link
                  className={storyLinkClass}
                  href={buildStoryHref(storyId, { tab: 'collaboration', panel: 'activity' })}
                >
                  {t('story.reading.activity')}
                </Link>
                <Link
                  className={storyLinkClass}
                  href={buildStoryHref(storyId, { tab: 'collaboration', panel: 'cases' })}
                >
                  {t('story.reading.cases')}
                </Link>
              </nav>
              {location.panel === 'cases' || location.caseId ? (
                <StoryCases storyId={storyId} selectedCaseId={location.caseId} />
              ) : (
                <StoryActivities storyId={storyId} />
              )}
            </div>
          ) : (
            <div
              className={
                activeTab === 'reading' ? 'grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]' : ''
              }
            >
              {activeTab === 'reading' ? (
                <StoryDocumentNavigation
                  storyId={storyId}
                  selectedDocument={currentDocument.data ?? null}
                  requestedParentId={params.get('directoryId')}
                />
              ) : null}
              <div className="min-w-0 space-y-5">
                <nav
                  aria-label={t('story.reading.context')}
                  className="flex flex-wrap gap-x-5 gap-y-2 border-b border-[var(--t-noise)] pb-3 font-sans text-[12px]"
                >
                  {panels
                    .filter((panel) => activeTab === 'reading' || panel !== 'related')
                    .map((panel) => (
                      <Link
                        key={panel}
                        className={
                          location.panel === panel
                            ? 'text-white underline underline-offset-4'
                            : 'text-[var(--t-sub)] hover:text-white'
                        }
                        href={panelHref(panel)}
                      >
                        {t('story.reading.' + panel)}
                      </Link>
                    ))}
                </nav>
                {requestedRevision ? (
                  <section className="border border-[var(--t-accent)] px-4 py-3 font-sans text-[12px] leading-6">
                    <p className="text-[var(--t-accent)]">
                      {t('story.reading.historicalVersion', { version: requestedRevision })}
                    </p>
                    <Link href={currentHref} className={storyLinkClass}>
                      {t('story.reading.readCurrentVersion')}
                    </Link>
                  </section>
                ) : null}
                {comparisonVersion && requestedRevision ? (
                  <StoryRevisionComparison
                    storyId={storyId}
                    documentId={documentId}
                    fromRevisionNumber={comparisonVersion}
                    toRevisionNumber={requestedRevision}
                  />
                ) : null}
                {documentId && activeTab === 'reading' && !comparisonVersion ? (
                  <StoryQueryStatus
                    pending={
                      currentDocument.isPending ||
                      (requestedRevision !== null && documentRevision.isPending)
                    }
                    failed={currentDocument.isError || documentRevision.isError}
                    retry={() => {
                      void currentDocument.refetch();
                      if (requestedRevision) void documentRevision.refetch();
                    }}
                  >
                    {snapshot && currentDocument.data ? (
                      <>
                        {currentDocument.data.archived ? (
                          <p className="border border-[var(--t-signal)] px-3 py-2 font-sans text-[12px] text-[var(--t-signal)]">
                            {t('story.reading.archived')}
                          </p>
                        ) : null}
                        <nav
                          aria-label={t('story.reading.ancestors')}
                          className="flex flex-wrap items-center gap-2 font-sans text-[11px] text-[var(--t-faint)]"
                        >
                          {documentLocation.data?.ancestors.map((ancestor) => (
                            <span key={ancestor.id} className="inline-flex items-center gap-2">
                              <Link
                                href={buildStoryHref(storyId, {
                                  tab: 'reading',
                                  documentId: ancestor.id,
                                  directoryId: ancestor.id,
                                })}
                              >
                                {ancestor.title}
                              </Link>
                              <ChevronRight aria-hidden="true" className="h-3 w-3" />
                            </span>
                          ))}
                          <span>{snapshot.title}</span>
                        </nav>
                        <TPanel
                          title={snapshot.title}
                          meta={t('story.reading.version', { version: revisionNumber })}
                        >
                          <p className="mb-4 font-sans text-[10px] text-[var(--t-faint)]">
                            {t('story.kinds.' + snapshot.kind)}
                          </p>
                          {snapshot.content ? (
                            <StoryMarkdown>{snapshot.content}</StoryMarkdown>
                          ) : (
                            <p className="text-[12px] text-[var(--t-faint)]">
                              {t('story.reading.emptyContent')}
                            </p>
                          )}
                        </TPanel>
                        {!requestedRevision && documentLocation.data ? (
                          <nav
                            aria-label={t('story.reading.chapterNavigation')}
                            className="flex flex-wrap justify-between gap-4 font-sans text-[12px]"
                          >
                            {documentLocation.data.ancestors.length ? (
                              <Link
                                className={storyLinkClass}
                                href={buildStoryHref(storyId, {
                                  tab: 'reading',
                                  documentId: documentLocation.data.ancestors[0]?.id,
                                  directoryId: '',
                                })}
                              >
                                {t('story.reading.rootDirectory')}
                              </Link>
                            ) : null}
                            {documentLocation.data.previousDocument ? (
                              <Link
                                className={storyLinkClass}
                                href={buildStoryHref(storyId, {
                                  tab: 'reading',
                                  documentId: documentLocation.data.previousDocument.id,
                                })}
                              >
                                {t('story.reading.previous')} ·{' '}
                                {documentLocation.data.previousDocument.title}
                              </Link>
                            ) : (
                              <span />
                            )}
                            {documentLocation.data.nextDocument ? (
                              <Link
                                className={storyLinkClass}
                                href={buildStoryHref(storyId, {
                                  tab: 'reading',
                                  documentId: documentLocation.data.nextDocument.id,
                                })}
                              >
                                {t('story.reading.next')} ·{' '}
                                {documentLocation.data.nextDocument.title}
                              </Link>
                            ) : null}
                          </nav>
                        ) : null}
                      </>
                    ) : null}
                  </StoryQueryStatus>
                ) : (
                  <StoryQueryStatus
                    pending={storyRevision.isFetching && requestedRevision !== null}
                    failed={storyRevision.isError}
                    retry={() => void storyRevision.refetch()}
                  >
                    {metadata && !comparisonVersion ? (
                      <TPanel>
                        <StoryOpening snapshot={metadata} />
                      </TPanel>
                    ) : null}
                  </StoryQueryStatus>
                )}
                {activeTab === 'overview' && location.panel === 'related' ? (
                  <TPanel title={t('story.reading.materials')}>
                    <dl className="flex flex-wrap gap-x-6 gap-y-3 font-sans text-[12px] text-[var(--t-sub)]">
                      {detail.data.documentCounts.map((count) => (
                        <div key={count.kind} className="flex gap-2">
                          <dt>{t('story.kinds.' + count.kind)}</dt>
                          <dd className="font-mono text-white">{count.count}</dd>
                        </div>
                      ))}
                    </dl>
                  </TPanel>
                ) : null}
                {activeTab === 'overview' && location.panel === 'related' ? (
                  <TPanel title={t('story.reading.recentActivity')}>
                    <ul className="space-y-3">
                      {detail.data.recentActivity.map((item) => (
                        <li key={item.id}>
                          <Link href={activityHref(storyId, item)} className={storyLinkClass}>
                            {item.title} · {item.summary}
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <Link
                      className={storyLinkClass}
                      href={buildStoryHref(storyId, { tab: 'collaboration', panel: 'activity' })}
                    >
                      {t('story.reading.allActivity')}
                    </Link>
                  </TPanel>
                ) : (
                  renderPanel()
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function isNarrative(kind: StoryApiDocumentSnapshot['kind']) {
  return kind === 'volume' || kind === 'chapter' || kind === 'scene';
}

function StoryDocumentNavigation({
  storyId,
  selectedDocument,
  requestedParentId,
}: {
  storyId: string;
  selectedDocument: StoryApiDocument | null;
  requestedParentId: string | null;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const parentDocumentId =
    requestedParentId !== null
      ? requestedParentId || null
      : selectedDocument && isNarrative(selectedDocument.kind)
        ? selectedDocument.parentDocumentId
        : null;
  const directory = useInfiniteQuery({
    queryKey: ['story', storyId, 'directory', parentDocumentId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      storyApi.listDirectory(storyId, {
        parentDocumentId: parentDocumentId || undefined,
        cursor: pageParam,
        limit: STORY_PAGE_SIZE,
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
  const materials = useStoryPages(['story', storyId, 'materials', deferredSearch], (cursor) =>
    storyApi.listDocuments(storyId, {
      q: deferredSearch || undefined,
      cursor,
      limit: STORY_PAGE_SIZE,
    }),
  );
  const itemLink = (document: Pick<StoryApiDocumentSummary, 'id' | 'kind' | 'parentDocumentId'>) =>
    buildStoryHref(storyId, {
      tab: 'reading',
      documentId: document.id,
      directoryId: document.kind === 'volume' ? document.id : document.parentDocumentId,
    });
  return (
    <aside className="min-w-0 space-y-5 border-b border-[var(--t-noise)] pb-5 lg:border-b-0 lg:border-r lg:pr-5">
      <section>
        <h2 className="mb-3 text-[12px] font-semibold text-white">
          {t('story.reading.narrativeDirectory')}
        </h2>
        <Link
          className={storyLinkClass + ' text-[11px]'}
          href={buildStoryHref(storyId, {
            tab: 'reading',
            documentId: selectedDocument?.id,
            directoryId: '',
          })}
        >
          {t('story.reading.rootDirectory')}
        </Link>
        <StoryQueryStatus
          pending={directory.isPending}
          failed={directory.isError && !directory.data}
          retry={() => void directory.refetch()}
        >
          <div className="my-3 space-y-2 font-sans text-[11px] text-[var(--t-faint)]">
            {directory.data?.pages[0]?.ancestors.map((ancestor) => (
              <Link
                key={ancestor.id}
                className="block break-words"
                href={buildStoryHref(storyId, {
                  tab: 'reading',
                  documentId: ancestor.id,
                  directoryId: ancestor.id,
                })}
              >
                {ancestor.title}
              </Link>
            ))}
          </div>
          <ol className="space-y-1">
            {directory.data?.pages
              .flatMap((page) => page.items)
              .map((document) => (
                <li key={document.id} className="border-l border-[var(--t-noise)] py-2 pl-3">
                  <Link
                    href={itemLink(document)}
                    aria-current={selectedDocument?.id === document.id ? 'page' : undefined}
                    className={
                      'block break-words font-sans text-[12px] leading-6 ' +
                      (selectedDocument?.id === document.id
                        ? 'text-[var(--t-accent)]'
                        : 'text-[var(--t-sub)] hover:text-white')
                    }
                  >
                    {document.title}
                  </Link>
                  <p className="text-[10px] text-[var(--t-faint)]">
                    {t('story.kinds.' + document.kind)} ·{' '}
                    {t('story.reading.version', { version: document.currentVersion })}
                  </p>
                  {document.kind === 'chapter' ? (
                    <Link
                      className="font-sans text-[10px] text-[var(--t-faint)] underline"
                      href={buildStoryHref(storyId, {
                        tab: 'reading',
                        documentId: document.id,
                        directoryId: document.id,
                      })}
                    >
                      {t('story.reading.scenes')}
                    </Link>
                  ) : null}
                </li>
              ))}
          </ol>
          {!directory.data?.pages.some((page) => page.items.length) ? (
            <p className="py-3 text-[11px] leading-6 text-[var(--t-faint)]">
              {t('story.reading.emptyDirectory')}
            </p>
          ) : null}
          <StoryPager
            hasMore={directory.hasNextPage}
            loading={directory.isFetchingNextPage}
            failed={directory.isFetchNextPageError}
            load={() => void directory.fetchNextPage()}
          />
        </StoryQueryStatus>
      </section>
      <section className="border-t border-[var(--t-noise)] pt-4">
        <h2 className="mb-3 text-[12px] font-semibold text-white">
          {t('story.reading.materials')}
        </h2>
        <label className="block">
          <span className="sr-only">{t('story.reading.searchMaterials')}</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('story.reading.searchMaterials')}
            className="skynet-input h-9 w-full px-2 font-sans text-[11px]"
          />
        </label>
        <StoryQueryStatus
          pending={materials.isPending}
          failed={materials.isError && !materials.data}
          retry={() => void materials.refetch()}
        >
          <ul className="mt-3 divide-y divide-[var(--t-noise)]">
            {materials.data?.pages
              .flatMap((page) => page.items)
              .map((document) => (
                <li key={document.id} className="py-2">
                  <Link
                    href={itemLink(document)}
                    className="block break-words font-sans text-[11px] leading-6 text-[var(--t-sub)] hover:text-white"
                  >
                    {document.title}
                  </Link>
                  <span className="text-[9px] text-[var(--t-faint)]">
                    {t('story.kinds.' + document.kind)}
                  </span>
                </li>
              ))}
          </ul>
          <StoryPager
            hasMore={materials.hasNextPage}
            loading={materials.isFetchingNextPage}
            failed={materials.isFetchNextPageError}
            load={() => void materials.fetchNextPage()}
          />
        </StoryQueryStatus>
      </section>
    </aside>
  );
}
