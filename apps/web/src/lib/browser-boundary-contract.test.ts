import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('auth session refresh is explicitly disabled until browser mount', () => {
  const source = readFileSync(new URL('../contexts/AuthContext.tsx', import.meta.url), 'utf8');

  assert.match(source, /enabled:\s*typeof window !== 'undefined'/u);
});

test('auth and settings route entries remain Server Components', () => {
  const routeFiles = [
    '../app/(application)/auth/page.tsx',
    '../app/(application)/settings/page.tsx',
  ];

  for (const routeFile of routeFiles) {
    const source = readFileSync(new URL(routeFile, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /^['"]use client['"];?/mu, routeFile);
  }

  assert.doesNotThrow(() =>
    readFileSync(new URL('../app/(application)/auth/AuthPageClient.tsx', import.meta.url)),
  );
  assert.doesNotThrow(() =>
    readFileSync(new URL('../app/(application)/settings/SettingsPageClient.tsx', import.meta.url)),
  );
});

test('initialization route performs its status check on the server and leaves the form client-only', () => {
  const routeSource = readFileSync(
    new URL('../app/initialization/page.tsx', import.meta.url),
    'utf8',
  );
  const formSource = readFileSync(
    new URL('../app/initialization/InitializationFormClient.tsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(routeSource, /^['"]use client['"];?/mu);
  assert.match(routeSource, /loadServerInitializationStatus/u);
  assert.match(routeSource, /redirect\('\/workspace'\)/u);
  assert.match(formSource, /^['"]use client['"];?/mu);
});

test('browser API module declares a client-only boundary', () => {
  const source = readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
  assert.match(source, /client-only/u);
});

test('public landing MCP panel does not resolve its endpoint during render', () => {
  const source = readFileSync(
    new URL('../components/agent/McpConnectPanel.tsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(
    source,
    /useMemo\(\(\)\s*=>\s*buildConfig\(provider,\s*getMcpEndpoint\(\)\)/u,
  );
  assert.match(source, /useSyncExternalStore\(/u);
});

test('public access settings accept only the site origin and show the API address as derived output', () => {
  const sectionSource = readFileSync(
    new URL('../components/admin/AdminSystemSections.tsx', import.meta.url),
    'utf8',
  );
  const adminApiSource = readFileSync(new URL('./admin-api.ts', import.meta.url), 'utf8');
  const publicAccessEditorSource = sectionSource.slice(
    sectionSource.indexOf('function PublicAccessEditor'),
    sectionSource.indexOf('export function PublicAccessSection'),
  );

  assert.doesNotMatch(publicAccessEditorSource, /<form\.AppField name="apiBaseUrl">/u);
  assert.doesNotMatch(publicAccessEditorSource, /defaultValues:\s*\{[\s\S]*?apiBaseUrl:/u);
  assert.match(publicAccessEditorSource, /getPublicAccessPreview\(values\.siteOrigin\)/u);
  assert.doesNotMatch(
    adminApiSource,
    /updatePublicAccessConfig:\s*\(data:\s*\{[\s\S]*?apiBaseUrl:/u,
  );
  assert.match(publicAccessEditorSource, /hasPublicAccessSiteOriginChange\(/u);
});

test('root layout no longer blocks rendering on a browser runtime config script', () => {
  const source = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /RuntimeConfigLoader|runtime-config\.js/u);
  assert.throws(
    () => readFileSync(new URL('../app/runtime-config.js/route.ts', import.meta.url), 'utf8'),
    /ENOENT/u,
  );
  assert.throws(
    () =>
      readFileSync(new URL('../components/system/RuntimeConfigLoader.ts', import.meta.url), 'utf8'),
    /ENOENT/u,
  );
});

test('search-parameter consumers declare their own Suspense boundary', () => {
  for (const componentFile of [
    '../components/forum/PostDetail.tsx',
    '../components/admin/AdminConsole.tsx',
  ]) {
    const source = readFileSync(new URL(componentFile, import.meta.url), 'utf8');
    assert.match(source, /<Suspense\s+fallback=/u, componentFile);
  }
});

test('every route that awaits URL params provides a same-segment Suspense fallback', () => {
  for (const loadingFile of [
    '../app/(application)/agent/[id]/loading.tsx',
    '../app/(application)/post/[id]/loading.tsx',
    '../app/(application)/circles/[slug]/loading.tsx',
    '../app/(application)/circles/[slug]/co-build/loading.tsx',
    '../app/(application)/circles/[slug]/co-build/[proposalId]/loading.tsx',
  ]) {
    assert.doesNotThrow(
      () => readFileSync(new URL(loadingFile, import.meta.url), 'utf8'),
      loadingFile,
    );
  }
});
