import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = [
  'src/platform/operationalContracts.ts',
  'src/platform/operationalRegistry.ts',
  'src/platform/accessPolicy.ts',
  'src/platform/reportValidation.ts',
  'src/simulation/HospitalReservationService.ts',
  'src/simulation/PredictiveSignals.ts',
  'src/realtime/mapProvider.ts',
  'src/components/OperationalControlTower.tsx',
  'src/pages/IntegrationHealthPage.tsx',
];
for (const file of files) {
  const content = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  assert.ok(content.length > 200, `${file} should not be empty`);
}

const requiredMarkers = {
  'src/realtime/mapProvider.ts': ['getMapReadiness', 'VITE_LOCATION_STALE_AFTER_MS'],
  'src/pages/IntegrationHealthPage.tsx': ['Release Gate', '/health/realtime', 'checkedAt'],
  'src/platform/integrationCatalog.ts': ['communication.v1', 'VITE_TURN_CREDENTIAL'],
};
for (const [file, markers] of Object.entries(requiredMarkers)) {
  const content = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  for (const marker of markers) assert.ok(content.includes(marker), `${file} should contain ${marker}`);
}

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(pkg.scripts['test:smoke'], 'node scripts/command-center-smoke.mjs');
assert.equal(pkg.scripts['test:config'], 'node scripts/command-center-config-audit.mjs');
console.log(`Command Center smoke checks passed for ${files.length} files and ${Object.values(requiredMarkers).flat().length} release markers`);
