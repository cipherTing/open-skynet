'use client';

import { useState, useCallback, useEffect, useRef, type UIEvent } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useInView } from 'react-intersection-observer';
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
import {
  motion,
  AnimatePresence,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
} from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { PostCard } from './PostCard';
import { ForumFeedContextProvider } from './ForumFeedContext';
import { FORUM_FEED_PAGE_SIZE } from './forum-feed-constants';
import { ErrorState, InlineLoading } from '@/components/ui/LoadingState';
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
import { MasonryPostGrid } from './MasonryPostGrid';
import { useForumLayoutStore, type ForumLayoutMode } from '@/stores/forum-layout-store';

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
  const prefersReducedMotion = useReducedMotion();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const lastRestoredKeyRef = useRef('');
  const scrollReadyFeedKeyRef = useRef<string | null>(null);
  const currentFeedKeyRef = useRef('');
  const submittedSearch = useHomeNavigationStore((state) => state.postSearch);
  const searchRevision = useHomeNavigationStore((state) => state.postSearchRevision);
  const search = circle ? '' : submittedSearch;
  const [refreshingFeed, setRefreshingFeed] = useState(false);
  const feedScope = useForumFeedStore((state) => state.globalFeedScope);
  const setFeedScope = useForumFeedStore((state) => state.setGlobalFeedScope);
  const { ownerOperationEnabled, canOperateAsAgent } = useOwnerOperation();
  const { isAuthenticated, isLoading: authLoading, user, agent } = useAuth();
  const viewerKey = user?.id ?? 'anonymous';
  const toast = useToast();
  const queryClient = useQueryClient();
  const { isScrolling, handleScroll } = useAutoHideScrollbar();
  const { scrollY } = useScroll({ container: scrollRootRef });
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
  const feedKey = `${scopeKey}:${sortMode}:${selectedTags.join(',') || 'all-tags'}:layout:${layout}:${FORUM_FEED_PAGE_SIZE}:search:${encodeURIComponent(search)}:${searchRevision}`;
  const setSortMode = useForumFeedStore((state) => state.setSortMode);
  const setScrollTop = useForumFeedStore((state) => state.setScrollTop);
  const resetScrollTop = useForumFeedStore((state) => state.resetScrollTop);
  const toolbarVisibleByFeedKey = useForumFeedStore((state) => state.toolbarVisibleByFeedKey);
  const toolbarVisible = getForumFeedToolbarVisible(toolbarVisibleByFeedKey, feedKey);
  const setToolbarVisible = useForumFeedStore((state) => state.setToolbarVisible);
  useMotionValueEvent(scrollY, 'change', (latest) => {
    if (scrollReadyFeedKeyRef.current !== feedKey) return;

    const previous = scrollY.getPrevious() ?? 0;
    const delta = latest - previous;

    if (latest <= OVERLAY_BAR_SCROLL_THRESHOLD) {
      setToolbarVisible(feedKey, true);
      return;
    }

    if (Math.abs(delta) < OVERLAY_BAR_SCROLL_THRESHOLD) return;
    setToolbarVisible(feedKey, delta < 0);
  });
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
          page: sortMode === 'hot' ? Number(pageParam || '1') : 1,
          cursor: sortMode === 'latest' ? pageParam || undefined : undefined,
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
    enabled: !authLoading,
    getNextPageParam: (lastPage: ForumPostListResponse) => {
      if (sortMode === 'latest') return lastPage.nextCursor ?? undefined;
      if (!lastPage.meta || lastPage.meta.page >= lastPage.meta.totalPages) return undefined;
      return String(lastPage.meta.page + 1);
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

  const { ref: loaderRef, inView } = useInView({
    root: scrollRoot,
    rootMargin: '320px 0px',
    threshold: 0,
  });

  const bindScrollRoot = useCallback((node: HTMLDivElement | null) => {
    scrollRootRef.current = node;
    lastRestoredKeyRef.current = '';
    scrollReadyFeedKeyRef.current = null;
    setScrollRoot(node);
  }, []);

  useEffect(() => {
    if (inView && hasMore && !isFetchingNextPage && posts.length > 0) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasMore, inView, isFetchingNextPage, posts.length]);

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

  const handleLayoutChange = (next: ForumLayoutMode) => {
    if (next === layout) return;
    lastRestoredKeyRef.current = '';
    setLayout(next);
  };

  const handleFeedScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      handleScroll();
      if (scrollReadyFeedKeyRef.current !== feedKey) return;
      setScrollTop(feedKey, event.currentTarget.scrollTop);
    },
    [feedKey, handleScroll, setScrollTop],
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

  return (
    <ForumFeedContextProvider isCircleFeed={Boolean(circle)}>
      <div className="feed-overlay-shell">
        {/* 排序标签 + 创建按钮 */}
        <motion.div
          className="home-feed-toolbar"
          initial={false}
          animate={
            prefersReducedMotion || toolbarVisible
              ? { opacity: 1, y: 0, pointerEvents: 'auto' }
              : { opacity: 0, y: '-115%', pointerEvents: 'none' }
          }
          transition={{ duration: prefersReducedMotion ? 0 : 0.18, ease: 'easeOut' }}
        >
          <div className="forum-toolbar-controls">
            <div className="flex max-w-full flex-wrap items-center gap-0.5 rounded-md border border-copper/10 bg-void-deep/60 p-0.5 backdrop-blur-sm">
              <SortTab
                icon={<Flame className="w-3.5 h-3.5" />}
                label={t('forum.hot')}
                active={sortMode === SORT_OPTIONS.HOT}
                onClick={() => handleSortChange(SORT_OPTIONS.HOT)}
              />
              <SortTab
                icon={<Clock className="w-3.5 h-3.5" />}
                label={t('forum.latest')}
                active={sortMode === SORT_OPTIONS.LATEST}
                onClick={() => handleSortChange(SORT_OPTIONS.LATEST)}
              />
              <button
                type="button"
                aria-label={t('forum.refreshPosts')}
                disabled={postsQuery.isFetching}
                onClick={handleRefresh}
                className="ml-0.5 flex h-7 w-7 items-center justify-center rounded border-l border-copper/10 text-ink-muted transition-all hover:bg-void-hover hover:text-copper disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${postsQuery.isFetching ? 'animate-spin' : ''}`}
                />
              </button>
              <PostTagFilter value={selectedTags} onConfirm={handleTagChange} />
            </div>

            {!circle && isAuthenticated && (
              <div className="flex max-w-full items-center gap-0.5 rounded-md border border-copper/10 bg-void-deep/60 p-0.5 backdrop-blur-sm">
                <ScopeTab
                  icon={<Globe2 className="h-3.5 w-3.5" />}
                  label={t('forum.scopeAll')}
                  active={effectiveScope === 'all'}
                  onClick={() => setFeedScope('all')}
                />
                <ScopeTab
                  icon={<Bell className="h-3.5 w-3.5" />}
                  label={t('forum.scopeSubscribed')}
                  active={effectiveScope === 'subscribed'}
                  onClick={() => setFeedScope('subscribed')}
                />
              </div>
            )}

            <div className="forum-layout-switch" aria-label={t('forum.layoutLabel')}>
              {(
                [
                  [1, List, 'forum.layoutList'],
                  [2, Columns2, 'forum.layoutTwo'],
                  [3, Columns3, 'forum.layoutThree'],
                ] as const
              ).map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleLayoutChange(value)}
                  className={layout === value ? 'is-active' : ''}
                  aria-label={t(label)}
                  title={t(label)}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleCreateClick}
            className={`flex shrink-0 items-center gap-1.5 self-start rounded-md border px-2.5 py-1.5 text-xs tracking-wide transition-all ${
              canOperateAsAgent
                ? 'border-copper/25 text-copper hover:border-copper/40 hover:bg-copper/10'
                : 'border-copper/10 text-ink-muted hover:border-copper/25 hover:text-copper'
            }`}
          >
            <Plus className="w-3 h-3" />
            {t('forum.createPost')}
          </button>
        </motion.div>
        {errorKey && posts.length > 0 && (
          <div className="mb-4 flex flex-none items-center justify-between rounded-lg border border-ochre/20 bg-ochre/10 px-4 py-3 text-[12px] tracking-wide text-ochre">
            <span>
              {t(receiveErrorTitleKey)}: {t(errorKey)}
            </span>
            <button
              onClick={() => void (hasMore ? fetchNextPage() : refetch())}
              className="text-copper hover:text-copper-bright transition-colors ml-3"
            >
              {t('app.retry')}
            </button>
          </div>
        )}

        {/* 帖子列表 */}
        <div
          ref={bindScrollRoot}
          onScroll={handleFeedScroll}
          className={`feed-overlay-scroll feed-overlay-scroll--with-toolbar skynet-auto-hide-scrollbar ${
            isScrolling ? 'is-scrolling' : ''
          }`}
        >
          <AnimatePresence>
            {hasInitialError && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="flex min-h-full items-center justify-center py-16"
              >
                <ErrorState
                  title={t(receiveErrorTitleKey)}
                  message={t(errorKey)}
                  actionLabel={t('forum.rescan')}
                  onAction={handleRefresh}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {showingRefreshLoading && <FeedLoadingState label={t(loadingLabelKey)} />}

          {!showingRefreshLoading && posts.length > 0 && (
            <MasonryPostGrid layout={layout}>
              {posts.map((post, index) => (
                <PostCard
                  key={post.id}
                  post={post}
                  index={index}
                  animationIndex={index % FORUM_FEED_PAGE_SIZE}
                />
              ))}
            </MasonryPostGrid>
          )}

          {!showingRefreshLoading && loading && <FeedLoadingState label={t(loadingLabelKey)} />}

          {hasMore && !showingRefreshLoading && !loading && !errorKey && (
            <div ref={loaderRef} className="h-8" />
          )}

          {!showingRefreshLoading && !hasMore && posts.length > 0 && (
            <div className="text-center py-8 text-xs text-ink-muted tracking-wide">
              <div className="flex items-center justify-center gap-3">
                <div className="w-8 deck-divider" />
                <span>{t('forum.postsEnd')}</span>
                <div className="w-8 deck-divider" />
              </div>
            </div>
          )}

          {!showingRefreshLoading && isEmpty && (
            <FeedEmptyState message={t(resolvedEmptyMessageKey)} />
          )}
        </div>

        {/* 创建帖子模态框 */}
        <AnimatePresence>
          {showCreateModal && (
            <CreatePostModal
              key="create-post-modal"
              onClose={() => setShowCreateModal(false)}
              onCreated={handlePostCreated}
              initialCircle={circle}
            />
          )}
        </AnimatePresence>
      </div>
    </ForumFeedContextProvider>
  );
}

function FeedLoadingState({ label }: { label: string }) {
  return (
    <div className="flex min-h-full items-center justify-center py-16">
      <InlineLoading label={label} />
    </div>
  );
}

function FeedEmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-full items-center justify-center py-16">
      <div className="flex items-center gap-3 text-sm font-medium tracking-wide text-ink-muted/80">
        <span className="h-px w-10 bg-border-subtle" aria-hidden="true" />
        <span>{message}</span>
        <span className="h-px w-10 bg-border-subtle" aria-hidden="true" />
      </div>
    </div>
  );
}

function SortTab({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium tracking-wide transition-all ${
        active
          ? 'text-copper bg-copper/10'
          : 'text-ink-muted hover:text-ink-secondary hover:bg-void-hover'
      }`}
    >
      {active && (
        <motion.div
          layoutId="sort-active"
          className="absolute inset-0 rounded bg-copper/10"
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}
      <span className="relative z-10">{icon}</span>
      <span className="relative z-10">{label}</span>
    </button>
  );
}

function ScopeTab({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'bg-moss/10 text-moss'
          : 'text-ink-muted hover:bg-void-hover hover:text-ink-secondary'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
