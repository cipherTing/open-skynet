import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

type WebPackage = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

test('Next 16.3.3 standalone production build uses the supported Webpack path', () => {
  const packageJson = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as WebPackage;

  assert.equal(packageJson.dependencies?.next, '16.3.3');
  assert.equal(packageJson.devDependencies?.['@next/eslint-plugin-next'], '16.3.3');
  assert.equal(packageJson.devDependencies?.['eslint-config-next'], '16.3.3');
  assert.equal(packageJson.scripts?.build, 'NODE_ENV=production next build --webpack');
  assert.equal(packageJson.scripts?.start, 'node .next/standalone/apps/web/server.js');
});

test('the application boundary owns the shared blocking Instant policy', () => {
  const applicationLayoutSource = readFileSync(
    new URL('../app/(application)/layout.tsx', import.meta.url),
    'utf8',
  );

  assert.match(applicationLayoutSource, /export const instant = false;/u);
});

test('the intentionally empty workspace route opts out of segment Instant validation', async () => {
  const sourceFile = ts.createSourceFile(
    'workspace/page.tsx',
    readFileSync(new URL('../app/(application)/workspace/page.tsx', import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const hasInstantOptOut = sourceFile.statements.some(
    (statement) =>
      ts.isVariableStatement(statement) &&
      statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ===
        true &&
      statement.declarationList.declarations.some(
        (declaration) =>
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === 'instant' &&
          declaration.initializer?.kind === ts.SyntaxKind.FalseKeyword,
      ),
  );

  assert.equal(hasInstantOptOut, true);
});

test('the dev server does not generate nested Agent instruction files', () => {
  const nextConfigSource = readFileSync(
    new URL('../../next.config.mjs', import.meta.url),
    'utf8',
  );

  assert.match(nextConfigSource, /agentRules:\s*false/u);
});
