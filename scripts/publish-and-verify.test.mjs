import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptsDirectory, '..');
const publishActionPath = path.join(root, '.github', 'actions', 'push-and-verify', 'action.yml');
const apiLocalImage = 'skynet-api-smoke';
const webLocalImage = 'skynet-web-smoke';
const apiRemoteImage = 'sundayting/skynet-api:dev-contract-test';
const webRemoteImage = 'sundayting/skynet-web:dev-contract-test';
const apiConfigDigest = 'sha256:51e4615f105c4e8e2a29c4804840bc179be86b337097d063f02f3baa6a57a564';
const webConfigDigest = 'sha256:5d0a9ef28f143a44014bb23d62d33fba8e5dcf0fc828427bcc194d50620c93b0';
const differentConfigDigest = `sha256:${'c'.repeat(64)}`;
const apiManifestDigest = `sha256:${'d'.repeat(64)}`;
const webManifestDigest = `sha256:${'e'.repeat(64)}`;

function extractActionRunBlock() {
  const source = readFileSync(publishActionPath, 'utf8');
  const marker = '      run: |\n';
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, 'push-and-verify action must contain a Bash run block');

  const lines = source.slice(markerIndex + marker.length).split('\n');
  const runLines = [];

  for (const line of lines) {
    if (line.startsWith('        ')) {
      runLines.push(line.slice(8));
      continue;
    }
    if (line.length === 0) {
      runLines.push(line);
      continue;
    }
    break;
  }

  assert.ok(runLines.length > 0, 'push-and-verify action run block must not be empty');
  return runLines.join('\n');
}

