import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const apiConfigDigest = `sha256:${'a'.repeat(64)}`;
const webConfigDigest = `sha256:${'b'.repeat(64)}`;
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

function renderActionRunBlock() {
  const inputs = {
    'api-local-image': apiLocalImage,
    'api-remote-image': apiRemoteImage,
    'web-local-image': webLocalImage,
    'web-remote-image': webRemoteImage,
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

function makeFixture(remoteMode) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'skynet-publish-action-test-'));
  const dockerPath = path.join(directory, 'docker');
  const curlPath = path.join(directory, 'curl');
  const dockerLogPath = path.join(directory, 'docker.log');
  const curlLogPath = path.join(directory, 'curl.log');
  const remoteLogPath = path.join(directory, 'remote.log');
  const publishedImagesPath = path.join(directory, 'published-images.log');
  const githubOutputPath = path.join(directory, 'github-output.txt');

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
    '${apiLocalImage}') printf '%s\\n' "$SKYNET_FAKE_API_CONFIG_DIGEST" ;;
    '${webLocalImage}') printf '%s\\n' "$SKYNET_FAKE_WEB_CONFIG_DIGEST" ;;
    *) echo "unknown local image: $local_image" >&2; exit 64 ;;
  esac
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

  return {
    directory,
    dockerLogPath,
    curlLogPath,
    remoteLogPath,
    publishedImagesPath,
    githubOutputPath,
    remoteMode,
  };
}

function readLines(filePath) {
  const content = readFileSync(filePath, 'utf8').trim();
  return content === '' ? [] : content.split('\n');
}

function runAction(fixture) {
  return spawnSync('/bin/bash', ['-c', renderActionRunBlock()], {
    cwd: fixture.directory,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_OUTPUT: fixture.githubOutputPath,
      PATH: `${fixture.directory}:${process.env.PATH}`,
      SKYNET_FAKE_API_CONFIG_DIGEST: apiConfigDigest,
      SKYNET_FAKE_WEB_CONFIG_DIGEST: webConfigDigest,
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
    const dockerCalls = readLines(fixture.dockerLogPath);

    assert.notEqual(result.status, 0, 'config digest mismatch must fail the publish action');
    assert.match(
      result.stderr,
      /remote tag already exists with a different smoke identity: sundayting\/skynet-api:dev-contract-test/u,
    );
    assert.deepEqual(dockerCalls, [
      `image inspect --format {{.Id}} ${apiLocalImage}`,
      `image inspect --format {{.Id}} ${webLocalImage}`,
    ]);
    assert.deepEqual(readLines(fixture.publishedImagesPath), []);
    assert.deepEqual(readLines(fixture.githubOutputPath), []);
    assert.deepEqual(readLines(fixture.remoteLogPath), [
      `${apiRemoteImage}|200|${differentConfigDigest}`,
    ]);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('缺失的远端 tag 推送后必须以匹配 config digest 回读并输出 manifest digest', () => {
  const fixture = makeFixture('missing-then-matching');
  try {
    const result = runAction(fixture);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(readLines(fixture.dockerLogPath), [
      `image inspect --format {{.Id}} ${apiLocalImage}`,
      `image inspect --format {{.Id}} ${webLocalImage}`,
      `image tag ${apiLocalImage} ${apiRemoteImage}`,
      `image push ${apiRemoteImage}`,
      `image tag ${webLocalImage} ${webRemoteImage}`,
      `image push ${webRemoteImage}`,
    ]);
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
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('已存在且 config digest 相同的远端 tag 不会重复推送并复用 manifest digest', () => {
  const fixture = makeFixture('present-matching');
  try {
    const result = runAction(fixture);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(readLines(fixture.dockerLogPath), [
      `image inspect --format {{.Id}} ${apiLocalImage}`,
      `image inspect --format {{.Id}} ${webLocalImage}`,
    ]);
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
