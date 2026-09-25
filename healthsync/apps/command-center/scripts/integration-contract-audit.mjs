import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('contracts/app-compatibility.v1.json', root), 'utf8'));
assert.equal(manifest.version, 1);
assert.deepEqual(manifest.apps, ['admin', 'command-center', 'mobile-patient', 'mobile-pharmacy', 'mobile-driver', 'mobile-ambulance']);
assert.ok(manifest.sharedContracts.length >= 6);
assert.deepEqual(manifest.requiredChannels, ['api', 'realtime', 'audit']);
const app = await readFile(new URL('src/App.tsx', root), 'utf8');
const page = await readFile(new URL('src/pages/IntegrationHealthPage.tsx', root), 'utf8');
assert.match(app, /command-center\/integrations/);
assert.match(page, /Integration Health/);
console.log(`Cross-app compatibility audit passed for ${manifest.apps.length} apps and ${manifest.sharedContracts.length} contracts.`);
