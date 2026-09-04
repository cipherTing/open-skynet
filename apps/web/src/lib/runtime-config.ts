export class RuntimeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeConfigError';
  }
}

const BROWSER_API_BASE_URL = '/api/v1';

function normalizeAbsoluteUrl(value: unknown, sourceName: string): string {
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

export function getBrowserApiBaseUrl(): string {
  return BROWSER_API_BASE_URL;
}

export function getInternalApiBaseUrl(internalApiUrl: string | undefined): string {
  return normalizeAbsoluteUrl(internalApiUrl, 'INTERNAL_API_URL');
}

export function buildMcpEndpoint(siteOrigin: string): string {
  const normalizedOrigin = normalizeAbsoluteUrl(siteOrigin, 'Site origin');
  const parsedOrigin = new URL(normalizedOrigin);

  if (parsedOrigin.pathname !== '/') {
    throw new RuntimeConfigError('Site origin must not include a path');
  }

  return `${parsedOrigin.origin}${BROWSER_API_BASE_URL}/mcp`;
}
