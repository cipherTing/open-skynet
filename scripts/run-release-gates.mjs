#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import process from 'node:process';

const root = process.cwd();

function help() {
  console.log(
    `Usage: node scripts/run-release-gates.mjs [--fast | --ci | --release]\n\nModes:\n  --fast    Static contracts, lint, and focused tests; no Compose or Redis.\n  --ci      Full local CI gate; no Compose or Redis.\n  --release  CI gate plus an exact v<root.version> release tag and clean-worktree check.`,
  );
}

function run(label, command, args) {
  console.log(`[release-gates] ${label}: ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`);
}

function gateList(mode) {
  const common = [
    ['release contract', process.execPath, ['scripts/check-release-contract.mjs']],
    ['public contracts', process.execPath, ['scripts/check-public-contracts.mjs']],
    ['whitespace', 'git', ['diff', '--check']],
    ['contract tests', 'pnpm', ['test:contracts']],
  ];
  if (mode === 'fast') {
    return [
      ...common,
      ['lint', 'pnpm', ['lint']],
      [
        'API tests',
        'pnpm',
        [
          '--filter',
          '@skynet/api',
          'exec',
          'jest',
          '--config',
          'jest.config.cjs',
          '--runInBand',
          '--watchman=false',
        ],
      ],
      ['Web unit tests', 'pnpm', ['--filter', '@skynet/web', 'test:unit']],
    ];
  }
  return [
    ...common,
    ['lint', 'pnpm', ['lint']],
    ['Web typecheck', 'pnpm', ['--filter', '@skynet/web', 'typecheck']],
    [
      'API tests',
      'pnpm',
      [
        '--filter',
        '@skynet/api',
        'exec',
        'jest',
        '--config',
        'jest.config.cjs',
        '--runInBand',
        '--watchman=false',
      ],
    ],
    ['Web unit tests', 'pnpm', ['--filter', '@skynet/web', 'test:unit']],
    ['build', 'pnpm', ['build']],
  ];
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.length === 0) {
  help();
  process.exit(args.length === 0 ? 1 : 0);
}
const modeFlag = args[0];
const mode =
  modeFlag === '--fast' ? 'fast' : modeFlag === '--ci' || modeFlag === '--release' ? 'ci' : null;
if (!mode || args.length !== 1) {
  help();
  process.exitCode = 1;
} else {
  try {
    if (modeFlag === '--release') {
      run('release tag', process.execPath, ['scripts/check-release-contract.mjs', '--release']);
    }
    for (const [label, command, commandArgs] of gateList(mode)) run(label, command, commandArgs);
    console.log(`[release-gates] ${modeFlag.slice(2)} gates passed`);
  } catch (error) {
    console.error(`[release-gates] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
