import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useAlerts } from '../hooks/useAlerts';
import ChartCard from '../components/ChartCard';
import MiniKpiCard from '../components/MiniKpiCard';
import ChipFilter from '../components/ChipFilter';
import DurasiAktif from '../components/DurasiAktif';
import LastUpdated from '../components/LastUpdated';
import { appendLog } from '../hooks/useActivityLog';
import styles from './Page.module.css';

// ─── Konfigurasi severity ──────────────────────────────────────────────────

const LEVEL_CONFIG = {
  LEVEL_3: { label: 'CRITICAL', color: '#991b1b', bg: '#fee2e2', dot: '#ef4444', barColor: '#ef4444' },
  LEVEL_2: { label: 'URGENT',   color: '#92400e', bg: '#fef3c7', dot: '#f59e0b', barColor: '#f59e0b' },
  LEVEL_1: { label: 'WARNING',  color: '#1e40af', bg: '#dbeafe', dot: '#3b82f6', barColor: '#3b82f6' },
} as const;

// ─── Helper waktu relatif ──────────────────────────────────────────────────

function relativeTime(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return `${diff} detik lalu`;
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  return `${Math.floor(diff / 86400)} hari lalu`;
}

// ─── AlertsPage utama ────────────────────────────────────────────────────

export default function AlertsPage() {
  const { alerts, loading, error, criticalCount, urgentCount, acknowledgeAlert, resolveAlert, refetch } =
    useAlerts(10000);

  // Dapatkan email user untuk audit log
  const _actor = (() => {
    try { return (JSON.parse(localStorage.getItem('hs_user') ?? '{}') as { email?: string }).email ?? 'Operator'; }
    catch { return 'Operator'; }
  })();

  const [filterLevel, setFilterLevel] = useState('');
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Perbarui lastFetch setiap kali daftar alerts berubah
  useEffect(() => {
    if (alerts.length >= 0) setLastFetch(new Date());
  }, [alerts]);

  // BUG FIX: Reset pilihan checkbox saat filter level berubah
  // (mencegah acknowledge alert dari level A saat sedang lihat level B)
  useEffect(() => {
    setSelectedIds(new Set());
  }, [filterLevel]);

  const warningCount = alerts.filter((a) => a.level === 'LEVEL_1').length;

  // Filter alerts berdasarkan level yang dipilih
  const filteredAlerts = filterLevel
    ? alerts.filter((a) => a.level === filterLevel)
    : alerts;

  // Data untuk BarChart severity
  const severityData = [
    { name: 'Critical', value: criticalCount, color: '#ef4444' },
    { name: 'Urgent',   value: urgentCount,   color: '#f59e0b' },
    { name: 'Warning',  value: warningCount,  color: '#3b82f6' },
  ];

  // Opsi chip filter berdasarkan level
  const chipOptions = [
    { value: 'LEVEL_3', label: 'Critical', count: criticalCount, color: '#ef4444' },
    { value: 'LEVEL_2', label: 'Urgent',   count: urgentCount,   color: '#f59e0b' },
    { value: 'LEVEL_1', label: 'Warning',  count: warningCount,  color: '#3b82f6' },
  ];

  // 5 alert terbaru untuk timeline
  const recentAlerts = [...alerts]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  // Toggle seleksi checkbox per alert
  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Acknowledge semua alert yang dipilih sekaligus
  async function bulkAcknowledge() {
    const ids = [...selectedIds];
    await Promise.all(ids.map(id => acknowledgeAlert(id)));
    setSelectedIds(new Set());
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>Memuat alerts...</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 className={styles.title} style={{ marginBottom: 0 }}>Alert Management</h1>
          <p style={{ color: 'var(--color-muted)', fontSize: '13px', marginTop: '4px' }}>
            {criticalCount > 0 && (
              <span style={{ color: '#ef4444', fontWeight: 700 }}>{criticalCount} Critical • </span>
            )}
            {urgentCount > 0 && (
              <span style={{ color: '#f59e0b', fontWeight: 700 }}>{urgentCount} Urgent • </span>
            )}
            {alerts.length} Total Aktif
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Tombol bulk acknowledge — muncul jika ada alert yang dipilih */}
          {selectedIds.size > 0 && (
            <button
              onClick={() => void bulkAcknowledge()}
              style={{ padding: '7px 14px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 700 }}
            >
              ✓ Acknowledge {selectedIds.size} Alert
            </button>
          )}
          <button
            onClick={() => void refetch()}
            style={{ padding: '7px 14px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
          >
            ↻ Refresh
          </button>
          {/* Tampilkan waktu terakhir data diperbarui */}
          <LastUpdated timestamp={lastFetch} />
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#991b1b' }}>
          {error} — Pastikan alert-service berjalan di port 4002
        </div>
      )}

      {/* ── KPI Cards ── */}
      {alerts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
          <MiniKpiCard label="Total Aktif"    value={alerts.length}  icon="🔔" color="var(--color-info)"    />
          <MiniKpiCard label="Critical"       value={criticalCount}  icon="🔴" color="#ef4444"              trend={criticalCount > 0 ? 'up' : 'neutral'} />
          <MiniKpiCard label="Urgent"         value={urgentCount}    icon="🟡" color="#f59e0b"              trend={urgentCount > 0 ? 'up' : 'neutral'} />
          <MiniKpiCard label="Warning"        value={warningCount}   icon="🔵" color="#3b82f6"              />
        </div>
      )}

      {/* ── Charts row ── */}
      {alerts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          {/* Bar Chart Distribusi Severity */}
          <ChartCard title="Distribusi Severity" subtitle="Jumlah alert berdasarkan tingkat keparahan">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={severityData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--color-border)' }}
                  formatter={(value: number) => [value, 'Alert']}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {severityData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Timeline 5 alert terbaru */}
          <ChartCard title="Alert Terbaru" subtitle="5 alert terakhir">
            {recentAlerts.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--color-muted)', fontSize: 13, paddingTop: 40 }}>Tidak ada alert terbaru</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {recentAlerts.map((alert, idx) => {
                  const cfg = LEVEL_CONFIG[alert.level] ?? LEVEL_CONFIG.LEVEL_1;
                  const isLast = idx === recentAlerts.length - 1;
                  return (
                    <div key={alert.id} style={{ display: 'flex', gap: 12, position: 'relative' }}>
                      {/* Dot + line */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                        <div style={{
                          width: 10, height: 10, borderRadius: '50%',
                          background: cfg.dot, border: '2px solid #fff',
                          boxShadow: `0 0 0 2px ${cfg.dot}40`,
                          zIndex: 1, flexShrink: 0, marginTop: 3,
                        }} />
                        {!isLast && (
                          <div style={{ width: 2, flex: 1, background: 'var(--color-border)', minHeight: 20, marginTop: 2 }} />
                        )}
                      </div>
                      {/* Content */}
                      <div style={{ paddingBottom: isLast ? 0 : 12, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 1 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                            {cfg.label}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                            {relativeTime(alert.created_at)}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {alert.message}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                          {alert.trigger_metric}: {alert.trigger_value}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ChartCard>
        </div>
      )}

      {/* ── Empty state ── */}
      {alerts.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--color-muted)', background: 'var(--color-surface)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>✅</div>
          <div style={{ fontWeight: 600 }}>Tidak ada alert aktif</div>
          <div style={{ fontSize: '13px', marginTop: '4px' }}>Semua pasien dalam kondisi normal</div>
        </div>
      )}

      {/* ── Filter Chip berdasarkan Level ── */}
      <div style={{ marginBottom: 16 }}>
        <ChipFilter
          options={chipOptions}
          value={filterLevel}
          onChange={(v) => { setFilterLevel(v); setSelectedIds(new Set()); }}
          allLabel="Semua Level"
        />
      </div>

      {/* ── Daftar Alert ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredAlerts.map((alert) => {
          const cfg = LEVEL_CONFIG[alert.level] ?? LEVEL_CONFIG.LEVEL_1;
          return (
            <div
              key={alert.id}
              style={{
                background: cfg.bg,
                border: `1px solid ${cfg.dot}40`,
                borderRadius: '8px',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '14px',
              }}
            >
              {/* Checkbox seleksi — hanya untuk alert ACTIVE */}
              {alert.status === 'ACTIVE' && (
                <input
                  type="checkbox"
                  checked={selectedIds.has(alert.id)}
                  onChange={() => toggleSelect(alert.id)}
                  style={{ flexShrink: 0, cursor: 'pointer', width: 14, height: 14 }}
                />
              )}
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: cfg.dot, marginTop: '4px', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: cfg.color, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    {cfg.label}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
                    {new Date(alert.created_at).toLocaleTimeString('id-ID')}
                  </span>
                </div>
                <div style={{ fontWeight: 600, fontSize: '14px', color: '#1f2328', marginBottom: '2px' }}>
                  {alert.message}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
                  Pasien: {alert.patient_name ?? alert.patient_id.slice(0, 8)} •{' '}
                  {alert.trigger_metric}: {alert.trigger_value} (threshold: {alert.trigger_threshold})
                </div>
                {/* Durasi aktif sejak alert dibuat */}
                <DurasiAktif
                  isoString={alert.created_at}
                  warnAfterMinutes={30}
                  criticalAfterMinutes={60}
                  prefix="Aktif sejak: "
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                {alert.status === 'ACTIVE' && (
                  <button
                    onClick={() => {
                      void acknowledgeAlert(alert.id);
                      appendLog({ level: 'info', actor: _actor, action: 'Acknowledge Alert', detail: `Alert "${alert.message}" (${cfg.label}) di-acknowledge`, page: 'Alerts' });
                    }}
                    style={{ padding: '5px 12px', background: '#fff', border: `1px solid ${cfg.dot}`, borderRadius: '5px', fontSize: '12px', cursor: 'pointer', color: cfg.color, fontWeight: 600 }}
                  >
                    Acknowledge
                  </button>
                )}
                <button
                  onClick={() => {
                    void resolveAlert(alert.id);
                    appendLog({ level: 'success', actor: _actor, action: 'Resolve Alert', detail: `Alert "${alert.message}" (${cfg.label}) diselesaikan`, page: 'Alerts' });
                  }}
                  style={{ padding: '5px 12px', background: cfg.dot, border: 'none', borderRadius: '5px', fontSize: '12px', cursor: 'pointer', color: '#fff', fontWeight: 600 }}
                >
                  Resolve
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
