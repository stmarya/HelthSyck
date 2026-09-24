import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { useAlerts } from '../hooks/useAlerts';
import { useAmbulances } from '../hooks/useAmbulances';
import { useConsultations } from '../hooks/useConsultations';
import { useReferrals } from '../hooks/useReferrals';
import { useHospitals } from '../hooks/useHospitals';
import { usePatients } from '../hooks/usePatients';
import { patientClient } from '../api/client';
import LastUpdated from '../components/LastUpdated';
import styles from './Page.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Tipe Data
// ─────────────────────────────────────────────────────────────────────────────

interface VitalDataPoint {
  time: string;
  heartRate: number;
  spo2: number;
}

interface VitalRecord {
  patient_id: string;
  heart_rate: number | null;
  spo2: string | null;
  systolic_bp: number | null;
  recorded_at: string;
}

// ─── Daftar layanan untuk health check ───────────────────────────────────────
// Gunakan path relatif /health/<slug> agar melewati Vite proxy (tanpa CORS)
const SERVICE_LIST: [string, string][] = [
  ['Auth',         '/health/auth'],
  ['Patient',      '/health/patient'],
  ['Consultation', '/health/consultation'],
  ['Prescription', '/health/prescription'],
  ['Ambulance',    '/health/ambulance'],
  ['Referral',     '/health/referral'],
  ['Hospital',     '/health/hospital'],
  ['Pharmacy',     '/health/pharmacy'],
  ['Notification', '/health/notification'],
  ['IoT Ingestion','/health/iot'],
  ['Alert',        '/health/alert'],
];

