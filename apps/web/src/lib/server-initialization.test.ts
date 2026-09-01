import assert from 'node:assert/strict';
import test from 'node:test';

type ServerInitializationModule = typeof import('./server-initialization-core.ts');

async function loadModule(): Promise<ServerInitializationModule> {
  const loadedModule = await import('./server-initialization-core.ts').catch(() => null);
  assert.ok(loadedModule, 'server initialization loader must exist');
  return loadedModule;
}

test('server initialization loader reads a valid API envelope without caching', async () => {
  const { loadServerInitializationStatus } = await loadModule();
  let requestedUrl = '';
  let requestedInit: RequestInit | undefined;

  const status = await loadServerInitializationStatus({
    internalApiUrl: 'http://api:8081/api/v1',
    fetchImpl: async (input, init) => {
      requestedUrl = String(input);
      requestedInit = init;
      return new Response(JSON.stringify({ data: { initialized: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.deepEqual(status, { initialized: true });
  assert.equal(requestedUrl, 'http://api:8081/api/v1/auth/initialization');
  assert.equal(requestedInit?.cache, 'no-store');
});

test('server initialization loader rejects transport and payload failures instead of returning false', async () => {
  const { loadServerInitializationStatus, ServerInitializationError } = await loadModule();

  await assert.rejects(
    loadServerInitializationStatus({
      internalApiUrl: 'http://api:8081/api/v1',
      fetchImpl: async () => new Response('unavailable', { status: 503 }),
    }),
    (error: unknown) => error instanceof ServerInitializationError && error.kind === 'http',
  );

  await assert.rejects(
    loadServerInitializationStatus({
      internalApiUrl: 'http://api:8081/api/v1',
      fetchImpl: async () =>
        new Response(JSON.stringify({ data: { initialized: 'yes' } }), { status: 200 }),
    }),
    (error: unknown) => error instanceof ServerInitializationError && error.kind === 'payload',
  );
});

test('server initialization loader requires INTERNAL_API_URL when no override is supplied', async () => {
  const { loadServerInitializationStatus, ServerInitializationError } = await loadModule();
  const previous = process.env.INTERNAL_API_URL;
  delete process.env.INTERNAL_API_URL;

  try {
    await assert.rejects(
      loadServerInitializationStatus({ fetchImpl: async () => new Response('{}') }),
      (error: unknown) =>
        error instanceof ServerInitializationError && error.kind === 'configuration',
    );
  } finally {
    if (previous === undefined) delete process.env.INTERNAL_API_URL;
    else process.env.INTERNAL_API_URL = previous;
  }
});
