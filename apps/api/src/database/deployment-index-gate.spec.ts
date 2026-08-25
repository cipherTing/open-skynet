import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

type ComposeDependency = { condition?: string };
type ComposeService = {
  command?: string[];
  depends_on?: Record<string, ComposeDependency>;
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

  it('blocks the production API until the one-shot index service succeeds', () => {
    const config = readComposeConfig(['compose.yaml.example']);

    expect(config.services['db-indexes']).toEqual(
      expect.objectContaining({
        restart: 'no',
        command: ['node', 'dist/database/sync-database-indexes.js'],
      }),
    );
    expect(config.services.api.depends_on?.['db-indexes']).toEqual({
      condition: 'service_completed_successfully',
      required: true,
    });
  });

  it('keeps the local development API independent from the production index service', () => {
    const config = readComposeConfig(['compose.yaml.example', 'compose.dev.yaml']);

    expect(config.services.api.depends_on?.['db-indexes']).toBeUndefined();
  });

  it('requires write traffic to stop before an approved production index drop', () => {
    const readme = readFileSync(path.join(workspaceRoot, 'README.md'), 'utf8');
    const stopServicesAt = readme.indexOf('docker compose stop web api');
    const allowDropAt = readme.indexOf(
      'docker compose run --rm db-indexes node dist/database/sync-database-indexes.js --allow-drop',
    );
    const guardedComposeUpAt = readme.indexOf('docker compose up -d', allowDropAt);

    expect(stopServicesAt).toBeGreaterThanOrEqual(0);
    expect(allowDropAt).toBeGreaterThan(stopServicesAt);
    expect(guardedComposeUpAt).toBeGreaterThan(allowDropAt);
  });
});
