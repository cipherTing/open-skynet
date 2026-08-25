import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptsDir, '..');
const containersCheckScript = path.join(scriptsDir, 'containers-check.mjs');
const containersSmokeScript = path.join(scriptsDir, 'containers-smoke.mjs');
const devEnvironmentCheckScript = path.join(scriptsDir, 'check-dev-env.mjs');
const productionComposeTemplate = path.join(root, 'compose.yaml.example');
const developmentCompose = path.join(root, 'compose.dev.yaml');
const aptInstallScript = path.join(root, 'docker', 'apt-install.sh');

function makeFakeDocker() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'skynet-containers-test-'));
  const logPath = path.join(directory, 'docker.log');
  const dockerPath = path.join(directory, 'docker');
  writeFileSync(
    dockerPath,
    `#!/bin/sh
printf '%s|SKYNET_IMAGE_TAG=%s|WEB_PORT=%s|API_PORT=%s\\n' "$*" "$SKYNET_IMAGE_TAG" "$WEB_PORT" "$API_PORT" >> "$SKYNET_TEST_DOCKER_LOG"
case "$*" in
  *" ps --all --status exited -q db-indexes"*) printf 'fake-db-indexes\\n' ;;
  *"inspect --format {{.State.ExitCode}} "*) printf '0\\n' ;;
esac
`,
    { mode: 0o755 },
  );
  chmodSync(dockerPath, 0o755);
  return { directory, logPath };
}

function readDockerCalls(fakeDocker) {
  try {
    return readFileSync(fakeDocker.logPath, 'utf8').trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function runScript(script, args, fakeDocker, environment = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...environment,
      PATH: `${fakeDocker.directory}:${process.env.PATH}`,
      SKYNET_TEST_DOCKER_LOG: fakeDocker.logPath,
    },
  });
}

test('production Compose template uses one release tag for API, indexes, and Web', () => {
  const production = readFileSync(productionComposeTemplate, 'utf8');
  const development = readFileSync(developmentCompose, 'utf8');

  assert.match(production, /image: sundayting\/skynet-api:\$\{SKYNET_IMAGE_TAG:-0\.1\.0\}/u);
  assert.match(production, /image: sundayting\/skynet-web:\$\{SKYNET_IMAGE_TAG:-0\.1\.0\}/u);
  assert.equal(
    (production.match(/image: sundayting\/skynet-api:\$\{SKYNET_IMAGE_TAG:-0\.1\.0\}/gu) ?? [])
      .length,
    2,
  );
  assert.doesNotMatch(production, /^\s{4}build:/mu);
  assert.match(production, /'127\.0\.0\.1:\$\{API_PORT:-8081\}:8081'/u);
  assert.match(production, /'127\.0\.0\.1:\$\{WEB_PORT:-8080\}:8080'/u);
  assert.match(production, /CORS_ORIGIN: http:\/\/localhost:\$\{WEB_PORT:-8080\}/u);
  assert.match(production, /SKYNET_PUBLIC_WEB_PORT: \$\{WEB_PORT:-8080\}/u);
  assert.match(production, /SKYNET_PUBLIC_API_PORT: \$\{API_PORT:-8081\}/u);
  assert.doesNotMatch(
    production,
    /SKYNET_(?:API|WEB)_IMAGE_REF|PUBLIC_API_BASE_URL|API_HOST|WEB_HOST/u,
  );
  assert.match(development, /^\s{4}build:\n\s{6}context: \./mu);
  assert.match(development, /- \.\/scripts:\/app\/scripts:ro/u);
  assert.match(development, /- \.\/config:\/app\/config:ro/u);
  assert.match(development, /SKYNET_CONTAINER_BUILD: '1'/u);
  assert.doesNotMatch(development, /CORS_ORIGIN|PUBLIC_API_BASE_URL/u);
});

test('Compose tracks a template and ignores the local production file', () => {
  const gitignore = readFileSync(path.join(root, '.gitignore'), 'utf8');

  assert.match(gitignore, /^compose\.yaml$/mu);
  assert.match(readFileSync(productionComposeTemplate, 'utf8'), /^services:/mu);
});

test('environment template only exposes ports, one image tag, and secrets to deployers', () => {
  const envExample = readFileSync(path.join(root, '.env.example'), 'utf8');

  assert.match(envExample, /^SKYNET_IMAGE_TAG=0\.1\.0$/mu);
  for (const name of [
    'WEB_PORT',
    'API_PORT',
    'MONGO_PORT',
    'REDIS_PORT',
    'MONGO_USERNAME',
    'MONGO_PASSWORD',
    'REDIS_PASSWORD',
    'JWT_SECRET',
    'APP_ENCRYPTION_KEY',
  ]) {
    assert.match(envExample, new RegExp(`^${name}=`, 'mu'));
  }
  assert.doesNotMatch(
    envExample,
    /(?:NODE_ENV|MONGODB_URI|REDIS_HOST|SKYNET_API_IMAGE_REF|SKYNET_WEB_IMAGE_REF|PUBLIC_API_BASE_URL|CORS_ORIGIN|TRUST_PROXY|SWAGGER_ENABLED)=/u,
  );
});

