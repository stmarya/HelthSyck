import { useEffect, useState, useCallback, useRef } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer, Legend,
  AreaChart, Area,
} from 'recharts';
import { authClient, consultationClient, alertClient, ambulanceClient } from '../api/client';
import type { AlertRow, AlertsApiResponse, Ambulance } from '../types/admin';
import styles from './Page.module.css';
import { Skeleton, SkeletonChart } from '../components/Skeleton';

// ─────────────────────────────────────────────────────────────────────────────
// ActivityFeed — menampilkan log aktivitas terbaru dari auth-service
// ─────────────────────────────────────────────────────────────────────────────

interface ActivityLog {
  id: string;
  action: string;
  actor_email: string;
  target?: string;
  created_at: string;
  level?: 'info' | 'warning' | 'danger' | 'success';
}

// Konfigurasi visual per level log
const ACTIVITY_STYLE: Record<string, { icon: string; bg: string; color: string }> = {
  danger:  { icon: '🚨', bg: 'var(--color-danger-bg)',  color: 'var(--color-danger)' },
  warning: { icon: '⚠️', bg: 'var(--color-warning-bg)', color: 'var(--color-warning)' },
  success: { icon: '✅', bg: 'var(--color-success-bg)', color: 'var(--color-success)' },
  info:    { icon: 'ℹ️', bg: 'var(--color-info-bg)',    color: 'var(--color-info)' },
};

// Deteksi level otomatis dari teks action jika tidak ada field level
function detectLevel(action: string): string {
  const a = action.toLowerCase();
  if (a.includes('delete') || a.includes('hapus') || a.includes('error') || a.includes('fail')) return 'danger';
  if (a.includes('logout') || a.includes('warn') || a.includes('update') || a.includes('edit')) return 'warning';
  if (a.includes('create') || a.includes('login') || a.includes('success') || a.includes('buat')) return 'success';
  return 'info';
}

