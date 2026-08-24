#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

function parseArgs(argv) {
  argv = argv.filter((argument) => argument !== '--');
  const options = { root: process.cwd(), config: null, version: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--root' || argument === '--config') {
      const value = argv[index + 1];
      if (!value) throw new Error(`Missing value for ${argument}`);
      options[argument.slice(2)] = value;
      index += 1;
      continue;
    }
    if (argument === '--help' || argument === '-h') {
      console.log('Usage: node scripts/set-version.mjs [--root <dir>] [--config <file>] <version>');
      process.exit(0);
    }
    if (options.version !== null) throw new Error(`Unexpected argument: ${argument}`);
    options.version = argument;
  }
  if (!options.version) throw new Error('A version is required');
  if (!SEMVER_PATTERN.test(options.version)) throw new Error(`Invalid SemVer: ${options.version}`);
  return options;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeManifest(root, relativePath, version) {
  const filePath = path.join(root, relativePath);
  const manifest = await readJson(filePath);
  manifest.version = version;
  await writeFile(filePath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main(argv) {
  const options = parseArgs(argv);
  const root = path.resolve(options.root);
  const config = await readJson(
    path.resolve(root, options.config ?? 'config/release-contract.json'),
  );
  if (config.productVersionSource !== 'package.json')
    throw new Error('productVersionSource must be package.json');
  await writeManifest(root, 'package.json', options.version);
  for (const relativePath of config.mirrors ?? [])
    await writeManifest(root, relativePath, options.version);
  console.log(`Synchronized workspace version to ${options.version}.`);
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(`[version:set] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
