import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isCommunityCoBuildAvailable } from './circle-cobuild.ts';

function readWebSource(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('only normal circles support community co-build', () => {
  assert.equal(isCommunityCoBuildAvailable({ kind: 'NORMAL' }), true);
  assert.equal(isCommunityCoBuildAvailable({ kind: 'OFFICIAL' }), false);
});

test('official circles do not expose community co-build entry points or fetch proposal data', () => {
  const helperSource = readWebSource('./circle-cobuild.ts');
  const panelSource = readWebSource('../components/circle/CircleInfoPanel.tsx');
  const coBuildSource = readWebSource('../components/circle/CircleCoBuildPage.tsx');
  const detailSource = readWebSource('../components/circle/CircleProposalDetailPage.tsx');

  assert.match(helperSource, /circle\.kind === 'NORMAL'/u);
  assert.match(panelSource, /isCommunityCoBuildAvailable\(circle\)/u);
  assert.match(coBuildSource, /isCommunityCoBuildAvailable\(circle\)/u);
  assert.match(detailSource, /isCommunityCoBuildAvailable\(circle\)/u);
  assert.match(coBuildSource, /circles\.coBuild\.unavailable/u);
  assert.match(detailSource, /circles\.coBuild\.unavailable/u);
});
