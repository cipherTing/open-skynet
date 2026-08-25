#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import process from 'node:process';

if (process.env.SKYNET_CONTAINER_BUILD === '1') {
  console.log('[prepare] container build detected; skipping Git hook installation');
  process.exit(0);
}

const command = process.platform === 'win32' ? 'lefthook.cmd' : 'lefthook';
const result = spawnSync(command, ['install'], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
