import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('API production image release contract assets', () => {
  it('copies the catalog and root package manifest required by the runtime loader', () => {
    const dockerfile = readFileSync(
      resolve(__dirname, '../../../../docker/api.Dockerfile'),
      'utf8',
    );

    const devStage = dockerfile.slice(
      dockerfile.indexOf('FROM deps AS dev'),
      dockerfile.indexOf('FROM deps AS builder'),
    );
    const prodStage = dockerfile.match(/^FROM .* AS prod\n[\s\S]*$/mu)?.[0] ?? '';

    expect(devStage).toMatch(/COPY config\/ \.\/config\//u);
    expect(prodStage).toMatch(/COPY --chown=node:node package\.json \/app\/package\.json/u);
    expect(prodStage).toMatch(/COPY --chown=node:node config \/app\/config/u);
  });
});
