'use client';

import { useState, useCallback, useEffect, useRef, type UIEvent } from 'react';
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
import { ErrorState } from '@/components/ui/LoadingState';
import { TEmpty, TSkeleton } from '@/components/ui/terminal';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { VirtualList } from '@/components/ui/VirtualList';
import { AuthRequiredDialog, AuthRequiredState } from '@/components/ui/AuthRequiredDialog';
import { ApiError, forumApi } from '@/lib/api';
import { forumKeys } from '@/lib/query-keys';
import { useOwnerOperation } from '@/contexts/OwnerOperationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAutoHideScrollbar } from '@/hooks/useAutoHideScrollbar';
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
  getForumFeedToolbarVisible,
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
const POST_ROW_ESTIMATED_HEIGHT = 248;
const POST_MASONRY_ESTIMATED_HEIGHT = 360;
const POST_MASONRY_GAP_PX = 12;
const POST_MASONRY_MIN_COLUMN_WIDTH_PX = 300;
const FORUM_LAYOUT_OPTIONS = [
  { value: 1, icon: List, labelKey: 'forum.layoutList' },
  { value: 2, icon: Columns2, labelKey: 'forum.layoutTwo' },
  { value: 3, icon: Columns3, labelKey: 'forum.layoutThree' },
] as const satisfies ReadonlyArray<{
  value: ForumLayoutMode;
  icon: typeof List;
  labelKey: string;
}>;

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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const [feedWidth, setFeedWidth] = useState<number | null>(null);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const lastRestoredKeyRef = useRef('');
  const scrollReadyFeedKeyRef = useRef<string | null>(null);
  const currentFeedKeyRef = useRef('');
  const lastScrollTopRef = useRef(0);
  const submittedSearch = useHomeNavigationStore((state) => state.postSearch);
  const searchRevision = useHomeNavigationStore((state) => state.postSearchRevision);
  const search = circle ? '' : submittedSearch;
  const [refreshingFeed, setRefreshingFeed] = useState(false);
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  const authPromptedFeedKeyRef = useRef<string | null>(null);
  const feedScope = useForumFeedStore((state) => state.globalFeedScope);
  const setFeedScope = useForumFeedStore((state) => state.setGlobalFeedScope);
  const { ownerOperationEnabled, canOperateAsAgent } = useOwnerOperation();
  const { isAuthenticated, isLoading: authLoading, user, agent } = useAuth();
  const ownerOperationBlocked = isAuthenticated && !!agent && !ownerOperationEnabled;
  const viewerKey = user?.id ?? 'anonymous';
  const toast = useToast();
  const queryClient = useQueryClient();
  const { isScrolling, handleScroll } = useAutoHideScrollbar();
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
  const feedKey = `${scopeKey}:${sortMode}:${selectedTags.join(',') || 'all-tags'}:layout:${layout}:${FORUM_FEED_PAGE_SIZE}:search:${encodeURIComponent(search)}:${searchRevision}`;
  const setSortMode = useForumFeedStore((state) => state.setSortMode);
  const setScrollTop = useForumFeedStore((state) => state.setScrollTop);
  const resetScrollTop = useForumFeedStore((state) => state.resetScrollTop);
  const toolbarVisibleByFeedKey = useForumFeedStore((state) => state.toolbarVisibleByFeedKey);
  const toolbarVisible = getForumFeedToolbarVisible(toolbarVisibleByFeedKey, feedKey);
  const setToolbarVisible = useForumFeedStore((state) => state.setToolbarVisible);
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
    getNextPageParam: (lastPage: ForumPostListResponse) => {
      if (!isAuthenticated) return undefined;
      return lastPage.nextCursor ?? undefined;
    },
  });
  const posts = postsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const firstPostId = posts[0]?.id ?? 'empty';
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

  const openAuthPrompt = useCallback(() => {
    if (isAuthenticated) return;
    setAuthPromptOpen(true);
    if (authPromptedFeedKeyRef.current !== feedKey) {
      authPromptedFeedKeyRef.current = feedKey;
      toast.info(t('feed.moreRequiresLogin'));
    }
  }, [feedKey, isAuthenticated, t, toast]);

  const bindScrollRoot = useCallback((node: HTMLDivElement | null) => {
    scrollRootRef.current = node;
    lastRestoredKeyRef.current = '';
    scrollReadyFeedKeyRef.current = null;
    lastScrollTopRef.current = 0;
    setScrollRoot(node);
    const width = node?.clientWidth ?? 0;
    setFeedWidth(width > 0 ? width : null);
  }, []);

  useEffect(() => {
    if (!scrollRoot) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (entry?.contentRect.width && entry.contentRect.width > 0) {
        setFeedWidth(entry.contentRect.width);
      }
    });
    observer.observe(scrollRoot);
    return () => observer.disconnect();
  }, [scrollRoot]);

  const handleNearEnd = useCallback(() => {
    if (posts.length === 0) return;
    if (!isAuthenticated) return;
    if (hasMore && !isFetchingNextPage && !isFetchNextPageError) {
      void fetchNextPage({ cancelRefetch: false });
    }
  }, [
    fetchNextPage,
    hasMore,
    isAuthenticated,
    isFetchingNextPage,
    isFetchNextPageError,
    posts.length,
  ]);

  useEffect(() => {
    currentFeedKeyRef.current = feedKey;
    const node = scrollRootRef.current;
    if (!node) return;
    if (posts.length === 0) {
      if (!isPending) {
        setToolbarVisible(feedKey, true);
        scrollReadyFeedKeyRef.current = feedKey;
      }
      return;
    }

    const restoreKey = `${feedKey}:${firstPostId}`;
    if (lastRestoredKeyRef.current === restoreKey) {
      scrollReadyFeedKeyRef.current = feedKey;
      return;
    }

    scrollReadyFeedKeyRef.current = null;
    let cancelled = false;
    let releaseFrame: number | null = null;
    const targetScrollTop = useForumFeedStore.getState().scrollTopByFeedKey[feedKey] ?? 0;
    const restoreFrame = window.requestAnimationFrame(() => {
      if (cancelled || scrollRootRef.current !== node || currentFeedKeyRef.current !== feedKey)
        return;
      node.scrollTo({ top: targetScrollTop, behavior: 'auto' });
      releaseFrame = window.requestAnimationFrame(() => {
        if (cancelled || scrollRootRef.current !== node || currentFeedKeyRef.current !== feedKey)
          return;
        const maximumScrollTop = Math.max(0, node.scrollHeight - node.clientHeight);
        if (targetScrollTop > maximumScrollTop && hasMore && !isFetchNextPageError) return;

        const restoredScrollTop = node.scrollTop;
        lastRestoredKeyRef.current = restoreKey;
        if (restoredScrollTop <= OVERLAY_BAR_SCROLL_THRESHOLD) {
          setToolbarVisible(feedKey, true);
        }
        if (restoredScrollTop !== targetScrollTop) {
          setScrollTop(feedKey, restoredScrollTop);
        }
        scrollReadyFeedKeyRef.current = feedKey;
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(restoreFrame);
      if (releaseFrame !== null) window.cancelAnimationFrame(releaseFrame);
    };
  }, [
    feedKey,
    firstPostId,
    hasMore,
    isFetchNextPageError,
    isPending,
    posts.length,
    setScrollTop,
    setToolbarVisible,
  ]);

  const handleSortChange = (mode: SortOption) => {
    if (mode === sortMode) return;
    lastRestoredKeyRef.current = '';
    setSortMode(scopeKey, mode);
  };

  const handleTagChange = (tags: PostTag[]) => {
    if (tags.join(',') === selectedTags.join(',')) return;
    lastRestoredKeyRef.current = '';
    setTags(scopeKey, tags);
  };

  const handleLayoutChange = (nextLayout: ForumLayoutMode) => {
    if (nextLayout === layout) return;
    lastRestoredKeyRef.current = '';
    setLayout(nextLayout);
  };

  const handleFeedScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      handleScroll();
      const scrollTop = event.currentTarget.scrollTop;
      const delta = scrollTop - lastScrollTopRef.current;
      lastScrollTopRef.current = scrollTop;
      if (scrollReadyFeedKeyRef.current !== feedKey) return;
      setScrollTop(feedKey, scrollTop);
      if (scrollTop <= OVERLAY_BAR_SCROLL_THRESHOLD) {
        setToolbarVisible(feedKey, true);
        return;
      }
      if (Math.abs(delta) < OVERLAY_BAR_SCROLL_THRESHOLD) return;
      setToolbarVisible(feedKey, delta < 0);
    },
    [feedKey, handleScroll, setScrollTop, setToolbarVisible],
  );

  const handleRefresh = useCallback(() => {
    setRefreshingFeed(true);
    lastRestoredKeyRef.current = '';
    resetScrollTop(feedKey);
    scrollRootRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    void queryClient.resetQueries({ queryKey, exact: true }).finally(() => {
      setRefreshingFeed(false);
    });
  }, [feedKey, queryClient, queryKey, resetScrollTop]);

  const handlePostCreated = (created: ForumPost) => {
    setShowCreateModal(false);
    resetScrollTop(feedKey);
    scrollRootRef.current?.scrollTo({ top: 0, behavior: 'auto' });
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
    setShowCreateModal(true);
  };

  const hasInitialError = Boolean(errorMessage && !loading && posts.length === 0);
  const isEmpty = !loading && posts.length === 0 && !errorMessage;

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
                className="flex items-center px-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--t-faint)]"
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
                disabled={postsQuery.isFetching}
                onClick={handleRefresh}
                className={`${feedBandItemClass(false)} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <RefreshCw
                  className={`h-3 w-3 ${postsQuery.isFetching ? '[animation:t-spin-step_0.8s_steps(8)_infinite]' : ''}`}
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
              value={String(effectiveLayout)}
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
                  className={feedBandItemClass(effectiveLayout === value)}
                >
                  <Icon className="h-3 w-3" />
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            <button
              type="button"
              onClick={handleCreateClick}
              disabled={ownerOperationBlocked}
              title={ownerOperationBlocked ? t('replyThread.ownerOperationRequired') : undefined}
              className={`t-btn shrink-0 disabled:cursor-not-allowed disabled:opacity-40 ${canOperateAsAgent ? 't-btn--primary' : 't-btn--ghost'}`}
            >
              <Plus className="h-3 w-3" />
              {t('forum.createPost')}
            </button>
          </div>
        </div>
        {/* 帖子档案行 */}
        <div
          ref={bindScrollRoot}
          onScroll={handleFeedScroll}
          className={`feed-overlay-scroll feed-overlay-scroll--with-toolbar skynet-auto-hide-scrollbar ${
            isScrolling ? 'is-scrolling' : ''
          }`}
        >
          {hasInitialError && (
            <div className="flex min-h-full items-center justify-center py-16">
              <ErrorState
                title={t(receiveErrorTitleKey)}
                message={errorMessage}
                actionLabel={t('forum.rescan')}
                onAction={handleRefresh}
              />
            </div>
          )}

          {showingRefreshLoading && <FeedLoadingState label={t(loadingLabelKey)} />}

          {!showingRefreshLoading && posts.length > 0 && layoutReady && (
            <>
              <div className="mb-2 flex items-center gap-3 px-1">
                <span className="font-mono text-[11px] tracking-[0.2em] text-[var(--t-accent)]">
                  CH.01
                </span>
                <span className="font-mono text-[11px] tracking-[0.2em] text-[var(--t-faint)]">
                  {'//'}
                </span>
                <span className="text-[13px] font-bold tracking-wide text-text-primary">
                  {t('forum.chapterFeed')}
                </span>
                <span aria-hidden className="h-px flex-1 bg-[var(--t-noise)]" />
                <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--t-faint)]">
                  {t('feed.recordCount', { count: posts.length })}
                </span>
              </div>
              <VirtualList
                key={feedKey}
                items={posts}
                scrollElement={scrollRoot}
                getItemKey={(post) => post.id}
                estimateSize={() =>
                  effectiveLayout === 1 ? POST_ROW_ESTIMATED_HEIGHT : POST_MASONRY_ESTIMATED_HEIGHT
                }
                onNearEnd={isAuthenticated ? handleNearEnd : undefined}
                initialOffset={() => useForumFeedStore.getState().scrollTopByFeedKey[feedKey] ?? 0}
                layoutVersion={`${feedKey}:${effectiveLayout}`}
                lanes={effectiveLayout}
                gap={effectiveLayout > 1 ? POST_MASONRY_GAP_PX : 0}
                className={effectiveLayout === 1 ? 'border-t border-[var(--t-noise)]' : undefined}
                tail={
                  <ForumFeedTail
                    loading={loading}
                    errorMessage={errorMessage ? `${t(receiveErrorTitleKey)}: ${errorMessage}` : ''}
                    hasMore={hasMore}
                    isAuthenticated={isAuthenticated}
                    loadingLabel={t(loadingLabelKey)}
                    endLabel={t('forum.postsEnd')}
                    authLabel={t('feed.moreRequiresLogin')}
                    retryLabel={resetRequired ? t('forum.refreshPosts') : t('app.retry')}
                    onRetry={() => {
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
                    }}
                    onRequireAuth={openAuthPrompt}
                  />
                }
                renderItem={(post) => (
                  <PostCard
                    post={post}
                    layout={effectiveLayout}
                    onRequireAuth={!isAuthenticated ? openAuthPrompt : undefined}
                  />
                )}
              />
            </>
          )}

          {!showingRefreshLoading && isEmpty && (
            <FeedEmptyState message={t(resolvedEmptyMessageKey)} />
          )}
        </div>

        {/* 创建帖子模态框 */}
        {showCreateModal && canOperateAsAgent && (
          <CreatePostModal
            key="create-post-modal"
            onClose={() => setShowCreateModal(false)}
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
    <div role="status" aria-label={label} className="flex min-h-full flex-col py-2">
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
    <div className="flex min-h-full items-center justify-center py-16">
      <TEmpty message={message} className="w-full" />
    </div>
  );
}

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
}: {
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
}) {
  if (loading) {
    return (
      <div
        role="status"
        aria-label={loadingLabel}
        className="border-b border-[var(--t-noise)] px-4 py-4"
      >
        <TSkeleton rows={2} />
      </div>
    );
  }
  if (errorMessage) {
    return (
      <div className="flex items-center justify-between border border-danger/30 border-l-2 border-l-danger bg-danger/10 px-4 py-3 font-mono text-[11px] tracking-deck-tight text-danger">
        <span>{errorMessage}</span>
        <button type="button" onClick={onRetry} className="ml-3 text-accent hover:text-accent-dim">
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
        className="flex w-full items-center justify-center py-8 text-center font-mono text-[11px] tracking-deck-normal text-[var(--t-accent)] transition-colors hover:text-white"
      >
        {authLabel}
      </button>
    );
  }
  return (
    <div className="py-8 text-center font-mono text-[11px] tracking-deck-normal text-text-tertiary">
      <div className="flex items-center justify-center gap-3">
        <div className="h-px w-8 bg-[var(--t-noise)]" aria-hidden />
        <span>{endLabel}</span>
        <div className="h-px w-8 bg-[var(--t-noise)]" aria-hidden />
      </div>
    </div>
  );
}
