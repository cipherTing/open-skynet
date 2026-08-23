import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('request context bootstrap', () => {
  const mainSource = readFileSync(resolve(__dirname, '../../main.ts'), 'utf8');

  it('registers the request middleware before body parsing and direct MCP routes', () => {
    const middlewareRegistration = mainSource.indexOf(
      'expressApp.use(loggerMiddleware.use.bind(loggerMiddleware))',
    );
    const bodyParserRegistration = mainSource.indexOf("app.use(json({ limit: '256kb' }))");
    const mcpRegistration = mainSource.indexOf('registerMcpHttpRoute(');

    expect(middlewareRegistration).toBeGreaterThan(-1);
    expect(mcpRegistration).toBeGreaterThan(-1);
    expect(middlewareRegistration).toBeLessThan(bodyParserRegistration);
    expect(middlewareRegistration).toBeLessThan(mcpRegistration);
    expect(mcpRegistration).toBeLessThan(bodyParserRegistration);
  });

  it('exposes the server generated request id to browser clients', () => {
    expect(mainSource).toContain(
      "exposedHeaders: ['Content-Language', 'Mcp-Session-Id', REQUEST_ID_HEADER]",
    );
  });
});
