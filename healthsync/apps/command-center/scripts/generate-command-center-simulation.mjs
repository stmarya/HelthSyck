#!/usr/bin/env node
/**
 * Deterministic Command Center simulation generator.
 *
 * Usage:
 *   node scripts/generate-command-center-simulation.mjs --once
 *   node scripts/generate-command-center-simulation.mjs --duration 120 --interval 1000 --seed 42
 *
 * Output is NDJSON: one event envelope per line. The output can be piped to a
 * WebSocket/SSE adapter, saved as a replay fixture, or consumed by a test.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultScenario = path.resolve(here, '../command-center-scenario.example.json');

function args(argv) {
  const out = { scenario: defaultScenario, duration: null, interval: null, seed: null, once: false };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--once') out.once = true;
    else if (key === '--scenario') out.scenario = path.resolve(argv[++i]);
    else if (key === '--duration') out.duration = Number(argv[++i]);
    else if (key === '--interval') out.interval = Number(argv[++i]);
    else if (key === '--seed') out.seed = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${key}`);
  }
  return out;
}

function rng(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(random, values) {
  return values[Math.floor(random() * values.length)];
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function move(random, location, delta = 0.0015) {
  return {
    lat: Number(clamp(location.lat + (random() - 0.5) * delta, -6.35, -6.10).toFixed(6)),
    lng: Number(clamp(location.lng + (random() - 0.5) * delta, 106.70, 106.95).toFixed(6)),
  };
}

function distanceKm(a, b) {
  const dLat = (b.lat - a.lat) * 111;
  const dLng = (b.lng - a.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

function readScenario(file) {
  const scenario = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (scenario.schemaVersion !== 1) throw new Error('Only schemaVersion 1 is supported');
  return structuredClone(scenario);
}

function createRuntime(scenario, random, seed) {
  const startAt = new Date(scenario.clock.startAt);
  const runtime = {
    scenario,
    random,
    seed,
    logicalMs: 0,
    seq: 0,
    emergencyTriggered: false,
    emergencyIndex: 0,
    emergencyCaseId: null,
    ambulanceReservation: null,
    doctors: structuredClone(scenario.doctors),
    patients: structuredClone(scenario.patients),
    ambulances: structuredClone(scenario.ambulances),
    drivers: structuredClone(scenario.drivers),
    hospitals: structuredClone(scenario.hospitals),
    startAt,
  };
  return runtime;
}

function emit(runtime, type, payload, correlationId = null, causationId = null) {
  runtime.seq += 1;
  const event = {
    id: `sim-${String(runtime.seq).padStart(6, '0')}`,
    sequence: runtime.seq,
    type,
    version: 1,
    occurredAt: new Date(runtime.startAt.getTime() + runtime.logicalMs).toISOString(),
    source: 'simulation',
    mode: 'SIMULATION',
    correlationId: correlationId ?? `tick-${runtime.logicalMs}`,
    ...(causationId ? { causationId } : {}),
    payload,
  };
  process.stdout.write(`${JSON.stringify(event)}\n`);
  return event;
}

function snapshot(runtime) {
  emit(runtime, 'simulation.snapshot', {
    seed: runtime.seed,
    doctors: runtime.doctors,
    patients: runtime.patients,
    ambulances: runtime.ambulances,
    drivers: runtime.drivers,
    hospitals: runtime.hospitals,
  });
}

function doctorTick(runtime) {
  const doctor = pick(runtime.random, runtime.doctors);
  const statuses = ['Available', 'In-Consultation', 'Offline'];
  doctor.status = pick(runtime.random, statuses);
  doctor.topic = doctor.status === 'In-Consultation' ? pick(runtime.random, ['Demam tinggi', 'Batuk berdahak', 'Nyeri dada']) : undefined;
  emit(runtime, 'doctor.status_changed', { doctor }, `doctor-${doctor.id}`);
  if (doctor.status === 'In-Consultation') {
    emit(runtime, 'teleconsultation.started', {
      sessionId: `consult-${runtime.seq + 1}`,
      doctorId: doctor.id,
      patientId: pick(runtime.random, runtime.patients).id,
      topic: doctor.topic,
      state: 'IN_PROGRESS',
    }, `doctor-${doctor.id}`);
  }
}

function logisticsTick(runtime) {
  const driver = pick(runtime.random, runtime.drivers);
  const patient = pick(runtime.random, runtime.patients);
  const orderId = `order-${String(runtime.seq + 1).padStart(5, '0')}`;
  driver.status = 'BUSY';
  driver.orderId = orderId;
  emit(runtime, 'logistics.order_created', {
    orderId,
    patientId: patient.id,
    pharmacyId: 'pharmacy-001',
    medicines: [pick(runtime.random, ['Paracetamol 500mg', 'Metformin 850mg', 'Amlodipine 5mg'])],
    status: 'ASSIGNED',
    driverId: driver.id,
  }, `order-${orderId}`);
}

function hospitalTick(runtime) {
  const hospital = pick(runtime.random, runtime.hospitals);
  for (const key of ['igd', 'icu', 'ward', 'or']) {
    const resource = hospital.resources[key];
    resource.available = clamp(resource.available + Math.floor(runtime.random() * 3) - 1, 0, resource.total);
  }
  emit(runtime, 'hospital.resources_changed', { hospitalId: hospital.id, resources: hospital.resources, bloodStock: hospital.bloodStock, connectivity: hospital.connectivity }, `hospital-${hospital.id}`);
}

function locationTick(runtime) {
  for (const entity of [...runtime.ambulances, ...runtime.drivers]) {
    entity.location = move(runtime.random, entity.location, entity.status === 'EN_ROUTE' ? 0.004 : 0.001);
    emit(runtime, 'location.updated', { entityType: entity.unit ? 'AMBULANCE' : 'DRIVER', entityId: entity.id, location: entity.location, accuracyM: Math.floor(8 + runtime.random() * 25) });
  }
}

function triggerEmergency(runtime) {
  if (!runtime.scenario.emergencyScenario.enabled || runtime.emergencyTriggered) return;
  const cfg = runtime.scenario.emergencyScenario;
  if (runtime.logicalMs < cfg.triggerAfterSeconds * 1000) return;
  const patient = runtime.patients.find((item) => item.id === cfg.patientId) ?? runtime.patients[0];
  runtime.emergencyTriggered = true;
  runtime.emergencyCaseId = `case-${patient.id}`;
  const vital = cfg.vitals[0];
  const event = emit(runtime, 'emergency.detected', { caseId: runtime.emergencyCaseId, patientId: patient.id, kind: cfg.kind, severity: 'CRITICAL', vitals: vital, location: patient.location, emergencyContact: patient.emergencyContact, state: 'CRITICAL_ALERT' }, runtime.emergencyCaseId);
  emit(runtime, 'emergency.alert_opened', { caseId: runtime.emergencyCaseId, slaSeconds: 120, actions: ['CALL_PATIENT', 'CALL_FAMILY', 'RECOMMEND_AMBULANCE'] }, runtime.emergencyCaseId, event.id);
}

function emergencyTick(runtime) {
  if (!runtime.emergencyCaseId) return;
  const cfg = runtime.scenario.emergencyScenario;
  const index = Math.min(runtime.emergencyIndex + 1, cfg.vitals.length - 1);
  if (index !== runtime.emergencyIndex) {
    runtime.emergencyIndex = index;
    emit(runtime, 'emergency.vitals_changed', { caseId: runtime.emergencyCaseId, vitals: cfg.vitals[index], severity: index === cfg.vitals.length - 1 ? 'CRITICAL' : 'HIGH' }, runtime.emergencyCaseId);
  }
  if (!runtime.ambulanceReservation && runtime.emergencyIndex >= 1) {
    const patient = runtime.patients.find((item) => item.id === cfg.patientId) ?? runtime.patients[0];
    const candidates = runtime.ambulances.filter((item) => item.status === 'STANDBY');
    const ambulance = [...(candidates.length ? candidates : runtime.ambulances)].sort((a, b) => distanceKm(a.location, patient.location) - distanceKm(b.location, patient.location))[0];
    runtime.ambulanceReservation = { reservationId: `reservation-${ambulance.id}`, ambulanceId: ambulance.id, etaMinutes: Math.max(4, Math.round(distanceKm(ambulance.location, patient.location) * 4)), expiresInSeconds: 30 };
    ambulance.status = 'EN_ROUTE';
    emit(runtime, 'emergency.dispatch_recommended', { caseId: runtime.emergencyCaseId, ...runtime.ambulanceReservation, reason: 'NEAREST_AVAILABLE_WITH_CAPABILITY' }, runtime.emergencyCaseId);
    emit(runtime, 'ambulance.status_changed', { ambulanceId: ambulance.id, status: ambulance.status, patientId: patient.id, etaMinutes: runtime.ambulanceReservation.etaMinutes }, runtime.emergencyCaseId);
  }
}

async function main() {
  const options = args(process.argv);
  const scenario = readScenario(options.scenario);
  const seed = options.seed ?? scenario.seed;
  const random = rng(seed);
  const runtime = createRuntime(scenario, random, seed);
  const interval = Math.max(100, options.interval ?? scenario.clock.tickMs);
  const duration = options.once ? 0 : Math.max(1, options.duration ?? scenario.clock.durationSeconds) * 1000;
  snapshot(runtime);
  if (options.once) {
    runtime.logicalMs = interval;
    locationTick(runtime);
    triggerEmergency(runtime);
    return;
  }
  while (runtime.logicalMs < duration) {
    runtime.logicalMs += interval;
    locationTick(runtime);
    if (runtime.logicalMs % 8000 === 0) doctorTick(runtime);
    if (runtime.logicalMs % 12000 === 0) logisticsTick(runtime);
    if (runtime.logicalMs % 10000 === 0) hospitalTick(runtime);
    triggerEmergency(runtime);
    if (runtime.logicalMs % 5000 === 0) emergencyTick(runtime);
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  emit(runtime, 'simulation.completed', { durationMs: duration, eventCount: runtime.seq, emergencyCaseId: runtime.emergencyCaseId });
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
