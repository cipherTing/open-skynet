import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const runner = path.join(scriptsDir, 'run-release-gates.mjs');
const root = path.resolve(scriptsDir, '..');
const releaseWorkflow = path.join(root, '.github', 'workflows', 'release.yml');
const lefthook = path.join(root, 'lefthook.yml');
const releaseRunbook = path.join(root, 'docs', 'release', 'release-runbook.md');

test('release gate runner exposes a fast mode without Compose or Redis requirements', () => {
  const result = spawnSync(process.execPath, [runner, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /--fast/);
  assert.match(result.stdout, /--ci/);
  assert.match(result.stdout, /--release/);
  assert.doesNotMatch(result.stdout, /--target production/);
});

test('root scripts install hooks and keep release verification independent of deployment URL settings', () => {
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(manifest.scripts.prepare, 'node scripts/prepare.mjs');
  assert.equal(manifest.scripts['release:verify'], 'node scripts/run-release-gates.mjs --release');
});

test('container prepare mode skips Git hook installation explicitly', () => {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'prepare.mjs')], {
    encoding: 'utf8',
    env: { ...process.env, SKYNET_CONTAINER_BUILD: '1', PATH: '/nonexistent' },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /container build.*skipping Git hook installation/u);
});

test('fast gates execute contract tests without Compose or Redis integration', () => {
  const source = readFileSync(runner, 'utf8');
  assert.match(source, /test:contracts/);
  assert.doesNotMatch(source, /docker\s+compose/i);
  assert.doesNotMatch(source, /RUN_MCP_REDIS_INTEGRATION/u);
});

test('release workflow injects only the release tag', () => {
  const workflow = readFileSync(releaseWorkflow, 'utf8');
  const releaseStepStart = workflow.indexOf('- run: pnpm release:verify');

  assert.notEqual(releaseStepStart, -1, 'release workflow must run pnpm release:verify');
  const releaseStep = workflow.slice(releaseStepStart);
  assert.match(releaseStep, /env:/u);
  assert.match(releaseStep, /RELEASE_TAG: \$\{\{ github\.ref_name \}\}/u);
  assert.doesNotMatch(releaseStep, /(?:CORS_ORIGIN|PUBLIC_SITE_ORIGIN|PUBLIC_API_BASE_URL):/u);
});

test('release workflow changes trigger contract tests without restoring public URL gates', () => {
  const hooks = readFileSync(lefthook, 'utf8');

  assert.doesNotMatch(readFileSync(runner, 'utf8'), /check-production-urls/u);
  assert.match(hooks, /\.github\/workflows\/\*\.yml/u);
});

test('release runbook requires Docker Hub immutable tags for the two published repositories', () => {
  const runbook = readFileSync(releaseRunbook, 'utf8');

  assert.match(runbook, /All tags are immutable/u);
  assert.match(runbook, /sundayting\/skynet-api/u);
  assert.match(runbook, /sundayting\/skynet-web/u);
});
