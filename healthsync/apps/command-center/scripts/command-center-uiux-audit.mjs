import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (file) => readFile(new URL(file, root), 'utf8');
const commandCenter = await read('src/pages/CommandCenterPage.tsx');
const controlTower = await read('src/components/OperationalControlTower.tsx');
const communication = await read('src/components/CommunicationPanel.tsx');
const liveMap = await read('src/pages/LiveMapPage.tsx');
const css = await read('src/pages/Page.module.css');

assert.ok(commandCenter.indexOf('<OperationalControlTower />') < commandCenter.indexOf('gridTemplateColumns: \'minmax(260px'), 'Control Tower should be above the operational grid');
assert.match(commandCenter, /SIMULATOR MAP/);
assert.match(controlTower, /role="alertdialog"/);
assert.match(controlTower, /notificationFilter/);
assert.match(controlTower, /freshnessLevel/);
assert.match(controlTower, /reservationControls/);
assert.match(communication, /contact-search/);
assert.match(communication, /connection !== 'Terhubung'/);
assert.match(liveMap, /tabIndex=\{0\}/);
assert.match(liveMap, /onKeyDown/);
assert.match(liveMap, /SIMULATOR/);
for (const className of ['controlTowerGrid', 'communicationGrid', 'emergencyDialog', 'srOnly']) assert.match(css, new RegExp(`\\.${className}\\b`));
console.log('Command Center UI/UX audit passed: hierarchy, emergency, notification, freshness, responsive, communication, and map accessibility checks.');
