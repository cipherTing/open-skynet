import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const workflowsDir = path.dirname(fileURLToPath(import.meta.url));
const githubDir = path.resolve(workflowsDir, '..');
const root = path.resolve(githubDir, '..');
const ciWorkflow = readFileSync(path.join(workflowsDir, 'ci.yml'), 'utf8');
const releaseWorkflow = readFileSync(path.join(workflowsDir, 'release.yml'), 'utf8');
const readOptionalGithubFile = (relativePath) => {
  const filePath = path.join(githubDir, relativePath);
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
};
const containerAction = readOptionalGithubFile(
  path.join('actions', 'build-and-smoke', 'action.yml'),
);
const publishAction = readOptionalGithubFile(path.join('actions', 'push-and-verify', 'action.yml'));
const node24ActionPins = [
  ['actions/checkout', '3d3c42e5aac5ba805825da76410c181273ba90b1'],
  ['actions/setup-node', '820762786026740c76f36085b0efc47a31fe5020'],
  ['pnpm/action-setup', '0977fd99725f1db4007ccb2928dbb4e90d06cc86'],
  ['docker/setup-buildx-action', '37fe631027851001ddb9b187196cc803df7f5f0e'],
  ['docker/build-push-action', '53b7df96c91f9c12dcc8a07bcb9ccacbed38856a'],
  ['docker/login-action', 'dbcb813823bdd20940b903addbd779551569679f'],
];

function assertShaPinnedExternalActions(source, file) {
  for (const match of source.matchAll(/^\s*-?\s*uses:\s*([^\s]+)$/gmu)) {
    const reference = match[1];
    if (reference.startsWith('./')) continue;
    assert.match(
      reference,
      /^[^@\s]+@[0-9a-f]{40}$/u,
      `${file} must pin ${reference} to an immutable full commit SHA`,
    );
  }
}

test('external workflow actions use the approved Node 24 pins', () => {
  const workflowSources = [ciWorkflow, releaseWorkflow, containerAction];

  for (const [action, revision] of node24ActionPins) {
    assert.ok(
      workflowSources.some((source) => source.includes(`${action}@${revision}`)),
      `missing approved Node 24 pin for ${action}`,
    );
  }
});

test('CI uses immutable actions and runs the source gate before container smoke', () => {
  assertShaPinnedExternalActions(ciWorkflow, '.github/workflows/ci.yml');
  assertShaPinnedExternalActions(containerAction, '.github/actions/build-and-smoke/action.yml');
  assert.match(ciWorkflow, /^permissions:\n\s+contents: read$/mu);
  assert.match(
    ciWorkflow,
    /^concurrency:\n\s+group: ci-\$\{\{ github\.workflow \}\}-\$\{\{ github\.event\.pull_request\.number \|\| github\.sha \}\}\n\s+cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}$/mu,
  );
  assert.match(ciWorkflow, /^\s{2}source:\n/mu);
  assert.match(ciWorkflow, /^\s{2}containers:\n\s{4}needs: source$/mu);
  assert.ok(
    ciWorkflow.indexOf('pnpm check:ci') <
      ciWorkflow.indexOf('uses: ./.github/actions/build-and-smoke'),
    'container smoke must start after pnpm check:ci succeeds',
  );
  assert.equal(
    (ciWorkflow.match(/persist-credentials: false/gu) ?? []).length,
    2,
    'CI checkouts must not persist a GitHub token into untrusted build workspaces',
  );
});

test('container smoke builds loadable linux/amd64 images under one local tag', () => {
  for (const image of ['api', 'web']) {
    assert.match(containerAction, new RegExp(`id: build-${image}`, 'u'));
    assert.ok(
      containerAction.includes(`tags: sundayting/skynet-${image}:\${{ inputs.image-tag }}`),
    );
    assert.match(containerAction, /platforms: linux\/amd64/u);
    assert.match(containerAction, /load: true/u);
    assert.match(containerAction, new RegExp(`scope=skynet-${image}`, 'u'));
  }
  assert.match(containerAction, /pnpm containers:smoke -- --tag "\$\{\{ inputs\.image-tag \}\}"/u);
  assert.match(
    containerAction,
    /if \[\[ ! -e compose\.yaml \]\]; then[\s\S]*cp compose\.yaml\.example compose\.yaml/u,
  );
  assert.match(containerAction, /if \[\[ ! -e \.env \]\]; then[\s\S]*cp \.env\.example \.env/u);
  assert.match(containerAction, /pnpm containers:check/u);
  assert.doesNotMatch(containerAction, /outputs:[\s\S]*build-api\.outputs\.digest/u);
});

