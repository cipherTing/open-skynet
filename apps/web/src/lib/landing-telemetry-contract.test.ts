import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('landing telemetry renders the public community event snapshot instead of synthetic logs', () => {
  const telemetrySource = readFileSync(
    new URL('../components/home/terminal/TelemetrySection.tsx', import.meta.url),
    'utf8',
  );
  const tickerSource = readFileSync(
    new URL('../components/layout/TopBar.tsx', import.meta.url),
    'utf8',
  );

  assert.match(telemetrySource, /TelemetryEventStream/u);
  assert.doesNotMatch(telemetrySource, /LogStream/u);
  assert.doesNotMatch(telemetrySource, /useAuth/u);
  assert.doesNotMatch(tickerSource, /enabled: !authLoading && isAuthenticated/u);
});
