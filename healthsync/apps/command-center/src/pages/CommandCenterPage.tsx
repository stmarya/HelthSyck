// CommandCenterPage.tsx — operational war-room untuk simulator HealthSync.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { simulationEngine } from '../simulation/SimulationEngine';
import type { EmergencyCase, SimEvent, SimState } from '../simulation/SimulationEngine';
import { useToast } from '../context/ToastContext';
import CommunicationPanel, { type CommunicationContact } from '../components/CommunicationPanel';
import OperationalControlTower from '../components/OperationalControlTower';
import { SEED_APOTEK } from '../simulation/SimulationData';
import styles from './Page.module.css';

type FeedItem = { id: string; text: string; level: 'info' | 'warning' | 'danger' | 'success'; at: Date };

const panelStyle: CSSProperties = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 16, boxShadow: '0 8px 24px rgba(7,4,12,.12)' };
const muted: CSSProperties = { color: 'var(--color-muted)', fontSize: 12 };

function cloneView(state: Readonly<SimState>): SimState {
  return {
    ...state,
    dokter: state.dokter.map((item) => ({ ...item })),
    pasien: state.pasien.map((item) => ({ ...item, koordinat: { ...item.koordinat } })),
    ambulans: state.ambulans.map((item) => ({ ...item, koordinat: { ...item.koordinat } })),
    driver: state.driver.map((item) => ({ ...item, koordinat: { ...item.koordinat } })),
    rumahSakit: state.rumahSakit.map((item) => ({ ...item, kapasitas: { IGD: { ...item.kapasitas.IGD }, ICU: { ...item.kapasitas.ICU }, Inap: { ...item.kapasitas.Inap }, Operasi: { ...item.kapasitas.Operasi } }, stokDarah: { ...item.stokDarah }, dokterJaga: item.dokterJaga.map((doctor) => ({ ...doctor })) })),
    teleconsultations: state.teleconsultations.map((item) => ({ ...item })),
    orders: state.orders.map((item) => ({ ...item, medicines: [...item.medicines] })),
    emergencies: state.emergencies.map((item) => ({ ...item, location: { ...item.location }, vitals: { ...item.vitals } })),
    bloodRequests: state.bloodRequests.map((item) => ({ ...item })),
    referrals: state.referrals.map((item) => ({ ...item })),
  };
}

function StatusPill({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'success' | 'warning' | 'danger' }) {
  const colors = { info: ['var(--color-info-bg)', 'var(--color-info)', 'var(--color-info-border)'], success: ['var(--color-success-bg)', 'var(--color-success)', 'var(--color-success-border)'], warning: ['var(--color-warning-bg)', 'var(--color-warning)', 'var(--color-warning-border)'], danger: ['var(--color-danger-bg)', 'var(--color-danger)', 'var(--color-danger-border)'] } as const;
  const [background, color, border] = colors[tone];
  return <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '3px 8px', fontSize: 10, fontWeight: 700, background, color, border: `1px solid ${border}` }}>{children}</span>;
}

function toneForEmergency(status: EmergencyCase['status']): 'danger' | 'warning' | 'success' | 'info' {
  if (['CRITICAL_ALERT', 'ESCALATED'].includes(status)) return 'danger';
  if (['DISPATCHING', 'EN_ROUTE', 'TRANSPORTING'].includes(status)) return 'warning';
  if (['ADMITTED', 'RESOLVED'].includes(status)) return 'success';
  return 'info';
}

