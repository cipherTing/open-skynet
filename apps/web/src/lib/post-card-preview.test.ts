import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('post preview uses a shrink-proof multiline clamp for each layout', () => {
  const postCardSource = readFileSync(
    new URL('../components/forum/PostCard.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    postCardSource,
    /previewClass:\s*'mt-1 min-h-0 shrink-0 overflow-hidden line-clamp-3 text-xs leading-relaxed text-text-secondary sm:line-clamp-1'/u,
  );
  assert.match(
    postCardSource,
    /previewClass:\s*'mt-2 min-h-0 shrink-0 overflow-hidden line-clamp-2 text-xs leading-relaxed text-text-secondary'/u,
  );
  assert.match(
    postCardSource,
    /previewClass:\s*'mt-1 min-h-0 shrink-0 overflow-hidden line-clamp-5 text-\[11px\] leading-relaxed text-text-secondary'/u,
  );
});

test('post title clamp matches the fixed card budget of each layout', () => {
  const postCardSource = readFileSync(
    new URL('../components/forum/PostCard.tsx', import.meta.url),
    'utf8',
  );

  assert.match(postCardSource, /titleClass: 'text-lg leading-tight sm:text-xl line-clamp-1'/u);
  assert.match(postCardSource, /titleClass: 'text-lg leading-tight line-clamp-2'/u);
  assert.match(postCardSource, /titleClass: 'text-base leading-tight line-clamp-2'/u);
});

test('masonry cards merge stats and time into one footer row', () => {
  const postCardSource = readFileSync(
    new URL('../components/forum/PostCard.tsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(postCardSource, /<RelativeTime date=\{post\.createdAt\} className="mt-0\.5"/u);
  assert.match(postCardSource, /<RelativeTime date=\{post\.createdAt\} \/>/u);
});

test('post preview is a cleaned text excerpt instead of raw content', () => {
  const postCardSource = readFileSync(
    new URL('../components/forum/PostCard.tsx', import.meta.url),
    'utf8',
  );

  assert.match(postCardSource, /createPostExcerpt\(post\.content, post\.mentions\)/u);
  assert.doesNotMatch(postCardSource, /post\.content\.replace/u);
});

test('feed cards use fixed heights with two-column at 234.4px and three-column at 261.6px', () => {
  const forumFeedSource = readFileSync(
    new URL('../components/forum/ForumFeed.tsx', import.meta.url),
    'utf8',
  );

  assert.match(forumFeedSource, /POST_LIST_ITEM_CLASS = 'h-\[192px\] sm:h-\[148px\]'/u);
  assert.match(forumFeedSource, /POST_TWO_COLUMN_ITEM_CLASS = 'h-\[234\.4px\]'/u);
  assert.match(forumFeedSource, /POST_THREE_COLUMN_ITEM_CLASS = 'h-\[261\.6px\]'/u);
});
