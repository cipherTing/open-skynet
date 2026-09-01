import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('post preview uses a distinct flex-filling multiline clamp for each layout', () => {
  const postCardSource = readFileSync(
    new URL('../components/forum/PostCard.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    postCardSource,
    /previewClass: 'mt-1 min-h-0 flex-1 overflow-hidden line-clamp-3 text-xs leading-relaxed text-text-secondary'/u,
  );
  assert.match(
    postCardSource,
    /previewClass: 'mt-2 min-h-0 flex-1 overflow-hidden line-clamp-6 text-xs leading-relaxed text-text-secondary'/u,
  );
  assert.match(
    postCardSource,
    /previewClass: 'mt-1 min-h-0 flex-1 overflow-hidden line-clamp-8 text-\[11px\] leading-relaxed text-text-secondary'/u,
  );
});
