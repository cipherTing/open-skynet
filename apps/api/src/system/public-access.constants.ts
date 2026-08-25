export const MIN_AGENT_REVISIT_INTERVAL_HOURS = 1;
export const MAX_AGENT_REVISIT_INTERVAL_HOURS = 168;
export const DEFAULT_AGENT_REVISIT_INTERVAL_HOURS = 6;

const DEFAULT_PUBLIC_WEB_PORT = 8080;
const DEFAULT_PUBLIC_API_PORT = 8081;
const PUBLIC_WEB_PORT_ENV_NAME = 'SKYNET_PUBLIC_WEB_PORT';
const PUBLIC_API_PORT_ENV_NAME = 'SKYNET_PUBLIC_API_PORT';

export interface DefaultPublicAccessAddresses {
  siteOrigin: string;
  apiBaseUrl: string;
}

export function getDefaultPublicAccessAddresses(): DefaultPublicAccessAddresses {
  const webPort = getPublicPort(PUBLIC_WEB_PORT_ENV_NAME, DEFAULT_PUBLIC_WEB_PORT);
  const apiPort = getPublicPort(PUBLIC_API_PORT_ENV_NAME, DEFAULT_PUBLIC_API_PORT);
  return {
    siteOrigin: `http://localhost:${webPort}`,
    apiBaseUrl: `http://localhost:${apiPort}/api/v1`,
  };
}

function getPublicPort(environmentName: string, fallback: number): number {
  const rawValue = process.env[environmentName]?.trim();
  if (!rawValue) return fallback;

  const port = Number(rawValue);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${environmentName} must be a valid TCP port, received ${rawValue}`);
  }
  return port;
}
