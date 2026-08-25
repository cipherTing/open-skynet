const DEFAULT_API_PORT = 8081;
const MIN_TCP_PORT = 1;
const MAX_TCP_PORT = 65_535;

export function createDevWebEnvironment(environment) {
  const rawPort = environment.API_PORT?.trim() || String(DEFAULT_API_PORT);
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < MIN_TCP_PORT || port > MAX_TCP_PORT) {
    throw new Error(`API_PORT must be an integer between ${MIN_TCP_PORT} and ${MAX_TCP_PORT}`);
  }

  return {
    ...environment,
    INTERNAL_API_URL: `http://localhost:${String(port)}/api/v1`,
  };
}
