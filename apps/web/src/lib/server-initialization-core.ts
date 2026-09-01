import { getInternalApiBaseUrl, RuntimeConfigError } from './runtime-config.ts';

export type ServerInitializationStatus = Readonly<{
  initialized: boolean;
}>;

export type ServerInitializationErrorKind =
  | 'configuration'
  | 'transport'
  | 'http'
  | 'json'
  | 'payload';

export class ServerInitializationError extends Error {
  public readonly kind: ServerInitializationErrorKind;
  public readonly statusCode?: number;

  constructor(
    kind: ServerInitializationErrorKind,
    message: string,
    statusCode?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ServerInitializationError';
    this.kind = kind;
    this.statusCode = statusCode;
  }
}

type LoadServerInitializationOptions = Readonly<{
  internalApiUrl?: string;
  fetchImpl?: typeof fetch;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...keys].sort();
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === expectedKeys[index])
  );
}

function parseInitializationPayload(payload: unknown): ServerInitializationStatus {
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ['data']) ||
    !isRecord(payload.data) ||
    !hasExactKeys(payload.data, ['initialized']) ||
    typeof payload.data.initialized !== 'boolean'
  ) {
    throw new ServerInitializationError(
      'payload',
      'Initialization status response has an invalid shape',
    );
  }

  return { initialized: payload.data.initialized };
}

export async function loadServerInitializationStatus(
  options: LoadServerInitializationOptions = {},
): Promise<ServerInitializationStatus> {
  let apiBaseUrl: string;
  try {
    apiBaseUrl = getInternalApiBaseUrl(options.internalApiUrl ?? process.env.INTERNAL_API_URL);
  } catch (error: unknown) {
    if (error instanceof RuntimeConfigError) {
      throw new ServerInitializationError('configuration', error.message, undefined, {
        cause: error,
      });
    }
    throw error;
  }

  const endpoint = new URL('auth/initialization', `${apiBaseUrl}/`);
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
  } catch (error: unknown) {
    throw new ServerInitializationError(
      'transport',
      'Initialization status request failed',
      undefined,
      {
        cause: error,
      },
    );
  }

  if (!response.ok) {
    throw new ServerInitializationError(
      'http',
      `Initialization status request returned HTTP ${String(response.status)}`,
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error: unknown) {
    throw new ServerInitializationError(
      'json',
      'Initialization status response is not valid JSON',
      undefined,
      { cause: error },
    );
  }

  return parseInitializationPayload(payload);
}
