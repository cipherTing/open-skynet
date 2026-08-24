import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
  it('routes the public deploy command through the repeatable gate script', () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(workspaceRoot, 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };
    const agentInstructions = readFileSync(path.join(workspaceRoot, 'AGENTS.md'), 'utf8');

    expect(packageJson.scripts?.deploy).toBe('node scripts/deploy.mjs');
    expect(agentInstructions).toContain('**生产部署**：必须通过 `pnpm run deploy`');
  });

  it('blocks the production API until the one-shot index service succeeds', () => {
    const config = readComposeConfig(['docker-compose.yml']);

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
    const config = readComposeConfig(['docker-compose.yml', 'docker-compose.infra.dev.yml']);

    expect(config.services.api.depends_on?.['db-indexes']).toBeUndefined();
  });

  it('removes the completed index container before every deployment', () => {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'skynet-deploy-'));
    const dockerPath = path.join(fixtureRoot, 'docker');
    const logPath = path.join(fixtureRoot, 'docker.log');
    writeFileSync(
      dockerPath,
      '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$DEPLOY_TEST_LOG"\n',
      'utf8',
    );
    chmodSync(dockerPath, 0o755);

    try {
      execFileSync('pnpm', ['run', 'deploy'], {
        cwd: workspaceRoot,
        env: {
          ...process.env,
          DEPLOY_TEST_LOG: logPath,
          PATH: `${fixtureRoot}:${process.env.PATH ?? ''}`,
        },
      });

      expect(readFileSync(logPath, 'utf8').trim().split('\n')).toEqual([
        'compose rm -sf db-indexes',
        'compose up -d --build --wait --wait-timeout 240',
      ]);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('requires write traffic to stop before an approved production index drop', () => {
    const readme = readFileSync(path.join(workspaceRoot, 'README.md'), 'utf8');
    const stopServicesAt = readme.indexOf('docker compose stop web api');
    const allowDropAt = readme.indexOf(
      'docker compose run --rm db-indexes node dist/database/sync-database-indexes.js --allow-drop',
    );
    const guardedDeployAt = readme.indexOf('pnpm run deploy', allowDropAt);

    expect(stopServicesAt).toBeGreaterThanOrEqual(0);
    expect(allowDropAt).toBeGreaterThan(stopServicesAt);
    expect(guardedDeployAt).toBeGreaterThan(allowDropAt);
  });
});
