import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Virtualizer } from '@tanstack/react-virtual';

const VIEWPORT_RECT = { width: 1280, height: 800 };
const TOP_LEVEL_ITEM_COUNT = 10_001;
const TOP_LEVEL_ITEM_HEIGHT = 248;
const CHILD_ITEM_COUNT = 100_001;
const CHILD_ITEM_HEIGHT = 164;
const OVERSCAN = 6;

function inspectVirtualSlots(count, itemHeight, offset, lanes = 1) {
  const virtualizer = new Virtualizer({
    count,
    getScrollElement: () => null,
    estimateSize: () => itemHeight,
    scrollToFn: () => undefined,
    observeElementRect: () => undefined,
    observeElementOffset: () => undefined,
    initialRect: VIEWPORT_RECT,
    initialOffset: offset,
    overscan: OVERSCAN,
    lanes,
    gap: lanes > 1 ? 12 : 0,
  });
  const slots = virtualizer.getVirtualItems();
  return {
    rendered: slots.length,
    first: slots[0]?.index,
    last: slots.at(-1)?.index,
    lanes: [...new Set(slots.map((slot) => slot.lane))],
  };
}

function shouldLoadNextPage({
  virtualIndexes,
  itemCount,
  listStart,
  listSize,
  viewportStart,
  viewportHeight,
  estimatedItemSize,
}) {
  const lastVirtualIndex = virtualIndexes.reduce((maximum, index) => Math.max(maximum, index), -1);
  const nearLastItemIndex = Math.max(0, itemCount - 5 - 1);
  if (lastVirtualIndex < nearLastItemIndex) return false;
  const viewportEnd = viewportStart + viewportHeight;
  const listEnd = listStart + listSize;
  return viewportStart <= listEnd && viewportEnd >= listEnd - estimatedItemSize * 5;
}

const [
  virtualListSource,
  forumFeedSource,
  postCardSource,
  postDetailSource,
  postDetailLoadingSource,
  replyThreadSource,
  ownerOperationSource,
  globalStyles,
  forumFeedStoreSource,
  homeShellSource,
  nextConfigSource,
] = await Promise.all([
  readFile(new URL('../src/components/ui/VirtualList.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/forum/ForumFeed.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/forum/PostCard.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/forum/PostDetail.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/(application)/post/[id]/loading.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/forum/ReplyThread.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/contexts/OwnerOperationContext.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/globals.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/stores/forum-feed-store.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/home/HomeShell.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../next.config.mjs', import.meta.url), 'utf8'),
]);

