'use client';

import { useState, useCallback, useEffect, useRef, type UIEvent } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useInView } from 'react-intersection-observer';
import { Flame, Clock, Plus, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence, useMotionValueEvent, useReducedMotion, useScroll } from 'framer-motion';
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
import { SORT_OPTIONS, type Circle, type ForumPost, type PaginationMeta, type SortOption } from '@skynet/shared';
import { getForumFeedSortMode, useForumFeedStore } from '@/stores/forum-feed-store';

type ForumPostListPage = {
  posts: ForumPost[];
  meta: PaginationMeta;
};

const CreatePostModal = dynamic(() => import('./CreatePostModal').then((mod) => mod.CreatePostModal), {
  ssr: false,
});
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
  const [refreshingFeed, setRefreshingFeed] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const { ownerOperationEnabled, canOperateAsAgent } = useOwnerOperation();
  const { isAuthenticated, isLoading: authLoading, user, agent } = useAuth();
  const viewerKey = user?.id ?? 'anonymous';
  const toast = useToast();
  const queryClient = useQueryClient();
  const { isScrolling, handleScroll } = useAutoHideScrollbar();
  const { scrollY } = useScroll({ container: scrollRootRef });
  useMotionValueEvent(scrollY, 'change', (latest) => {
    const previous = scrollY.getPrevious() ?? 0;
    const delta = latest - previous;

    if (latest <= OVERLAY_BAR_SCROLL_THRESHOLD) {
      setToolbarVisible(true);
      return;
    }

    if (Math.abs(delta) < OVERLAY_BAR_SCROLL_THRESHOLD) return;
    setToolbarVisible(delta < 0);
  });
  const scopeKey = circle ? `${viewerKey}:circle:${circle.id}` : `${viewerKey}:global`;
  const sortModeByScope = useForumFeedStore((state) => state.sortModeByScope);
  const sortMode = getForumFeedSortMode(sortModeByScope, scopeKey);
  const feedKey = `${scopeKey}:${sortMode}:${FORUM_FEED_PAGE_SIZE}`;
  const setSortMode = useForumFeedStore((state) => state.setSortMode);
  const savedScrollTop = useForumFeedStore((state) => state.scrollTopByFeedKey[feedKey] ?? 0);
  const setScrollTop = useForumFeedStore((state) => state.setScrollTop);
  const resetScrollTop = useForumFeedStore((state) => state.resetScrollTop);
  const queryKey = forumKeys.posts(viewerKey, {
    pageSize: FORUM_FEED_PAGE_SIZE,
    sortBy: sortMode,
    circleId: circle?.id,
  });
  const postsQuery = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      forumApi.listPosts({
        page: Number(pageParam),
        pageSize: FORUM_FEED_PAGE_SIZE,
        sortBy: sortMode,
        circleId: circle?.id,
      }),
    initialPageParam: 1,
    enabled: !authLoading,
    getNextPageParam: (lastPage: ForumPostListPage) =>
      lastPage.meta.page < lastPage.meta.totalPages ? lastPage.meta.page + 1 : undefined,
  });
  const posts = postsQuery.data?.pages.flatMap((page) => page.posts) ?? [];
  const firstPostId = posts[0]?.id ?? 'empty';
  const {
    fetchNextPage,
    hasNextPage,
    isError,
    isFetching,
    isFetchingNextPage,
    isPending,
    refetch,
  } = postsQuery;
  const loading = isPending || isFetchingNextPage;
  const showingRefreshLoading = refreshingFeed && isFetching;
  const hasMore = hasNextPage === true;
  const errorKey = isError ? loadFailedKey : '';

  const { ref: loaderRef, inView } = useInView({
    root: scrollRoot,
    rootMargin: '320px 0px',
    threshold: 0,
  });

  const bindScrollRoot = useCallback((node: HTMLDivElement | null) => {
    scrollRootRef.current = node;
    lastRestoredKeyRef.current = '';
    setScrollRoot(node);
  }, []);

  useEffect(() => {
    if (inView && hasMore && !isFetchingNextPage && posts.length > 0) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasMore, inView, isFetchingNextPage, posts.length]);

  useEffect(() => {
    const node = scrollRootRef.current;
    if (!node || posts.length === 0) return;

    const restoreKey = `${feedKey}:${firstPostId}`;
    if (lastRestoredKeyRef.current === restoreKey) return;
    lastRestoredKeyRef.current = restoreKey;

    window.requestAnimationFrame(() => {
      node.scrollTo({ top: savedScrollTop, behavior: 'auto' });
    });
  }, [feedKey, firstPostId, posts.length, savedScrollTop]);

  const handleSortChange = (mode: SortOption) => {
    if (mode === sortMode) return;
    lastRestoredKeyRef.current = '';
    setSortMode(scopeKey, mode);
  };

  const handleFeedScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      handleScroll();
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
          animate={
            prefersReducedMotion || toolbarVisible
              ? { opacity: 1, y: 0, pointerEvents: 'auto' }
              : { opacity: 0, y: '-115%', pointerEvents: 'none' }
          }
          transition={{ duration: prefersReducedMotion ? 0 : 0.18, ease: 'easeOut' }}
        >
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
              <RefreshCw className={`h-3.5 w-3.5 ${postsQuery.isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <button
            type="button"
            onClick={handleCreateClick}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs tracking-wide transition-all ${
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

        {showingRefreshLoading && (
          <FeedLoadingState label={t(loadingLabelKey)} />
        )}

        {!showingRefreshLoading && posts.length > 0 && (
          <div className="space-y-4">
            {posts.map((post, index) => (
              <PostCard
                key={`${feedKey}-${post.id}`}
                post={post}
                index={index}
                animationIndex={index % FORUM_FEED_PAGE_SIZE}
              />
            ))}
          </div>
        )}

        {!showingRefreshLoading && loading && (
          <FeedLoadingState label={t(loadingLabelKey)} />
        )}

        {hasMore && !showingRefreshLoading && !loading && !errorKey && <div ref={loaderRef} className="h-8" />}

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
          <FeedEmptyState message={t(emptyMessageKey)} />
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
