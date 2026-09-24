import { useEffect, useMemo, useState } from 'react';
import { simulationEngine } from '../simulation/SimulationEngine';
import type { SimEvent, SimState } from '../simulation/SimulationEngine';
import { buildEntityIdentityRegistry, freshnessLevel, makeFreshness } from '../platform/operationalRegistry';
import type { IncidentTimelineEntry, NotificationItem } from '../platform/operationalContracts';
import { hospitalReservationService } from '../simulation/HospitalReservationService';
import { generatePredictiveSignals } from '../simulation/PredictiveSignals';
import { canExecute } from '../platform/accessPolicy';
import { getMapRuntimeConfig } from '../realtime/mapProvider';
import styles from '../pages/Page.module.css';

const panel = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 14 } as const;
const muted = { color: 'var(--color-muted)', fontSize: 11 } as const;

function eventText(event: SimEvent): string {
  return simulationEngine.getEventDisplayText(event);
}

function severityFor(event: SimEvent): NotificationItem['severity'] {
  if (event.type === 'PATIENT_EMERGENCY' || (event.type === 'EMERGENCY_UPDATED' && event.emergency.severity === 'CRITICAL')) return 'critical';
  if (event.type === 'AMBULANCE_REQUEST' || event.type === 'REFERRAL_REQUEST' || event.type === 'BLOOD_REQUEST') return 'warning';
  if (event.type === 'DOCTOR_STATUS' && event.status === 'Tersedia') return 'success';
  return 'info';
}

function incidentIdFor(event: SimEvent): string | undefined {
  if (event.type === 'PATIENT_EMERGENCY' || event.type === 'EMERGENCY_UPDATED') return event.emergency.id;
  if (event.type === 'AMBULANCE_REQUEST') return event.caseId;
  return undefined;
}

export default function OperationalControlTower() {
  const [state, setState] = useState<SimState>(() => ({ ...simulationEngine.getState() }));
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [timeline, setTimeline] = useState<IncidentTimelineEntry[]>([]);
  const [, setClock] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    const unsubscribe = simulationEngine.on('*', (event) => {
      setState({ ...simulationEngine.getState() });
      const correlationId = incidentIdFor(event) ?? event.type;
      const item: NotificationItem = { id: `${Date.now()}-${Math.random()}`, severity: severityFor(event), title: event.type.split('_').join(' '), body: eventText(event), createdAt: Date.now(), correlationId, acknowledged: false };
      setNotifications((previous) => [item, ...previous].filter((entry, index, all) => index < 30 && all.findIndex((candidate) => candidate.correlationId === entry.correlationId && candidate.body === entry.body) === index));
      const incidentId = incidentIdFor(event);
      if (incidentId) setTimeline((previous) => [{ id: `${Date.now()}-${Math.random()}`, incidentId, status: event.type === 'PATIENT_EMERGENCY' ? 'DETECTED' : event.type.replace('EMERGENCY_', '').replace('AMBULANCE_', ''), actor: 'simulation-engine', at: Date.now(), note: eventText(event) }, ...previous].slice(0, 40));
      hospitalReservationService.expire(simulationEngine.getState());
    });
    return () => { window.clearInterval(timer); unsubscribe(); };
  }, []);

  const registry = useMemo(() => buildEntityIdentityRegistry(state), [state]);
  const predictions = useMemo(() => generatePredictiveSignals(state), [state]);
  const freshness = makeFreshness(Date.now(), simulationEngine.isRunning() ? 'simulation-live' : 'simulation-paused', 15_000, 1);
  const activeIncident = state.emergencies.find((item) => !['RESOLVED', 'CANCELLED', 'ADMITTED'].includes(item.status));
  const reservations = hospitalReservationService.list().filter((item) => item.status === 'HELD' || item.status === 'RESERVED');
  const mapRuntime = getMapRuntimeConfig();
  const reserveFirstHospital = () => {
    if (!activeIncident || !canExecute('COMMAND_CENTER', 'RESERVE_CAPACITY')) return;
    const target = state.rumahSakit.find((item) => item.kapasitas.IGD.tersedia > 0);
    if (target) hospitalReservationService.reserve(state, { hospitalId: target.id, patientId: activeIncident.patientId, resource: 'IGD', ttlMs: 5 * 60_000 });
    setState({ ...simulationEngine.getState() });
  };

  return <section style={{ ...panel, marginTop: 14 }} aria-label="Operational control tower">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div><strong>Operational Control Tower</strong><div style={muted}>Registry, notification, incident timeline, reservation, freshness, dan predictive signals</div></div>
      <span style={{ color: freshnessLevel(freshness) === 'LIVE' ? 'var(--color-success)' : 'var(--color-warning)', fontSize: 11, fontWeight: 700 }}>{freshnessLevel(freshness)} · {registry.length} entitas · map {mapRuntime.provider}</span>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 12 }}>
      <div style={panel}><b>Notification Center</b>{notifications.slice(0, 4).map((item) => <div key={item.id} style={{ borderTop: '1px solid var(--color-border)', paddingTop: 7, marginTop: 7 }}><div style={{ color: item.severity === 'critical' ? 'var(--color-danger)' : 'var(--color-text)', fontSize: 11, fontWeight: 700 }}>{item.title}</div><div style={muted}>{item.body}</div></div>)}{notifications.length === 0 && <div style={{ ...muted, marginTop: 8 }}>Belum ada event.</div>}</div>
      <div style={panel}><b>Incident Timeline</b>{timeline.slice(0, 4).map((item) => <div key={item.id} style={{ borderTop: '1px solid var(--color-border)', paddingTop: 7, marginTop: 7 }}><div style={{ fontSize: 11, fontWeight: 700 }}>{item.incidentId} · {item.status}</div><div style={muted}>{new Date(item.at).toLocaleTimeString('id-ID')} · {item.actor}</div></div>)}{timeline.length === 0 && <div style={{ ...muted, marginTop: 8 }}>Timeline akan terisi ketika emergency dipicu.</div>}</div>
      <div style={panel}><b>Capacity & Predictive</b>{predictions.slice(0, 3).map((signal) => <div key={signal.id} style={{ borderTop: '1px solid var(--color-border)', paddingTop: 7, marginTop: 7 }}><div style={{ color: signal.severity === 'critical' ? 'var(--color-danger)' : 'var(--color-warning)', fontSize: 11, fontWeight: 700 }}>{signal.title}</div><div style={muted}>{signal.detail} · confidence {Math.round(signal.confidence * 100)}%</div></div>)}<div style={{ ...muted, marginTop: 8 }}>Reservation aktif: {reservations.length}</div>{activeIncident && <button className={`${styles.btn} ${styles.btnSecondary}`} style={{ marginTop: 8, fontSize: 10 }} onClick={reserveFirstHospital}>Hold IGD untuk emergency</button>}</div>
    </div>
  </section>;
}
