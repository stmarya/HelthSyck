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

const muted = { color: 'var(--color-muted)', fontSize: 11 } as const;
const ACTIVE_EMERGENCY = ['CRITICAL_ALERT', 'ACKNOWLEDGED', 'CONTACTING', 'DISPATCHING', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING', 'ARRIVED_AT_HOSPITAL', 'ESCALATED'];
type Resource = 'IGD' | 'ICU' | 'Inap' | 'Operasi';

function eventText(event: SimEvent): string { return simulationEngine.getEventDisplayText(event); }
function incidentIdFor(event: SimEvent): string | undefined {
  if (event.type === 'PATIENT_EMERGENCY' || event.type === 'EMERGENCY_UPDATED') return event.emergency.id;
  if (event.type === 'AMBULANCE_REQUEST') return event.caseId;
  return undefined;
}
function severityFor(event: SimEvent): NotificationItem['severity'] {
  if (event.type === 'PATIENT_EMERGENCY' || (event.type === 'EMERGENCY_UPDATED' && event.emergency.severity === 'CRITICAL')) return 'critical';
  if (event.type === 'AMBULANCE_REQUEST' || event.type === 'REFERRAL_REQUEST' || event.type === 'BLOOD_REQUEST') return 'warning';
  if (event.type === 'DOCTOR_STATUS' && event.status === 'Tersedia') return 'success';
  return 'info';
}
function cloneState(state: Readonly<SimState>): SimState { return { ...state, rumahSakit: state.rumahSakit.map((item) => ({ ...item, kapasitas: { IGD: { ...item.kapasitas.IGD }, ICU: { ...item.kapasitas.ICU }, Inap: { ...item.kapasitas.Inap }, Operasi: { ...item.kapasitas.Operasi } } })) }; }

export default function OperationalControlTower() {
  const [state, setState] = useState<SimState>(() => cloneState(simulationEngine.getState()));
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [timeline, setTimeline] = useState<IncidentTimelineEntry[]>([]);
  const [lastDataAt, setLastDataAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [notificationFilter, setNotificationFilter] = useState<'ALL' | NotificationItem['severity']>('ALL');
  const [selectedHospitalId, setSelectedHospitalId] = useState('');
  const [selectedResource, setSelectedResource] = useState<Resource>('IGD');
  const [reservationMessage, setReservationMessage] = useState('');
  const [showEmergencyDialog, setShowEmergencyDialog] = useState(true);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const unsubscribe = simulationEngine.on('*', (event) => {
      const eventAt = Date.now();
      setNow(eventAt);
      setLastDataAt(eventAt);
      setState(cloneState(simulationEngine.getState()));
      if (event.type === 'SIMULATION_RESET') { setNotifications([]); setTimeline([]); setReservationMessage(''); return; }
      const correlationId = incidentIdFor(event) ?? event.type;
      const item: NotificationItem = { id: `${eventAt}-${Math.random()}`, severity: severityFor(event), title: event.type.split('_').join(' '), body: eventText(event), createdAt: eventAt, correlationId, acknowledged: false };
      setNotifications((previous) => [item, ...previous].filter((entry, index, all) => index < 40 && all.findIndex((candidate) => candidate.correlationId === entry.correlationId && candidate.body === entry.body) === index));
      const incidentId = incidentIdFor(event);
      if (incidentId) setTimeline((previous) => [{ id: `${eventAt}-${Math.random()}`, incidentId, status: event.type === 'PATIENT_EMERGENCY' ? 'DETECTED' : event.type.replace('EMERGENCY_', '').replace('AMBULANCE_', ''), actor: 'simulation-engine', at: eventAt, note: eventText(event) }, ...previous].slice(0, 60));
      hospitalReservationService.expire(simulationEngine.getState());
    });
    return () => { window.clearInterval(timer); unsubscribe(); };
  }, []);

  const registry = useMemo(() => buildEntityIdentityRegistry(state), [state]);
  const predictions = useMemo(() => generatePredictiveSignals(state, now), [state, now]);
  const mapRuntime = getMapRuntimeConfig();
  const activeIncident = state.emergencies.find((item) => ACTIVE_EMERGENCY.includes(item.status));
  const freshness = makeFreshness(lastDataAt, simulationEngine.isRunning() ? 'simulation-live' : 'simulation-paused', 15_000, 1);
  const freshnessState = lastDataAt === 0 ? 'UNKNOWN' : freshnessLevel(freshness, now);
  const activeNotifications = notifications.filter((item) => !item.acknowledged);
  const visibleNotifications = notifications.filter((item) => notificationFilter === 'ALL' || item.severity === notificationFilter).slice(0, 6);
  const reservations = hospitalReservationService.list().filter((item) => item.status === 'HELD' || item.status === 'RESERVED');
  const selectedHospital = state.rumahSakit.find((item) => item.id === selectedHospitalId) ?? state.rumahSakit.find((item) => item.kapasitas.IGD.tersedia > 0);
  const emergencySeconds = activeIncident ? Math.max(0, Math.floor((now - activeIncident.openedAt) / 1000)) : 0;

  const acknowledgeNotification = (id: string) => setNotifications((previous) => previous.map((item) => item.id === id ? { ...item, acknowledged: true } : item));
  const acknowledgeIncident = () => { if (activeIncident) { simulationEngine.acknowledgeEmergency(activeIncident.id); setShowEmergencyDialog(false); } };
  const contactIncident = () => { if (activeIncident) simulationEngine.contactEmergency(activeIncident.id); };
  const reserveCapacity = () => {
    if (!activeIncident || !selectedHospital || !canExecute('COMMAND_CENTER', 'RESERVE_CAPACITY')) return;
    const reservation = hospitalReservationService.reserve(state, { hospitalId: selectedHospital.id, patientId: activeIncident.patientId, resource: selectedResource, ttlMs: 5 * 60_000 });
    setReservationMessage(reservation ? `${selectedResource} di-${selectedHospital.nama} di-hold sampai ${new Date(reservation.expiresAt).toLocaleTimeString('id-ID')}` : `Resource ${selectedResource} tidak tersedia atau sudah di-hold.`);
    setState(cloneState(simulationEngine.getState()));
  };

  return <section className={styles.controlTower} aria-label="Operational control tower">
    <div className={styles.controlTowerHeader}>
      <div><strong>Operational Control Tower</strong><div style={muted}>Command queue terpusat untuk notification, incident, capacity, dan freshness.</div></div>
      <div className={styles.controlTowerStatus} aria-live="polite"><span className={freshnessState === 'LIVE' ? styles.statusDotLive : styles.statusDotStale} />{freshnessState} · {registry.length} entitas · {mapRuntime.provider === 'simulator' ? 'SIMULATOR MAP' : `MAP ${mapRuntime.provider.toUpperCase()}`}</div>
    </div>

    {activeIncident && showEmergencyDialog && <div className={styles.emergencyDialog} role="alertdialog" aria-modal="false" aria-labelledby="emergency-dialog-title">
      <div><div id="emergency-dialog-title" className={styles.emergencyDialogTitle}>🚨 EMERGENCY ACTIVE</div><div className={styles.emergencyDialogBody}><b>{activeIncident.patientName}</b> · {activeIncident.condition} · HR {activeIncident.vitals.heartRate} · SpO₂ {activeIncident.vitals.spo2}% · SLA {emergencySeconds}s</div></div>
      <div className={styles.inlineActions}><button className={`${styles.btn} ${styles.btnDanger}`} onClick={acknowledgeIncident}>Acknowledge</button><button className={`${styles.btn} ${styles.btnSecondary}`} onClick={contactIncident}>Hubungi</button><button className={styles.iconButton} aria-label="Sembunyikan emergency alert" onClick={() => setShowEmergencyDialog(false)}>×</button></div>
    </div>}

    <div className={styles.controlTowerGrid}>
      <section className={styles.controlPanel} aria-labelledby="notification-title">
        <div className={styles.controlPanelHeader}><div><b id="notification-title">Notification Center</b><span className={styles.unreadCount}>{activeNotifications.length}</span></div><select value={notificationFilter} onChange={(event) => setNotificationFilter(event.target.value as typeof notificationFilter)} aria-label="Filter severity notification"><option value="ALL">Semua</option><option value="critical">Critical</option><option value="warning">Warning</option><option value="info">Info</option><option value="success">Success</option></select></div>
        <div className={styles.notificationList}>{visibleNotifications.map((item) => <div key={item.id} className={`${styles.notificationItem} ${item.severity === 'critical' ? styles.notificationCritical : ''}`}><div><b>{item.title}</b><div style={muted}>{item.body}</div><span style={muted}>{new Date(item.createdAt).toLocaleTimeString('id-ID')}</span></div>{!item.acknowledged && <button className={styles.smallButton} onClick={() => acknowledgeNotification(item.id)}>Tandai</button>}</div>)}{visibleNotifications.length === 0 && <div style={muted}>Tidak ada notification sesuai filter.</div>}</div>
      </section>

      <section className={styles.controlPanel} aria-labelledby="timeline-title">
        <div className={styles.controlPanelHeader}><b id="timeline-title">Incident Timeline</b><span style={muted}>{timeline.length} event</span></div>
        <div className={styles.timelineList}>{timeline.slice(0, 6).map((item) => <div key={item.id} className={styles.timelineItem}><span className={styles.timelineRail} /><div><b>{item.incidentId} · {item.status}</b><div style={muted}>{new Date(item.at).toLocaleTimeString('id-ID')} · {item.actor}</div><div style={muted}>{item.note}</div></div></div>)}{timeline.length === 0 && <div style={muted}>Timeline akan muncul ketika emergency dimulai.</div>}</div>
      </section>

      <section className={styles.controlPanel} aria-labelledby="capacity-title">
        <div className={styles.controlPanelHeader}><b id="capacity-title">Capacity & Predictive</b><span style={muted}>confidence</span></div>
        <div className={styles.predictiveList}>{predictions.slice(0, 3).map((signal) => <div key={signal.id} className={styles.predictiveItem}><b className={signal.severity === 'critical' ? styles.textDanger : styles.textWarning}>{signal.title}</b><div style={muted}>{signal.detail}</div><span style={muted}>{Math.round(signal.confidence * 100)}% confidence</span></div>)}{predictions.length === 0 && <div style={muted}>Belum ada risiko prediktif.</div>}</div>
        <div className={styles.reservationBox}><div style={muted}>Reservation aktif: {reservations.length}</div><div className={styles.reservationControls}><select value={selectedHospital?.id ?? ''} onChange={(event) => setSelectedHospitalId(event.target.value)} aria-label="Pilih rumah sakit untuk reservation">{state.rumahSakit.map((hospital) => <option key={hospital.id} value={hospital.id}>{hospital.nama}</option>)}</select><select value={selectedResource} onChange={(event) => setSelectedResource(event.target.value as Resource)} aria-label="Pilih resource rumah sakit"><option value="IGD">IGD</option><option value="ICU">ICU</option><option value="Inap">Rawat Inap</option><option value="Operasi">OR</option></select></div>{activeIncident && <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={reserveCapacity}>Hold resource 5 menit</button>}{reservationMessage && <div role="status" style={muted}>{reservationMessage}</div>}</div>
      </section>
    </div>
  </section>;
}