test('CI pushes only the smoke-tested main images under full-SHA dev tags', () => {
  const mainOnly = "github.event_name == 'push' && github.ref == 'refs/heads/main'";
  assert.ok(ciWorkflow.includes(`if: ${mainOnly}`));
  assert.match(ciWorkflow, /secrets\.DOCKERHUB_TOKEN/u);
  assert.match(ciWorkflow, /vars\.DOCKERHUB_USERNAME/u);
  assert.match(ciWorkflow, /sundayting\/skynet-api:dev-\$\{\{ github\.sha \}\}/u);
  assert.match(ciWorkflow, /sundayting\/skynet-web:dev-\$\{\{ github\.sha \}\}/u);
  assert.match(ciWorkflow, /smoke-tag=ci-\$\{GITHUB_SHA\}/u);
  assert.match(ciWorkflow, /uses: \.\/\.github\/actions\/push-and-verify/u);
  assert.doesNotMatch(ciWorkflow, /push:\s*true/u);
  assert.doesNotMatch(ciWorkflow, /sundayting\/skynet-(?:api|web):(?:latest|rc[-:])/iu);
});

test('release verifies the tag and origin/main ancestry before smoke and SemVer push', () => {
  assertShaPinnedExternalActions(releaseWorkflow, '.github/workflows/release.yml');
  assert.match(releaseWorkflow, /^permissions:\n\s+contents: read$/mu);
  assert.match(releaseWorkflow, /pnpm release:verify/u);
  assert.match(releaseWorkflow, /RELEASE_TAG: \$\{\{ github\.ref_name \}\}/u);
  assert.doesNotMatch(
    releaseWorkflow,
    /(?:CORS_ORIGIN|PUBLIC_SITE_ORIGIN|PUBLIC_API_BASE_URL): \$\{\{ vars\./u,
  );
  assert.match(releaseWorkflow, /git fetch --no-tags origin main/u);
  assert.match(releaseWorkflow, /git merge-base --is-ancestor "\$GITHUB_SHA" "origin\/main"/u);
  assert.match(
    releaseWorkflow,
    /sundayting\/skynet-api:\$\{\{ steps\.image\.outputs\.version \}\}/u,
  );
  assert.match(
    releaseWorkflow,
    /sundayting\/skynet-web:\$\{\{ steps\.image\.outputs\.version \}\}/u,
  );
  assert.doesNotMatch(releaseWorkflow, /NEXT_PUBLIC_API_URL/u);
  assert.doesNotMatch(releaseWorkflow, /sundayting\/skynet-(?:api|web):(?:latest|rc[-:])/iu);

  const verifyIndex = releaseWorkflow.indexOf('pnpm release:verify');
  const ancestryIndex = releaseWorkflow.indexOf('git merge-base --is-ancestor');
  const smokeIndex = releaseWorkflow.indexOf('uses: ./.github/actions/build-and-smoke');
  const pushIndex = releaseWorkflow.indexOf('uses: ./.github/actions/push-and-verify');
  assert.ok(verifyIndex < ancestryIndex && ancestryIndex < smokeIndex && smokeIndex < pushIndex);
});

test('publish gate compares remote image config identity with the smoke-tested local image', () => {
  assert.match(publishAction, /docker image inspect --format '\{\{\.Id\}\}' "\$local_image"/u);
  assert.match(publishAction, /https:\/\/registry-1\.docker\.io/u);
  assert.match(publishAction, /select\(\.manifests\? \| not\) \| \.config\.digest/u);
  assert.match(publishAction, /docker-content-digest:/u);
  assert.match(publishAction, /remote image config does not match smoke-tested local image/u);
  assert.match(
    publishAction,
    /assert_matching_remote_or_missing "\$\{\{ inputs\.api-remote-image \}\}"[\s\S]*assert_matching_remote_or_missing "\$\{\{ inputs\.web-remote-image \}\}"[\s\S]*publish_and_verify/u,
  );
  assert.match(publishAction, /api-remote-manifest-digest=\$api_remote_manifest_digest/u);
  assert.match(publishAction, /web-remote-manifest-digest=\$web_remote_manifest_digest/u);
  assert.doesNotMatch(publishAction, /api-build-digest|web-build-digest/u);
  assert.doesNotMatch(publishAction, /=\$\(push_and_verify/u);
  assert.match(
    ciWorkflow,
    /API_REMOTE_MANIFEST_DIGEST: \$\{\{ steps\.publish\.outputs\.api-remote-manifest-digest \}\}/u,
  );
  assert.match(
    releaseWorkflow,
    /API_REMOTE_MANIFEST_DIGEST: \$\{\{ steps\.publish\.outputs\.api-remote-manifest-digest \}\}/u,
  );
  const publishFunctionStart = publishAction.indexOf('publish_and_verify()');
  const remoteReadAt = publishAction.indexOf(
    'read_remote_image "$remote_image" || return 1',
    publishFunctionStart,
  );
  const tagAt = publishAction.indexOf(
    'docker image tag "$local_image" "$remote_image"',
    publishFunctionStart,
  );
  assert.ok(
    publishFunctionStart >= 0 && remoteReadAt > publishFunctionStart && tagAt > remoteReadAt,
    'each image must be read from Docker Hub before the local image is tagged and pushed',
  );
});
