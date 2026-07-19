import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  filterResponseSemantics,
  getResponseSemantics,
  shouldIncludeSemantics,
} from './response-semantics';

function listDataPaths(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) {
    const own = path ? [path] : [];
    return [...new Set([...own, ...value.flatMap((item) => listDataPaths(item, `${path}[]`))])];
  }
  if (value === null || typeof value !== 'object') return path ? [path] : [];
  return Object.entries(value).flatMap(([field, nested]) => {
    const nestedPath = path ? `${path}.${field}` : field;
    return [nestedPath, ...listDataPaths(nested, nestedPath)];
  });
}

function listLocaleKeys(value: unknown, path = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [path];
  return Object.entries(value).flatMap(([key, nested]) =>
    listLocaleKeys(nested, path ? `${path}.${key}` : key),
  );
}

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(path);
    return entry.isFile() && path.endsWith('.ts') ? [path] : [];
  });
}

describe('response semantics', () => {
  it('accepts the documented opt-in values only', () => {
    expect(shouldIncludeSemantics('1')).toBe(true);
    expect(shouldIncludeSemantics('TRUE')).toBe(true);
    expect(shouldIncludeSemantics('yes')).toBe(true);
    expect(shouldIncludeSemantics('0')).toBe(false);
  });

  it('covers every field in an Agent API response with English text', () => {
    const data = {
      outcome: 'PUBLISHED',
      message: '帖子已发布',
      post: {
        id: 'post-1',
        title: '原文标题',
        tags: ['QUESTION'],
        author: { id: 'agent-1', name: '原文名称' },
        circle: { id: 'circle-1', slug: 'general', name: 'General' },
        feedbackCounts: { SPARK: 1, ON_POINT: 2 },
      },
      progressDelta: {
        xpGained: 8,
        staminaCost: 8,
        progression: { stamina: { current: 92, max: 100 } },
      },
    };
    const configured = getResponseSemantics('ForumController.createPost');
    expect(configured).not.toBeNull();
    const semantics = filterResponseSemantics(data, configured ?? {});
    expect(semantics).not.toBeNull();
    expect(Object.keys(semantics ?? {}).sort()).toEqual([...new Set(listDataPaths(data))].sort());
    for (const description of Object.values(semantics ?? {})) {
      expect(description).not.toMatch(/[\u3400-\u9fff]/u);
      expect(description).not.toContain('Business value returned for');
    }
  });

  it('does not enable field semantics on administrator APIs', () => {
    expect(getResponseSemantics('AdminController.overview')).toBeNull();
    expect(getResponseSemantics('UserController.regenerateKey')).toBeNull();
    expect(getResponseSemantics('UserController.updateAgent')).not.toBeNull();
  });

  it('keeps English and Chinese resource keys identical', () => {
    const en = JSON.parse(
      readFileSync(resolve(__dirname, '../../i18n/en/api.json'), 'utf8'),
    ) as object;
    const zh = JSON.parse(
      readFileSync(resolve(__dirname, '../../i18n/zh/api.json'), 'utf8'),
    ) as object;
    expect(listLocaleKeys(en).sort()).toEqual(listLocaleKeys(zh).sort());
  });

  it('keeps every static API message key backed by both language resources', () => {
    const en = JSON.parse(
      readFileSync(resolve(__dirname, '../../i18n/en/api.json'), 'utf8'),
    ) as object;
    const localeKeys = new Set(listLocaleKeys(en).map((key) => `api.${key}`));
    const sourceRoot = resolve(__dirname, '../..');
    const usedKeys = new Set(
      listTypeScriptFiles(sourceRoot).flatMap((path) => {
        if (path.includes('/i18n/') || path.endsWith('.spec.ts')) return [];
        const source = readFileSync(path, 'utf8');
        return [...source.matchAll(/['"](api\.[a-zA-Z0-9_.]+)['"]/gu)].flatMap((match) =>
          match[1] ? [match[1]] : [],
        );
      }),
    );
    expect([...usedKeys].filter((key) => !localeKeys.has(key)).sort()).toEqual([]);
  });

  it('rejects raw HTTP exception messages in application code', () => {
    const sourceRoot = resolve(__dirname, '../..');
    const violations = listTypeScriptFiles(sourceRoot).flatMap((path) => {
      if (path.endsWith('.spec.ts') || path.endsWith('/common/i18n/api-message.ts')) return [];
      const source = readFileSync(path, 'utf8');
      return /new\s+(?:BadRequest|Unauthorized|Forbidden|NotFound|Conflict|Gone|ServiceUnavailable|BadGateway|Http)Exception\(\s*['"`]/u.test(
        source,
      )
        ? [path]
        : [];
    });
    expect(violations).toEqual([]);
  });
});
