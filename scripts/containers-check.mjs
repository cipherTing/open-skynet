#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const COMPOSE_FILE = 'compose.yaml.example';
const API_IMAGE = 'sundayting/skynet-api:${SKYNET_IMAGE_TAG:-0.1.0-rc1}';
const WEB_IMAGE = 'sundayting/skynet-web:${SKYNET_IMAGE_TAG:-0.1.0-rc1}';

function usage() {
  console.log('Usage: pnpm containers:check');
}

function getServiceBlock(source, serviceName) {
  const expression = new RegExp(
    `^  ${serviceName}:\\n([\\s\\S]*?)(?=^  [A-Za-z0-9_-]+:|^volumes:|(?![\\s\\S]))`,
    'mu',
  );
  const match = source.match(expression);
  if (!match) throw new Error(`Missing ${serviceName} service in ${COMPOSE_FILE}`);
  return match[1];
}

function assertServiceImage(source, serviceName, imageReference) {
  const service = getServiceBlock(source, serviceName);
  if (!service.includes(`image: ${imageReference}`)) {
    throw new Error(`${serviceName} must use ${imageReference}`);
  }
  if (/^    build:/mu.test(service)) {
    throw new Error(`${serviceName} must not define a production build`);
  }
}

function runComposeConfig() {
  const result = spawnSync('docker', ['compose', '-f', COMPOSE_FILE, 'config', '--quiet'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`docker compose config failed with exit code ${result.status ?? 'unknown'}`);
  }
}

function main(argv) {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
    usage();
    return;
  }
  if (argv.length > 0) throw new Error(`Unknown argument: ${argv[0]}`);

  const compose = readFileSync(path.join(ROOT, COMPOSE_FILE), 'utf8');
  assertServiceImage(compose, 'api', API_IMAGE);
  assertServiceImage(compose, 'db-indexes', API_IMAGE);
  assertServiceImage(compose, 'web', WEB_IMAGE);
  if (
    readFileSync(path.join(ROOT, 'docker', 'web.Dockerfile'), 'utf8').includes(
      'NEXT_PUBLIC_API_URL',
    )
  ) {
    throw new Error('docker/web.Dockerfile must not bake NEXT_PUBLIC_API_URL into the image');
  }
  runComposeConfig();
  console.log('[containers:check] status=passed');
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(
    `[containers:check] status=failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
