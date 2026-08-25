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
  assert.match(containerAction, /if \[\[ ! -e compose\.yaml \]\]; then[\s\S]*cp compose\.yaml\.example compose\.yaml/u);
  assert.match(containerAction, /if \[\[ ! -e \.env \]\]; then[\s\S]*cp \.env\.example \.env/u);
  assert.match(containerAction, /pnpm containers:check/u);
  assert.match(containerAction, /api-digest:[\s\S]*steps\.build-api\.outputs\.digest/u);
  assert.match(containerAction, /web-digest:[\s\S]*steps\.build-web\.outputs\.digest/u);
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

test('publish gate preserves existing Docker Hub tags by comparing manifest digests to smoke builds', () => {
  assert.match(publishAction, /docker image push "\$remote_image" 2>&1/u);
  assert.match(
    publishAction,
    /existing_digest="\$\(get_remote_digest "\$remote_image" \|\| true\)"/u,
  );
  assert.match(publishAction, /remote tag already exists with a different digest/u);
  assert.match(
    publishAction,
    /docker buildx imagetools inspect --format '\{\{json \.Manifest\.Digest\}\}'/u,
  );
  assert.match(publishAction, /local expected_digest="\$3"/u);
  assert.match(publishAction, /if \[\[ "\$actual_digest" != "\$expected_digest" \]\]; then/u);
  assert.match(
    publishAction,
    /assert_remote_matches_expected_digest "\$remote_image" "\$existing_digest"/u,
  );
  assert.match(publishAction, /test "\$remote_digest" = "\$expected_digest"/u);
  assert.match(publishAction, /api-remote-digest=\$api_remote_digest/u);
  assert.match(publishAction, /web-remote-digest=\$web_remote_digest/u);
  assert.match(publishAction, /api-build-digest/u);
  assert.match(publishAction, /web-build-digest/u);
  assert.match(
    publishAction,
    /assert_existing_or_empty "\$\{\{ inputs\.api-remote-image \}\}"[\s\S]*assert_existing_or_empty "\$\{\{ inputs\.web-remote-image \}\}"[\s\S]*api_remote_digest=/u,
  );
  assert.match(publishAction, /assert_digest "\$\{\{ inputs\.api-build-digest \}\}" "API"/u);
  assert.match(publishAction, /assert_digest "\$\{\{ inputs\.web-build-digest \}\}" "Web"/u);
  assert.match(
    ciWorkflow,
    /API_BUILD_DIGEST: \$\{\{ steps\.smoke\.outputs\.api-digest \}\}/u,
  );
  assert.match(
    releaseWorkflow,
    /API_BUILD_DIGEST: \$\{\{ steps\.smoke\.outputs\.api-digest \}\}/u,
  );
  assert.ok(
    publishAction.indexOf('existing_digest="$(get_remote_digest') <
      publishAction.indexOf('docker image tag "$local_image" "$remote_image"') &&
      publishAction.indexOf('docker image tag "$local_image" "$remote_image"') <
        publishAction.indexOf('docker image push "$remote_image" 2>&1'),
    'the registry must be checked before a local tag is created or pushed',
  );
});
