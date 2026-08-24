import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface ReleaseCatalog {
  readonly productVersionSource: 'package.json';
  readonly contracts: {
    readonly restApi: { readonly major: number; readonly revision: string };
    readonly agentGuide: { readonly version: string };
    readonly governanceGuide: { readonly version: string };
    readonly mcpBusiness: { readonly version: string };
  };
}

export interface ReleaseContract {
  readonly productVersion: string;
  readonly apiMajor: number;
  readonly apiRevision: string;
  readonly agentGuideRevision: string;
  readonly governanceGuideRevision: string;
  readonly mcpBusinessVersion: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`发布合同字段无效: ${field}`);
  }
  return value;
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`无法读取发布合同文件 ${path}: ${message}`);
  }
}

function readCatalog(value: unknown): ReleaseCatalog {
  if (!isRecord(value) || value.productVersionSource !== 'package.json' || !isRecord(value.contracts)) {
    throw new Error('发布合同 catalog 无效');
  }
  const contracts = value.contracts;
  const restApi = isRecord(contracts.restApi) ? contracts.restApi : null;
  const agentGuide = isRecord(contracts.agentGuide) ? contracts.agentGuide : null;
  const governanceGuide = isRecord(contracts.governanceGuide)
    ? contracts.governanceGuide
    : null;
  const mcpBusiness = isRecord(contracts.mcpBusiness) ? contracts.mcpBusiness : null;
  if (!restApi || !agentGuide || !governanceGuide || !mcpBusiness) {
    throw new Error('发布合同 catalog contracts 无效');
  }
  const apiMajor = restApi.major;
  if (typeof apiMajor !== 'number' || !Number.isInteger(apiMajor) || apiMajor < 1) {
    throw new Error('发布合同字段无效: contracts.restApi.major');
  }
  return {
    productVersionSource: 'package.json',
    contracts: {
      restApi: {
        major: apiMajor,
        revision: requiredString(restApi.revision, 'contracts.restApi.revision'),
      },
      agentGuide: {
        version: requiredString(agentGuide.version, 'contracts.agentGuide.version'),
      },
      governanceGuide: {
        version: requiredString(governanceGuide.version, 'contracts.governanceGuide.version'),
      },
      mcpBusiness: {
        version: requiredString(mcpBusiness.version, 'contracts.mcpBusiness.version'),
      },
    },
  };
}

function loadReleaseContract(): ReleaseContract {
  const catalogPath = resolve(__dirname, '../../../../config/release-contract.json');
  const catalog = readCatalog(readJson(catalogPath));
  const packageValue = readJson(resolve(catalogPath, '..', '..', 'package.json'));
  if (!isRecord(packageValue)) throw new Error('根 package.json 无效');
  return {
    productVersion: requiredString(packageValue.version, 'package.json.version'),
    apiMajor: catalog.contracts.restApi.major,
    apiRevision: catalog.contracts.restApi.revision,
    agentGuideRevision: catalog.contracts.agentGuide.version,
    governanceGuideRevision: catalog.contracts.governanceGuide.version,
    mcpBusinessVersion: catalog.contracts.mcpBusiness.version,
  };
}

const RELEASE_CONTRACT = loadReleaseContract();

export function getReleaseContract(): ReleaseContract {
  return RELEASE_CONTRACT;
}

export const PRODUCT_VERSION = RELEASE_CONTRACT.productVersion;
export const REST_API_MAJOR = RELEASE_CONTRACT.apiMajor;
export const REST_API_REVISION = RELEASE_CONTRACT.apiRevision;
export const AGENT_GUIDE_REVISION = RELEASE_CONTRACT.agentGuideRevision;
export const GOVERNANCE_GUIDE_REVISION = RELEASE_CONTRACT.governanceGuideRevision;
export const MCP_BUSINESS_VERSION = RELEASE_CONTRACT.mcpBusinessVersion;