// ─────────────────────────────────────────────────────────────────────────────
// Komponen Tooltip Kustom
// ─────────────────────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ color: string; name: string; value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 10, padding: '10px 14px', boxShadow: 'var(--shadow-lg)', fontSize: 12,
    }}>
      {label && <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--color-muted)', fontSize: 11 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
          <span style={{ color: 'var(--color-muted)' }}>{p.name}:</span>
          <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>
            {p.value}{p.name === 'Heart Rate' ? ' bpm' : p.name === 'SpO₂' ? '%' : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Stat Card
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, color, icon, trend, onClick,
}: {
  label: string;
  value: number | string;
  sub: string;
  color: string;
  icon: string;
  trend?: 'up' | 'down' | 'flat';
  onClick?: () => void;
}) {
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : null;
  const trendColor = trend === 'up' ? 'var(--color-danger)' : trend === 'down' ? 'var(--color-success)' : color;

  return (
    <div
      className={styles.statCard}
      style={{
        borderLeft: `3px solid ${color}`,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
      onClick={onClick}
      onMouseEnter={(e) => onClick && ((e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)')}
      onMouseLeave={(e) => onClick && ((e.currentTarget as HTMLDivElement).style.transform = '')}
    >
      <div style={{
        width: 42, height: 42, borderRadius: '50%',
        background: `${color}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span className={styles.statValue}>{value}</span>
          {trendIcon && (
            <span style={{ fontSize: 12, fontWeight: 700, color: trendColor }}>{trendIcon}</span>
          )}
        </div>
        <div className={styles.statLabel}>{label}</div>
        {sub && <div style={{ fontSize: 11, color, fontWeight: 600, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Metric Row (ringkasan 2 angka horizontal)
// ─────────────────────────────────────────────────────────────────────────────

function MetricRow({ label, a, b, aLabel, bLabel, aColor, bColor }: {
  label: string;
  a: number; b: number;
  aLabel: string; bLabel: string;
  aColor: string; bColor: string;
}) {
  const total = a + b;
  const pctA = total > 0 ? (a / total) * 100 : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
        <span style={{ color: 'var(--color-text)', fontWeight: 500 }}>{label}</span>
        <span style={{ color: 'var(--color-muted)', fontSize: 11 }}>{a} {aLabel} · {b} {bLabel}</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: `${bColor}30`, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 999,
          background: aColor, width: `${pctA}%`,
          transition: 'width 0.5s ease',
        }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Fungsi helper: ambil vitals untuk chart
// ─────────────────────────────────────────────────────────────────────────────

async function fetchVitalsForChart(patientId: string): Promise<VitalDataPoint[]> {
  const to = new Date();
  const from = new Date(Date.now() - 8 * 60 * 60 * 1000);
  const res = await patientClient.get(
    `/v1/patients/${patientId}/vitals?from=${from.toISOString()}&to=${to.toISOString()}&limit=20`,
  );
  const body = res.data as { data: { vitals: VitalRecord[] } };
  const vitals = (body.data?.vitals ?? []).reverse();

  if (vitals.length === 0) {
    const latestRes = await patientClient.get(`/v1/patients/${patientId}/vitals/latest`);
    const latest = (latestRes.data as { data: VitalRecord }).data;
    if (latest) {
      const t = new Date(latest.recorded_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      return [{ time: t, heartRate: latest.heart_rate ?? 0, spo2: parseFloat(String(latest.spo2 ?? '0')) }];
    }
    return [];
  }

  return vitals.map((v) => ({
    time: new Date(v.recorded_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    heartRate: v.heart_rate ?? 0,
    spo2: parseFloat(String(v.spo2 ?? '0')),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// OverviewPage Utama
// ─────────────────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const navigate = useNavigate();

  // ── Hooks data semua service ──
  const { alerts, criticalCount, urgentCount } = useAlerts(15000);
  const { ambulances, available: availableAmbs, dispatched: dispatchedAmbs } = useAmbulances(15000);
  const { activeCount: activeConsultations, pendingCount: pendingConsultations, consultations } = useConsultations(30000);
  const { referrals } = useReferrals(30000);
  const { hospitals } = useHospitals(60000);
  const { patients } = usePatients(60000);

  // ── State lokal ──
  const [serviceHealth, setServiceHealth] = useState<Record<string, boolean>>({});
  const [vitalData, setVitalData] = useState<VitalDataPoint[]>([]);
  const [vitalLoading, setVitalLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // ── Agregasi Ambulans ──
  const activeStatuses = ['DISPATCHED', 'EN_ROUTE', 'AT_SCENE', 'TRANSPORTING'];
  const offlineAmbs = ambulances.filter((a) => a.status === 'OFFLINE').length;
  const activeAmbs = ambulances.filter((a) => activeStatuses.includes(a.status)).length;

  // ── Agregasi Rujukan ──
  const pendingReferrals = referrals.filter((r) => r.status === 'SENT').length;
  const inTransitReferrals = referrals.filter((r) => r.status === 'IN_TRANSIT').length;
  const criticalReferrals = referrals.filter((r) => r.urgency_level === 'CRITICAL').length;

  // ── Agregasi Rumah Sakit ──
  const totalBeds = hospitals.reduce((s, h) => s + (h.total_beds ?? 0), 0);
  const availableBeds = hospitals.reduce((s, h) => s + (h.available_beds ?? 0), 0);
  const totalIcu = hospitals.reduce((s, h) => s + (h.icu_total ?? 0), 0);
  const availableIcu = hospitals.reduce((s, h) => s + (h.icu_available ?? 0), 0);
  const occupancyPct = totalBeds > 0 ? Math.round(((totalBeds - availableBeds) / totalBeds) * 100) : 0;

  // ── Data grafik batang: distribusi status ambulans ──
  const ambulanceBarData = [
    { name: 'Siap', value: availableAmbs.length, color: '#16a34a' },
    { name: 'Aktif', value: activeAmbs, color: '#f59e0b' },
    { name: 'Kembali', value: ambulances.filter((a) => a.status === 'RETURNING').length, color: '#3b82f6' },
    { name: 'Offline', value: offlineAmbs, color: '#ef4444' },
  ].filter((d) => d.value > 0);

  // ── Data grafik batang: urgency rujukan ──
  const referralUrgencyData = [
    { name: 'Normal', value: referrals.filter((r) => r.urgency_level === 'NORMAL').length, color: '#6b7280' },
    { name: 'Mendesak', value: referrals.filter((r) => r.urgency_level === 'URGENT').length, color: '#f59e0b' },
    { name: 'Kritis', value: referrals.filter((r) => r.urgency_level === 'CRITICAL').length, color: '#ef4444' },
  ].filter((d) => d.value > 0);

  // ── Service Health Check ──
  useEffect(() => {
    const checkHealth = () => {
      Promise.allSettled(
        SERVICE_LIST.map(([name, url]) =>
          fetch(url, { signal: AbortSignal.timeout(3000) })
            .then((r) => [name, r.ok] as [string, boolean])
            .catch(() => [name, false] as [string, boolean]),
        ),
      ).then((results) => {
        const health: Record<string, boolean> = {};
        results.forEach((r) => {
          if (r.status === 'fulfilled') health[r.value[0]] = r.value[1];
        });
        setServiceHealth(health);
      }).catch(() => {/* abaikan */});
    };
    checkHealth();
    const interval = setInterval(checkHealth, 60000);
    return () => clearInterval(interval);
  }, []);

  // ── Ambil vitals pasien untuk chart ──
  const fetchVitals = useCallback(async () => {
    setVitalLoading(true);
    try {
      const ptRes = await patientClient.get('/v1/patients?page=1&limit=20');
      const body = ptRes.data as { data: { patients: Array<{ id: string }> } };
      const patientList = body.data?.patients ?? [];

      let found = false;
      for (const patient of patientList) {
        try {
          const points = await fetchVitalsForChart(patient.id);
          if (points.length > 0) {
            setVitalData(points);
            setLastUpdated(new Date());
            found = true;
            break;
          }
        } catch {
          // coba pasien berikutnya
        }
      }
      if (!found) setVitalData([]);
    } catch {
      setVitalData([]);
    } finally {
      setVitalLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchVitals();
    const interval = setInterval(() => void fetchVitals(), 30000);
    return () => clearInterval(interval);
  }, [fetchVitals]);

  const healthyCount = Object.values(serviceHealth).filter(Boolean).length;
  const totalServices = Object.keys(serviceHealth).length;

  return (
    <div className={styles.page}>

      {/* ── Keyframes ── */}
      <style>{`
        @keyframes pulseDot {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.6; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--color-text)', margin: 0, letterSpacing: '-0.3px' }}>
            Command Center
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', margin: '4px 0 0' }}>
            Pantau sistem HealthSync secara real-time
          </p>
          <LastUpdated timestamp={lastUpdated} interval={5000} />
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11, fontWeight: 600,
          color: criticalCount > 0 ? 'var(--color-danger)' : 'var(--color-success)',
          background: criticalCount > 0 ? 'var(--color-danger-bg)' : 'var(--color-success-bg)',
          border: `1px solid ${criticalCount > 0 ? 'var(--color-danger-border)' : 'var(--color-success-border)'}`,
          borderRadius: 999, padding: '4px 12px',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
            background: criticalCount > 0 ? 'var(--color-danger)' : 'var(--color-success)',
            animation: 'pulseDot 2s ease-in-out infinite',
          }} />
          {criticalCount > 0 ? `${criticalCount} Alert Kritis` : 'Semua Normal'}
        </div>
      </div>

      {/* ── Banner Alert Kritis ── */}
      {criticalCount > 0 && (
        <div style={{
          background: 'var(--color-danger-bg)',
          border: '1px solid var(--color-danger-border)',
          borderRadius: 'var(--radius-xl)', padding: '14px 18px', marginBottom: 20,
          animation: 'fadeInUp 0.3s ease both',
        }}>
          <h2 style={{
            fontSize: 11, fontWeight: 700, color: 'var(--color-danger)',
            textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10, marginTop: 0,
          }}>
            🚨 Alert Kritis — Perlu Tindakan Segera
          </h2>
          {alerts.filter((a) => a.level === 'LEVEL_3').slice(0, 3).map((a) => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              fontSize: 13, color: 'var(--color-danger)',
              padding: '5px 0', borderBottom: '1px solid var(--color-danger-border)',
            }}>
              <span style={{ fontWeight: 700, flexShrink: 0 }}>●</span>
              <span style={{ flex: 1 }}>{a.message}</span>
              <span style={{
                fontSize: 11, fontWeight: 600, flexShrink: 0,
                background: 'rgba(220,38,38,0.1)', padding: '2px 8px', borderRadius: 999,
              }}>
                Pasien {a.patient_name ?? a.patient_id.slice(0, 8)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── KPI Cards Baris 1: Alerts + Konsultasi ── */}
      <div className={styles.statGrid} style={{ marginBottom: 16 }}>
        <StatCard
          label="Alert Kritis"
          value={criticalCount}
          sub={`${urgentCount} mendesak`}
          color="var(--color-danger)"
          icon="🚨"
          trend={criticalCount > 0 ? 'up' : 'flat'}
          onClick={() => navigate('/alerts')}
        />
        <StatCard
          label="Total Alert Aktif"
          value={alerts.length}
          sub="semua level"
          color="var(--color-warning)"
          icon="⚠️"
          onClick={() => navigate('/alerts')}
        />
        <StatCard
          label="Konsultasi Aktif"
          value={activeConsultations}
          sub={`${pendingConsultations} menunggu`}
          color="var(--color-primary)"
          icon="🩺"
          onClick={() => navigate('/consultations')}
        />
        <StatCard
          label="Total Konsultasi"
          value={consultations.length > 0 ? consultations.length : activeConsultations + pendingConsultations}
          sub="data dimuat"
          color="#7c3aed"
          icon="📋"
          onClick={() => navigate('/consultations')}
        />
      </div>

      {/* ── KPI Cards Baris 2: Ambulans + RS + Pasien ── */}
      <div className={styles.statGrid} style={{ marginBottom: 20 }}>
        <StatCard
          label="Ambulans Siap"
          value={availableAmbs.length}
          sub={`${dispatchedAmbs.length} dikirim · ${offlineAmbs} offline`}
          color="var(--color-success)"
          icon="🚑"
          onClick={() => navigate('/ambulance')}
        />
        <StatCard
          label="Rujukan Pending"
          value={pendingReferrals}
          sub={`${inTransitReferrals} transit · ${criticalReferrals} kritis`}
          color={criticalReferrals > 0 ? 'var(--color-danger)' : 'var(--color-warning)'}
          icon="🔄"
          trend={criticalReferrals > 0 ? 'up' : undefined}
          onClick={() => navigate('/referrals')}
        />
        <StatCard
          label="Tempat Tidur RS"
          value={availableBeds > 0 ? `${availableBeds}/${totalBeds}` : hospitals.length > 0 ? `—/${totalBeds}` : '—'}
          sub={`${occupancyPct}% terisi · ${availableIcu}/${totalIcu} ICU`}
          color={occupancyPct > 80 ? 'var(--color-danger)' : occupancyPct > 60 ? 'var(--color-warning)' : 'var(--color-success)'}
          icon="🏥"
          trend={occupancyPct > 80 ? 'up' : undefined}
          onClick={() => navigate('/hospitals')}
        />
        <StatCard
          label="Layanan Online"
          value={totalServices > 0 ? `${healthyCount}/${totalServices}` : '—'}
          sub={`${patients.length > 0 ? patients.length + ' pasien' : 'memuat...'}`}
          color={healthyCount === totalServices && totalServices > 0 ? 'var(--color-success)' : 'var(--color-warning)'}
          icon="💚"
        />
      </div>

      {/* ── Panel Tengah: Chart + Metrik ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Distribusi Ambulans */}
        <div
          className={styles.card}
          style={{ cursor: 'pointer' }}
          onClick={() => navigate('/ambulance')}
        >
          <h2 className={styles.cardTitle} style={{ margin: '0 0 4px' }}>Status Armada Ambulans</h2>
          <p style={{ fontSize: 12, color: 'var(--color-muted)', margin: '0 0 14px' }}>
            {ambulances.length} unit terdaftar
          </p>
          {ambulanceBarData.length === 0 ? (
            <div style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-muted)', fontSize: 13 }}>
              Memuat data armada...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={ambulanceBarData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0] as { value: number; payload: { name: string; color: string } };
                    return (
                      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                        <span style={{ color: d.payload.color, fontWeight: 700 }}>{d.payload.name}: </span>
                        <span style={{ color: 'var(--color-text)', fontWeight: 700 }}>{d.value} unit</span>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  {ambulanceBarData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Distribusi Urgency Rujukan */}
        <div
          className={styles.card}
          style={{ cursor: 'pointer' }}
          onClick={() => navigate('/referrals')}
        >
          <h2 className={styles.cardTitle} style={{ margin: '0 0 4px' }}>Distribusi Urgensi Rujukan</h2>
          <p style={{ fontSize: 12, color: 'var(--color-muted)', margin: '0 0 14px' }}>
            {referrals.length} rujukan dimuat
          </p>
          {referralUrgencyData.length === 0 ? (
            <div style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-muted)', fontSize: 13 }}>
              Memuat data rujukan...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={referralUrgencyData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0] as { value: number; payload: { name: string; color: string } };
                    return (
                      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                        <span style={{ color: d.payload.color, fontWeight: 700 }}>{d.payload.name}: </span>
                        <span style={{ color: 'var(--color-text)', fontWeight: 700 }}>{d.value} rujukan</span>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  {referralUrgencyData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Panel Tengah: Kapasitas RS + Metrik Operasional ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Kapasitas RS */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle} style={{ margin: '0 0 16px' }}>Kapasitas Rumah Sakit</h2>
          {hospitals.length === 0 ? (
            <div style={{ color: 'var(--color-muted)', fontSize: 13 }}>Memuat data RS...</div>
          ) : (
            <>
              <MetricRow
                label="Tempat Tidur Umum"
                a={totalBeds - availableBeds}
                b={availableBeds}
                aLabel="terisi"
                bLabel="kosong"
                aColor="var(--color-primary)"
                bColor="var(--color-success)"
              />
              <MetricRow
                label="Unit ICU"
                a={totalIcu - availableIcu}
                b={availableIcu}
                aLabel="terisi"
                bLabel="kosong"
                aColor="#dc2626"
                bColor="var(--color-success)"
              />
              <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--color-surface-2)', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--color-muted)' }}>Total RS Terdaftar</span>
                  <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{hospitals.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6 }}>
                  <span style={{ color: 'var(--color-muted)' }}>Tingkat Okupansi</span>
                  <span style={{
                    fontWeight: 700,
                    color: occupancyPct > 80 ? 'var(--color-danger)' : occupancyPct > 60 ? 'var(--color-warning)' : 'var(--color-success)',
                  }}>
                    {occupancyPct}%
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Metrik Operasional */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle} style={{ margin: '0 0 16px' }}>Ringkasan Operasional</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Total Pasien', value: patients.length > 0 ? patients.length : '—', color: 'var(--color-primary)' },
              { label: 'Rujukan Aktif', value: referrals.filter(r => !['COMPLETED','CANCELLED'].includes(r.status)).length, color: 'var(--color-warning)' },
              { label: 'Konsultasi Selesai', value: consultations.filter(c => c.status === 'COMPLETED').length, color: 'var(--color-success)' },
              { label: 'RS Mitra EMT', value: hospitals.filter(h => h.is_emt_partner).length, color: '#7c3aed' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                padding: '12px 14px',
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                borderRadius: 10,
              }}>
                <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
                <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Service Health Grid ── */}
      <div className={styles.card} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <h2 className={styles.cardTitle} style={{ margin: 0 }}>Status Layanan Microservice</h2>
            <p style={{ fontSize: 12, color: 'var(--color-muted)', margin: '3px 0 0' }}>
              {totalServices > 0
                ? `${healthyCount} dari ${totalServices} layanan aktif`
                : 'Memeriksa semua layanan...'}
            </p>
          </div>
          {totalServices > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
              <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                ● {healthyCount} Online
              </span>
              {totalServices - healthyCount > 0 && (
                <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
                  ● {totalServices - healthyCount} Offline
                </span>
              )}
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
          {Object.keys(serviceHealth).length === 0
            ? Array.from({ length: SERVICE_LIST.length }, (_, i) => (
                <div key={i} style={{
                  padding: '9px 12px', background: 'var(--color-surface-2)',
                  borderRadius: 10, fontSize: 12, color: 'var(--color-muted)',
                  display: 'flex', alignItems: 'center', gap: 6,
                  border: '1px solid var(--color-border)',
                }}>
                  <span style={{ animation: 'pulse 1.5s ease-in-out infinite', fontSize: 8 }}>●</span>
                  Memeriksa...
                </div>
              ))
            : Object.entries(serviceHealth).map(([name, up]) => (
                <div key={name} style={{
                  padding: '9px 12px',
                  background: up ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
                  border: `1px solid ${up ? 'var(--color-success-border)' : 'var(--color-danger-border)'}`,
                  borderRadius: 10, fontSize: 12,
                  color: up ? 'var(--color-success)' : 'var(--color-danger)',
                  display: 'flex', alignItems: 'center', gap: 7,
                  fontWeight: 500, transition: 'all 0.2s',
                }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                    background: up ? 'var(--color-success)' : 'var(--color-danger)',
                    animation: up ? 'pulseDot 2s ease-in-out infinite' : 'none',
                  }} />
                  {name}
                </div>
              ))}
        </div>
      </div>

      {/* ── Area Chart: Live Vitals ── */}
      <div className={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <h2 className={styles.cardTitle} style={{ margin: 0 }}>Live Vitals Trend</h2>
            <p style={{ fontSize: 12, color: 'var(--color-muted)', margin: '3px 0 0' }}>
              {vitalLoading
                ? 'Memuat data vital...'
                : vitalData.length > 0
                  ? `${vitalData.length} titik data — detak jantung & saturasi oksigen`
                  : 'Tidak ada data vital dalam rentang waktu ini'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 12, height: 3, background: '#DC2626', borderRadius: 2 }} />
              <span style={{ color: 'var(--color-muted)' }}>Heart Rate</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 12, height: 3, background: '#2563EB', borderRadius: 2 }} />
              <span style={{ color: 'var(--color-muted)' }}>SpO₂</span>
            </div>
          </div>
        </div>

        {vitalLoading ? (
          <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-muted)', fontSize: 13 }}>
            <span style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>Memuat data vital pasien...</span>
          </div>
        ) : vitalData.length === 0 ? (
          <div style={{ height: 240, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-muted)', fontSize: 13, gap: 8 }}>
            <span style={{ fontSize: 28 }}>📊</span>
            <span>Tidak ada data vital tersedia</span>
            <button
              onClick={() => void fetchVitals()}
              style={{ padding: '6px 14px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: 'var(--color-text-secondary)' }}
            >
              ↻ Muat Ulang
            </button>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={vitalData} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="hrGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#DC2626" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#DC2626" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="spo2Grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#2563EB" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="time" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone" dataKey="heartRate" name="Heart Rate"
                stroke="#DC2626" fill="url(#hrGrad)" strokeWidth={2.5}
                dot={false} activeDot={{ r: 5, fill: '#DC2626' }}
              />
              <Area
                type="monotone" dataKey="spo2" name="SpO₂"
                stroke="#2563EB" fill="url(#spo2Grad)" strokeWidth={2.5}
                dot={false} activeDot={{ r: 5, fill: '#2563EB' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
