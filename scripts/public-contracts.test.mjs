import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptsDir, '..');
const checker = path.join(scriptsDir, 'check-public-contracts.mjs');

async function fixtureRoot({ guideVersion = '1.1.0', templateGuideVersion = guideVersion } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'skynet-public-contracts-'));
  await mkdir(path.join(root, 'apps/api/src/system'), { recursive: true });
  await mkdir(path.join(root, 'apps/api/src/mcp'), { recursive: true });
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '1.0.0' }) + '\n');
  await writeFile(path.join(root, 'CHANGELOG.md'), '# Changelog\n\n## [1.0.0] - 2026-08-23\n');
  await writeFile(
    path.join(root, 'config.json'),
    JSON.stringify({
      productVersionSource: 'package.json',
      contracts: {
        restApi: { major: 1, revision: '1' },
        agentGuide: { version: guideVersion, template: 'apps/api/src/system/guide.template.md' },
        governanceGuide: {
          version: '1.1.0',
          template: 'apps/api/src/system/governance.template.md',
        },
        mcpBusiness: { version: '2.0.0' },
      },
    }) + '\n',
  );
  await writeFile(
    path.join(root, 'apps/api/src/system/guide.template.md'),
    `---\nversion: '${templateGuideVersion}'\napi_prefix: /api/v1\n---\n`,
  );
  await writeFile(
    path.join(root, 'apps/api/src/system/governance.template.md'),
    `---\nversion: '1.1.0'\napi_prefix: /api/v1\n---\n`,
  );
  await writeFile(
    path.join(root, 'apps/api/src/main.ts'),
    `new DocumentBuilder().setVersion('1.0.0');\n`,
  );
  await writeFile(
    path.join(root, 'apps/api/src/mcp/mcp-agent-tools.service.ts'),
    `new McpServer({ name: 'skynet-agent-api', version: '1.0.0' });\n`,
  );
  return root;
}

function run(root) {
  return spawnSync(
    process.execPath,
    [checker, '--root', root, '--config', path.join(root, 'config.json')],
    {
      encoding: 'utf8',
    },
  );
}

test('public contract checker accepts guide front matter and runtime mirrors', async () => {
  const root = await fixtureRoot();
  const result = run(root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('public contract checker rejects a guide template with the wrong version', async () => {
  const root = await fixtureRoot({ templateGuideVersion: '1.0.0' });
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /guide/i);
});

test('README documents the modern-only MCP transport and discovery contract', async () => {
  const readme = await readFile(path.join(workspaceRoot, 'README.md'), 'utf8');
  const sectionStart = readme.indexOf('外部 Agent 也可以通过官方 MCP Server');
  const sectionEnd = readme.indexOf('Agent Key 只能调用明确登记的 Agent 用户接口', sectionStart);

  assert.notEqual(sectionStart, -1, 'README 缺少 MCP 接入段落');
  assert.notEqual(sectionEnd, -1, 'README 的 MCP 接入段落边界缺失');

  const section = readme.slice(sectionStart, sectionEnd);
  assert.match(section, /modern-only Streamable HTTP/u);
  assert.match(section, /拒绝 2025-era 无状态传输/u);
  assert.match(section, /`server\/discover`/u);
  assert.doesNotMatch(section, /`initialize`/u);
});
