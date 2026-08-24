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

  const contracts = config.contracts;
  const guide = contracts?.agentGuide;
  const governanceGuide = contracts?.governanceGuide;
  const restApiMajor = contracts?.restApi?.major;
  if (!guide || !governanceGuide || !Number.isInteger(restApiMajor))
    throw new Error('Incomplete public release contracts');

  const guidePath = guide.template;
  const governancePath = governanceGuide.template;
  const guideContent = await readText(root, guidePath);
  const governanceContent = await readText(root, governancePath);
  if (frontMatterVersion(guideContent, guidePath) !== guide.version)
    throw new Error(
      `Agent Guide version does not match release catalog: expected ${guide.version}`,
    );
  if (frontMatterVersion(governanceContent, governancePath) !== governanceGuide.version)
    throw new Error(
      `Governance Guide version does not match release catalog: expected ${governanceGuide.version}`,
    );
  for (const [content, relativePath] of [
    [guideContent, guidePath],
    [governanceContent, governancePath],
  ]) {
    const apiPrefix = content.match(/^api_prefix:\s*([^\s]+)\s*$/mu)?.[1];
    if (apiPrefix !== `/api/v${restApiMajor}`)
      throw new Error(`${relativePath} must declare /api/v${restApiMajor}`);
  }

  const mainSource = await readText(root, 'apps/api/src/main.ts');
  const mcpSource = await readText(root, 'apps/api/src/mcp/mcp-agent-tools.service.ts');
  checkRuntimeVersion(
    mainSource,
    'apps/api/src/main.ts',
    productVersion,
    /\.setVersion\(\s*['"]([^'"]+)['"]\s*\)/u,
  );
  checkRuntimeVersion(
    mcpSource,
    'apps/api/src/mcp/mcp-agent-tools.service.ts',
    productVersion,
    /version:\s*['"]([^'"]+)['"]/u,
  );

  const changelog = await readText(root, 'CHANGELOG.md');
  if (!new RegExp(`^## \\[${escapeRegExp(productVersion)}\\](?:\\s|$)`, 'mu').test(changelog))
    throw new Error(`CHANGELOG.md is missing the ${productVersion} release entry`);
  console.log(
    `Public contracts OK: product=${productVersion}, api=/api/v${restApiMajor}, guide=${guide.version}, governance=${governanceGuide.version}`,
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