assert.match(virtualListSource, /const DEFAULT_OVERSCAN = 6;/u);
assert.match(virtualListSource, /count: items\.length,/u);
assert.match(virtualListSource, /virtualItems\.map\(/u);
assert.match(virtualListSource, /focusedIndex/u);
assert.match(virtualListSource, /focusedIndex >= items\.length/u);
assert.match(virtualListSource, /const NEAR_END_PREFETCH_ITEM_COUNT = 5;/u);
assert.match(virtualListSource, /useEffect\(\(\) =>/u);
assert.match(virtualListSource, /const virtualItems = virtualizer\.getVirtualItems\(\)/u);
assert.match(virtualListSource, /viewportStart <= listEnd/u);
assert.match(virtualListSource, /viewportEnd >= listEnd - prefetchThreshold/u);
assert.doesNotMatch(virtualListSource, /onChange:/u);
assert.doesNotMatch(virtualListSource, /instance\.isAtEnd\(/u);
assert.doesNotMatch(virtualListSource, /lastNearEndRequestKeyRef|loadMoreKey|laneAnchorRef/u);
assert.doesNotMatch(virtualListSource, /anchorTo: 'end'|followOnAppend/u);
assert.match(virtualListSource, /laneAssignmentMode: lanes > 1 \? 'measured' : 'estimate'/u);
assert.doesNotMatch(virtualListSource, /paddingEnd|getFirstVisibleAnchor|scrollBy/u);
assert.doesNotMatch(
  virtualListSource,
  /MAX_ANCHOR_RESTORE_FRAME_COUNT|data-virtual-key|useImperativeHandle/u,
);
assert.match(
  forumFeedSource,
  /queryClient\.resetQueries\(\s*\{ queryKey, exact: true \},\s*\{ cancelRefetch: true \},\s*\)/u,
);
assert.doesNotMatch(forumFeedSource, /queryClient\.setQueryData<InfiniteData/u);
assert.match(forumFeedSource, /fetchNextPage\(\{ cancelRefetch: false \}\)/u);
assert.match(forumFeedSource, /useForumLayoutStore/u);
assert.match(forumFeedSource, /from 'react-virtuoso';/u);
assert.match(forumFeedSource, /<VirtuosoGrid/u);
assert.match(forumFeedSource, /computeItemKey=\{\(_, post\) => post\.id\}/u);
assert.doesNotMatch(forumFeedSource, /customScrollParent/u);
assert.match(forumFeedSource, /scrollerRef=\{bindGridScroller\}/u);
assert.match(forumFeedSource, /isScrolling=\{handleGridScrollingChange\}/u);
assert.match(forumFeedSource, /increaseViewportBy=\{POST_FEED_VIEWPORT_EXTENSION\}/u);
assert.doesNotMatch(forumFeedSource, /nativeScrollActiveRef|scrollend|queuedLoadMoreFeedKeyRef/u);
assert.match(forumFeedSource, /refreshingFeedRef\.current/u);
assert.match(forumFeedSource, /queryClient\.cancelQueries\(\{ queryKey, exact: true \}, \{ silent: true \}\)/u);
assert.match(forumFeedSource, /cancelRefetch: true/u);
assert.match(forumFeedSource, /ref=\{virtuosoRef\}/u);
assert.match(forumFeedSource, /refetchOnMount: false/u);
assert.match(forumFeedSource, /endReached=\{isAuthenticated \? handleNearEnd : undefined\}/u);
assert.match(forumFeedSource, /components=\{FORUM_FEED_GRID_COMPONENTS\}/u);
// feedKey scopes the query and auth prompt only; the Virtuoso instance must not
// be keyed by it, otherwise filters and navigation would destroy scroll state.
assert.doesNotMatch(forumFeedSource, /<VirtuosoGrid[\s\S]*?key=\{feedKey\}/u);
assert.doesNotMatch(
  forumFeedSource,
  /captureTopPostIndex|scrollToIndex|layoutRestore|initialTopMostItemIndex|readyStateChanged|overscan=/u,
);
assert.match(forumFeedSource, /POST_LIST_ITEM_CLASS/u);
assert.match(forumFeedSource, /POST_TWO_COLUMN_ITEM_CLASS/u);
assert.match(forumFeedSource, /POST_THREE_COLUMN_ITEM_CLASS/u);
assert.match(forumFeedSource, /const POST_LIST_ITEM_CLASS = 'h-\[148px\]';/u);
assert.match(forumFeedSource, /const POST_TWO_COLUMN_ITEM_CLASS = 'h-\[224px\]';/u);
assert.match(forumFeedSource, /const POST_THREE_COLUMN_ITEM_CLASS = 'h-\[218px\]';/u);
assert.match(postCardSource, /line-clamp-2 font-bold tracking-normal text-white/u);
assert.match(postCardSource, /previewClass: 'mt-1 line-clamp-2/u);
assert.doesNotMatch(forumFeedSource, /<VirtualList/u);
assert.doesNotMatch(forumFeedSource, /POST_.*ESTIMATED_HEIGHT/u);
assert.doesNotMatch(forumFeedSource, /paddingEnd=/u);
assert.doesNotMatch(forumFeedSource, /:layout:\$\{layout\}/u);
assert.doesNotMatch(forumFeedSource, /requestAnimationFrame|scrollTopByFeedKey|setScrollTop/u);
assert.doesNotMatch(forumFeedStoreSource, /scrollTopByFeedKey|toolbarVisibleByFeedKey/u);
assert.match(homeShellSource, /<Activity mode=\{activeSection === 'feed'/u);
assert.match(homeShellSource, /<Activity mode=\{activeSection === 'circles'/u);
assert.match(homeShellSource, /<Activity mode=\{activeSection === 'governance'/u);
assert.match(nextConfigSource, /cacheComponents: true/u);
assert.match(forumFeedSource, /!ownerOperationBlocked \? \(/u);
assert.match(forumFeedSource, /createModalRevision === ownerOperationRevision/u);
assert.match(postCardSource, /h-full cursor-pointer overflow-hidden/u);
assert.match(postCardSource, /min-h-0 min-w-0 flex-1 flex-col overflow-hidden/u);
assert.match(postDetailSource, /\{canOperateAsAgent \? \(/u);
assert.doesNotMatch(postDetailSource, /disabled=\{ownerOperationBlocked\}/u);
assert.doesNotMatch(postDetailSource, /APPEND\.LOG/u);
assert.match(postDetailSource, /max-w-\[80ch\]/u);
assert.match(postDetailSource, /border-\[var\(--t-frame\)\]/u);
assert.doesNotMatch(postDetailSource, /max-w-3xl/u);
assert.match(postDetailLoadingSource, /max-w-5xl/u);
assert.match(postDetailLoadingSource, /border-\[var\(--t-frame\)\]/u);
assert.match(replyThreadSource, /const CHILD_REPLY_ESTIMATED_HEIGHT = 164;/u);
assert.match(replyThreadSource, /<Virtuoso/u);
assert.doesNotMatch(replyThreadSource, /<VirtualList/u);
assert.doesNotMatch(replyThreadSource, /disabled=\{ownerOperationBlocked\}/u);
assert.match(replyThreadSource, /replyInputRevision === ownerOperationRevision/u);
assert.match(ownerOperationSource, /setOwnerOperationRevision\(\(revision\) => revision \+ 1\)/u);
assert.match(globalStyles, /overscroll-behavior: none;/u);
assert.match(globalStyles, /--t-frame: #4a684a;/u);

const topLevel = [
  inspectVirtualSlots(TOP_LEVEL_ITEM_COUNT, TOP_LEVEL_ITEM_HEIGHT, 0),
  inspectVirtualSlots(TOP_LEVEL_ITEM_COUNT, TOP_LEVEL_ITEM_HEIGHT, TOP_LEVEL_ITEM_HEIGHT * 5000),
  inspectVirtualSlots(TOP_LEVEL_ITEM_COUNT, TOP_LEVEL_ITEM_HEIGHT, TOP_LEVEL_ITEM_HEIGHT * 10_000),
];
const children = [
  inspectVirtualSlots(CHILD_ITEM_COUNT, CHILD_ITEM_HEIGHT, 0),
  inspectVirtualSlots(CHILD_ITEM_COUNT, CHILD_ITEM_HEIGHT, CHILD_ITEM_HEIGHT * 50_000),
  inspectVirtualSlots(CHILD_ITEM_COUNT, CHILD_ITEM_HEIGHT, CHILD_ITEM_HEIGHT * 100_000),
];
const masonry = inspectVirtualSlots(TOP_LEVEL_ITEM_COUNT, 360, 360 * 100, 3);
const sharedPageScroll = {
  revisionNearEnd: shouldLoadNextPage({
    virtualIndexes: [14, 15, 16, 17, 18, 19],
    itemCount: 20,
    listStart: 1_000,
    listSize: 1_120,
    viewportStart: 1_400,
    viewportHeight: 800,
    estimatedItemSize: 56,
  }),
  revisionAlreadyAboveViewport: shouldLoadNextPage({
    virtualIndexes: [14, 15, 16, 17, 18, 19],
    itemCount: 20,
    listStart: 1_000,
    listSize: 1_120,
    viewportStart: 2_550,
    viewportHeight: 800,
    estimatedItemSize: 56,
  }),
  voterNearEnd: shouldLoadNextPage({
    virtualIndexes: [14, 15, 16, 17, 18, 19],
    itemCount: 20,
    listStart: 2_600,
    listSize: 960,
    viewportStart: 2_550,
    viewportHeight: 800,
    estimatedItemSize: 48,
  }),
};

assert.deepEqual(
  topLevel.map((scenario) => scenario.rendered),
  [10, 16, 7],
);
assert.deepEqual(
  children.map((scenario) => scenario.rendered),
  [11, 17, 7],
);
assert.equal(topLevel[0]?.first, 0);
assert.equal(topLevel[2]?.last, TOP_LEVEL_ITEM_COUNT - 1);
assert.equal(children[0]?.first, 0);
assert.equal(children[2]?.last, CHILD_ITEM_COUNT - 1);
assert.ok(masonry.rendered < 100);
assert.deepEqual(masonry.lanes, [0, 1, 2]);
assert.equal(sharedPageScroll.revisionNearEnd, true);
assert.equal(sharedPageScroll.revisionAlreadyAboveViewport, false);
assert.equal(sharedPageScroll.voterNearEnd, true);

console.log(
  JSON.stringify({
    topLevel,
    children,
    masonry,
    sharedPageScroll,
  }),
);
