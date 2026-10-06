import type { SimState } from '../simulation/SimulationEngine';
import type { EntityIdentity, EntityKind, FreshnessLevel, FreshnessStamp } from './operationalContracts';

function add(list: EntityIdentity[], id: string, kind: EntityKind, label: string, capabilities: string[], facilityId?: string): void {
  list.push({ id, kind, label, capabilities, ...(facilityId ? { facilityId } : {}), source: 'simulation' });
}

export function buildEntityIdentityRegistry(state: Readonly<SimState>): EntityIdentity[] {
  const list: EntityIdentity[] = [];
  state.pasien.forEach((item) => add(list, item.id, 'PATIENT', item.nama, ['VIEW_PROFILE', 'CONTACT_FAMILY']));
  state.dokter.forEach((item) => add(list, item.id, 'DOCTOR', item.nama, ['CONSULTATION']));
  state.ambulans.forEach((item) => add(list, item.id, 'AMBULANCE', item.nomorUnit, ['GPS', 'DISPATCH']));
  state.driver.forEach((item) => add(list, item.id, 'DRIVER', item.nama, ['GPS', 'DELIVERY'], item.apotekId));
  state.rumahSakit.forEach((item) => add(list, item.id, 'HOSPITAL', item.nama, ['CAPACITY', 'REFERRAL', 'CHAT', 'CALL']));
  return list;
}

export function resolveEntity(registry: readonly EntityIdentity[], id: string): EntityIdentity | undefined {
  return registry.find((item) => item.id === id);
}

export function makeFreshness(updatedAt = Date.now(), source = 'simulation', staleAfterMs = 15_000, confidence = 1): FreshnessStamp {
  return { updatedAt, source, staleAfterMs, confidence: Math.min(1, Math.max(0, confidence)) };
}

export function freshnessLevel(stamp: FreshnessStamp | undefined, now = Date.now()): FreshnessLevel {
  if (!stamp || !Number.isFinite(stamp.updatedAt)) return 'UNKNOWN';
  return now - stamp.updatedAt <= stamp.staleAfterMs ? 'LIVE' : 'STALE';
}
