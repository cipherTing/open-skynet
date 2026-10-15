#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function parseArgs(argv) {
  const options = { root: process.cwd(), config: null };
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
      console.log(
        'Usage: node scripts/check-public-contracts.mjs [--root <dir>] [--config <file>]',
      );
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function readText(root, relativePath) {
  try {
    return await readFile(path.join(root, relativePath), 'utf8');
  } catch (error) {
    throw new Error(
      `Required public contract file is missing: ${relativePath} (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

function frontMatterVersion(content, relativePath) {
  const frontMatter = content.match(/^---\s*\n([\s\S]*?)\n---/u)?.[1] ?? '';
  const version = frontMatter.match(/^version:\s*['"]?([^'"\s]+)['"]?\s*$/mu)?.[1];
  if (!version) throw new Error(`${relativePath} is missing front matter version`);
  return version;
}

function checkRuntimeVersion(source, relativePath, productVersion, expression) {
  const literal = source.match(expression)?.[1];
  if (literal !== undefined) {
    if (literal !== productVersion)
      throw new Error(`${relativePath} declares ${literal}; expected ${productVersion}`);
    return;
  }
  if (
    !source.includes('PRODUCT_VERSION') &&
    !source.includes('releaseContract.productVersion') &&
    !source.includes('getReleaseContract().productVersion')
  ) {
    throw new Error(`${relativePath} must use the release contract for its public version`);
  }
}

async function main(argv) {
  const options = parseArgs(argv);
  const root = path.resolve(options.root);
  const config = await readJson(
    path.resolve(root, options.config ?? 'config/release-contract.json'),
  );
  const productVersion = (
    await readJson(path.join(root, config.productVersionSource ?? 'package.json'))
  ).version;
  if (typeof productVersion !== 'string' || productVersion.length === 0)
    throw new Error('Product version is missing');

  const skillEntry = await readText(root, 'skills/skynet/SKILL.md');
  const skillName = skillEntry.match(/^name:\s*([^\s]+)\s*$/mu)?.[1];
  if (skillName !== 'skynet') throw new Error('skills/skynet/SKILL.md must declare name: skynet');
  const installer = await readText(root, 'scripts/install-skynet-skill.py');
  if (!installer.includes('"--skill-ref"'))
    throw new Error('Skynet Skill installer must require the release tag via --skill-ref');
  const readme = await readText(root, 'README.md');
  const skillTag = `v${productVersion}`;
  if (
    !readme.includes(
      `https://raw.githubusercontent.com/cipherTing/open-skynet/${skillTag}/scripts/install-skynet-skill.py`,
    ) ||
    !readme.includes(`--skill-ref ${skillTag}`)
  ) {
    throw new Error(`README Skill installer must use product tag ${skillTag}`);
  }

  const contracts = config.contracts;
  const guide = contracts?.agentGuide;
  const restApiMajor = contracts?.restApi?.major;
  if (!guide || !Number.isInteger(restApiMajor))
    throw new Error('Incomplete public release contracts');
  if ('governanceGuide' in contracts)
    throw new Error('Standalone Governance Guide is no longer a public release contract');
  if ('mcpBusiness' in contracts) throw new Error('MCP is no longer a public release contract');

  const guidePath = guide.template;
  const guideContent = await readText(root, guidePath);
  if (frontMatterVersion(guideContent, guidePath) !== guide.version)
    throw new Error(
      `Agent Guide version does not match release catalog: expected ${guide.version}`,
    );
  const apiPrefix = guideContent.match(/^api_prefix:\s*([^\s]+)\s*$/mu)?.[1];
  if (apiPrefix !== `/api/v${restApiMajor}`)
    throw new Error(`${guidePath} must declare /api/v${restApiMajor}`);
  if (
    !guideContent.includes('open-skynet/{{SKYNET_SKILL_REF}}/scripts/install-skynet-skill.py') ||
    !guideContent.includes("--skill-ref '{{SKYNET_SKILL_REF}}'")
  ) {
    throw new Error(`${guidePath} must pass its versioned Skill ref to the installer`);
  }

  const mainSource = await readText(root, 'apps/api/src/main.ts');
  checkRuntimeVersion(
    mainSource,
    'apps/api/src/main.ts',
    productVersion,
    /\.setVersion\(\s*['"]([^'"]+)['"]\s*\)/u,
  );
  const changelog = await readText(root, 'CHANGELOG.md');
  if (!new RegExp(`^## \\[${escapeRegExp(productVersion)}\\](?:\\s|$)`, 'mu').test(changelog))
    throw new Error(`CHANGELOG.md is missing the ${productVersion} release entry`);
  console.log(
    `Public contracts OK: product=${productVersion}, api=/api/v${restApiMajor}, guide=${guide.version}, governance=none`,
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(`[public-contracts] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
