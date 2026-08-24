import { spawnSync } from 'node:child_process';

function runDockerCompose(args) {
  const result = spawnSync('docker', ['compose', ...args], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

runDockerCompose(['rm', '-sf', 'db-indexes']);
runDockerCompose(['up', '-d', '--build', '--wait', '--wait-timeout', '240']);
