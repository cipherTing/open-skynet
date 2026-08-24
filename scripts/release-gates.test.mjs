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
const releaseRunbook = path.join(root, 'docs', 'release', 'release-runbook.md');
const lefthook = path.join(root, 'lefthook.yml');

test('release gate runner exposes a fast mode without Compose or Redis requirements', () => {
  const result = spawnSync(process.execPath, [runner, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /--fast/);
  assert.match(result.stdout, /--ci/);
  assert.match(result.stdout, /--release/);
  assert.match(result.stdout, /--target production/);
});

test('root scripts install hooks and make release verification target production', () => {
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(manifest.scripts.prepare, 'lefthook install');
  assert.equal(
    manifest.scripts['release:verify'],
    'node scripts/run-release-gates.mjs --release --target production',
  );
});

test('fast gates execute contract tests without Compose or Redis integration', () => {
  const source = readFileSync(runner, 'utf8');
  assert.match(source, /test:contracts/);
  assert.doesNotMatch(source, /docker\s+compose/i);
  assert.doesNotMatch(source, /RUN_MCP_REDIS_INTEGRATION/u);
});

test('release workflow injects the release tag and public URL variables', () => {
  const workflow = readFileSync(releaseWorkflow, 'utf8');
  const releaseStepStart = workflow.indexOf('- run: pnpm release:verify');

  assert.notEqual(releaseStepStart, -1, 'release workflow must run pnpm release:verify');
  const releaseStep = workflow.slice(releaseStepStart);
  assert.match(releaseStep, /env:/u);
  assert.match(releaseStep, /RELEASE_TAG: \$\{\{ github\.ref_name \}\}/u);
  for (const name of [
    'CORS_ORIGIN',
    'NEXT_PUBLIC_API_URL',
    'PUBLIC_SITE_ORIGIN',
    'PUBLIC_API_BASE_URL',
  ]) {
    assert.match(
      releaseStep,
      new RegExp(`${name}: \\$\\{\\{ vars\\.${name} \\}\\}`, 'u'),
      `${name} must come from a GitHub Actions variable`,
    );
  }
});

test('release workflow changes trigger contract tests and the runbook documents variables', () => {
  const runbook = readFileSync(releaseRunbook, 'utf8');
  const hooks = readFileSync(lefthook, 'utf8');

  assert.match(runbook, /Repository Actions Variables/u);
  assert.match(runbook, /CORS_ORIGIN[\s\S]*必填/u);
  assert.match(runbook, /NEXT_PUBLIC_API_URL[\s\S]*必填/u);
  assert.match(runbook, /PUBLIC_SITE_ORIGIN[\s\S]*可选/u);
  assert.match(runbook, /PUBLIC_API_BASE_URL[\s\S]*可选/u);
  assert.match(runbook, /RELEASE_TAG[\s\S]*(自动|不需要配置)/u);
  assert.match(hooks, /\.github\/workflows\/\*\.yml/u);
});