export default function CommandCenterPage() {
  const toast = useToast();
  const [state, setState] = useState<SimState>(() => cloneView(simulationEngine.getState()));
  const [running, setRunning] = useState(simulationEngine.isRunning());
  const [speed, setSpeed] = useState(simulationEngine.getSpeed());
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);

  const refresh = useCallback(() => setState(cloneView(simulationEngine.getState())), []);

  useEffect(() => {
    const unsubscribe = simulationEngine.on('*', (event: SimEvent) => {
      refresh();
      if (event.type === 'LOCATION_UPDATE') return;
      const level = simulationEngine.getEventLevel(event);
      setFeed((previous) => [...previous, { id: `${Date.now()}-${previous.length}`, text: simulationEngine.getEventDisplayText(event), level, at: new Date() }].slice(-100));
      if (event.type === 'PATIENT_EMERGENCY') {
        setSelectedCaseId(event.emergency.id);
        toast.error(`${event.emergency.patientName}: ${event.emergency.condition}`, '🚨 Emergency Alert');
      }
    });
    return unsubscribe;
  }, [refresh, toast]);

  const selectedCase = state.emergencies.find((item) => item.id === selectedCaseId) ?? state.emergencies[0] ?? null;
  const criticalCount = state.emergencies.filter((item) => ['CRITICAL_ALERT', 'ESCALATED'].includes(item.status)).length;
  const availableAmbulances = state.ambulans.filter((item) => item.status === 'Tersedia').length;
  const activeConsultations = state.teleconsultations.filter((item) => item.status === 'IN_PROGRESS').length;
  const activeOrders = state.orders.filter((item) => !['DELIVERED', 'FAILED'].includes(item.status)).length;
  const openReferrals = state.referrals.filter((item) => ['REQUESTED', 'ACCEPTED'].includes(item.status)).length;

  const toggleSimulation = useCallback(() => {
    if (simulationEngine.isRunning()) { simulationEngine.stop(); setRunning(false); toast.info('Simulasi dijeda', 'Simulation Control'); }
    else { simulationEngine.start(); setRunning(true); toast.success('Simulasi berjalan', 'Simulation Control'); }
  }, [toast]);

  const changeSpeed = useCallback((value: number) => { simulationEngine.setSpeed(value); setSpeed(value); }, []);
  const resetSimulation = useCallback(() => { simulationEngine.reset(); setRunning(false); refresh(); setFeed([]); setSelectedCaseId(null); toast.info('Data simulator dikembalikan ke seed awal', 'Reset Simulator'); }, [refresh, toast]);

  const acknowledge = useCallback(() => {
    if (!selectedCase) return;
    simulationEngine.acknowledgeEmergency(selectedCase.id);
    toast.info('Emergency di-acknowledge dan masuk queue response', 'Emergency Workflow');
    refresh();
  }, [refresh, selectedCase, toast]);

  const contact = useCallback((target: 'patient' | 'family') => {
    if (!selectedCase) return;
    simulationEngine.contactEmergency(selectedCase.id);
    toast.info(`Membuka kanal kontak ${target === 'patient' ? 'pasien' : 'keluarga'}: ${target === 'patient' ? selectedCase.patientName : selectedCase.contactFamily}`, 'One-Click Contact');
    refresh();
  }, [refresh, selectedCase, toast]);

  const dispatch = useCallback(() => {
    if (!selectedCase) return;
    const result = simulationEngine.dispatchNearestAmbulance(selectedCase.id);
    if (!result?.ambulanceId) toast.error('Tidak ada ambulans yang dapat di-reserve', 'Dispatch Gagal');
    else toast.success(`Ambulans ${result.ambulanceId} di-reserve untuk ${result.patientName}`, 'Auto-Dispatch Berhasil');
    refresh();
  }, [refresh, selectedCase, toast]);

  const requestReferral = useCallback((hospitalId: string) => {
    const patient = selectedCase?.patientId ?? state.pasien[0]?.id;
    if (!patient) return;
    const result = simulationEngine.requestReferral(patient, hospitalId, 'IGD', selectedCase ? 'Emergency handover' : 'Kebutuhan rujukan operasional');
    if (result) toast.success(`Rujukan ${result.id} dibuat ke ${result.toHospitalName}`, 'Rujukan Berhasil');
    refresh();
  }, [refresh, selectedCase, state.pasien, toast]);

  const communicationContacts: CommunicationContact[] = [
    ...state.rumahSakit.map((item) => ({ id: item.id, label: item.nama, kind: 'HOSPITAL' as const, status: item.statusKoneksi })),
    ...SEED_APOTEK.map((item) => ({ id: item.id, label: item.nama, kind: 'PHARMACY' as const })),
    ...state.dokter.map((item) => ({ id: item.id, label: item.nama, kind: 'DOCTOR' as const, status: item.status })),
    ...state.driver.map((item) => ({ id: item.id, label: item.nama, kind: 'DRIVER' as const, status: item.status })),
    ...state.ambulans.map((item) => ({ id: item.id, label: item.nomorUnit, kind: 'AMBULANCE' as const, status: item.status })),
  ];

  const topFeed = useMemo(() => [...feed].reverse().slice(0, 12), [feed]);

  return (
    <div className={styles.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 25, fontWeight: 800 }}>Command Center</h1>
            <StatusPill tone="warning">SIMULATION</StatusPill>
            {running && <StatusPill tone="success">LIVE ENGINE</StatusPill>}
          </div>
          <p style={{ ...muted, margin: '5px 0 0' }}>Operational war-room · seed {state.seed} · {state.elapsedSeconds}s elapsed</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ ...muted, display: 'flex', alignItems: 'center', gap: 6 }}>Speed
            <select value={speed} onChange={(event) => changeSpeed(Number(event.target.value))} style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '6px 8px' }}>
              {[0.5, 1, 2, 4].map((value) => <option key={value} value={value}>{value}x</option>)}
            </select>
          </label>
          <button className={`${styles.btn} ${running ? styles.btnSecondary : styles.btnPrimary}`} onClick={toggleSimulation}>{running ? '⏸ Jeda' : '▶ Mulai'}</button>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={resetSimulation}>↺ Reset</button>
        </div>
      </div>

      <div className={styles.statGrid} style={{ marginBottom: 16 }}>
        {[
          ['Emergency Aktif', criticalCount, 'var(--color-danger)', '🚨'],
          ['Ambulans Standby', availableAmbulances, 'var(--color-success)', '🚑'],
          ['Telekonsultasi', activeConsultations, 'var(--color-primary)', '🩺'],
          ['Order / Rujukan', `${activeOrders} / ${openReferrals}`, 'var(--color-warning)', '📦'],
        ].map(([label, value, color, icon]) => <div key={String(label)} className={styles.statCard} style={{ borderLeft: `3px solid ${color}` }}><span style={{ fontSize: 22 }}>{icon}</span><div><div className={styles.statValue} style={{ fontSize: 24 }}>{value}</div><div className={styles.statLabel}>{label}</div></div></div>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, .85fr) minmax(360px, 1.5fr) minmax(280px, .95fr)', gap: 14, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 14 }}>
          <section style={panelStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}><strong>Emergency Queue</strong><StatusPill tone={criticalCount ? 'danger' : 'success'}>{criticalCount} kritis</StatusPill></div>
            {state.emergencies.length === 0 && <div style={muted}>Belum ada emergency. Jalankan simulasi untuk memicu skenario.</div>}
            {state.emergencies.slice(0, 8).map((item) => <button key={item.id} onClick={() => setSelectedCaseId(item.id)} style={{ width: '100%', display: 'flex', textAlign: 'left', alignItems: 'center', gap: 8, padding: '10px 0', border: 0, borderTop: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text)', cursor: 'pointer' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: item.status === 'ADMITTED' ? 'var(--color-success)' : 'var(--color-danger)' }} /><span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontSize: 12 }}>{item.patientName}</b><span style={muted}>{item.condition}</span></span><StatusPill tone={toneForEmergency(item.status)}>{item.status}</StatusPill></button>)}
          </section>
          <section style={panelStyle}><strong>Telekonsultasi Aktif</strong>{state.teleconsultations.slice(0, 5).map((item) => <div key={item.id} style={{ padding: '10px 0', borderTop: '1px solid var(--color-border)', marginTop: 8 }}><b style={{ fontSize: 12 }}>{item.doctorName}</b><div style={muted}>{item.patientName} · {item.topic}</div><StatusPill tone="info">{item.status}</StatusPill></div>)}</section>
          <section style={panelStyle}><strong>Live Order Logistik</strong>{state.orders.slice(0, 5).map((item) => <div key={item.id} style={{ padding: '10px 0', borderTop: '1px solid var(--color-border)', marginTop: 8 }}><b style={{ fontSize: 12 }}>{item.patientName}</b><div style={muted}>{item.medicines.join(', ')}</div><StatusPill tone={item.status === 'IN_TRANSIT' ? 'warning' : 'info'}>{item.status}</StatusPill></div>)}</section>
        </div>

        <section style={{ ...panelStyle, minHeight: 620, background: 'linear-gradient(160deg, #211b2a, #19151f)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, color: '#fff7f3' }}><div><strong>Operational Map</strong><div style={{ color: '#b2a4b1', fontSize: 11 }}>Jakarta simulation projection · {state.ambulans.length + state.driver.length + state.pasien.length} moving entities</div></div><StatusPill tone="success">● GPS STREAM</StatusPill></div>
          <div style={{ height: 430, position: 'relative', overflow: 'hidden', borderRadius: 10, border: '1px solid rgba(255,255,255,.1)', background: 'radial-gradient(circle at 50% 40%, rgba(173,145,184,.14), transparent 42%), repeating-linear-gradient(0deg, transparent 0 54px, rgba(255,255,255,.06) 55px), repeating-linear-gradient(90deg, transparent 0 74px, rgba(255,255,255,.05) 75px)' }}>
            {state.rumahSakit.map((item, index) => <div key={item.id} title={item.nama} style={{ position: 'absolute', left: `${12 + (index * 17) % 78}%`, top: `${18 + (index * 23) % 66}%`, width: 12, height: 12, borderRadius: 3, background: '#ad91b8', border: '2px solid #fff7f3', boxShadow: '0 0 0 5px rgba(173,145,184,.16)' }} />)}
            {state.ambulans.map((item, index) => <div key={item.id} title={`${item.nomorUnit} · ${item.status}`} style={{ position: 'absolute', left: `${8 + (index * 29) % 82}%`, top: `${12 + (index * 31) % 75}%`, width: 14, height: 14, borderRadius: 4, background: item.status === 'Dalam Perjalanan' ? '#f07c70' : '#71c99e', border: '2px solid white', color: '#fff', fontSize: 8, textAlign: 'center' }}>+</div>)}
            {state.pasien.map((item, index) => <div key={item.id} title={`${item.nama} · ${item.kondisi}`} style={{ position: 'absolute', left: `${5 + (index * 19) % 88}%`, top: `${8 + (index * 37) % 84}%`, width: 9, height: 9, borderRadius: '50%', background: item.status === 'Darurat' ? '#f07c70' : item.status === 'Kritis' ? '#e5c887' : '#82b6d8', border: '1px solid white' }} />)}
            <div style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', gap: 10, flexWrap: 'wrap', padding: '7px 9px', borderRadius: 7, background: 'rgba(25,21,31,.86)', color: '#eadde2', fontSize: 10 }}><span>● Pasien</span><span>+ Ambulans</span><span>■ Rumah sakit</span></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>{[['Pasien', state.pasien.length], ['Ambulans', state.ambulans.length], ['Driver', state.driver.length]].map(([label, value]) => <div key={String(label)} style={{ padding: 10, background: 'rgba(255,255,255,.05)', borderRadius: 8, color: '#fff7f3' }}><b>{value}</b><div style={{ color: '#b2a4b1', fontSize: 10 }}>{label}</div></div>)}</div>
        </section>

        <div style={{ display: 'grid', gap: 14 }}>
          <section style={{ ...panelStyle, borderColor: selectedCase ? 'var(--color-danger-border)' : undefined }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}><strong>Response Panel</strong>{selectedCase && <StatusPill tone={toneForEmergency(selectedCase.status)}>{selectedCase.status}</StatusPill>}</div>{!selectedCase ? <div style={muted}>Pilih emergency untuk melihat detail response.</div> : <><h3 style={{ margin: '4px 0 2px' }}>{selectedCase.patientName}</h3><div style={muted}>{selectedCase.condition}</div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '12px 0' }}>{[['HR', `${selectedCase.vitals.heartRate} bpm`], ['SpO₂', `${selectedCase.vitals.spo2}%`], ['BP', `${selectedCase.vitals.systolicBp} mmHg`], ['RR', `${selectedCase.vitals.respiratoryRate}/min`]].map(([label, value]) => <div key={String(label)} style={{ padding: 9, background: 'var(--color-danger-bg)', borderRadius: 7 }}><b>{value}</b><div style={muted}>{label}</div></div>)}</div><div style={{ ...muted, marginBottom: 10 }}>Kontak: {selectedCase.contactFamily} · {selectedCase.contactPhone}</div><div style={{ display: 'grid', gap: 7 }}><button className={`${styles.btn} ${styles.btnSecondary}`} onClick={acknowledge}>✓ Acknowledge</button><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}><button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => contact('patient')}>☎ Pasien</button><button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => contact('family')}>☎ Keluarga</button></div><button className={`${styles.btn} ${styles.btnDanger}`} onClick={dispatch} disabled={Boolean(selectedCase.ambulanceId)}>🚑 Dispatch Ambulans</button></div></>}</section>
          <section style={panelStyle}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}><strong>Hospital Resources</strong><span style={muted}>{state.rumahSakit.length} RS</span></div>{state.rumahSakit.slice(0, 4).map((hospital) => <div key={hospital.id} style={{ padding: '10px 0', borderTop: '1px solid var(--color-border)' }}><b style={{ fontSize: 12 }}>{hospital.nama}</b><div style={{ ...muted, margin: '3px 0 6px' }}>IGD {hospital.kapasitas.IGD.tersedia}/{hospital.kapasitas.IGD.total} · ICU {hospital.kapasitas.ICU.tersedia}/{hospital.kapasitas.ICU.total}</div><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><StatusPill tone={hospital.statusKoneksi === 'Online' ? 'success' : 'danger'}>{hospital.statusKoneksi}</StatusPill><button className={`${styles.btn} ${styles.btnSecondary}`} style={{ height: 28, padding: '0 8px', fontSize: 10 }} onClick={() => requestReferral(hospital.id)}>Request Rujukan</button></div></div>)}</section>
          <section style={panelStyle}><strong>Activity Feed</strong><div style={{ maxHeight: 240, overflow: 'auto', marginTop: 8 }}>{topFeed.map((item) => <div key={item.id} style={{ padding: '8px 0', borderTop: '1px solid var(--color-border)', fontSize: 11 }}><div style={{ color: item.level === 'danger' ? 'var(--color-danger)' : 'var(--color-text)' }}>{item.text}</div><div style={muted}>{item.at.toLocaleTimeString('id-ID')}</div></div>)}{topFeed.length === 0 && <div style={muted}>Feed akan terisi ketika simulasi berjalan.</div>}</div></section>
        </div>
      </div>

      <OperationalControlTower />
      <CommunicationPanel contacts={communicationContacts} />
    </div>
  );
}
