import { useEffect, useState, useCallback, useRef } from 'react';
import styles from './Page.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type SvcStatus = 'ONLINE' | 'OFFLINE' | 'CHECKING';

interface ServiceHealth {
  name: string;
  displayName: string;
  port: number;
  url: string;
  status: SvcStatus;
  latency?: number;
  lastChecked?: Date;
  uptimeClass: string;
}

interface HealthResponse {
  status?: string;
  db?: boolean;
  redis?: boolean;
}

function makeTimeoutSignal(timeoutMs: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(timeoutMs);
  const controller = new AbortController();
  window.setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

function isHealthyResponse(payload: HealthResponse): boolean {
  const dbHealthy = payload.db ?? true;
  const redisHealthy = payload.redis ?? true;
  return payload.status !== 'degraded' && payload.status !== 'error' && dbHealthy && redisHealthy;
}

const SERVICES_DEF: Omit<ServiceHealth, 'status' | 'lastChecked'>[] = [
  { name: 'auth-service',         displayName: 'Auth Service',         port: 3001, url: '/health/auth',         uptimeClass: 'Core' },
  { name: 'patient-service',      displayName: 'Patient Service',      port: 3002, url: '/health/patient',      uptimeClass: 'Core' },
  { name: 'consultation-service', displayName: 'Consultation Service', port: 3003, url: '/health/consultation', uptimeClass: 'Core' },
  { name: 'prescription-service', displayName: 'Prescription Service', port: 3004, url: '/health/prescription', uptimeClass: 'Core' },
  { name: 'ambulance-service',    displayName: 'Ambulance Service',    port: 3005, url: '/health/ambulance',    uptimeClass: 'Emergency' },
  { name: 'referral-service',     displayName: 'Referral Service',     port: 3006, url: '/health/referral',     uptimeClass: 'Core' },
  { name: 'hospital-service',     displayName: 'Hospital Service',     port: 3007, url: '/health/hospital',     uptimeClass: 'Core' },
  { name: 'pharmacy-service',     displayName: 'Pharmacy Service',     port: 3008, url: '/health/pharmacy',     uptimeClass: 'Core' },
  { name: 'notification-service', displayName: 'Notification Service', port: 3009, url: '/health/notification', uptimeClass: 'Support' },
  { name: 'integration-service',  displayName: 'Integration Service',  port: 3010, url: '/health/integration',  uptimeClass: 'Support' },
  { name: 'iot-ingestion',        displayName: 'IoT Ingestion',        port: 4001, url: '/health/iot',          uptimeClass: 'IoT' },
  { name: 'alert-service',        displayName: 'Alert Service',        port: 4002, url: '/health/alert',        uptimeClass: 'Emergency' },
];

const CLASS_COLORS: Record<string, { bg: string; color: string }> = {
  Core:      { bg: '#e3f2fd', color: '#1E88E5' },
  Emergency: { bg: '#fef2f2', color: '#E53935' },
  Support:   { bg: '#f0fdf4', color: '#43A047' },
  IoT:       { bg: '#fffbeb', color: '#FB8C00' },
};

export default function HealthCheckPage() {
  const [services, setServices] = useState<ServiceHealth[]>(
    SERVICES_DEF.map((s) => ({ ...s, status: 'CHECKING' as const })),
  );
  const [autoRefresh, setAutoRefresh]   = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [countdown, setCountdown]       = useState(0);
  const cancelledRef = useRef(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkHealth = useCallback(async () => {
    setCountdown(refreshInterval);
    const results = await Promise.all(
      SERVICES_DEF.map(async (svc) => {
        const start = Date.now();
        try {
          const res = await fetch(svc.url, { signal: makeTimeoutSignal(5000) });
          const lat = Date.now() - start;
          if (!res.ok) return { ...svc, status: 'OFFLINE' as const, lastChecked: new Date() };
          const contentType = res.headers.get('content-type') ?? '';
          const payload = contentType.includes('application/json')
            ? await res.json() as HealthResponse
            : {};
          if (!isHealthyResponse(payload)) return { ...svc, status: 'OFFLINE' as const, lastChecked: new Date() };
          return { ...svc, status: 'ONLINE' as const, latency: lat, lastChecked: new Date() };
        } catch {
          return { ...svc, status: 'OFFLINE' as const, lastChecked: new Date() };
        }
      }),
    );
    if (!cancelledRef.current) setServices(results);
  }, [refreshInterval]);

  useEffect(() => {
    cancelledRef.current = false;
    void checkHealth();

    if (autoRefresh) {
      const id = setInterval(() => { void checkHealth(); }, refreshInterval * 1000);
      // Countdown timer
      setCountdown(refreshInterval);
      countdownRef.current = setInterval(() => {
        setCountdown((c) => Math.max(0, c - 1));
      }, 1000);
      return () => {
        cancelledRef.current = true;
        clearInterval(id);
        if (countdownRef.current) clearInterval(countdownRef.current);
      };
    }
    return () => { cancelledRef.current = true; };
  }, [checkHealth, autoRefresh, refreshInterval]);

  const online  = services.filter((s) => s.status === 'ONLINE').length;
  const offline = services.filter((s) => s.status === 'OFFLINE').length;
  const checking = services.filter((s) => s.status === 'CHECKING').length;

  const lats    = services.filter((s) => s.latency != null).map((s) => s.latency!);
  const avgLat  = lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : null;
  const maxLat  = lats.length ? Math.max(...lats) : null;

  // Group by class
  const groups = Array.from(new Set(SERVICES_DEF.map((s) => s.uptimeClass)));

  return (
    <div className={styles.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 className={styles.title} style={{ margin: 0 }}>Health Check — Monitoring Layanan</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
          {autoRefresh && (
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              style={{ padding: '5px 10px', fontSize: 13, border: '1px solid #E0E0E0', borderRadius: 6 }}
            >
              {[10, 15, 30, 60].map((s) => (
                <option key={s} value={s}>{s}s</option>
              ))}
            </select>
          )}
          <button
            onClick={() => { void checkHealth(); }}
            style={{ padding: '7px 16px', fontSize: 13, border: '1px solid #E0E0E0', borderRadius: 6, background: '#fff', cursor: 'pointer' }}
          >
            ↺ Refresh Sekarang
          </button>
          {autoRefresh && countdown > 0 && (
            <span style={{ fontSize: 12, color: '#9E9E9E' }}>refresh dalam {countdown}s</span>
          )}
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Online',     value: online,    color: '#43A047', bg: '#f0fdf4' },
          { label: 'Offline',    value: offline,   color: '#E53935', bg: '#fef2f2' },
          { label: 'Memeriksa',  value: checking,  color: '#FB8C00', bg: '#fffbeb' },
          { label: 'Avg Latency',value: avgLat != null ? `${avgLat}ms` : '—', color: '#1E88E5', bg: '#e3f2fd' },
          { label: 'Max Latency',value: maxLat != null ? `${maxLat}ms` : '—', color: '#7c3aed', bg: '#ede9fe' },
          { label: 'Total Layanan', value: services.length, color: '#212121', bg: '#F5F5F5' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} style={{
            background: bg, border: `1px solid ${color}30`, borderRadius: 8,
            padding: '16px 18px',
          }}>
            <div style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
            <div style={{ fontSize: 12, color, marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── Services by group ── */}
      {groups.map((group) => {
        const groupSvcs = services.filter((s) => s.uptimeClass === group);
        const gc = CLASS_COLORS[group] ?? { bg: '#F5F5F5', color: '#616161' };
        return (
          <div key={group} className={styles.card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{
                padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                background: gc.bg, color: gc.color,
              }}>
                {group}
              </span>
              <span style={{ fontSize: 12, color: '#9E9E9E' }}>
                {groupSvcs.filter((s) => s.status === 'ONLINE').length}/{groupSvcs.length} online
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {groupSvcs.map((svc) => {
                const isOnline  = svc.status === 'ONLINE';
                const isOffline = svc.status === 'OFFLINE';
                const latColor  = svc.latency == null ? '#9E9E9E' : svc.latency < 100 ? '#43A047' : svc.latency < 300 ? '#FB8C00' : '#E53935';

                return (
                  <div key={svc.name} style={{
                    padding: '14px 16px', borderRadius: 8,
                    background: isOnline ? '#f0fdf4' : isOffline ? '#fef2f2' : '#fafafa',
                    border: `1px solid ${isOnline ? '#86efac' : isOffline ? '#fca5a5' : '#E0E0E0'}`,
                    display: 'flex', flexDirection: 'column', gap: 8,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{svc.displayName}</div>
                        <div style={{ fontSize: 11, color: '#9E9E9E' }}>port {svc.port}</div>
                      </div>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                        background: isOnline ? '#dcfce7' : isOffline ? '#fee2e2' : '#F5F5F5',
                        color: isOnline ? '#166534' : isOffline ? '#991b1b' : '#9E9E9E',
                      }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: isOnline ? '#22c55e' : isOffline ? '#ef4444' : '#9E9E9E',
                        }} />
                        {svc.status}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                      <span style={{ color: latColor, fontWeight: 600 }}>
                        {svc.latency != null ? `${svc.latency}ms` : '—'}
                      </span>
                      {svc.lastChecked && (
                        <span style={{ color: '#9E9E9E' }}>
                          Cek: {svc.lastChecked.toLocaleTimeString('id-ID')}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
