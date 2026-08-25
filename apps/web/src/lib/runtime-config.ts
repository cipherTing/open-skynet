export type PublicRuntimeConfig = Readonly<{
  apiBaseUrl: string;
}>;

type RuntimeConfigHost = {
  __SKYNET_RUNTIME_CONFIG__?: unknown;
};

type RuntimeConfigEnvironment = Readonly<Record<string, string | undefined>>;

declare global {
  interface Window {
    __SKYNET_RUNTIME_CONFIG__?: PublicRuntimeConfig;
  }
}

export class RuntimeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeConfigError';
  }
}

const DEFAULT_PUBLIC_API_PORT = 8081;
const MIN_TCP_PORT = 1;
const MAX_TCP_PORT = 65_535;
const LOCALHOST_HOSTNAME = 'localhost';
const PUBLIC_API_BASE_PATH = '/api/v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeApiBaseUrl(value: unknown, sourceName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RuntimeConfigError(`${sourceName} is required`);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(value);
  } catch {
    throw new RuntimeConfigError(`${sourceName} must be an absolute URL`);
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new RuntimeConfigError(`${sourceName} must use http or https`);
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new RuntimeConfigError(`${sourceName} must not include credentials`);
  }

  if (parsedUrl.search || parsedUrl.hash) {
    throw new RuntimeConfigError(`${sourceName} must not include a query or hash`);
  }

  return parsedUrl.toString().replace(/\/+$/u, '');
}

function normalizePublicApiPort(value: string | undefined): number {
  if (value === undefined || value.trim().length === 0) {
    return DEFAULT_PUBLIC_API_PORT;
  }

  if (!/^[1-9]\d{0,4}$/u.test(value)) {
    throw new RuntimeConfigError('SKYNET_PUBLIC_API_PORT must be a valid TCP port');
  }

  const port = Number(value);
  if (port < MIN_TCP_PORT || port > MAX_TCP_PORT) {
    throw new RuntimeConfigError('SKYNET_PUBLIC_API_PORT must be a valid TCP port');
  }

  return port;
}

function normalizeBrowserApiBaseUrl(value: unknown, sourceName: string): string {
  const normalized = normalizeApiBaseUrl(value, sourceName);
  const parsedUrl = new URL(normalized);

  if (
    parsedUrl.protocol !== 'http:' ||
    parsedUrl.hostname !== LOCALHOST_HOSTNAME ||
    parsedUrl.pathname !== PUBLIC_API_BASE_PATH
  ) {
    throw new RuntimeConfigError(`${sourceName} must be a localhost API base URL`);
  }

  return normalized;
}

function getApiBaseUrlFromRuntimeConfig(runtimeGlobal: RuntimeConfigHost): string {
  const runtimeConfig = runtimeGlobal.__SKYNET_RUNTIME_CONFIG__;
  if (!isRecord(runtimeConfig)) {
    throw new RuntimeConfigError('Browser runtime config is missing');
  }

  return normalizeBrowserApiBaseUrl(runtimeConfig.apiBaseUrl, 'Browser runtime config apiBaseUrl');
}

export function getBrowserApiBaseUrl(runtimeGlobal: RuntimeConfigHost): string {
  return getApiBaseUrlFromRuntimeConfig(runtimeGlobal);
}

export function getInternalApiBaseUrl(internalApiUrl: string | undefined): string {
  return normalizeApiBaseUrl(internalApiUrl, 'INTERNAL_API_URL');
}

export function getPublicApiBaseUrl(publicApiPort: string | undefined): string {
  const port = normalizePublicApiPort(publicApiPort);
  return normalizeBrowserApiBaseUrl(
    `http://${LOCALHOST_HOSTNAME}:${String(port)}${PUBLIC_API_BASE_PATH}`,
    'SKYNET_PUBLIC_API_PORT',
  );
}

function getPublicApiPortFromEnvironment(
  environment: RuntimeConfigEnvironment,
): string | undefined {
  return environment.SKYNET_PUBLIC_API_PORT ?? environment.API_PORT;
}

export function getPublicApiBaseUrlFromEnvironment(environment: RuntimeConfigEnvironment): string {
  return getPublicApiBaseUrl(getPublicApiPortFromEnvironment(environment));
}

export function getApiOrigin(apiBaseUrl: string): string {
  return new URL(normalizeApiBaseUrl(apiBaseUrl, 'API base URL')).origin;
}

export function buildMcpEndpoint(apiBaseUrl: string): string {
  return `${normalizeApiBaseUrl(apiBaseUrl, 'API base URL')}/mcp`;
}

export function createRuntimeConfigScript(publicApiPort: string | undefined): string {
  const config: PublicRuntimeConfig = {
    apiBaseUrl: getPublicApiBaseUrl(publicApiPort),
  };

  return `window.__SKYNET_RUNTIME_CONFIG__ = Object.freeze(${JSON.stringify(config)});\n`;
}

export function createRuntimeConfigResponse(publicApiPort: string | undefined): Response {
  try {
    return new Response(createRuntimeConfigScript(publicApiPort), {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/javascript; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (!(error instanceof RuntimeConfigError)) {
      throw error;
    }

    return new Response('Runtime configuration is invalid', {
      status: 500,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }
}

export function createRuntimeConfigResponseFromEnvironment(
  environment: RuntimeConfigEnvironment,
): Response {
  return createRuntimeConfigResponse(getPublicApiPortFromEnvironment(environment));
}
