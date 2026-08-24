import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const checker = path.join(scriptsDir, 'check-release-contract.mjs');
const setter = path.join(scriptsDir, 'set-version.mjs');

async function fixtureRoot({ mirrorVersion = '1.0.0', tag = null } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'skynet-release-contract-'));
  await mkdir(path.join(root, 'apps/api'), { recursive: true });
  await mkdir(path.join(root, 'apps/web'), { recursive: true });
  await mkdir(path.join(root, 'packages/shared'), { recursive: true });
  await mkdir(path.join(root, 'docs/release'), { recursive: true });
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'skynet', version: '1.0.0' }) + '\n',
  );
  for (const relative of [
    'apps/api/package.json',
    'apps/web/package.json',
    'packages/shared/package.json',
  ]) {
    await writeFile(
      path.join(root, relative),
      JSON.stringify({ name: relative, version: mirrorVersion }) + '\n',
    );
  }
  await writeFile(
    path.join(root, 'config.json'),
    JSON.stringify({
      productVersionSource: 'package.json',
      contracts: {
        restApi: { major: 1, revision: '1' },
        agentGuide: { version: '1.1.0', template: 'guide.md' },
        governanceGuide: { version: '1.1.0', template: 'governance.md' },
        mcpBusiness: { version: '1.0.0' },
      },
      mirrors: ['apps/api/package.json', 'apps/web/package.json', 'packages/shared/package.json'],
      release: {
        tagPrefix: 'v',
        changelog: 'CHANGELOG.md',
        requiredFiles: ['CHANGELOG.md', 'docs/release/VERSIONING.md'],
      },
    }) + '\n',
  );
  await writeFile(path.join(root, 'CHANGELOG.md'), '# Changelog\n\n## [1.0.0] - 2026-08-23\n');
  await writeFile(path.join(root, 'docs/release/VERSIONING.md'), '# Versioning\n');
  return { root, tag };
}

function run(root, ...args) {
  return spawnSync(
    process.execPath,
    [checker, '--root', root, '--config', path.join(root, 'config.json'), ...args],
    {
      encoding: 'utf8',
    },
  );
}

test('release contract checker accepts synchronized package versions and the matching tag', async () => {
  const { root } = await fixtureRoot();
  const result = run(root, '--tag', 'v1.0.0');
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('release contract checker rejects a stale workspace mirror', async () => {
  const { root } = await fixtureRoot({ mirrorVersion: '0.9.0' });
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /apps\/api\/package\.json/);
});

test('release contract checker rejects a tag that does not equal the root version', async () => {
  const { root } = await fixtureRoot();
  const result = run(root, '--tag', 'v0.9.0');
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /tag/i);
});

test('release contract checker rejects an invalid public contract version', async () => {
  const { root } = await fixtureRoot();
  const configPath = path.join(root, 'config.json');
  const config = JSON.parse(await (await import('node:fs/promises')).readFile(configPath, 'utf8'));
  config.contracts.agentGuide.version = 'guide-next';
  await (await import('node:fs/promises')).writeFile(configPath, `${JSON.stringify(config)}\n`);
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /SemVer|agentGuide/i);
});

test('version setter updates the root and every catalog mirror without touching dependencies', async () => {
  const { root } = await fixtureRoot();
  const result = spawnSync(
    process.execPath,
    [setter, '--root', root, '--config', path.join(root, 'config.json'), '2.0.0'],
    {
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  for (const relative of [
    'package.json',
    'apps/api/package.json',
    'apps/web/package.json',
    'packages/shared/package.json',
  ]) {
    const manifest = JSON.parse(
      await (await import('node:fs/promises')).readFile(path.join(root, relative), 'utf8'),
    );
    assert.equal(manifest.version, '2.0.0');
  }
});

test('release mode rejects a dirty Git worktree', async () => {
  const { root } = await fixtureRoot();
  for (const args of [
    ['init', '--quiet'],
    ['config', 'user.email', 'release-test@example.com'],
    ['config', 'user.name', 'Release Test'],
    ['add', '.'],
    ['commit', '--quiet', '-m', 'fixture'],
  ]) {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }

  const clean = spawnSync(
    process.execPath,
    [checker, '--root', root, '--config', path.join(root, 'config.json'), '--release'],
    { encoding: 'utf8', env: { ...process.env, RELEASE_TAG: 'v1.0.0' } },
  );
  assert.equal(clean.status, 0, clean.stderr || clean.stdout);

  await writeFile(path.join(root, 'dirty.txt'), 'dirty\n');
  const dirty = spawnSync(
    process.execPath,
    [checker, '--root', root, '--config', path.join(root, 'config.json'), '--release'],
    { encoding: 'utf8', env: { ...process.env, RELEASE_TAG: 'v1.0.0' } },
  );
  assert.notEqual(dirty.status, 0);
  assert.match(`${dirty.stdout}${dirty.stderr}`, /worktree|dirty|clean/i);
});
