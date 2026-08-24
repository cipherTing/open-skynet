#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

function parseArgs(argv) {
  const options = { root: process.cwd(), config: null, tag: null, release: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--root' || argument === '--config' || argument === '--tag') {
      const value = argv[index + 1];
      if (!value) throw new Error(`Missing value for ${argument}`);
      options[argument.slice(2)] = value;
      index += 1;
      continue;
    }
    if (argument === '--release') {
      options.release = true;
      continue;
    }
    if (argument === '--help' || argument === '-h') {
      console.log(
        'Usage: node scripts/check-release-contract.mjs [--root <dir>] [--config <file>] [--tag <tag> | --release]',
      );
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    throw new Error(
      `Unable to read JSON file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function requireString(value, name) {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`${name} must be a non-empty string`);
  return value;
}

function requireSemver(value, name) {
  requireString(value, name);
  if (!SEMVER_PATTERN.test(value)) throw new Error(`${name} must be a valid SemVer: ${value}`);
  return value;
}

async function main(argv) {
  const options = parseArgs(argv);
  const root = path.resolve(options.root);
  const configPath = path.resolve(root, options.config ?? 'config/release-contract.json');
  const config = await readJson(configPath);
  const source = requireString(config.productVersionSource, 'productVersionSource');
  if (source !== 'package.json') throw new Error('productVersionSource must be package.json');

  const rootManifest = await readJson(path.join(root, source));
  const productVersion = requireSemver(rootManifest.version, 'package.json.version');
  const contracts = config.contracts;
  if (!contracts || typeof contracts !== 'object' || Array.isArray(contracts)) {
    throw new Error('contracts must be an object');
  }
  const restApi = contracts.restApi;
  if (!restApi || typeof restApi !== 'object' || Array.isArray(restApi)) {
    throw new Error('contracts.restApi must be an object');
  }
  if (!Number.isInteger(restApi.major) || restApi.major < 1) {
    throw new Error('contracts.restApi.major must be a positive integer');
  }
  if (typeof restApi.revision !== 'string' || !/^\d+$/u.test(restApi.revision)) {
    throw new Error('contracts.restApi.revision must be a numeric string');
  }
  for (const [name, value] of [
    ['contracts.agentGuide.version', contracts.agentGuide?.version],
    ['contracts.governanceGuide.version', contracts.governanceGuide?.version],
    ['contracts.mcpBusiness.version', contracts.mcpBusiness?.version],
  ]) {
    requireSemver(value, name);
  }
  const mirrors = config.mirrors;
  if (!Array.isArray(mirrors) || mirrors.length === 0)
    throw new Error('mirrors must be a non-empty array');
  const mismatches = [];
  for (const relativePath of mirrors) {
    const mirrorPath = path.join(root, requireString(relativePath, 'mirror path'));
    const manifest = await readJson(mirrorPath);
    if (manifest.version !== productVersion)
      mismatches.push(
        `${relativePath}: expected ${productVersion}, received ${manifest.version ?? '(missing)'}`,
      );
  }
  if (mismatches.length > 0)
    throw new Error(`Workspace package versions are out of sync:\n${mismatches.join('\n')}`);

  const requiredFiles = config.release?.requiredFiles;
  if (!Array.isArray(requiredFiles) || requiredFiles.length === 0)
    throw new Error('release.requiredFiles must be a non-empty array');
  for (const relativePath of requiredFiles) {
    try {
      await readFile(path.join(root, requireString(relativePath, 'required file path')));
    } catch {
      throw new Error(`Required release file is missing: ${relativePath}`);
    }
  }

  const tag =
    options.tag ??
    (options.release ? (process.env.RELEASE_TAG ?? process.env.GITHUB_REF_NAME) : null);
  if (options.release && !tag)
    throw new Error('RELEASE_TAG or GITHUB_REF_NAME is required for --release');
  if (tag) {
    const prefix = requireString(config.release?.tagPrefix, 'release.tagPrefix');
    const expectedTag = `${prefix}${productVersion}`;
    if (tag !== expectedTag) throw new Error(`Release tag ${tag} does not match ${expectedTag}`);
  }

  if (options.release) {
    let status;
    try {
      status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
        cwd: root,
        encoding: 'utf8',
      });
    } catch (error) {
      throw new Error(
        `Unable to inspect Git worktree: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (status.trim().length > 0)
      throw new Error('Release verification requires a clean Git worktree');
  }

  const changelogPath = path.join(
    root,
    requireString(config.release?.changelog, 'release.changelog'),
  );
  const changelog = await readFile(changelogPath, 'utf8');
  if (!new RegExp(`^## \\[${escapeRegExp(productVersion)}\\](?:\\s|$)`, 'mu').test(changelog)) {
    throw new Error(`CHANGELOG.md is missing the ${productVersion} release entry`);
  }

  console.log(`Release contract OK: ${productVersion}${tag ? ` (${tag})` : ''}`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(`[release-contract] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
