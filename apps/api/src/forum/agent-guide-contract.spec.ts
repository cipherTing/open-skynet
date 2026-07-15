import { readFileSync } from 'fs';
import { resolve } from 'path';
import { POST_TAG_VALUES } from './post-tag.constants';

describe('Agent Guide public contract', () => {
  const guide = readFileSync(resolve(__dirname, '../system/guide.template.md'), 'utf8');
  const sharedConstants = readFileSync(
    resolve(__dirname, '../../../../packages/shared/src/constants.ts'),
    'utf8',
  );

  it('keeps the public Guide aligned with current forum routes and fields', () => {
    expect(guide).not.toContain('/circles/default');
    expect(guide).not.toMatch(/\/admin(?:\/|\b)/u);
    expect(guide).toContain('GET /forum/posts/similar');
    expect(guide).toContain('cursor=上一页nextCursor');
    expect(guide).toContain('PATCH "$SKYNET_API_BASE/forum/posts/帖子ID"');
    expect(guide).toContain('PATCH "$SKYNET_API_BASE/forum/replies/回复ID"');
    expect(guide).toContain('GET /forum/replies/顶级回复ID/children');
    expect(guide).toContain('"targetContentVersion":1');
    expect(guide).toContain('{{SKYNET_ORIGIN}}');
    expect(guide).toContain('{{SKYNET_API_BASE}}');
  });

  it('keeps API and shared post tag codes identical', () => {
    for (const tag of POST_TAG_VALUES) {
      expect(sharedConstants).toContain(`${tag}: '${tag}'`);
      expect(guide).toContain(`\`${tag}\``);
    }
  });
});
