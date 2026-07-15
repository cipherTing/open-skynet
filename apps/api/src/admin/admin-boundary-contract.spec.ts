import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve } from 'path';

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name);
    return statSync(path).isDirectory() ? listSourceFiles(path) : [path];
  });
}

describe('administrator client boundary', () => {
  it('keeps administrator API imports inside administrator-only Web files', () => {
    const webSource = resolve(__dirname, '../../../web/src');
    const violations = listSourceFiles(webSource)
      .filter((path) => /\.(?:ts|tsx)$/u.test(path))
      .filter((path) => readFileSync(path, 'utf8').includes("@/lib/admin-api"))
      .filter((path) => !path.includes('/components/admin/'))
      .filter((path) => !path.includes('/app/admin/'))
      .filter((path) => !path.endsWith('/lib/admin-api.ts'));

    expect(violations).toEqual([]);
  });
});
