import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
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
  await mkdir(path.join(root, 'skills/skynet'), { recursive: true });
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '1.0.0' }) + '\n');
  await writeFile(path.join(root, 'CHANGELOG.md'), '# Changelog\n\n## [1.0.0] - 2026-08-23\n');
  await writeFile(
    path.join(root, 'README.md'),
    'https://raw.githubusercontent.com/cipherTing/open-skynet/v1.0.0/scripts/install-skynet-skill.py\npython3 - --skill-ref v1.0.0\n',
  );
  await writeFile(path.join(root, 'skills/skynet/SKILL.md'), '---\nname: skynet\n---\n');
  await writeFile(
    path.join(root, 'scripts/install-skynet-skill.py'),
    'parser.add_argument("--skill-ref", required=True)\n',
  );
  await writeFile(
    path.join(root, 'config.json'),
    JSON.stringify({
      productVersionSource: 'package.json',
      contracts: {
        restApi: { major: 1, revision: '1' },
        agentGuide: { version: guideVersion, template: 'apps/api/src/system/guide.template.md' },
      },
    }) + '\n',
  );
  await writeFile(
    path.join(root, 'apps/api/src/system/guide.template.md'),
    `---\nversion: '${templateGuideVersion}'\napi_prefix: /api/v1\n---\nhttps://raw.githubusercontent.com/cipherTing/open-skynet/{{SKYNET_SKILL_REF}}/scripts/install-skynet-skill.py\n--skill-ref '{{SKYNET_SKILL_REF}}'\n`,
  );
  await writeFile(
    path.join(root, 'apps/api/src/main.ts'),
    `new DocumentBuilder().setVersion('1.0.0');\n`,
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

test('public contract checker accepts one lightweight Guide without a Governance Guide contract', async () => {
  const root = await fixtureRoot();
  const result = run(root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /governance=none/u);
});

test('public contract checker rejects a standalone Governance Guide contract', async () => {
  const root = await fixtureRoot();
  const configPath = path.join(root, 'config.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  config.contracts.governanceGuide = { version: '1.1.0', template: 'governance.md' };
  await writeFile(configPath, `${JSON.stringify(config)}\n`);
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /Governance Guide/u);
});

test('public contract checker rejects a guide template with the wrong version', async () => {
  const root = await fixtureRoot({ templateGuideVersion: '1.0.0' });
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /guide/i);
});

test('public contract checker requires the Guide installer URL and argument to share one tag placeholder', async () => {
  const root = await fixtureRoot();
  const guidePath = path.join(root, 'apps/api/src/system/guide.template.md');
  await writeFile(
    guidePath,
    "---\nversion: '1.1.0'\napi_prefix: /api/v1\n---\ninstaller without a ref\n",
  );
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /must pass its versioned Skill ref/u);
});

test('public contract checker requires README to use the product Skill release tag', async () => {
  const root = await fixtureRoot();
  const readmePath = path.join(root, 'README.md');
  await writeFile(
    readmePath,
    'https://raw.example/v0.9.0/scripts/install-skynet-skill.py\n--skill-ref v0.9.0\n',
  );
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /README Skill installer.*v1\.0\.0/u);
});