test('production Dockerfiles retry transient APT transport failures without ignoring package errors', () => {
  const aptInstaller = readFileSync(aptInstallScript, 'utf8');

  assert.match(aptInstaller, /for attempt in 1 2 3;/u);
  assert.match(aptInstaller, /apt-get -o Acquire::Retries=3 update -y/u);
  assert.match(aptInstaller, /apt-get -o Acquire::Retries=3 install -y/u);
  assert.doesNotMatch(aptInstaller, /--fix-missing/u);

  for (const dockerfileName of ['api.Dockerfile', 'web.Dockerfile']) {
    const dockerfile = readFileSync(path.join(root, 'docker', dockerfileName), 'utf8');

    assert.match(dockerfile, /COPY docker\/apt-install\.sh \/usr\/local\/bin\/apt-install/u);
    assert.match(dockerfile, /RUN apt-install /u);
  }
});

test('root scripts reserve direct Compose for deployment and only layer compose.dev.yaml for development', () => {
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

  assert.equal(manifest.scripts.deploy, undefined);
  assert.match(manifest.scripts['dev:deps'], /-f compose\.yaml -f compose\.dev\.yaml/u);
  assert.doesNotMatch(manifest.scripts['dev:deps'], /--env-file|docker-compose/u);
  assert.match(manifest.scripts['dev:down'], /-f compose\.yaml -f compose\.dev\.yaml/u);
  assert.equal(manifest.scripts['containers:check'], 'node scripts/containers-check.mjs');
  assert.equal(manifest.scripts['containers:smoke'], 'node scripts/containers-smoke.mjs');
  assert.match(manifest.scripts['test:containers'], /scripts\/containers\.test\.mjs/u);
});

test('container checker validates the tracked Compose template without an env-file', () => {
  const fakeDocker = makeFakeDocker();
  try {
    const result = runScript(containersCheckScript, [], fakeDocker);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(readDockerCalls(fakeDocker), [
      'compose -f compose.yaml.example config --quiet|SKYNET_IMAGE_TAG=|WEB_PORT=|API_PORT=',
    ]);
  } finally {
    rmSync(fakeDocker.directory, { recursive: true, force: true });
  }
});

test('development environment checker tells users to copy the Compose template when the local file is missing', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'skynet-dev-compose-test-'));
  try {
    const result = spawnSync(process.execPath, [devEnvironmentCheckScript], {
      cwd: directory,
      encoding: 'utf8',
      env: process.env,
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /compose\.yaml is missing\. Run: cp compose\.yaml\.example compose\.yaml/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('container smoke accepts one local image tag and derives CORS and browser API addresses from port values', () => {
  const fakeDocker = makeFakeDocker();
  try {
    const result = runScript(containersSmokeScript, ['--tag', 'ci-contract'], fakeDocker, {
      WEB_PORT: '19080',
      API_PORT: '19081',
    });
    const calls = readDockerCalls(fakeDocker);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(calls.length, 7);
    assert.match(calls[0], /^compose --project-name skynet-smoke-[a-z0-9-]+ up -d /u);
    assert.match(calls[0], /SKYNET_IMAGE_TAG=ci-contract/u);
    assert.match(calls[0], /WEB_PORT=19080/u);
    assert.match(calls[0], /API_PORT=19081/u);
    assert.match(calls[4], /http:\/\/localhost:19080/u);
    assert.match(calls[5], /http:\/\/localhost:19081\/api\/v1/u);
    assert.match(calls[6].split('|')[0], / down --volumes --remove-orphans$/u);
  } finally {
    rmSync(fakeDocker.directory, { recursive: true, force: true });
  }
});

test('container smoke rejects missing or duplicated image tags before calling Docker', () => {
  const fakeDocker = makeFakeDocker();
  try {
    const missing = runScript(containersSmokeScript, [], fakeDocker);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /--tag is required/u);

    const duplicated = runScript(
      containersSmokeScript,
      ['--tag', 'first', '--tag', 'second'],
      fakeDocker,
    );
    assert.notEqual(duplicated.status, 0);
    assert.match(duplicated.stderr, /may only be provided once/u);
    assert.deepEqual(readDockerCalls(fakeDocker), []);
  } finally {
    rmSync(fakeDocker.directory, { recursive: true, force: true });
  }
});
