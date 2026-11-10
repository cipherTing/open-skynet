import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('request context bootstrap', () => {
  const mainSource = readFileSync(resolve(__dirname, '../../main.ts'), 'utf8');

  it('registers the request middleware before body parsing', () => {
    const middlewareRegistration = mainSource.indexOf(
      'expressApp.use(loggerMiddleware.use.bind(loggerMiddleware))',
    );
    const bodyParserRegistration = mainSource.indexOf('registerRequestBodyParsers(app)');
    expect(middlewareRegistration).toBeGreaterThan(-1);
    expect(middlewareRegistration).toBeLessThan(bodyParserRegistration);
  });

  it('exposes the server generated request id to browser clients', () => {
    expect(mainSource).toContain("exposedHeaders: ['Content-Language', REQUEST_ID_HEADER]");
  });
});
