#!/usr/bin/env node

import process from 'node:process';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const REQUIRED_URLS = ['CORS_ORIGIN', 'NEXT_PUBLIC_API_URL'];
const OPTIONAL_URLS = ['PUBLIC_SITE_ORIGIN', 'PUBLIC_API_BASE_URL'];

function parseArgs(argv) {
  let target = 'production';
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--target') {
      target = argv[index + 1];
      if (!target) throw new Error('Missing value for --target');
      index += 1;
      continue;
    }
    if (argument === '--help' || argument === '-h') {
      console.log('Usage: node scripts/check-production-urls.mjs [--target production]');
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  if (target !== 'production') throw new Error(`Unsupported target: ${target}`);
  return target;
}

function parseUrls(name, raw) {
  const values =
    name === 'CORS_ORIGIN' ? raw.split(',').map((value) => value.trim()) : [raw.trim()];
  if (values.some((value) => value.length === 0))
    throw new Error(`${name} must not contain empty URLs`);
  return values;
}

function assertPublicUrl(name, value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must contain valid URLs`);
  }
  const hostname = url.hostname.toLowerCase();
  const isIpv4Loopback = /^127(?:\.\d{1,3}){3}$/u.test(hostname);
  if (url.protocol !== 'https:') throw new Error(`${name} must use HTTPS`);
  if (LOOPBACK_HOSTS.has(hostname) || isIpv4Loopback || hostname.endsWith('.localhost')) {
    throw new Error(`${name} must not use a loopback host`);
  }
  if (url.username || url.password) throw new Error(`${name} must not contain URL credentials`);
}

function main(argv) {
  parseArgs(argv);
  for (const name of REQUIRED_URLS) {
    const raw = process.env[name]?.trim();
    if (!raw) throw new Error(`${name} is required for production release verification`);
    for (const value of parseUrls(name, raw)) assertPublicUrl(name, value);
  }
  for (const name of OPTIONAL_URLS) {
    const raw = process.env[name]?.trim();
    if (!raw) continue;
    for (const value of parseUrls(name, raw)) assertPublicUrl(name, value);
  }
  console.log('Production public URLs use HTTPS and non-loopback hosts.');
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(`[production-urls] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
