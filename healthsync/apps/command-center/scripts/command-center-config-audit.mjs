import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const envTemplate = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
const requiredEnv = [
  'VITE_MAP_PROVIDER',
  'VITE_MAP_STYLE_URL',
  'VITE_MAP_ACCESS_TOKEN',
  'VITE_ROUTING_URL',
  'VITE_LOCATION_STALE_AFTER_MS',
  'VITE_TURN_URL',
  'VITE_TURN_USERNAME',
  'VITE_TURN_CREDENTIAL',
];
for (const key of requiredEnv) assert.ok(envTemplate.includes(`${key}=`), `.env.example must document ${key}`);

const viteConfig = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8');
for (const route of ['/health/realtime', '/ws']) assert.ok(viteConfig.includes(route), `Vite proxy must include ${route}`);

const catalog = await readFile(new URL('../src/platform/integrationCatalog.ts', import.meta.url), 'utf8');
for (const contract of ['auth.v1', 'ambulance.v1', 'communication.v1', 'hospital-capacity.v1', 'pharmacy.v1']) {
  assert.ok(catalog.includes(contract), `Integration catalog must include ${contract}`);
}

console.log(`Command Center configuration audit passed for ${requiredEnv.length} environment keys`);
