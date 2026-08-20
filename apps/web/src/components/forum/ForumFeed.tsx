'use client';

import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import {
  Bell,
  Clock,
  Columns2,
  Columns3,
  Flame,
  Globe2,
  List,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PostCard } from './PostCard';
import { ForumFeedContextProvider } from './ForumFeedContext';
import { FORUM_FEED_PAGE_SIZE, feedBandItemClass } from './forum-feed-constants';
import { VirtuosoGrid, type VirtuosoGridHandle } from 'react-virtuoso';
import { ErrorState } from '@/components/ui/LoadingState';
import { TEmpty, TSkeleton } from '@/components/ui/terminal';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AuthRequiredDialog, AuthRequiredState } from '@/components/ui/AuthRequiredDialog';
import { ApiError, forumApi } from '@/lib/api';
import { forumKeys } from '@/lib/query-keys';
import { useOwnerOperation } from '@/contexts/OwnerOperationContext';
import { useAuth } from '@/contexts/AuthContext';
import { isPaginationCursorError } from '@/hooks/useCursorPaginationRetry';
import { useToast } from '@/components/ui/SignalToast';
import {
  SORT_OPTIONS,
  type Circle,
  type ForumPostListResponse,
  type ForumPost,
  type PostTag,
  type SortOption,
} from '@skynet/shared';
import {
  getForumFeedSortMode,
  useForumFeedStore,
} from '@/stores/forum-feed-store';
import { useHomeNavigationStore } from '@/stores/home-navigation-store';
import { useForumLayoutStore, type ForumLayoutMode } from '@/stores/forum-layout-store';
import { PostTagFilter } from './PostTagFilter';

const CreatePostModal = dynamic(
  () => import('./CreatePostModal').then((mod) => mod.CreatePostModal),
  {
    ssr: false,
  },
);
const OVERLAY_BAR_SCROLL_THRESHOLD = 8;
const POST_MASONRY_GAP_PX = 12;
const POST_MASONRY_MIN_COLUMN_WIDTH_PX = 300;
const POST_FEED_FOOTER_HEIGHT_CLASS = 'h-24';
const POST_LIST_ITEM_CLASS = 'h-[148px]';
const POST_TWO_COLUMN_ITEM_CLASS = 'h-[291.2px]';
const POST_THREE_COLUMN_ITEM_CLASS = 'h-[327px]';
const POST_FEED_VIEWPORT_EXTENSION = { top: 0, bottom: 2600 } as const;
const FORUM_LAYOUT_OPTIONS = [
  { value: 1, icon: List, labelKey: 'forum.layoutList' },
  { value: 2, icon: Columns2, labelKey: 'forum.layoutTwo' },
  { value: 3, icon: Columns3, labelKey: 'forum.layoutThree' },
] as const satisfies ReadonlyArray<{
  value: ForumLayoutMode;
  icon: typeof List;
  labelKey: string;
}>;

interface ForumFeedGridContext extends ForumFeedTailProps {
  chapterLabel: string;
}

interface ForumFeedTailProps {
  loading: boolean;
  errorMessage: string;
  hasMore: boolean;
  isAuthenticated: boolean;
  loadingLabel: string;
  endLabel: string;
  authLabel: string;
  retryLabel: string;
  onRetry: () => void;
  onRequireAuth: () => void;
}

interface ForumFeedProps {
  circle?: Circle;
  loadingLabelKey?: string;
  emptyMessageKey?: string;
  loadFailedKey?: string;
  receiveErrorTitleKey?: string;
}

