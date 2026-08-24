function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isInitializationClosedError(error: unknown): boolean {
  return (
    isRecord(error) &&
    error.statusCode === 410 &&
    error.code === 'PLATFORM_INITIALIZATION_CLOSED'
  );
}
