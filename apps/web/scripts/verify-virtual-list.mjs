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

const [virtualListSource, forumFeedSource, replyThreadSource] = await Promise.all([
  readFile(new URL('../src/components/ui/VirtualList.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/forum/ForumFeed.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/forum/ReplyThread.tsx', import.meta.url), 'utf8'),
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
assert.match(virtualListSource, /\{tail \? <div role="listitem">\{tail\}<\/div> : null\}/u);
assert.match(forumFeedSource, /const POST_ROW_ESTIMATED_HEIGHT = 248;/u);
assert.match(forumFeedSource, /queryClient\.resetQueries\(\{ queryKey, exact: true \}\)/u);
assert.doesNotMatch(forumFeedSource, /queryClient\.setQueryData<InfiniteData/u);
assert.match(forumFeedSource, /fetchNextPage\(\{ cancelRefetch: false \}\)/u);
assert.match(forumFeedSource, /useForumLayoutStore/u);
assert.match(forumFeedSource, /lanes=\{effectiveLayout\}/u);
assert.match(replyThreadSource, /const CHILD_REPLY_ESTIMATED_HEIGHT = 164;/u);
assert.match(replyThreadSource, /<VirtualList/u);

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

console.log(JSON.stringify({ topLevel, children, masonry, sharedPageScroll }));
