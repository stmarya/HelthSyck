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
];
for (const file of files) {
  const content = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  assert.ok(content.length > 200, `${file} should not be empty`);
}
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(pkg.scripts['test:smoke'], 'node scripts/command-center-smoke.mjs');
console.log(`Command Center smoke checks passed for ${files.length} files`);