function renderActionRunBlock(overrides = {}) {
  const inputs = {
    'api-local-image': apiLocalImage,
    'api-remote-image': apiRemoteImage,
    'web-local-image': webLocalImage,
    'web-remote-image': webRemoteImage,
    replace_remote: 'false',
    ...overrides,
  };
  let command = extractActionRunBlock();

  for (const [name, value] of Object.entries(inputs)) {
    const expression = `\${{ inputs.${name} }}`;
    assert.ok(command.includes(expression), `action run block must use ${expression}`);
    command = command.replaceAll(expression, value);
  }

  assert.doesNotMatch(command, /\$\{\{\s*inputs\./u);
  return command;
}

function makeFixture(remoteMode, { localIdentity = 'config', archiveMode = 'valid' } = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'skynet-publish-action-test-'));
  const dockerPath = path.join(directory, 'docker');
  const curlPath = path.join(directory, 'curl');
  const dockerLogPath = path.join(directory, 'docker.log');
  const curlLogPath = path.join(directory, 'curl.log');
  const remoteLogPath = path.join(directory, 'remote.log');
  const publishedImagesPath = path.join(directory, 'published-images.log');
  const githubOutputPath = path.join(directory, 'github-output.txt');
  const archiveLogPath = path.join(directory, 'archive.log');

  for (const [image, title] of [
    [apiLocalImage, 'api'],
    [webLocalImage, 'web'],
  ]) {
    const archiveDirectory = path.join(directory, 'archives', image);
    const configPath = `blobs/sha256/${title}-config`;
    mkdirSync(path.join(archiveDirectory, 'blobs', 'sha256'), { recursive: true });
    const manifest = { Config: configPath, RepoTags: [image], Layers: [] };
    writeFileSync(
      path.join(archiveDirectory, 'manifest.json'),
      JSON.stringify(archiveMode === 'multiple-manifests' ? [manifest, manifest] : [manifest]),
    );
    if (archiveMode !== 'missing-config') {
      writeFileSync(
        path.join(archiveDirectory, configPath),
        JSON.stringify({
          architecture: 'amd64',
          os: 'linux',
          config: { Labels: { 'org.opencontainers.image.title': title } },
        }),
      );
    }
  }

  writeFileSync(
    dockerPath,
    `#!/bin/sh
set -eu

printf '%s\\n' "$*" >> "$SKYNET_FAKE_DOCKER_LOG"

if [ "$1" = 'image' ] && [ "$2" = 'inspect' ]; then
  local_image=''
  for argument in "$@"; do
    local_image="$argument"
  done
  case "$local_image" in
    '${apiLocalImage}') printf '%s\\n' "$SKYNET_FAKE_API_IMAGE_ID" ;;
    '${webLocalImage}') printf '%s\\n' "$SKYNET_FAKE_WEB_IMAGE_ID" ;;
    *) echo "unknown local image: $local_image" >&2; exit 64 ;;
  esac
  exit 0
fi

if [ "$1" = 'image' ] && [ "$2" = 'save' ]; then
  shift 2
  archive=''
  local_image=''
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --output) archive="$2"; shift 2 ;;
      --platform) test "$2" = 'linux/amd64'; shift 2 ;;
      *) local_image="$1"; shift ;;
    esac
  done
  printf '%s\\n' "$archive" >> "$SKYNET_FAKE_ARCHIVE_LOG"
  if [ "$SKYNET_FAKE_ARCHIVE_MODE" = 'export-failed' ]; then
    echo 'fixture export failed' >&2
    exit 65
  fi
  tar -cf "$archive" -C "$SKYNET_FAKE_ARCHIVES/$local_image" manifest.json blobs
  exit 0
fi

if [ "$1" = 'image' ] && [ "$2" = 'tag' ]; then
  exit 0
fi

if [ "$1" = 'image' ] && [ "$2" = 'push' ]; then
  printf '%s\\n' "$3" >> "$SKYNET_FAKE_PUBLISHED_IMAGES"
  exit 0
fi

echo "unexpected docker invocation: $*" >&2
exit 64
`,
    { mode: 0o755 },
  );
  writeFileSync(
    curlPath,
    `#!/bin/sh
set -eu

printf '%s\\n' "$*" >> "$SKYNET_FAKE_CURL_LOG"

for argument in "$@"; do
  if [ "$argument" = '--get' ]; then
    printf '%s\\n' '{"token":"fake-pull-token"}'
    exit 0
  fi
done

headers=''
body=''
url=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dump-header | --output | --write-out | --data-urlencode | -H)
      case "$#" in
        1) echo "missing curl argument for $1" >&2; exit 64 ;;
      esac
      case "$1" in
        --dump-header) headers="$2" ;;
        --output) body="$2" ;;
      esac
      shift 2
      ;;
    --silent | --show-error)
      shift
      ;;
    *)
      url="$1"
      shift
      ;;
  esac
done

case "$url" in
  *'/v2/sundayting/skynet-api/manifests/dev-contract-test')
    remote_image='${apiRemoteImage}'
    local_config_digest="$SKYNET_FAKE_API_CONFIG_DIGEST"
    manifest_digest="$SKYNET_FAKE_API_MANIFEST_DIGEST"
    ;;
  *'/v2/sundayting/skynet-web/manifests/dev-contract-test')
    remote_image='${webRemoteImage}'
    local_config_digest="$SKYNET_FAKE_WEB_CONFIG_DIGEST"
    manifest_digest="$SKYNET_FAKE_WEB_MANIFEST_DIGEST"
    ;;
  *)
    echo "unexpected manifest URL: $url" >&2
    exit 64
    ;;
esac

if [ "$SKYNET_FAKE_REMOTE_MODE" = 'present-different' ]; then
  status='200'
  config_digest="$SKYNET_FAKE_DIFFERENT_CONFIG_DIGEST"
elif [ "$SKYNET_FAKE_REMOTE_MODE" = 'present-matching' ] || grep -Fx "$remote_image" "$SKYNET_FAKE_PUBLISHED_IMAGES" >/dev/null 2>&1; then
  status='200'
  config_digest="$local_config_digest"
else
  status='404'
  config_digest=''
fi

printf '%s|%s|%s\\n' "$remote_image" "$status" "$config_digest" >> "$SKYNET_FAKE_REMOTE_LOG"

if [ "$status" = '200' ]; then
  printf 'Docker-Content-Digest: %s\\r\\n' "$manifest_digest" > "$headers"
  printf '{"schemaVersion":2,"config":{"digest":"%s"}}\\n' "$config_digest" > "$body"
else
  : > "$headers"
  printf '%s\\n' '{}' > "$body"
fi

printf '%s' "$status"
`,
    { mode: 0o755 },
  );
  chmodSync(dockerPath, 0o755);
  chmodSync(curlPath, 0o755);
  writeFileSync(dockerLogPath, '');
  writeFileSync(curlLogPath, '');
  writeFileSync(remoteLogPath, '');
  writeFileSync(publishedImagesPath, '');
  writeFileSync(githubOutputPath, '');
  writeFileSync(archiveLogPath, '');

  return {
    directory,
    dockerLogPath,
    curlLogPath,
    remoteLogPath,
    publishedImagesPath,
    githubOutputPath,
    remoteMode,
    localIdentity,
    archiveMode,
    archiveLogPath,
  };
}

