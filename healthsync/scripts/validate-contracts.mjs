#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

function migrationEnum(relative, typeName) {
  const source = read(relative);
  const match = source.match(
    new RegExp(`CREATE TYPE ${typeName} AS ENUM \\(([\\s\\S]*?)\\);`),
  );
  expect(match, `${relative}: enum ${typeName} was not found`);
  return match ? [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
}

function expectEnum(relative, typeName, expected) {
  const actual = migrationEnum(relative, typeName);
  expect(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${relative}: ${typeName} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
  );
}

function expectText(relative, fragments) {
  const source = read(relative);
  for (const fragment of fragments) {
    expect(source.includes(fragment), `${relative}: missing contract fragment ${fragment}`);
  }
}

expectEnum('infra/db/migrations/V002__auth_schema.sql', 'user_role', [
  'PATIENT', 'DOCTOR', 'COMMAND_CENTER', 'PHARMACIST', 'AMBULANCE_DRIVER', 'ADMIN',
]);
expectEnum('infra/db/migrations/V004__consultation_schema.sql', 'consultation_status', [
  'PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED',
]);
expectEnum('infra/db/migrations/V005__prescription_pharmacy_schema.sql', 'prescription_status', [
  'ISSUED', 'SENT_TO_PHARMACY', 'CONFIRMED', 'PREPARING', 'READY',
  'DELIVERING', 'DELIVERED', 'CANCELLED',
]);
expectEnum('infra/db/migrations/V006__hospital_ambulance_referral_alert_schema.sql', 'referral_status', [
  'DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'IN_TRANSIT', 'ARRIVED', 'CANCELLED',
]);

expectText('docs/DATABASE.md', [
  'V012',
  'There is **no `scheduled_at` column**',
  'There are **no `drug_code`, `frequency`, `duration`, or `medicine_name` columns**',
  '`PUT /v1/notifications/read`',
  'SENT_TO_PHARMACY',
]);
expectText('docs/README.md', [
  '[`DATABASE.md`](DATABASE.md)',
  'one PostgreSQL schema currently shared',
]);

expectText('apps/admin/src/types/admin.ts', [
  "'SENT_TO_PHARMACY'",
  "'DELIVERING'",
  "'CRITICAL'",
]);
expectText('apps/command-center/src/hooks/useReferrals.ts', [
  "'SENT'",
  "'IN_TRANSIT'",
  "'CRITICAL'",
]);
expectText('apps/admin/src/components/NotificationBell.tsx', [
  'res.data?.data?.notifications',
  'notificationIds',
]);
expectText('apps/mobile/lib/features/dokter/screens/notifications_dokter_screen.dart', [
  "raw['notifications']",
  "'notificationIds': ids",
]);
expectText('services/prescription-service/src/index.ts', [
  'json_agg(item ORDER BY item.id)',
  'FROM prescription_items pi',
]);
expect(
  !read('services/prescription-service/src/index.ts').includes('pi.created_at'),
  'prescription_items has no created_at column',
);
expect(
  !read('services/hospital-service/src/index.ts').includes('hospital_beds\n           SET status      = $1,\n               patient_id  = $2,\n               admitted_at = CASE WHEN $1 = \'OCCUPIED\' THEN NOW() ELSE NULL END,\n               updated_at'),
  'hospital_beds has no updated_at column',
);

const patientBooking = read('apps/mobile/lib/screens/book_consultation_screen.dart');
expect(!patientBooking.includes('scheduled_at'), 'patient booking must not reference a non-existent scheduled_at column');
expect(!patientBooking.includes('Doctor ID'), 'patient booking must not require an ignored doctor ID field');

for (const file of [
  'apps/mobile/lib/core/providers/pharmacy_provider.dart',
  'apps/mobile/lib/core/providers/driver_provider.dart',
]) {
  expect(!read(file).includes("'PREPARED'"), `${file}: PREPARED is not a DB prescription status`);
}

if (failures.length > 0) {
  console.error('Contract validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Contract validation passed: FE, BE, DB, and docs are aligned for the checked contracts.');