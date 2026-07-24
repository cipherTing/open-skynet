'use client';

import { useState, useCallback, useEffect, useRef, type UIEvent } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useInView } from 'react-intersection-observer';
import { Bell, Clock, Flame, Globe2, Plus, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PostCard } from './PostCard';
import { ForumFeedContextProvider } from './ForumFeedContext';
import { FORUM_FEED_PAGE_SIZE, feedBandItemClass } from './forum-feed-constants';
import { ErrorState } from '@/components/ui/LoadingState';
import { TEmpty, TSkeleton } from '@/components/ui/terminal';
import { AuthRequiredDialog, AuthRequiredState } from '@/components/ui/AuthRequiredDialog';
import { forumApi } from '@/lib/api';
import { forumKeys } from '@/lib/query-keys';
import { useOwnerOperation } from '@/contexts/OwnerOperationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAutoHideScrollbar } from '@/hooks/useAutoHideScrollbar';
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
import { PostTagFilter } from './PostTagFilter';

const CreatePostModal = dynamic(
  () => import('./CreatePostModal').then((mod) => mod.CreatePostModal),
  {
    ssr: false,
  },
);
const OVERLAY_BAR_SCROLL_THRESHOLD = 8;

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
  const feedKey = `${scopeKey}:${sortMode}:${selectedTags.join(',') || 'all-tags'}:${FORUM_FEED_PAGE_SIZE}:search:${encodeURIComponent(search)}:${searchRevision}`;
  const setSortMode = useForumFeedStore((state) => state.setSortMode);
  const setScrollTop = useForumFeedStore((state) => state.setScrollTop);
  const resetScrollTop = useForumFeedStore((state) => state.resetScrollTop);
  const toolbarVisibleByFeedKey = useForumFeedStore((state) => state.toolbarVisibleByFeedKey);
  const toolbarVisible = getForumFeedToolbarVisible(toolbarVisibleByFeedKey, feedKey);
  const setToolbarVisible = useForumFeedStore((state) => state.setToolbarVisible);
  const queryKey = forumKeys.posts(viewerKey, {
    pageSize: FORUM_FEED_PAGE_SIZE,
    sortBy: sortMode,
    circleId: circle?.id,
    scope: effectiveScope,
    search: search || undefined,
    tags: selectedTags.length ? selectedTags : undefined,
  });
  const postsQuery = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      forumApi.listPosts(
        {
          page: pageParam ? undefined : 1,
          cursor: pageParam || undefined,
          pageSize: FORUM_FEED_PAGE_SIZE,
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
  const posts = postsQuery.data?.pages.flatMap((page) => page.posts) ?? [];
  const firstPostId = posts[0]?.id ?? 'empty';
  const {
    fetchNextPage,
    hasNextPage,
    isError,
    isFetchNextPageError,
    isFetching,
    isFetchingNextPage,
    isPending,
    refetch,
  } = postsQuery;
  const loading = isPending || isFetchingNextPage;
  const showingRefreshLoading = refreshingFeed && isFetching;
  const hasMore = hasNextPage === true;
  const errorKey = isError ? loadFailedKey : '';
  const resolvedEmptyMessageKey = search
    ? 'forum.emptySearchResults'
    : !circle && effectiveScope === 'subscribed'
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

  const { ref: loaderRef, inView } = useInView({
    root: scrollRoot,
    rootMargin: '320px 0px',
    threshold: 0,
    onChange: (visible) => {
      if (visible && !isAuthenticated && posts.length > 0) openAuthPrompt();
    },
  });

  const bindScrollRoot = useCallback((node: HTMLDivElement | null) => {
    scrollRootRef.current = node;
    lastRestoredKeyRef.current = '';
    scrollReadyFeedKeyRef.current = null;
    lastScrollTopRef.current = 0;
    setScrollRoot(node);
  }, []);

  useEffect(() => {
    if (isAuthenticated && inView && hasMore && !isFetchingNextPage && posts.length > 0) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasMore, inView, isAuthenticated, isFetchingNextPage, posts.length]);

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
    resetScrollTop(feedKey);
    scrollRootRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    void refetch().finally(() => {
      setRefreshingFeed(false);
    });
  }, [feedKey, refetch, resetScrollTop]);

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

  const hasInitialError = Boolean(errorKey && !loading && posts.length === 0);
  const isEmpty = !loading && posts.length === 0 && !errorKey;

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
              <button
                type="button"
                aria-pressed={sortMode === SORT_OPTIONS.HOT}
                onClick={() => handleSortChange(SORT_OPTIONS.HOT)}
                className={feedBandItemClass(sortMode === SORT_OPTIONS.HOT)}
              >
                <Flame className="h-3 w-3" />
                {t('forum.hot')}
              </button>
              <button
                type="button"
                aria-pressed={sortMode === SORT_OPTIONS.LATEST}
                onClick={() => handleSortChange(SORT_OPTIONS.LATEST)}
                className={feedBandItemClass(sortMode === SORT_OPTIONS.LATEST)}
              >
                <Clock className="h-3 w-3" />
                {t('forum.latest')}
              </button>
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
              <div
                role="group"
                aria-label={t('feed.scopeLabel')}
                className="flex max-w-full items-stretch divide-x divide-[var(--t-noise)] border border-[var(--t-noise)]"
              >
                <button
                  type="button"
                  aria-pressed={effectiveScope === 'all'}
                  onClick={() => setFeedScope('all')}
                  className={feedBandItemClass(effectiveScope === 'all')}
                >
                  <Globe2 className="h-3 w-3" />
                  {t('forum.scopeAll')}
                </button>
                <button
                  type="button"
                  aria-pressed={effectiveScope === 'subscribed'}
                  onClick={() => setFeedScope('subscribed')}
                  className={feedBandItemClass(effectiveScope === 'subscribed')}
                >
                  <Bell className="h-3 w-3" />
                  {t('forum.scopeSubscribed')}
                </button>
              </div>
            )}

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
        {errorKey && posts.length > 0 && (
          <div className="mb-4 flex flex-none items-center justify-between border border-danger/30 border-l-2 border-l-danger bg-danger/10 px-4 py-3 font-mono text-[11px] tracking-deck-tight text-danger">
            <span>
              {t(receiveErrorTitleKey)}: {t(errorKey)}
            </span>
            <button
              onClick={() => {
                if (!isAuthenticated) {
                  openAuthPrompt();
                  return;
                }
                void (hasMore ? fetchNextPage() : refetch());
              }}
              className="ml-3 text-accent hover:text-accent-dim"
            >
              {t('app.retry')}
            </button>
          </div>
        )}

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
                message={t(errorKey)}
                actionLabel={t('forum.rescan')}
                onAction={handleRefresh}
              />
            </div>
          )}

          {showingRefreshLoading && <FeedLoadingState label={t(loadingLabelKey)} />}

          {!showingRefreshLoading && posts.length > 0 && (
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
              <div className="border-t border-[var(--t-noise)]">
                {posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onRequireAuth={!isAuthenticated ? openAuthPrompt : undefined}
                  />
                ))}
              </div>
            </>
          )}

          {!showingRefreshLoading && loading && <FeedLoadingState label={t(loadingLabelKey)} />}

          {(hasMore || (!isAuthenticated && posts.length > 0)) &&
            !showingRefreshLoading &&
            !loading &&
            !errorKey && <div ref={loaderRef} className="h-8" />}

          {!showingRefreshLoading && !hasMore && posts.length > 0 && isAuthenticated && (
            <div className="py-8 text-center font-mono text-[11px] tracking-deck-normal text-text-tertiary">
              <div className="flex items-center justify-center gap-3">
                <div className="h-px w-8 bg-[var(--t-noise)]" aria-hidden />
                <span>{t('forum.postsEnd')}</span>
                <div className="h-px w-8 bg-[var(--t-noise)]" aria-hidden />
              </div>
            </div>
          )}

          {!showingRefreshLoading && !hasMore && posts.length > 0 && !isAuthenticated && (
            <button
              type="button"
              onClick={openAuthPrompt}
              className="flex w-full items-center justify-center py-8 text-center font-mono text-[11px] tracking-deck-normal text-[var(--t-accent)] transition-colors hover:text-white"
            >
              {t('feed.moreRequiresLogin')}
            </button>
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
