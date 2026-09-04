#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';

const ROOT = process.cwd();
const ENV_FILE = '.env';
const WAIT_TIMEOUT_SECONDS = '240';
const DEFAULT_WEB_PORT = 8080;
const DEFAULT_API_PORT = 8081;
const IMAGE_TAG_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/u;

function usage() {
  console.log('Usage: pnpm containers:smoke -- --tag <image tag>');
}

function parseArgs(argv) {
  const argumentsWithoutSeparator = argv[0] === '--' ? argv.slice(1) : argv;
  if (
    argumentsWithoutSeparator.length === 1 &&
    (argumentsWithoutSeparator[0] === '--help' || argumentsWithoutSeparator[0] === '-h')
  ) {
    usage();
    process.exit(0);
  }

  let tag;
  for (let index = 0; index < argumentsWithoutSeparator.length; index += 1) {
    const argument = argumentsWithoutSeparator[index];
    if (argument !== '--tag') throw new Error(`Unknown argument: ${argument}`);
    if (tag !== undefined) throw new Error('--tag may only be provided once');
    const value = argumentsWithoutSeparator[index + 1];
    if (!value || value.startsWith('--')) throw new Error('--tag requires an image tag');
    tag = value;
    index += 1;
  }
  if (tag === undefined) throw new Error('--tag is required');
  if (!IMAGE_TAG_PATTERN.test(tag)) throw new Error('--tag must be a valid Docker image tag');
  return tag;
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const values = {};
  for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function readPort(value, name, fallback) {
  const resolved = value?.trim() || String(fallback);
  const port = Number(resolved);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  return port;
}

function runDocker(args, env, options = {}) {
  const result = spawnSync('docker', args, {
    cwd: ROOT,
    env,
    stdio: options.stdio ?? 'inherit',
    encoding: options.encoding,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`docker ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}`);
  }
  return result;
}

function getCompletedIndexContainerId(composePrefix, env) {
  const result = runDocker(
    [...composePrefix, 'ps', '--all', '--status', 'exited', '-q', 'db-indexes'],
    env,
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    },
  );
  const containerId = result.stdout.trim();
  if (!containerId || containerId.includes('\n')) {
    throw new Error('db-indexes did not complete exactly once');
  }
  return containerId;
}

function assertIndexGateCompleted(composePrefix, env) {
  const containerId = getCompletedIndexContainerId(composePrefix, env);
  const result = runDocker(['inspect', '--format', '{{.State.ExitCode}}', containerId], env, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  if (result.stdout.trim() !== '0') {
    throw new Error(`db-indexes exited with code ${result.stdout.trim() || 'unknown'}`);
  }
}

function assertApiReady(composePrefix, env) {
  const script =
    "void (async () => { const response = await fetch('http://127.0.0.1:8081/api/v1/health/ready'); if (!response.ok) throw new Error(`API ready returned ${response.status}`); })().catch((error) => { console.error(error); process.exit(1); });";
  runDocker([...composePrefix, 'exec', '-T', 'api', 'node', '-e', script], env);
}

function assertApiCors(composePrefix, env, origin) {
  const script = [
    'void (async () => {',
    `const response = await fetch('http://127.0.0.1:8081/api/v1/health/ready', { headers: { Origin: ${JSON.stringify(origin)} } });`,
    'if (!response.ok) throw new Error(`API CORS probe returned ${response.status}`);',
    `if (response.headers.get('access-control-allow-origin') !== ${JSON.stringify(origin)}) throw new Error('API did not return the configured CORS origin');`,
    "if (response.headers.get('access-control-allow-credentials') !== 'true') throw new Error('API did not allow credentialed CORS requests');",
    '})().catch((error) => { console.error(error); process.exit(1); });',
  ].join(' ');
  runDocker([...composePrefix, 'exec', '-T', 'api', 'node', '-e', script], env);
}

function assertWebContract(composePrefix, env) {
  const script = [
    'void (async () => {',
    "const pageResponse = await fetch('http://127.0.0.1:8080/');",
    'if (!pageResponse.ok) throw new Error(`Web health returned ${pageResponse.status}`);',
    "const csp = pageResponse.headers.get('content-security-policy') ?? '';",
    `if (!csp.includes(${JSON.stringify("connect-src 'self'")})) throw new Error("CSP did not allow same-origin API requests");`,
    '})().catch((error) => { console.error(error); process.exit(1); });',
  ].join(' ');
  runDocker([...composePrefix, 'exec', '-T', 'web', 'node', '-e', script], env);
}

function main(argv) {
  const tag = parseArgs(argv);
  const fileEnvironment = parseEnvFile(ENV_FILE);
  const webPort = readPort(
    process.env.WEB_PORT ?? fileEnvironment.WEB_PORT,
    'WEB_PORT',
    DEFAULT_WEB_PORT,
  );
  const apiPort = readPort(
    process.env.API_PORT ?? fileEnvironment.API_PORT,
    'API_PORT',
    DEFAULT_API_PORT,
  );
  const corsOrigin =
    process.env.CORS_ORIGIN?.trim() ||
    fileEnvironment.CORS_ORIGIN?.trim() ||
    `http://localhost:${webPort}`;
  const projectName = `skynet-smoke-${process.pid}-${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const env = {
    ...process.env,
    SKYNET_IMAGE_TAG: tag,
    WEB_PORT: String(webPort),
    API_PORT: String(apiPort),
    CORS_ORIGIN: corsOrigin,
    JWT_SECRET: `smoke-jwt-${randomUUID().replaceAll('-', '')}`,
    APP_ENCRYPTION_KEY: `smoke-encryption-${randomUUID().replaceAll('-', '')}`,
  };
  const composePrefix = ['compose', '--project-name', projectName];
  let attemptedStart = false;
  let failure;

  try {
    attemptedStart = true;
    runDocker(
      [
        ...composePrefix,
        'up',
        '-d',
        '--no-build',
        '--wait',
        '--wait-timeout',
        WAIT_TIMEOUT_SECONDS,
        '--remove-orphans',
      ],
      env,
    );
    assertIndexGateCompleted(composePrefix, env);
    assertApiReady(composePrefix, env);
    assertApiCors(composePrefix, env, corsOrigin);
    assertWebContract(composePrefix, env);
  } catch (error) {
    failure = error;
  } finally {
    if (attemptedStart) {
      try {
        runDocker([...composePrefix, 'down', '--volumes', '--remove-orphans'], env);
      } catch (cleanupError) {
        if (!failure) failure = cleanupError;
        else {
          console.error(
            `[containers:smoke] cleanup=failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
          );
        }
      }
    }
  }

  if (failure) throw failure;
  console.log(`[containers:smoke] status=passed project=${projectName} tag=${tag}`);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(
    `[containers:smoke] status=failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
