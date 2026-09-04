import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('application shell keeps workspace and route content in React Activity boundaries', () => {
  const source = readFileSync(
    new URL('../components/system/ApplicationShell.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /<Activity\s+mode=/u);
  assert.match(source, /HomeShell/u);
  assert.match(source, /children/u);
  assert.doesNotMatch(source, /invisible\s+h-full/u);
  assert.doesNotMatch(source, /absolute\s+inset-0/u);
});

test('application layout owns the shared Instant blocking policy', () => {
  const source = readFileSync(new URL('../app/(application)/layout.tsx', import.meta.url), 'utf8');

  assert.match(source, /export const instant = false;/u);
  assert.doesNotMatch(source, /InitializationGate/u);
  assert.match(source, /ApplicationShell/u);
});

test('workspace shell does not read the wall clock during server render', () => {
  const source = readFileSync(new URL('../components/home/HomeShell.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /useState\(\(\) => Date\.now\(\)\)/u);
  assert.match(source, /window\.setTimeout\(\(\) => \{/u);
});

test('agent profile uptime derives its clock after browser mount', () => {
  const source = readFileSync(
    new URL('../components/agent/AgentHero.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /useClockNow/u);
  assert.doesNotMatch(source, /const now = new Date\(\)/u);
});

test('landing page exposes the product release version instead of the prototype protocol label', () => {
  const heroSource = readFileSync(
    new URL('../components/home/terminal/HeroSection.tsx', import.meta.url),
    'utf8',
  );
  const footerSource = readFileSync(
    new URL('../components/home/terminal/TerminalFooter.tsx', import.meta.url),
    'utf8',
  );
  const landingSource = readFileSync(
    new URL('../components/home/terminal/TerminalLanding.tsx', import.meta.url),
    'utf8',
  );
  const resources = readFileSync(new URL('../i18n/resources.ts', import.meta.url), 'utf8');

  assert.match(landingSource, /PRODUCT_VERSION/u);
  assert.match(landingSource, /productVersion=\{PRODUCT_VERSION\}/u);
  assert.match(heroSource, /productVersion/u);
  assert.match(footerSource, /productVersion/u);
  assert.doesNotMatch(resources, /PROTOCOL V0\.9 \/\/ PROTOTYPE/u);
});

test('settings page exposes a switchable About tab with project metadata', () => {
  const source = readFileSync(
    new URL('../app/(application)/settings/SettingsPageClient.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /activeTab/u);
  assert.match(source, /settingsSys\.aboutTab/u);
  assert.match(source, /settingsSys\.about/u);
  assert.match(source, /ProjectGithubLink/u);
  assert.match(source, /github\.com\/cipherTing/u);
  assert.match(source, /hidden=\{activeTab !== 'settings'\}/u);
  assert.match(source, /hidden=\{activeTab !== 'about'\}/u);
});

test('brand entrypoints use the original brand assets', () => {
  const layoutSource = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
  const sidebarSource = readFileSync(
    new URL('../components/layout/Sidebar.tsx', import.meta.url),
    'utf8',
  );
  const heroSource = readFileSync(
    new URL('../components/home/terminal/HeroSection.tsx', import.meta.url),
    'utf8',
  );

  assert.match(layoutSource, /\/brand\/logo\.png/u);
  assert.match(sidebarSource, /\/brand\/logo\.png/u);
  assert.match(heroSource, /\/brand\/logo_title\.png/u);
  assert.doesNotMatch(layoutSource, /\/brand\/skynet-favicon-v2\.png/u);
  assert.doesNotMatch(sidebarSource, /\/brand\/skynet-logo-v2\.png/u);
  assert.doesNotMatch(heroSource, /\/brand\/skynet-logo-title-v2\.png/u);
});
