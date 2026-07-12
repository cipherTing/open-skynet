#!/usr/bin/env node
import { spawn } from 'node:child_process';
import process from 'node:process';

const PNPM = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const TERMINATE_TIMEOUT_MS = 8_000;
const mode = process.argv.includes('--rebuild') ? 'rebuild' : 'default';
const dependencyScript = mode === 'rebuild' ? 'dev:docker:rebuild' : 'dev:deps';

let activeChild = null;
let appChild = null;
let dependenciesStarted = false;
let cleanupPromise = null;

const detachedChildren = new WeakSet();

function log(message) {
  console.log(`[dev] ${message}`);
}

function spawnPnpmScript(
  script,
  { detached = process.platform !== 'win32', env = process.env } = {},
) {
  const child = spawn(PNPM, [script], {
    detached,
    stdio: 'inherit',
    env,
  });

  if (detached) detachedChildren.add(child);
  return child;
}

function waitForChild(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
}

function isRunning(child) {
  return child && child.exitCode === null && child.signalCode === null;
}

function sendSignal(child, signal) {
  if (!isRunning(child) || child.pid === undefined) return;

  try {
    if (detachedChildren.has(child) && process.platform !== 'win32') {
      process.kill(-child.pid, signal);
      return;
    }
    child.kill(signal);
  } catch (error) {
    if (error && error.code !== 'ESRCH') {
      console.error(`[dev] failed to send ${signal}: ${error.message}`);
    }
  }
}

async function waitUntilStopped(child, timeoutMs) {
  if (!isRunning(child)) return true;

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.once('close', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function terminateChild(child) {
  if (!isRunning(child)) return;

  sendSignal(child, 'SIGTERM');
  const stopped = await waitUntilStopped(child, TERMINATE_TIMEOUT_MS);
  if (stopped) return;

  sendSignal(child, 'SIGKILL');
  await waitUntilStopped(child, 1_000);
}

async function runPnpmScript(script, options) {
  const child = spawnPnpmScript(script, options);
  activeChild = child;

  try {
    const result = await waitForChild(child);
    if (result.signal) {
      const error = new Error(`${script} stopped by ${result.signal}`);
      error.exitCode = exitCodeForSignal(result.signal);
      throw error;
    }
    if (result.code !== 0) {
      const error = new Error(`${script} exited with code ${result.code}`);
      error.exitCode = result.code ?? 1;
      throw error;
    }
  } finally {
    if (activeChild === child) activeChild = null;
  }
}

async function runDevApps() {
  const env =
    process.platform === 'darwin'
      ? { ...process.env, WATCHPACK_POLLING: process.env.WATCHPACK_POLLING ?? '1000' }
      : process.env;
  const child = spawnPnpmScript('dev:apps', { env });
  appChild = child;
  activeChild = child;

  try {
    return await waitForChild(child);
  } finally {
    if (activeChild === child) activeChild = null;
    if (appChild === child) appChild = null;
  }
}

async function cleanup(exitCode) {
  if (cleanupPromise) return cleanupPromise;

  cleanupPromise = (async () => {
    if (activeChild) await terminateChild(activeChild);
    if (appChild && appChild !== activeChild) await terminateChild(appChild);

    if (dependenciesStarted) {
      try {
        log('stopping Docker dev services...');
        await runPnpmScript('dev:down');
      } catch (error) {
        console.error(`[dev] dev:down failed: ${error.message}`);
        return exitCode === 0 ? 1 : exitCode;
      }
    }

    return exitCode;
  })();

  return cleanupPromise;
}

function exitCodeForSignal(signal) {
  if (signal === 'SIGINT') return 130;
  if (signal === 'SIGTERM') return 143;
  if (signal === 'SIGHUP') return 129;
  return 1;
}

async function requestShutdown(signal) {
  if (cleanupPromise) {
    console.error(`[dev] received ${signal}; shutdown is already in progress, waiting for Docker cleanup...`);
    return;
  }

  const code = await cleanup(exitCodeForSignal(signal));
  process.exit(code);
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    void requestShutdown(signal);
  });
}

try {
  await runPnpmScript('dev:check');
  dependenciesStarted = true;
  await runPnpmScript(dependencyScript);

  const result = await runDevApps();
  const exitCode = result.signal ? exitCodeForSignal(result.signal) : (result.code ?? 0);
  const cleanedExitCode = await cleanup(exitCode);
  process.exit(cleanedExitCode);
} catch (error) {
  console.error(`[dev] ${error.message}`);
  const cleanedExitCode = await cleanup(error.exitCode ?? 1);
  process.exit(cleanedExitCode);
}