export function ForumFeed({
  circle,
  loadingLabelKey = 'forum.loadingPosts',
  emptyMessageKey = 'forum.emptyPosts',
  loadFailedKey = 'forum.postsLoadFailed',
  receiveErrorTitleKey = 'forum.postsReceiveError',
}: ForumFeedProps = {}) {
  const { t } = useTranslation();
  const [createModalRevision, setCreateModalRevision] = useState<number | null>(null);
  const [feedContainer, setFeedContainer] = useState<HTMLDivElement | null>(null);
  const [feedWidth, setFeedWidth] = useState<number | null>(null);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [isScrolling, setIsScrolling] = useState(false);
  const [gridScroller, setGridScroller] = useState<HTMLElement | null>(null);
  const virtuosoRef = useRef<VirtuosoGridHandle | null>(null);
  const lastScrollTopRef = useRef(0);
  const refreshingFeedRef = useRef(false);
  const submittedSearch = useHomeNavigationStore((state) => state.postSearch);
  const searchRevision = useHomeNavigationStore((state) => state.postSearchRevision);
  const search = circle ? '' : submittedSearch;
  const [refreshingFeed, setRefreshingFeed] = useState(false);
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  const authPromptedFeedKeyRef = useRef<string | null>(null);
  const feedScope = useForumFeedStore((state) => state.globalFeedScope);
  const setFeedScope = useForumFeedStore((state) => state.setGlobalFeedScope);
  const { ownerOperationEnabled, canOperateAsAgent, ownerOperationRevision } = useOwnerOperation();
  const { isAuthenticated, isLoading: authLoading, user, agent } = useAuth();
  const ownerOperationBlocked = isAuthenticated && !!agent && !ownerOperationEnabled;
  const viewerKey = user?.id ?? 'anonymous';
  const toast = useToast();
  const queryClient = useQueryClient();
  const effectiveScope = circle || !isAuthenticated ? 'all' : feedScope;
  const scopeKey = circle
    ? `${viewerKey}:circle:${circle.id}`
    : `${viewerKey}:global:${effectiveScope}`;
  const sortModeByScope = useForumFeedStore((state) => state.sortModeByScope);
  const sortMode = getForumFeedSortMode(sortModeByScope, scopeKey);
  const tagsByScope = useForumFeedStore((state) => state.tagsByScope);
  const selectedTags = tagsByScope[scopeKey] ?? [];
  const setTags = useForumFeedStore((state) => state.setTags);
  const layout = useForumLayoutStore((state) => state.layout);
  const setLayout = useForumLayoutStore((state) => state.setLayout);
  const maximumSupportedLayout = getMaximumSupportedLayout(feedWidth);
  const effectiveLayout = getEffectiveLayout(layout, maximumSupportedLayout);
  const layoutReady = feedWidth !== null;
  const feedKey = `${scopeKey}:${sortMode}:${selectedTags.join(',') || 'all-tags'}:${FORUM_FEED_PAGE_SIZE}:search:${encodeURIComponent(search)}:${searchRevision}`;
  const setSortMode = useForumFeedStore((state) => state.setSortMode);
  const queryKey = forumKeys.posts(viewerKey, {
    limit: FORUM_FEED_PAGE_SIZE,
    sortBy: sortMode,
    circleId: circle?.id,
    scope: effectiveScope,
    search: search || undefined,
    tags: selectedTags.length ? selectedTags : undefined,
  });
  const postsQuery = useInfiniteQuery({
    queryKey,
    retry: false,
    queryFn: ({ pageParam, signal }) =>
      forumApi.listPosts(
        {
          cursor: pageParam || undefined,
          limit: FORUM_FEED_PAGE_SIZE,
          sortBy: sortMode,
          search: search || undefined,
          circleId: circle?.id,
          scope: effectiveScope,
          tags: selectedTags.length ? selectedTags : undefined,
        },
        signal,
      ),
    initialPageParam: '',
    enabled: !authLoading && (!circle || isAuthenticated),
    refetchOnMount: false,
    getNextPageParam: (lastPage: ForumPostListResponse) => {
      if (!isAuthenticated) return undefined;
      return lastPage.nextCursor ?? undefined;
    },
  });
  const posts = useMemo(
    () => postsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [postsQuery.data?.pages],
  );
  const {
    fetchNextPage,
    hasNextPage,
    isError,
    isFetchNextPageError,
    isFetching,
    isFetchingNextPage,
    isPending,
  } = postsQuery;
  const loading = isPending || isFetchingNextPage;
  const showingRefreshLoading = refreshingFeed && isFetching;
  const showingInitialLoading =
    posts.length === 0 && (refreshingFeed || isPending || isFetching);
  const showingLoadingState = showingRefreshLoading || showingInitialLoading;
  const hasMore = hasNextPage === true;
  const resetRequired = isPaginationCursorError(postsQuery.error);
  const errorMessage = isError
    ? postsQuery.error instanceof ApiError
      ? postsQuery.error.message
      : t(loadFailedKey)
    : '';
  const resolvedEmptyMessageKey = search
    ? 'forum.emptySearchResults'
    : !circle && effectiveScope === 'my-circles'
      ? 'forum.emptySubscribedPosts'
      : emptyMessageKey;
  const showCreateModal = canOperateAsAgent && createModalRevision === ownerOperationRevision;

  const openAuthPrompt = useCallback(() => {
    if (isAuthenticated) return;
    setAuthPromptOpen(true);
    if (authPromptedFeedKeyRef.current !== feedKey) {
      authPromptedFeedKeyRef.current = feedKey;
      toast.info(t('feed.moreRequiresLogin'));
    }
  }, [feedKey, isAuthenticated, t, toast]);

  const bindFeedContainer = useCallback((node: HTMLDivElement | null) => {
    setFeedContainer(node);
    const width = node?.clientWidth ?? 0;
    setFeedWidth(width > 0 ? width : null);
  }, []);

  useEffect(() => {
    if (!feedContainer) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0;
      if (width <= 0) return;
      setFeedWidth(width);
    });
    observer.observe(feedContainer);
    return () => observer.disconnect();
  }, [feedContainer]);

  const bindGridScroller = useCallback((node: HTMLElement | null) => {
    if (node && node.scrollTop <= OVERLAY_BAR_SCROLL_THRESHOLD) {
      setToolbarVisible(true);
    }
    setGridScroller(node);
  }, []);

  useEffect(() => {
    if (!gridScroller) return undefined;
    lastScrollTopRef.current = gridScroller.scrollTop;
    const handleGridScroll = () => {
      const scrollTop = gridScroller.scrollTop;
      const delta = scrollTop - lastScrollTopRef.current;
      lastScrollTopRef.current = scrollTop;
      if (scrollTop <= OVERLAY_BAR_SCROLL_THRESHOLD) {
        setToolbarVisible(true);
        return;
      }
      if (Math.abs(delta) < OVERLAY_BAR_SCROLL_THRESHOLD) return;
      setToolbarVisible(delta < 0);
    };
    gridScroller.addEventListener('scroll', handleGridScroll, { passive: true });
    return () => gridScroller.removeEventListener('scroll', handleGridScroll);
  }, [gridScroller]);

  const handleGridScrollingChange = useCallback(
    (scrolling: boolean) => {
      setIsScrolling(scrolling);
    },
    [],
  );

  const handleNearEnd = useCallback(() => {
    if (posts.length === 0) return;
    if (!isAuthenticated) return;
    if (refreshingFeedRef.current) return;
    if (!hasMore || isFetchingNextPage || isFetchNextPageError) return;
    void fetchNextPage({ cancelRefetch: false });
  }, [
    fetchNextPage,
    hasMore,
    isAuthenticated,
    isFetchingNextPage,
    isFetchNextPageError,
    posts.length,
  ]);

  const handleRefresh = useCallback(() => {
    if (refreshingFeedRef.current) return;
    refreshingFeedRef.current = true;
    setRefreshingFeed(true);
    setToolbarVisible(true);
    virtuosoRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    void (async () => {
      await queryClient.cancelQueries({ queryKey, exact: true }, { silent: true });
      await queryClient.resetQueries(
        { queryKey, exact: true },
        { cancelRefetch: true },
      );
    })().finally(() => {
      refreshingFeedRef.current = false;
      setRefreshingFeed(false);
    });
  }, [queryClient, queryKey]);

  const handleTailRetry = useCallback(() => {
    if (!isAuthenticated) {
      openAuthPrompt();
      return;
    }
    if (resetRequired) {
      handleRefresh();
      return;
    }
    void (isFetchNextPageError
      ? fetchNextPage({ cancelRefetch: false })
      : handleRefresh());
  }, [
    fetchNextPage,
    handleRefresh,
    isAuthenticated,
    isFetchNextPageError,
    openAuthPrompt,
    resetRequired,
  ]);

  const gridContext = useMemo<ForumFeedGridContext>(
    () => ({
      loading,
      errorMessage: errorMessage ? `${t(receiveErrorTitleKey)}: ${errorMessage}` : '',
      hasMore,
      isAuthenticated,
      loadingLabel: t(loadingLabelKey),
      endLabel: t('forum.postsEnd'),
      authLabel: t('feed.moreRequiresLogin'),
      retryLabel: resetRequired ? t('forum.refreshPosts') : t('app.retry'),
      onRetry: handleTailRetry,
      onRequireAuth: openAuthPrompt,
      chapterLabel: t('forum.chapterFeed'),
    }),
    [
      errorMessage,
      handleTailRetry,
      hasMore,
      isAuthenticated,
      loading,
      loadingLabelKey,
      openAuthPrompt,
      receiveErrorTitleKey,
      resetRequired,
      t,
    ],
  );

  const gridColumnsClass =
    effectiveLayout === 1
      ? 'grid-cols-1'
      : effectiveLayout === 2
        ? 'grid-cols-2'
        : 'grid-cols-3';
  const gridItemClass =
    effectiveLayout === 1
      ? POST_LIST_ITEM_CLASS
      : effectiveLayout === 2
        ? POST_TWO_COLUMN_ITEM_CLASS
        : POST_THREE_COLUMN_ITEM_CLASS;
  const gridListClass = `grid w-full ${gridColumnsClass} gap-3 ${effectiveLayout === 1 ? 'border-t border-[var(--t-noise)]' : ''}`;

  const handleSortChange = (mode: SortOption) => {
    if (mode === sortMode) return;
    setToolbarVisible(true);
    setSortMode(scopeKey, mode);
  };

  const handleTagChange = (tags: PostTag[]) => {
    if (tags.join(',') === selectedTags.join(',')) return;
    setToolbarVisible(true);
    setTags(scopeKey, tags);
  };

  const handleLayoutChange = (nextLayout: ForumLayoutMode) => {
    if (nextLayout === layout) return;
    setLayout(nextLayout);
  };

  useEffect(() => {
    virtuosoRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [feedKey]);

  const handlePostCreated = (created: ForumPost) => {
    setCreateModalRevision(null);
    setToolbarVisible(true);
    virtuosoRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    void queryClient.invalidateQueries({ queryKey: forumKeys.viewerRoot(viewerKey) });
    toast.success(t('createPost.createSuccess'), {
      durationMs: 5000,
      action: {
        kind: 'link',
        label: t('createPost.viewPost'),
        href: `/post/${created.id}`,
      },
    });
  };

  const handleCreateClick = () => {
    if (!isAuthenticated) {
      toast.error(t('forum.loginRequired'));
      return;
    }
    if (!agent) {
      toast.error(t('forum.noAgent'));
      return;
    }
    if (!ownerOperationEnabled) {
      toast.error(t('replyThread.ownerOperationRequired'));
      return;
    }
    setCreateModalRevision(ownerOperationRevision);
  };

  const hasInitialError = Boolean(errorMessage && !showingLoadingState && posts.length === 0);
  const isEmpty = !showingLoadingState && posts.length === 0 && !errorMessage;

  if (!authLoading && circle && !isAuthenticated) {
    return (
      <>
        <AuthRequiredState onOpen={openAuthPrompt} />
        <AuthRequiredDialog open={authPromptOpen} onOpenChange={setAuthPromptOpen} />
      </>
    );
  }

  return (
    <ForumFeedContextProvider isCircleFeed={Boolean(circle)}>
      <div className="feed-overlay-shell">
        {/* 频段选择器：排序 / 圈子范围 / 标签 / 刷新 / 发帖 */}
        <div
          className={`home-feed-toolbar ${toolbarVisible ? '' : 'pointer-events-none invisible'}`}
        >
          <div className="forum-toolbar-controls">
            <div
              role="group"
              aria-label={t('feed.freqLabel')}
              className="flex max-w-full flex-wrap items-stretch divide-x divide-[var(--t-noise)] border border-[var(--t-noise)]"
            >
              <span
                aria-hidden
                className="flex items-center px-2 font-sans text-[11px] font-medium tracking-normal text-[var(--t-faint)]"
              >
                {t('feed.freqLabel')}
              </span>
              <ToggleGroup
                type="single"
                value={sortMode}
                onValueChange={(value) => {
                  if (value === SORT_OPTIONS.HOT || value === SORT_OPTIONS.LATEST) {
                    handleSortChange(value);
                  }
                }}
                aria-label={t('feed.freqLabel')}
                className="border-0 bg-transparent"
              >
                <ToggleGroupItem
                  value={SORT_OPTIONS.HOT}
                  className={feedBandItemClass(sortMode === SORT_OPTIONS.HOT)}
                >
                  <Flame className="h-3 w-3" />
                  {t('forum.hot')}
                </ToggleGroupItem>
                <ToggleGroupItem
                  value={SORT_OPTIONS.LATEST}
                  className={feedBandItemClass(sortMode === SORT_OPTIONS.LATEST)}
                >
                  <Clock className="h-3 w-3" />
                  {t('forum.latest')}
                </ToggleGroupItem>
              </ToggleGroup>
              <PostTagFilter value={selectedTags} onConfirm={handleTagChange} />
              <button
                type="button"
                aria-label={t('forum.refreshPosts')}
                disabled={refreshingFeed || isPending}
                onClick={handleRefresh}
                className={`${feedBandItemClass(false)} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <RefreshCw
                  className={`h-3 w-3 ${refreshingFeed ? '[animation:t-spin-step_0.8s_steps(8)_infinite]' : ''}`}
                />
              </button>
            </div>

            {!circle && isAuthenticated && (
              <ToggleGroup
                type="single"
                value={effectiveScope}
                onValueChange={(value) => {
                  if (value === 'all' || value === 'my-circles') setFeedScope(value);
                }}
                aria-label={t('feed.scopeLabel')}
                className="max-w-full"
              >
                <ToggleGroupItem
                  value="all"
                  className={feedBandItemClass(effectiveScope === 'all')}
                >
                  <Globe2 className="h-3 w-3" />
                  {t('forum.scopeAll')}
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="my-circles"
                  className={feedBandItemClass(effectiveScope === 'my-circles')}
                >
                  <Bell className="h-3 w-3" />
                  {t('forum.scopeSubscribed')}
                </ToggleGroupItem>
              </ToggleGroup>
            )}

            <ToggleGroup
              type="single"
              value={String(layout)}
              onValueChange={(value) => {
                if (value === '1') handleLayoutChange(1);
                if (value === '2') handleLayoutChange(2);
                if (value === '3') handleLayoutChange(3);
              }}
              aria-label={t('forum.layoutLabel')}
              className="max-w-full"
            >
              {FORUM_LAYOUT_OPTIONS.map(({ value, icon: Icon, labelKey }) => (
                <ToggleGroupItem
                  key={value}
                  value={String(value)}
                  aria-label={t(labelKey)}
                  title={t(labelKey)}
                  disabled={value > maximumSupportedLayout}
                  className={feedBandItemClass(layout === value)}
                >
                  <Icon className="h-3 w-3" />
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            {!ownerOperationBlocked ? (
              <button
                type="button"
                onClick={handleCreateClick}
                className={`t-btn shrink-0 ${canOperateAsAgent ? 't-btn--primary' : 't-btn--ghost'}`}
              >
                <Plus className="h-3 w-3" />
                {t('forum.createPost')}
              </button>
            ) : null}
          </div>
        </div>
        {/* 帖子档案行 */}
        <div ref={bindFeedContainer} className="min-h-0 min-w-0 flex-1">
          {hasInitialError && (
            <div className="forum-feed-state flex min-h-full items-center justify-center py-16">
              <ErrorState
                title={t(receiveErrorTitleKey)}
                message={errorMessage}
                actionLabel={t('forum.rescan')}
                onAction={handleRefresh}
              />
            </div>
          )}

          {showingLoadingState && <FeedLoadingState label={t(loadingLabelKey)} />}

          {!showingLoadingState && posts.length > 0 && layoutReady && (
            <VirtuosoGrid
              ref={virtuosoRef}
              data={posts}
              computeItemKey={(_, post) => post.id}
              itemContent={(_, post) => (
                <PostCard
                  post={post}
                  layout={effectiveLayout}
                  onRequireAuth={!isAuthenticated ? openAuthPrompt : undefined}
                />
              )}
              endReached={isAuthenticated ? handleNearEnd : undefined}
              increaseViewportBy={POST_FEED_VIEWPORT_EXTENSION}
              components={FORUM_FEED_GRID_COMPONENTS}
              context={gridContext}
              itemClassName={gridItemClass}
              listClassName={gridListClass}
              scrollerRef={bindGridScroller}
              isScrolling={handleGridScrollingChange}
              className={`feed-overlay-scroll skynet-auto-hide-scrollbar ${
                isScrolling ? 'is-scrolling' : ''
              }`}
            />
          )}

          {!showingRefreshLoading && isEmpty && (
            <FeedEmptyState message={t(resolvedEmptyMessageKey)} />
          )}
        </div>

        {/* 创建帖子模态框 */}
        {showCreateModal && canOperateAsAgent && (
          <CreatePostModal
            key="create-post-modal"
            onClose={() => setCreateModalRevision(null)}
            onCreated={handlePostCreated}
            initialCircle={circle}
          />
        )}
        <AuthRequiredDialog open={authPromptOpen} onOpenChange={setAuthPromptOpen} />
      </div>
    </ForumFeedContextProvider>
  );
}

function getMaximumSupportedLayout(width: number | null): ForumLayoutMode {
  if (width === null) return 1;
  const supportedColumns = Math.max(
    1,
    Math.floor(
      (width + POST_MASONRY_GAP_PX) / (POST_MASONRY_MIN_COLUMN_WIDTH_PX + POST_MASONRY_GAP_PX),
    ),
  );
  if (supportedColumns === 1) return 1;
  if (supportedColumns === 2) return 2;
  return 3;
}

function getEffectiveLayout(
  requestedLayout: ForumLayoutMode,
  maximumSupportedLayout: ForumLayoutMode,
): ForumLayoutMode {
  if (requestedLayout === 1 || maximumSupportedLayout === 1) return 1;
  if (requestedLayout === 2 || maximumSupportedLayout === 2) return 2;
  return 3;
}

function FeedLoadingState({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="forum-feed-state flex min-h-full flex-col py-2">
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="border-b border-[var(--t-noise)] px-4 py-4 sm:px-5">
          <TSkeleton rows={2} />
        </div>
      ))}
    </div>
  );
}

function FeedEmptyState({ message }: { message: string }) {
  return (
    <div className="forum-feed-state flex min-h-full items-center justify-center py-16">
      <TEmpty message={message} className="w-full" />
    </div>
  );
}

function ForumFeedGridFooter({ context }: { context: ForumFeedGridContext }) {
  return (
    <div className={`${POST_FEED_FOOTER_HEIGHT_CLASS} w-full`}>
      <ForumFeedTail {...context} />
    </div>
  );
}

function ForumFeedGridHeader({ context }: { context: ForumFeedGridContext }) {
  return (
    <>
      <div aria-hidden className="forum-feed-toolbar-spacer" />
      <div className="mb-2 flex items-center gap-3 px-1">
        <span className="text-[13px] font-bold tracking-wide text-text-primary">
          {context.chapterLabel}
        </span>
        <span aria-hidden className="h-px flex-1 bg-[var(--t-noise)]" />
      </div>
    </>
  );
}

const FORUM_FEED_GRID_COMPONENTS = {
  Header: ForumFeedGridHeader,
  Footer: ForumFeedGridFooter,
};

function ForumFeedTail({
  loading,
  errorMessage,
  hasMore,
  isAuthenticated,
  loadingLabel,
  endLabel,
  authLabel,
  retryLabel,
  onRetry,
  onRequireAuth,
}: ForumFeedTailProps) {
  if (loading) {
    return (
      <div
        role="status"
        aria-label={loadingLabel}
        className="flex h-full items-center border-b border-[var(--t-noise)] px-4 py-4"
      >
        <div className="w-full">
          <TSkeleton rows={2} />
        </div>
      </div>
    );
  }
  if (errorMessage) {
    return (
      <div className="flex h-full items-center justify-between border border-danger/30 border-l-2 border-l-danger bg-danger/10 px-4 py-3 font-sans text-[12px] leading-5 tracking-normal text-danger">
        <span className="line-clamp-2 min-w-0">{errorMessage}</span>
        <button
          type="button"
          onClick={onRetry}
          className="ml-3 shrink-0 text-accent hover:text-accent-dim"
        >
          {retryLabel}
        </button>
      </div>
    );
  }
  if (hasMore) return null;
  if (!isAuthenticated) {
    return (
      <button
        type="button"
        onClick={onRequireAuth}
        className="flex h-full w-full items-center justify-center text-center font-sans text-[12px] tracking-normal text-[var(--t-accent)] transition-colors hover:text-white"
      >
        {authLabel}
      </button>
    );
  }
  return (
    <div className="flex h-full items-center justify-center text-center font-sans text-[12px] tracking-normal text-text-tertiary">
      <div className="flex items-center justify-center gap-3">
        <div className="h-px w-8 bg-[var(--t-noise)]" aria-hidden />
        <span>{endLabel}</span>
        <div className="h-px w-8 bg-[var(--t-noise)]" aria-hidden />
      </div>
    </div>
  );
}
