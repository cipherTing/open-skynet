#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import net from 'node:net';
import process from 'node:process';

const ENV_PATH = '.env.dev';
const EXAMPLE_PATH = '.env.dev.example';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function parseEnvFile(path) {
  const env = {};
  const content = readFileSync(path, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const equalIndex = line.indexOf('=');
    if (equalIndex === -1) continue;
    const key = line.slice(0, equalIndex).trim();
    let value = line.slice(equalIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function readPort(env, name) {
  const rawValue = env[name];
  const port = Number(rawValue);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} 必须是 1-65535 的端口号，当前值：${rawValue ?? '(missing)'}`);
  }
  return port;
}

function assertUniquePorts(namedPorts) {
  const seen = new Map();
  for (const [name, port] of Object.entries(namedPorts)) {
    const existing = seen.get(port);
    if (existing) {
      throw new Error(`${name} 与 ${existing} 使用了相同端口 ${port}`);
    }
    seen.set(port, name);
  }
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function assertLocalHttpUrl(value, expectedPort, expectedPath, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} 必须是合法 URL`);
  }

  const expectedPathname = expectedPath || '/';
  if (
    url.protocol !== 'http:' ||
    !LOCAL_HOSTS.has(url.hostname) ||
    url.port !== String(expectedPort) ||
    url.pathname !== expectedPathname
  ) {
    throw new Error(`${name} 必须指向本机 ${expectedPort}${expectedPath}`);
  }
}

function assertLocalMongoUri(value, expectedPort) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('MONGODB_URI 必须是合法 MongoDB URI');
  }

  if (
    url.protocol !== 'mongodb:' ||
    !LOCAL_HOSTS.has(url.hostname) ||
    url.port !== String(expectedPort)
  ) {
    throw new Error(`MONGODB_URI 必须指向本机 MongoDB ${expectedPort}`);
  }
}

function isComposeServiceRunning(serviceName) {
  try {
    const output = execFileSync(
      'docker',
      [
        'compose',
        '--env-file',
        ENV_PATH,
        '-f',
        'docker-compose.yml',
        '-f',
        'docker-compose.infra.dev.yml',
        'ps',
        '--services',
        '--filter',
        'status=running',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return output.split(/\r?\n/).includes(serviceName);
  } catch {
    return false;
  }
}

function assertComposeWaitSupport() {
  let help;
  try {
    help = execFileSync('docker', ['compose', 'up', '--help'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    throw new Error('Docker Compose 不可用，请先安装或启动 Docker');
  }

  if (!help.includes('--wait') || !help.includes('--wait-timeout')) {
    throw new Error('Docker Compose 版本过旧，请升级到支持 --wait 和 --wait-timeout 的版本');
  }
}

function getComposePublishedPort(serviceName, containerPort) {
  try {
    const output = execFileSync(
      'docker',
      [
        'compose',
        '--env-file',
        ENV_PATH,
        '-f',
        'docker-compose.yml',
        '-f',
        'docker-compose.infra.dev.yml',
        'port',
        serviceName,
        String(containerPort),
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    const match = output.match(/:(\d+)$/);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

function fail(message) {
  console.error(`[dev:check] ${message}`);
  process.exit(1);
}

function queryPortListeners(port) {
  let output;
  try {
    output = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-F', 'pc'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return [];
  }

  const listeners = [];
  let current = null;
  for (const line of output.split(/\r?\n/)) {
    if (!line) continue;
    const prefix = line[0];
    const value = line.slice(1);
    if (prefix === 'p') {
      const pid = Number(value);
      if (Number.isInteger(pid)) current = { pid, command: '' };
    } else if (prefix === 'c' && current) {
      current.command = value.trim();
      listeners.push(current);
      current = null;
    }
  }

  const unique = new Map();
  for (const listener of listeners) {
    if (!unique.has(listener.pid)) unique.set(listener.pid, listener);
  }
  return Array.from(unique.values());
}

function formatListeners(listeners) {
  return listeners.map(({ pid, command }) => `${pid} (${command})`).join(', ');
}

async function assertPortAvailable(name, port) {
  if (!(await isPortOpen(port))) return;

  const listeners = queryPortListeners(port);
  const listenerSummary = listeners.length > 0 ? `：${formatListeners(listeners)}` : '';
  throw new Error(
    `${name}=${port} 已被占用${listenerSummary}。如果开发服务已经运行，请先在原终端按 Ctrl+C，再重新启动`,
  );
}

if (!existsSync(ENV_PATH)) {
  fail(`缺少 ${ENV_PATH}。请先运行：cp ${EXAMPLE_PATH} ${ENV_PATH}`);
}

try {
  assertComposeWaitSupport();
  const env = parseEnvFile(ENV_PATH);
  const ports = {
    API_PORT: readPort(env, 'API_PORT'),
    WEB_PORT: readPort(env, 'WEB_PORT'),
    MONGO_PORT: readPort(env, 'MONGO_PORT'),
    REDIS_PORT: readPort(env, 'REDIS_PORT'),
  };

  assertUniquePorts(ports);

  if (env.NODE_ENV !== 'development') {
    throw new Error('NODE_ENV 必须是 development');
  }

  assertLocalMongoUri(env.MONGODB_URI, ports.MONGO_PORT);

  if (!LOCAL_HOSTS.has(env.REDIS_HOST)) {
    throw new Error('REDIS_HOST 必须是本机地址');
  }

  assertLocalHttpUrl(env.CORS_ORIGIN, ports.WEB_PORT, '', 'CORS_ORIGIN');
  assertLocalHttpUrl(env.NEXT_PUBLIC_API_URL, ports.API_PORT, '/api/v1', 'NEXT_PUBLIC_API_URL');

  await assertPortAvailable('WEB_PORT', ports.WEB_PORT);

  const composePorts = [
    ['API_PORT', 'api', 8081],
    ['MONGO_PORT', 'mongo', 27017],
    ['REDIS_PORT', 'redis', 6379],
  ];

  for (const [portName, serviceName, containerPort] of composePorts) {
    if (await isPortOpen(ports[portName])) {
      const publishedPort = getComposePublishedPort(serviceName, containerPort);
      if (!isComposeServiceRunning(serviceName) || publishedPort !== ports[portName]) {
        throw new Error(`${portName}=${ports[portName]} 已被非本项目 ${serviceName} 服务占用`);
      }
    }
  }

  console.log('[dev:check] OK');
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