function readLines(filePath) {
  const content = readFileSync(filePath, 'utf8').trim();
  return content === '' ? [] : content.split('\n');
}

function runAction(fixture, overrides) {
  return spawnSync('/bin/bash', ['-c', renderActionRunBlock(overrides)], {
    cwd: fixture.directory,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_OUTPUT: fixture.githubOutputPath,
      PATH: `${fixture.directory}:${process.env.PATH}`,
      SKYNET_FAKE_API_CONFIG_DIGEST: apiConfigDigest,
      SKYNET_FAKE_WEB_CONFIG_DIGEST: webConfigDigest,
      SKYNET_FAKE_API_IMAGE_ID:
        fixture.localIdentity === 'manifest' ? apiManifestDigest : apiConfigDigest,
      SKYNET_FAKE_WEB_IMAGE_ID:
        fixture.localIdentity === 'manifest' ? webManifestDigest : webConfigDigest,
      SKYNET_FAKE_ARCHIVES: path.join(fixture.directory, 'archives'),
      SKYNET_FAKE_ARCHIVE_MODE: fixture.archiveMode,
      SKYNET_FAKE_ARCHIVE_LOG: fixture.archiveLogPath,
      SKYNET_FAKE_DIFFERENT_CONFIG_DIGEST: differentConfigDigest,
      SKYNET_FAKE_API_MANIFEST_DIGEST: apiManifestDigest,
      SKYNET_FAKE_WEB_MANIFEST_DIGEST: webManifestDigest,
      SKYNET_FAKE_CURL_LOG: fixture.curlLogPath,
      SKYNET_FAKE_DOCKER_LOG: fixture.dockerLogPath,
      SKYNET_FAKE_PUBLISHED_IMAGES: fixture.publishedImagesPath,
      SKYNET_FAKE_REMOTE_LOG: fixture.remoteLogPath,
      SKYNET_FAKE_REMOTE_MODE: fixture.remoteMode,
    },
  });
}