function ActivityFeed() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await authClient.get('/v1/auth/admin/activity-logs?limit=8');
        const body = res.data as { data: ActivityLog[] };
        setLogs(body.data ?? []);
      } catch {
        // Fallback: log kosong jika endpoint tidak tersedia
        setLogs([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} height={40} borderRadius={8} />
        ))}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 16px', borderRadius: 10,
        background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
      }}>
        <span style={{ fontSize: 18 }}>📋</span>
        <span style={{ fontSize: 13, color: 'var(--color-muted)', fontWeight: 500 }}>
          Belum ada log aktivitas tersedia.
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {logs.map((log) => {
        const lvl   = log.level ?? detectLevel(log.action);
        const style = ACTIVITY_STYLE[lvl] ?? ACTIVITY_STYLE.info;
        const ts    = new Date(log.created_at);
        const waktu = isNaN(ts.getTime())
          ? '—'
          : ts.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

        return (
          <div key={log.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '9px 14px', borderRadius: 8,
            background: style.bg, border: `1px solid ${style.bg}`,
            transition: 'opacity 0.15s',
          }}>
            {/* Ikon level */}
            <span style={{ fontSize: 16, flexShrink: 0 }}>{style.icon}</span>

            {/* Aksi + aktor */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {log.action}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 1 }}>
                {log.actor_email}
                {log.target && <span> → <span style={{ color: style.color, fontWeight: 600 }}>{log.target}</span></span>}
              </div>
            </div>

            {/* Timestamp */}
            <span style={{ fontSize: 11, color: 'var(--color-muted)', flexShrink: 0, fontFamily: 'monospace' }}>
              {waktu}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipe & Konstanta
// ─────────────────────────────────────────────────────────────────────────────

interface ServiceStatus {
  name: string;
  port: number;
  url: string;
  status: 'ONLINE' | 'OFFLINE' | 'CHECKING';
  latency?: number;
}

interface KpiRow { metric: string; current: number; previous: number }
interface RoleCount { role: string; count: number }
interface DayCount { day: number; count: number }

// Konfigurasi level alert
const ALERT_LEVEL_STYLE: Record<string, { bg: string; color: string; label: string; border: string }> = {
  LEVEL_3: { bg: '#FEF2F2', color: '#DC2626', label: 'Kritis',  border: '#FECACA' },
  LEVEL_2: { bg: '#FFFBEB', color: '#D97706', label: 'Tinggi',  border: '#FDE68A' },
  LEVEL_1: { bg: '#F0FDF4', color: '#059669', label: 'Sedang',  border: '#A7F3D0' },
};

const SERVICES: Omit<ServiceStatus, 'status'>[] = [
  { name: 'auth-service',         port: 3001, url: '/health/auth' },
  { name: 'patient-service',      port: 3002, url: '/health/patient' },
  { name: 'consultation-service', port: 3003, url: '/health/consultation' },
  { name: 'prescription-service', port: 3004, url: '/health/prescription' },
  { name: 'ambulance-service',    port: 3005, url: '/health/ambulance' },
  { name: 'referral-service',     port: 3006, url: '/health/referral' },
  { name: 'hospital-service',     port: 3007, url: '/health/hospital' },
  { name: 'pharmacy-service',     port: 3008, url: '/health/pharmacy' },
  { name: 'notification-service', port: 3009, url: '/health/notification' },
  { name: 'integration-service',  port: 3010, url: '/health/integration' },
  { name: 'iot-ingestion',        port: 4001, url: '/health/iot' },
  { name: 'alert-service',        port: 4002, url: '/health/alert' },
];

const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

// Palet warna modern
const ROLE_COLORS = ['#7C3AED', '#2563EB', '#059669', '#D97706', '#DC2626', '#0284C7'];

// ─────────────────────────────────────────────────────────────────────────────
// KPI Card — gaya HackerEarth: border kiri warna, ikon lingkaran, flat
// ─────────────────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  icon: React.ReactNode;
  loading?: boolean;
}

function KpiCard({ label, value, sub, color, icon, loading }: KpiCardProps) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderLeft: `3px solid ${color}`,
      borderRadius: 'var(--radius-lg)',
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      transition: 'background 0.15s',
    }}>
      {/* Ikon lingkaran warna */}
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        background: `${color}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 17, flexShrink: 0,
      }}>
        {icon}
      </div>

      {/* Konten teks */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {loading ? (
          <>
            <Skeleton width={72} height={24} borderRadius={4} />
            <Skeleton width={100} height={11} borderRadius={3} style={{ marginTop: 7 }} />
          </>
        ) : (
          <>
            <div style={{
              fontSize: 24, fontWeight: 700, lineHeight: 1,
              color: 'var(--color-text)', letterSpacing: '-0.3px',
            }}>
              {value}
            </div>
            <div style={{ marginTop: 5, fontSize: 12, color: 'var(--color-muted)', fontWeight: 500 }}>
              {label}
            </div>
            {sub && (
              <div style={{ marginTop: 3, fontSize: 11, color, fontWeight: 600 }}>
                {sub}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Recent Users mini-table
// ─────────────────────────────────────────────────────────────────────────────

interface RecentUser { name: string; email: string; role: string; createdAt: string }

function RecentUsersTable({ loading }: { loading: boolean }) {
  const [users, setUsers] = useState<RecentUser[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await authClient.get('/v1/auth/admin/users?page=1&limit=5');
        const d = res.data as { data: RecentUser[] };
        setUsers(d.data ?? []);
      } catch { /* gagal diam */ }
    })();
  }, []);

  const ROLE_CHIP: Record<string, { bg: string; color: string; border: string }> = {
    ADMIN:   { bg: 'var(--color-accent-light)', color: 'var(--color-accent)', border: 'rgba(124,58,237,0.2)' },
    DOCTOR:  { bg: 'var(--color-info-bg)',      color: 'var(--color-primary)', border: 'var(--color-info-border)' },
    PATIENT: { bg: 'var(--color-surface-2)',    color: 'var(--color-muted)',  border: 'var(--color-border)' },
  };

  if (loading || users.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
            <Skeleton width={36} height={36} borderRadius={10} />
            <div style={{ flex: 1 }}>
              <Skeleton width="55%" height={13} borderRadius={3} />
              <Skeleton width="75%" height={11} borderRadius={3} style={{ marginTop: 5 }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {users.map((u) => {
        const chip = ROLE_CHIP[u.role] ?? ROLE_CHIP.PATIENT;
        return (
          <div key={u.email} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 0', borderBottom: '1px solid var(--color-border)',
          }}>
            {/* Avatar */}
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #7C3AED, #2563EB)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0,
              boxShadow: '0 2px 8px rgba(124,58,237,0.25)',
            }}>
              {u.name.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text)' }}>
                {u.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {u.email}
              </div>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
              background: chip.bg, color: chip.color,
              border: `1px solid ${chip.border}`,
              letterSpacing: '0.3px', textTransform: 'uppercase',
            }}>
              {u.role.replace(/_/g, ' ')}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip Chart Kustom
// ─────────────────────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ color: string; name: string; value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 10,
      padding: '10px 14px',
      boxShadow: 'var(--shadow-lg)',
      fontSize: 12,
    }}>
      {label && <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--color-muted)' }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
          <span style={{ color: 'var(--color-muted)' }}>{p.name}:</span>
          <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{p.value.toLocaleString('id-ID')}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Utama
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  // Service health
  const [services, setServices] = useState<ServiceStatus[]>(
    SERVICES.map((s) => ({ ...s, status: 'CHECKING' as const })),
  );
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const cancelledRef = useRef(false);

  // Analytics
  const [kpis,             setKpis]             = useState<KpiRow[]>([]);
  const [consultsByDay,    setConsultsByDay]     = useState<{ day: string; count: number }[]>([]);
  const [usersByRole,      setUsersByRole]       = useState<{ name: string; value: number }[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  // Monitoring — Alert & Ambulans
  const [activeAlerts,  setActiveAlerts]  = useState<AlertRow[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [availableAmb,  setAvailableAmb]  = useState<number | null>(null);

  // Health check
  const checkHealth = useCallback(async () => {
    const results = await Promise.all(
      SERVICES.map(async (svc) => {
        const start = Date.now();
        try {
          const res = await fetch(svc.url, { signal: AbortSignal.timeout(3000) });
          if (!res.ok) return { ...svc, status: 'OFFLINE' as const };
          return { ...svc, status: 'ONLINE' as const, latency: Date.now() - start };
        } catch {
          return { ...svc, status: 'OFFLINE' as const };
        }
      }),
    );
    if (!cancelledRef.current) {
      setServices(results);
      setCheckedAt(new Date());
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    void checkHealth();
    const id = setInterval(() => { void checkHealth(); }, 30_000);
    return () => { cancelledRef.current = true; clearInterval(id); };
  }, [checkHealth]);

  // Monitoring fetch — alert aktif + ambulans
  useEffect(() => {
    let cancel = false;
    const loadMonitoring = async () => {
      const [alertRes, ambRes] = await Promise.allSettled([
        alertClient.get<AlertsApiResponse>('/v1/alerts?status=ACTIVE&limit=5'),
        ambulanceClient.get<{ data: Ambulance[] }>('/v1/ambulances?status=AVAILABLE&limit=100'),
      ]);
      if (cancel) return;
      if (alertRes.status === 'fulfilled') {
        setActiveAlerts(alertRes.value.data?.data ?? []);
      }
      if (ambRes.status === 'fulfilled') {
        const ambList = ambRes.value.data?.data ?? [];
        setAvailableAmb(ambList.filter((a) => a.status === 'AVAILABLE').length);
      }
      setAlertsLoading(false);
    };
    void loadMonitoring();
    const id = setInterval(() => { void loadMonitoring(); }, 30_000);
    return () => { cancel = true; clearInterval(id); };
  }, []);

  // Analytics fetch
  useEffect(() => {
    let cancel = false;
    const load = async () => {
      const [consultRes, rolesRes, kpisRes] = await Promise.allSettled([
        consultationClient.get<{ data: DayCount[] }>('/v1/consultations/stats/weekly'),
        authClient.get<{ data: RoleCount[] }>('/v1/auth/users/stats/by-role'),
        authClient.get<{ data: KpiRow[] }>('/v1/admin/kpis'),
      ]);
      if (cancel) return;

      if (consultRes.status === 'fulfilled') {
        setConsultsByDay(
          (consultRes.value.data.data ?? []).map((d) => ({
            day: DAY_LABELS[d.day] ?? `Hari ${d.day}`,
            count: d.count,
          })),
        );
      }
      if (rolesRes.status === 'fulfilled') {
        setUsersByRole(
          (rolesRes.value.data.data ?? []).map((r) => ({
            name: r.role.charAt(0) + r.role.slice(1).toLowerCase().replace(/_/g, ' '),
            value: r.count,
          })),
        );
      }
      if (kpisRes.status === 'fulfilled') {
        setKpis(kpisRes.value.data.data ?? []);
      }
      setAnalyticsLoading(false);
    };
    void load();
    return () => { cancel = true; };
  }, []);

  const online  = services.filter((s) => s.status === 'ONLINE').length;
  const offline = services.filter((s) => s.status === 'OFFLINE').length;
  const lats    = services.filter((s) => s.latency != null).map((s) => s.latency!);
  const avgLat  = lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : null;

  const totalUsers    = kpis.find((k) => k.metric === 'New Users')?.current ?? 0;
  const totalConsult  = kpis.find((k) => k.metric === 'Consultations')?.current ?? 0;
  const totalDoctors  = usersByRole.find((r) => r.name.toLowerCase().startsWith('doc'))?.value ?? 0;
  const totalPatients = usersByRole.find((r) => r.name.toLowerCase().startsWith('pat'))?.value ?? 0;
  const criticalAlertCount = activeAlerts.filter((a) => a.level === 'LEVEL_3').length;

  // ── Render ──
  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--color-text)', margin: 0, letterSpacing: '-0.3px' }}>
            Dashboard Overview
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 4, margin: '4px 0 0' }}>
            Ringkasan sistem HealthSync secara real-time
          </p>
        </div>
        <div style={{
          fontSize: 12, color: 'var(--color-muted)',
          background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
          borderRadius: 999, padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: offline === 0 ? 'var(--color-success)' : 'var(--color-warning)',
            display: 'inline-block', animation: 'pulseDot 2s ease-in-out infinite',
          }} />
          {checkedAt ? `Diperbarui ${checkedAt.toLocaleTimeString('id-ID')}` : 'Memeriksa…'}
        </div>
      </div>

      {/* ── KPI Cards (2 baris × 4 kolom) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <KpiCard
          label="Total Pengguna"
          value={analyticsLoading ? '—' : totalUsers.toLocaleString('id-ID')}
          color="#7C3AED"
          icon="👥"
          loading={analyticsLoading}
        />
        <KpiCard
          label="Total Pasien"
          value={analyticsLoading ? '—' : totalPatients.toLocaleString('id-ID')}
          color="#2563EB"
          icon="🏥"
          loading={analyticsLoading}
        />
        <KpiCard
          label="Dokter Aktif"
          value={analyticsLoading ? '—' : totalDoctors.toLocaleString('id-ID')}
          color="#059669"
          icon="👨‍⚕️"
          loading={analyticsLoading}
        />
        <KpiCard
          label="Konsultasi Bulan Ini"
          value={analyticsLoading ? '—' : totalConsult.toLocaleString('id-ID')}
          color="#D97706"
          icon="💬"
          loading={analyticsLoading}
        />
        <KpiCard
          label="Alert Aktif"
          value={alertsLoading ? '—' : activeAlerts.length}
          sub={criticalAlertCount > 0 ? `${criticalAlertCount} kritis` : undefined}
          color={criticalAlertCount > 0 ? '#DC2626' : '#D97706'}
          icon="🚨"
          loading={alertsLoading}
        />
        <KpiCard
          label="Ambulans Tersedia"
          value={availableAmb ?? '—'}
          color="#059669"
          icon="🚑"
          loading={alertsLoading}
        />
        <KpiCard
          label="Layanan Online"
          value={`${online}/${SERVICES.length}`}
          sub={offline > 0 ? `${offline} offline` : 'Semua normal'}
          color={offline === 0 ? '#059669' : '#DC2626'}
          icon="⚡"
        />
        <KpiCard
          label="Avg Latency"
          value={avgLat != null ? `${avgLat}ms` : '—'}
          sub={avgLat != null ? (avgLat < 100 ? 'Sangat baik' : avgLat < 300 ? 'Normal' : 'Lambat') : undefined}
          color="#0284C7"
          icon="📡"
        />
      </div>

      {/* ── Charts Row 1: Konsultasi + Distribusi Pengguna ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Konsultasi Minggu Ini — Area Chart */}
        <div style={{
          background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border)', padding: 20, boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
                Konsultasi Minggu Ini
              </h2>
              <p style={{ fontSize: 12, color: 'var(--color-muted)', margin: '3px 0 0' }}>
                Perubahan volume harian konsultasi
              </p>
            </div>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '4px 10px',
              background: 'var(--color-accent-light)', color: 'var(--color-accent)',
              borderRadius: 999, border: '1px solid rgba(124,58,237,0.2)',
            }}>
              7 Hari Terakhir
            </span>
          </div>
          {analyticsLoading ? <SkeletonChart height={220} /> : consultsByDay.length === 0 ? (
            <div className={styles.emptyState} style={{ padding: '30px 0' }}>
              Tidak ada data konsultasi.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={consultsByDay} margin={{ top: 5, right: 10, bottom: 0, left: -15 }}>
                <defs>
                  <linearGradient id="consultGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#7C3AED" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#7C3AED" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone" dataKey="count" name="Konsultasi"
                  stroke="#7C3AED" fill="url(#consultGrad)"
                  strokeWidth={2.5} dot={{ r: 4, fill: '#7C3AED', strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 6 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Distribusi Pengguna — Donut Chart */}
        <div style={{
          background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border)', padding: 20, boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
              Distribusi Pengguna
            </h2>
            <p style={{ fontSize: 12, color: 'var(--color-muted)', margin: '3px 0 0' }}>
              Komposisi peran pengguna sistem
            </p>
          </div>
          {analyticsLoading ? <SkeletonChart height={220} /> : usersByRole.length === 0 ? (
            <div className={styles.emptyState} style={{ padding: '30px 0' }}>
              Tidak ada data.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={usersByRole} cx="50%" cy="50%"
                  innerRadius={60} outerRadius={90}
                  paddingAngle={3} dataKey="value"
                  label={({ percent }: { percent: number }) => `${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {usersByRole.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={ROLE_COLORS[index % ROLE_COLORS.length]} />
                  ))}
                </Pie>
                <Legend
                  iconSize={8} iconType="circle"
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                />
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Alert Kritis Terbaru ── */}
      <div style={{
        background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--color-border)', padding: 20,
        marginBottom: 20, boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
              Alert Kritis Terbaru
            </h2>
            <p style={{ fontSize: 12, color: 'var(--color-muted)', margin: '3px 0 0' }}>
              Alert aktif yang memerlukan perhatian
            </p>
          </div>
          <a href="/alerts" style={{
            fontSize: 12, fontWeight: 600, color: 'var(--color-primary)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            Lihat semua →
          </a>
        </div>
        {alertsLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} height={44} borderRadius={10} />
            ))}
          </div>
        ) : activeAlerts.length === 0 ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '14px 16px', borderRadius: 10,
            background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)',
          }}>
            <span style={{ fontSize: 18 }}>✅</span>
            <span style={{ fontSize: 13, color: 'var(--color-success)', fontWeight: 500 }}>
              Tidak ada alert aktif saat ini. Semua parameter vital dalam kondisi normal.
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeAlerts.slice(0, 5).map((alert) => {
              const lvl = ALERT_LEVEL_STYLE[alert.level] ?? ALERT_LEVEL_STYLE.LEVEL_1;
              return (
                <div key={alert.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 10,
                  background: lvl.bg, border: `1px solid ${lvl.border}`,
                  transition: 'transform 0.15s',
                }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 10px',
                    borderRadius: 999, background: lvl.color, color: '#fff',
                    flexShrink: 0, letterSpacing: '0.3px',
                  }}>
                    {lvl.label}
                  </span>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                    {alert.message}
                  </span>
                  {alert.patient_name && (
                    <span style={{
                      fontSize: 11, color: 'var(--color-muted)', flexShrink: 0,
                      background: 'rgba(0,0,0,0.04)', padding: '2px 8px', borderRadius: 999,
                    }}>
                      {alert.patient_name}
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--color-muted)', flexShrink: 0 }}>
                    {new Date(alert.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Bottom Row: Pengguna Terbaru + Status Layanan ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 20 }}>
        {/* Pengguna Terbaru */}
        <div style={{
          background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border)', padding: 20, boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
                Pengguna Terbaru
              </h2>
              <p style={{ fontSize: 12, color: 'var(--color-muted)', margin: '3px 0 0' }}>
                5 pengguna terakhir didaftarkan
              </p>
            </div>
            <a href="/users" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary)' }}>
              Lihat semua →
            </a>
          </div>
          <RecentUsersTable loading={analyticsLoading} />
        </div>

        {/* Status Layanan — Grid Modern */}
        <div style={{
          background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border)', padding: 20, boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
                Status Layanan
              </h2>
              <p style={{ fontSize: 12, color: 'var(--color-muted)', margin: '3px 0 0' }}>
                {online} / {SERVICES.length} layanan aktif
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <a href="/health" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary)' }}>
                Detail →
              </a>
              <button
                onClick={() => { void checkHealth(); }}
                style={{
                  padding: '5px 14px', fontSize: 12, border: '1px solid var(--color-border)',
                  borderRadius: 8, background: 'var(--color-surface-2)',
                  cursor: 'pointer', color: 'var(--color-text-secondary)',
                  transition: 'all 0.15s', fontWeight: 500,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-hover)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-border-strong)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-2)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-border)';
                }}
              >
                ↻ Refresh
              </button>
            </div>
          </div>

          {/* Grid layanan */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {services.map((svc) => {
              const isOnline  = svc.status === 'ONLINE';
              const isOffline = svc.status === 'OFFLINE';
              return (
                <div key={svc.name} style={{
                  padding: '9px 11px', borderRadius: 10,
                  background: isOnline ? 'var(--color-success-bg)' : isOffline ? 'var(--color-danger-bg)' : 'var(--color-surface-2)',
                  border: `1px solid ${isOnline ? 'var(--color-success-border)' : isOffline ? 'var(--color-danger-border)' : 'var(--color-border)'}`,
                  transition: 'all 0.2s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                      background: isOnline ? 'var(--color-success)' : isOffline ? 'var(--color-danger)' : 'var(--color-muted)',
                      animation: isOnline ? 'pulseDot 2s ease-in-out infinite' : 'none',
                    }} />
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      color: isOnline ? 'var(--color-success)' : isOffline ? 'var(--color-danger)' : 'var(--color-muted)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {svc.name.replace(/-service$/, '').replace(/-/g, ' ')}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--color-muted)', paddingLeft: 13 }}>
                    {svc.latency != null ? `${svc.latency}ms` : svc.status === 'CHECKING' ? '…' : 'offline'}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary bar bawah */}
          <div style={{
            marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--color-border)',
            display: 'flex', gap: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-success)', display: 'inline-block' }} />
              <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>{online} Online</span>
            </div>
            {offline > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-danger)', display: 'inline-block' }} />
                <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>{offline} Offline</span>
              </div>
            )}
            {avgLat != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginLeft: 'auto' }}>
                <span style={{ color: 'var(--color-muted)' }}>Avg Latency:</span>
                <span style={{
                  fontWeight: 700,
                  color: avgLat < 100 ? 'var(--color-success)' : avgLat < 300 ? 'var(--color-warning)' : 'var(--color-danger)',
                }}>
                  {avgLat}ms
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Activity Feed: log aktivitas terbaru sistem ── */}
      <div style={{
        background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--color-border)', padding: 20,
        marginTop: 20, boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
              Aktivitas Terbaru
            </h2>
            <p style={{ fontSize: 12, color: 'var(--color-muted)', margin: '3px 0 0' }}>
              Log aksi penting pada sistem HealthSync
            </p>
          </div>
          <a href="/logs" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary)' }}>
            Lihat semua →
          </a>
        </div>
        <ActivityFeed />
      </div>
      {/* pulseDot sudah didefinisikan di index.css global — tidak perlu inline */}
    </div>
  );
}
