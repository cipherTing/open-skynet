import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

type ComposeDependency = { condition?: string };
type ComposeService = {
  command?: string[];
  depends_on?: Record<string, ComposeDependency>;
  healthcheck?: { test?: string[] };
  restart?: string;
};
type ComposeConfig = { services: Record<string, ComposeService> };

const workspaceRoot = path.resolve(__dirname, '../../../..');

function readComposeConfig(files: string[]): ComposeConfig {
  const args = [
    'compose',
    '--env-file',
    '.env.example',
    ...files.flatMap((file) => ['-f', file]),
    'config',
    '--format',
    'json',
  ];
  return JSON.parse(
    execFileSync('docker', args, { cwd: workspaceRoot, encoding: 'utf8' }),
  ) as ComposeConfig;
}

describe('production database index gate', () => {
  it('uses standard Compose as the public deployment entrypoint', () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(workspaceRoot, 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };
    const agentInstructions = readFileSync(path.join(workspaceRoot, 'AGENTS.md'), 'utf8');

    expect(packageJson.scripts?.deploy).toBeUndefined();
    expect(existsSync(path.join(workspaceRoot, 'scripts/deploy.mjs'))).toBe(false);
    expect(agentInstructions).toContain(
      '**生产部署**：必须先从 `compose.yaml.example` 复制本地 `compose.yaml`，再复制并填写 `.env`，然后通过 `docker compose up -d` 启动全量服务',
    );
  });

  it('runs database migrations before the API and Web start', () => {
    const config = readComposeConfig(['compose.yaml.example']);

    expect(config.services['db-indexes']).toEqual(
      expect.objectContaining({
        restart: 'no',
        command: ['node', 'dist/database/sync-database-indexes.js'],
      }),
    );
    expect(config.services['db-indexes'].depends_on?.api).toBeUndefined();
    expect(config.services['db-indexes'].depends_on?.['mongo-init']).toEqual({
      condition: 'service_completed_successfully',
      required: true,
    });
    expect(config.services.api.depends_on?.['db-indexes']).toEqual({
      condition: 'service_completed_successfully',
      required: true,
    });
    expect(config.services.api.healthcheck?.test).toEqual(
      expect.arrayContaining([expect.stringContaining('/api/v1/health/ready')]),
    );
    expect(config.services.web.depends_on?.['db-indexes']).toBeUndefined();
  });

  it('keeps the local development API independent from the production index service', () => {
    const config = readComposeConfig(['compose.yaml.example', 'compose.dev.yaml']);

    expect(config.services.api.depends_on?.['db-indexes']).toBeUndefined();
  });

});