test('Skynet Skill installer fetches a complete package before replacing instance URLs', () => {
  const result = spawnSync(
    'python3',
    ['-B', '-m', 'unittest', 'scripts.test_install_skynet_skill'],
    {
      cwd: workspaceRoot,
      encoding: 'utf8',
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('the unified Skill installer manifest contains every package file and no credentials', async () => {
  const skillRoot = path.join(workspaceRoot, 'skills/skynet');
  const installer = await readFile(
    path.join(workspaceRoot, 'scripts/install-skynet-skill.py'),
    'utf8',
  );
  const files = await collectFiles(skillRoot);
  const skillEntrypoints = files.filter((relativePath) => relativePath.endsWith('SKILL.md'));

  assert.deepEqual(skillEntrypoints, ['SKILL.md']);
  for (const relativePath of files) {
    assert.ok(
      installer.includes(`"${relativePath}"`),
      `${relativePath} missing from installer manifest`,
    );
    const content = await readFile(path.join(skillRoot, relativePath), 'utf8');
    assert.doesNotMatch(
      content,
      /sk_live_/u,
      `${relativePath} must not contain Agent Key material`,
    );
  }
});

test('README documents the unified Skill and contains no MCP access contract', async () => {
  const readme = await readFile(path.join(workspaceRoot, 'README.md'), 'utf8');
  assert.match(readme, /一个统一的 Skynet Skill/u);
  assert.match(readme, /install-skynet-skill\.py/u);
  assert.match(readme, /\/guide\.md/u);
  assert.doesNotMatch(readme, /MCP|\/api\/v1\/mcp/u);
});

test('story API contract and Skill describe revision-bound feedback and scoped collaboration accurately', async () => {
  const [apiContract, novelSkill, guide] = await Promise.all([
    readFile(path.join(workspaceRoot, 'docs/Agent接口设计规范.md'), 'utf8'),
    readFile(path.join(workspaceRoot, 'skills/skynet/references/novel.md'), 'utf8'),
    readFile(path.join(workspaceRoot, 'apps/api/src/system/guide.template.md'), 'utf8'),
  ]);
  const storySectionStart = apiContract.indexOf('## 小说共创');
  const storySectionEnd = apiContract.indexOf('\n## ', storySectionStart + 1);
  assert.notEqual(storySectionStart, -1, 'Agent API contract must include story routes');
  assert.notEqual(storySectionEnd, -1, 'Story API contract must have a bounded section');
  const storyContract = apiContract.slice(storySectionStart, storySectionEnd);

  for (const [name, content] of [
    ['Agent API contract', storyContract],
    ['Novel Skill reference', novelSkill],
  ]) {
    assert.match(content, /文字反馈/u, `${name} must describe written feedback`);
    assert.match(content, /revisionNumber/u, `${name} must bind feedback to a revision`);
    assert.match(
      content,
      /冲突信号是中性记录，不冻结资料/u,
      `${name} must say conflict signals do not freeze documents`,
    );
    assert.match(content, /不阻止编辑/u, `${name} must say conflict signals do not block edits`);
    assert.match(content, /noticeDiscussionId/u, `${name} must name the notice discussion input`);
    assert.match(content, /laterConflictId/u, `${name} must name the later conflict input`);
    assert.match(content, /noticeTargetAgentId/u, `${name} must explain how to notify the target`);
    assert.match(content, /24 小时/u, `${name} must describe the response window`);
    assert.match(content, /三[名位]不同主人/u, `${name} must require independent owners`);
    assert.match(content, /均投 `UPHOLD`/u, `${name} must require unanimous uphold votes`);
    assert.match(content, /1 小时/u, `${name} must describe the fixed restriction duration`);
    assert.match(content, /申诉/u, `${name} must explain the appeal path`);
    assert.doesNotMatch(
      content,
      /1[–-]5 分|1 到 5 分|protectionExpiresAt|requestedRestrictionHours.{0,40}(?:24|168)/u,
    );
    assert.match(
      content,
      /GET \/stories\/:storyId\/discussions\/:discussionId/u,
      `${name} must document reading an individual discussion`,
    );
    assert.match(content, /branchId: string\|null/u, `${name} must describe the discussion branch`);
    assert.match(
      content,
      /documentId.*revisionNumber.*AND/su,
      `${name} must document discussion filters`,
    );
    assert.match(content, /不含 `content`/u, `${name} must keep story listings as summaries`);
    assert.match(content, /标题字面前缀/u, `${name} must document literal title prefix search`);
    assert.match(
      content,
      /documentIds/u,
      `${name} must document related-document summary selection`,
    );
    assert.match(
      content,
      /重复查询参数/u,
      `${name} must document repeated documentIds query parameters`,
    );
    assert.match(content, /主线及该分线/u, `${name} must describe branch summary lookup`);
    assert.match(content, /不能与 `cursor`、`limit`、`q` 或 `kind`/u);
    assert.match(content, /`nextCursor` 为 `null`/u);
    assert.match(content, /`q` 时结果按标题和 ID 升序/u);
    assert.match(content, /不使用时按创建时间和 ID 倒序/u);
    assert.match(content, /不含 `diff`/u, `${name} must keep recent activity as summaries`);
    assert.match(
      content,
      /(?:修订摘要列表|修订列表).*不含 `diff`/u,
      `${name} must keep revision listings as summaries`,
    );
    assert.match(content, /compare.*指定.*版本|compare.*两个版本/u);
    assert.match(content, /revisionNumber` 倒序/u);
    assert.match(content, /nextCursor` 继续读取更旧版本/u);
    assert.match(
      content,
      /故事元数据修订列表.*完整/u,
      `${name} must preserve full story metadata revisions`,
    );
    assert.match(
      content,
      /默认 `desc`/u,
      `${name} must make latest discussion messages directly readable`,
    );
  }

  const pythonReference = await readFile(
    path.join(workspaceRoot, 'skills/skynet/references/python/novel.py'),
    'utf8',
  );
  assert.match(pythonReference, /def get_discussion\(/u);
  assert.match(pythonReference, /optionally filtered by documentId and revisionNumber/u);
  assert.match(guide, /浏览器控制参与故事时/u);
  assert.match(guide, /references\/novel\.md/u);
});

async function collectFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.name !== '__pycache__' && !entry.name.endsWith('.pyc'))
      .map(async (entry) => {
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory())
          return collectFiles(path.join(directory, entry.name), relativePath);
        return [relativePath];
      }),
  );
  return nested.flat().sort();
}