test('不同 config digest 的远端 tag 会阻止任何镜像写入', () => {
  const fixture = makeFixture('present-different');
  try {
    const result = runAction(fixture);
    assert.notEqual(result.status, 0, 'config digest mismatch must fail the publish action');
    assert.match(
      result.stderr,
      /remote tag already exists with a different smoke identity: sundayting\/skynet-api:dev-contract-test/u,
    );
    assert.deepEqual(readLines(fixture.publishedImagesPath), []);
    assert.deepEqual(readLines(fixture.githubOutputPath), []);
    assert.deepEqual(readLines(fixture.remoteLogPath), [
      `${apiRemoteImage}|200|${differentConfigDigest}`,
    ]);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('本地 image ID 是 manifest 摘要时仍按真实 config 身份核验发布', () => {
  const fixture = makeFixture('missing-then-matching', { localIdentity: 'manifest' });
  try {
    const result = runAction(fixture);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(readLines(fixture.publishedImagesPath), [apiRemoteImage, webRemoteImage]);
    assert.deepEqual(readLines(fixture.githubOutputPath), [
      `api-remote-manifest-digest=${apiManifestDigest}`,
      `web-remote-manifest-digest=${webManifestDigest}`,
    ]);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

for (const archiveMode of ['export-failed', 'multiple-manifests', 'missing-config']) {
  test(`本地镜像 ${archiveMode} 时在任何远端写入前失败并清理导出文件`, () => {
    const fixture = makeFixture('present-matching', { archiveMode });
    try {
      const result = runAction(fixture);

      assert.notEqual(result.status, 0);
      assert.deepEqual(readLines(fixture.publishedImagesPath), []);
      assert.deepEqual(readLines(fixture.curlLogPath), []);
      assert.deepEqual(readLines(fixture.githubOutputPath), []);
      for (const archivePath of readLines(fixture.archiveLogPath)) {
        assert.equal(existsSync(path.dirname(archivePath)), false);
      }
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true });
    }
  });
}

test('允许覆盖的参数不能用于不可变版本镜像', () => {
  const fixture = makeFixture('present-matching');
  try {
    const result = runAction(fixture, { replace_remote: 'true' });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /replace-remote is reserved for latest aliases/u);
    assert.deepEqual(readLines(fixture.publishedImagesPath), []);
    assert.deepEqual(readLines(fixture.curlLogPath), []);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('缺失的远端 tag 推送后必须以匹配 config digest 回读并输出 manifest digest', () => {
  const fixture = makeFixture('missing-then-matching');
  try {
    const result = runAction(fixture);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(
      readLines(fixture.dockerLogPath).filter((call) => !call.startsWith('image save ')),
      [
        `image tag ${apiLocalImage} ${apiRemoteImage}`,
        `image push ${apiRemoteImage}`,
        `image tag ${webLocalImage} ${webRemoteImage}`,
        `image push ${webRemoteImage}`,
      ],
    );
    assert.deepEqual(readLines(fixture.publishedImagesPath), [apiRemoteImage, webRemoteImage]);
    assert.deepEqual(readLines(fixture.remoteLogPath), [
      `${apiRemoteImage}|404|`,
      `${webRemoteImage}|404|`,
      `${apiRemoteImage}|404|`,
      `${apiRemoteImage}|200|${apiConfigDigest}`,
      `${webRemoteImage}|404|`,
      `${webRemoteImage}|200|${webConfigDigest}`,
    ]);
    assert.deepEqual(readLines(fixture.githubOutputPath), [
      `api-remote-manifest-digest=${apiManifestDigest}`,
      `web-remote-manifest-digest=${webManifestDigest}`,
    ]);
    const archivePaths = readLines(fixture.archiveLogPath);
    assert.equal(archivePaths.length, 2);
    for (const archivePath of archivePaths) {
      assert.equal(existsSync(path.dirname(archivePath)), false);
    }
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('已存在且 config digest 相同的远端 tag 不会重复推送并复用 manifest digest', () => {
  const fixture = makeFixture('present-matching');
  try {
    const result = runAction(fixture);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(
      readLines(fixture.dockerLogPath).filter((call) => !call.startsWith('image save ')),
      [],
    );
    assert.deepEqual(readLines(fixture.publishedImagesPath), []);
    assert.deepEqual(readLines(fixture.remoteLogPath), [
      `${apiRemoteImage}|200|${apiConfigDigest}`,
      `${webRemoteImage}|200|${webConfigDigest}`,
      `${apiRemoteImage}|200|${apiConfigDigest}`,
      `${webRemoteImage}|200|${webConfigDigest}`,
    ]);
    assert.deepEqual(readLines(fixture.githubOutputPath), [
      `api-remote-manifest-digest=${apiManifestDigest}`,
      `web-remote-manifest-digest=${webManifestDigest}`,
    ]);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});
