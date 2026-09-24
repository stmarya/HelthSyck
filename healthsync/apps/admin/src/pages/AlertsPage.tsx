import { useEffect, useState, useCallback, useRef } from 'react';
import { alertClient } from '../api/client';
import type { AlertRow, AlertLevel, AlertStatus, AlertsApiResponse } from '../types/admin';
import { ConfirmDialog } from '../components/Modal';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import { SelectField } from '../components/FormField';
import { Skeleton } from '../components/Skeleton';
import styles from './Page.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Konstanta & Peta Tampilan
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_OPTIONS: { value: AlertLevel | ''; label: string }[] = [
  { value: '',        label: 'Semua Level' },
  { value: 'LEVEL_1', label: 'Level 1 — Perhatian' },
  { value: 'LEVEL_2', label: 'Level 2 — Peringatan' },
  { value: 'LEVEL_3', label: 'Level 3 — Kritis' },
];

const STATUS_OPTIONS: { value: AlertStatus | ''; label: string }[] = [
  { value: '',              label: 'Semua Status' },
  { value: 'ACTIVE',        label: 'Aktif' },
  { value: 'ACKNOWLEDGED',  label: 'Diakui' },
  { value: 'RESOLVED',      label: 'Diselesaikan' },
  { value: 'FALSE_POSITIVE',label: 'Positif Palsu' },
];

/** Style per level urgensi */
const LEVEL_STYLE: Record<AlertLevel, { bg: string; color: string; label: string; icon: string }> = {
  LEVEL_1: { bg: 'var(--color-warning-bg)', color: 'var(--color-warning)', label: 'Perhatian',  icon: '⚠️' },
  LEVEL_2: { bg: '#fff3e0',                 color: '#e65100',              label: 'Peringatan', icon: '🔶' },
  LEVEL_3: { bg: 'var(--color-danger-bg)',  color: 'var(--color-danger)',  label: 'Kritis',     icon: '🚨' },
};

/** Style per status alert */
const STATUS_STYLE: Record<AlertStatus, { bg: string; color: string; label: string }> = {
  ACTIVE:         { bg: 'var(--color-danger-bg)',  color: 'var(--color-danger)',  label: 'Aktif' },
  ACKNOWLEDGED:   { bg: 'var(--color-warning-bg)', color: 'var(--color-warning)', label: 'Diakui' },
  RESOLVED:       { bg: 'var(--color-success-bg)', color: 'var(--color-success)', label: 'Selesai' },
  FALSE_POSITIVE: { bg: '#f5f5f5',                 color: '#9e9e9e',              label: 'Positif Palsu' },
};

/** Label metrik vital sign */
const METRIC_LABEL: Record<string, string> = {
  heart_rate:  'Detak Jantung',
  spo2:        'Saturasi Oksigen (SpO₂)',
  temperature: 'Suhu Tubuh',
};

const METRIC_UNIT: Record<string, string> = {
  heart_rate:  'bpm',
  spo2:        '%',
  temperature: '°C',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

/** Hitung selisih waktu sejak alert dibuat */
function agoLabel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const menit = Math.floor(diff / 60_000);
  if (menit < 1)  return 'Baru saja';
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24)   return `${jam} jam lalu`;
  return `${Math.floor(jam / 24)} hari lalu`;
}

// ─────────────────────────────────────────────────────────────────────────────
// AlertsPage — halaman monitoring & manajemen alert IoT / vital signs
// ─────────────────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const { showToast } = useToast();

  // ── State data ──
  const [rows, setRows]       = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // ── State filter ──
  const [levelFilter, setLevelFilter]   = useState<AlertLevel | ''>('');
  const [statusFilter, setStatusFilter] = useState<AlertStatus | ''>('ACTIVE');
  const [limit]                         = useState(20);
  const [offset, setOffset]             = useState(0);

  // ── State aksi ──
  const [actionTarget, setActionTarget] = useState<{ row: AlertRow; action: 'acknowledge' | 'resolve' | 'false-positive' } | null>(null);
  const [actionBusy, setActionBusy]     = useState(false);

  // ── Auto-refresh ──
  const [autoRefresh, setAutoRefresh]   = useState(true);
  const [lastRefresh, setLastRefresh]   = useState<Date | null>(null);
  const intervalRef                     = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch data ──
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (levelFilter)  params.set('level', levelFilter);
      if (statusFilter) params.set('status', statusFilter);

      const res = await alertClient.get<AlertsApiResponse>(`/v1/alerts?${params.toString()}`);
      setRows(res.data.data ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat data alert';
      if (!silent) {
        setError(msg);
        showToast(msg, 'error');
      }
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, [limit, offset, levelFilter, statusFilter, showToast]);

  // Fetch awal
  useEffect(() => { void fetchData(); }, [fetchData]);

  // Reset offset saat filter berubah
  useEffect(() => { setOffset(0); }, [levelFilter, statusFilter]);

  // Auto-refresh setiap 15 detik jika aktif
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => { void fetchData(true); }, 15_000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, fetchData]);

  // ── Aksi: acknowledge / resolve / false-positive ──
  const handleAction = async () => {
    if (!actionTarget) return;
    setActionBusy(true);
    try {
      const { row, action } = actionTarget;
      await alertClient.post(`/v1/alerts/${row.id}/${action}`);

      const labelAksi = action === 'acknowledge' ? 'diakui'
        : action === 'resolve' ? 'diselesaikan'
        : 'ditandai positif palsu';

      showToast(`Alert berhasil ${labelAksi}`, 'success');
      setActionTarget(null);
      void fetchData(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memproses aksi';
      showToast(msg, 'error');
    } finally {
      setActionBusy(false);
    }
  };

  // ── Statistik ringkas ──
  const countAktif    = rows.filter((r) => r.status === 'ACTIVE').length;
  const countKritis   = rows.filter((r) => r.level === 'LEVEL_3' && r.status === 'ACTIVE').length;
  const countDiakui   = rows.filter((r) => r.status === 'ACKNOWLEDGED').length;
  const countSelesai  = rows.filter((r) => r.status === 'RESOLVED').length;

  // ── Label aksi ──
  const getActionLabel = (action: string) => {
    if (action === 'acknowledge')   return 'Akui Alert';
    if (action === 'resolve')       return 'Tandai Selesai';
    if (action === 'false-positive') return 'Tandai Positif Palsu';
    return action;
  };

  const getActionMessage = (target: typeof actionTarget): string => {
    if (!target) return '';
    const { row, action } = target;
    const lvl = LEVEL_STYLE[row.level];
    if (action === 'acknowledge')
      return `Akui alert ${lvl.label} untuk pasien ${row.patient_name ?? row.patient_id.slice(0, 8)} (${METRIC_LABEL[row.trigger_metric] ?? row.trigger_metric}: ${row.trigger_value} ${METRIC_UNIT[row.trigger_metric] ?? ''})?`;
    if (action === 'resolve')
      return `Tandai alert ini sebagai DISELESAIKAN? Pastikan kondisi pasien sudah ditangani.`;
    return `Tandai alert ini sebagai POSITIF PALSU? Gunakan hanya jika yakin ini bukan kondisi berbahaya.`;
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Monitoring Alert"
        subtitle="Pantau dan kelola alert vital sign pasien secara real-time"
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Alert' }]}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-muted)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto-refresh (15s)
            </label>
            <button
              className={`${styles.btn} ${styles.btnOutline}`}
              onClick={() => void fetchData()}
              title="Muat ulang sekarang"
            >
              ↻ Refresh
            </button>
          </div>
        }
      />

      {/* ── Status refresh ── */}
      {lastRefresh && (
        <div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 12 }}>
          Terakhir diperbarui: {lastRefresh.toLocaleTimeString('id-ID')}
          {autoRefresh && <span style={{ marginLeft: 6, color: 'var(--color-success)' }}>● Live</span>}
        </div>
      )}

      {/* ── Stat Cards ── */}
      <div className={styles.statGrid} style={{ marginBottom: 20 }}>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: 'var(--color-danger)' }}>{countAktif}</div>
          <div className={styles.statLabel}>Alert Aktif</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: '#e65100' }}>{countKritis}</div>
          <div className={styles.statLabel}>🚨 Kritis (Level 3)</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: 'var(--color-warning)' }}>{countDiakui}</div>
          <div className={styles.statLabel}>Sedang Ditangani</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: 'var(--color-success)' }}>{countSelesai}</div>
          <div className={styles.statLabel}>Diselesaikan</div>
        </div>
      </div>

      {/* ── Filter ── */}
      <div className={styles.card}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '0 1 220px' }}>
            <SelectField
              label="Filter Level"
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value as AlertLevel | '')}
              options={LEVEL_OPTIONS}
            />
          </div>
          <div style={{ flex: '0 1 220px' }}>
            <SelectField
              label="Filter Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as AlertStatus | '')}
              options={STATUS_OPTIONS}
            />
          </div>
          <button
            className={`${styles.btn} ${styles.btnOutline}`}
            onClick={() => { setLevelFilter(''); setStatusFilter('ACTIVE'); setOffset(0); }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* ── Tabel Alert ── */}
      <div className={styles.card} style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 'var(--space-6)' }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} height={52} style={{ marginBottom: 8 }} />
            ))}
          </div>
        ) : error ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateIcon}>⚠️</div>
            <div className={styles.emptyStateTitle}>Gagal memuat data alert</div>
            <div style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 12 }}>{error}</div>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => void fetchData()}>
              Coba Lagi
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateIcon}>✅</div>
            <div className={styles.emptyStateTitle}>Tidak ada alert</div>
            <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
              {statusFilter === 'ACTIVE'
                ? 'Tidak ada alert aktif saat ini. Kondisi sistem normal.'
                : 'Tidak ada alert yang cocok dengan filter saat ini.'}
            </div>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ width: 100 }}>Level</th>
                  <th>Pasien</th>
                  <th>Metrik</th>
                  <th style={{ textAlign: 'center' }}>Nilai / Ambang</th>
                  <th>Pesan</th>
                  <th style={{ width: 100 }}>Status</th>
                  <th style={{ width: 120 }}>Dibuat</th>
                  <th style={{ width: 160, textAlign: 'center' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const lvl = LEVEL_STYLE[row.level];
                  const st  = STATUS_STYLE[row.status];
                  const unit = METRIC_UNIT[row.trigger_metric] ?? '';
                  return (
                    <tr
                      key={row.id}
                      style={{
                        background: row.level === 'LEVEL_3' && row.status === 'ACTIVE'
                          ? 'rgba(239,68,68,0.04)'
                          : undefined,
                      }}
                    >
                      {/* Level */}
                      <td>
                        <span className={styles.badge} style={{ background: lvl.bg, color: lvl.color, fontWeight: 700 }}>
                          {lvl.icon} {lvl.label}
                        </span>
                      </td>

                      {/* Pasien */}
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                          {row.patient_name ?? <span style={{ color: 'var(--color-muted)', fontFamily: 'monospace', fontSize: 'var(--text-xs)' }}>{row.patient_id.slice(0, 8)}…</span>}
                        </div>
                      </td>

                      {/* Metrik */}
                      <td style={{ fontSize: 'var(--text-sm)' }}>
                        {METRIC_LABEL[row.trigger_metric] ?? row.trigger_metric}
                      </td>

                      {/* Nilai / Ambang */}
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 700, color: lvl.color, fontSize: 'var(--text-sm)' }}>
                          {row.trigger_value} {unit}
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
                          &gt; {row.trigger_threshold} {unit}
                        </div>
                      </td>

                      {/* Pesan */}
                      <td style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.message}
                      </td>

                      {/* Status */}
                      <td>
                        <span className={styles.badge} style={{ background: st.bg, color: st.color }}>
                          {st.label}
                        </span>
                      </td>

                      {/* Waktu */}
                      <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
                        <div>{agoLabel(row.created_at)}</div>
                        <div style={{ fontSize: 10 }}>{formatDateTime(row.created_at)}</div>
                      </td>

                      {/* Aksi */}
                      <td style={{ textAlign: 'center' }}>
                        {row.status === 'ACTIVE' && (
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                            <button
                              className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                              onClick={() => setActionTarget({ row, action: 'acknowledge' })}
                              title="Akui alert"
                            >
                              Akui
                            </button>
                            <button
                              className={`${styles.btn} ${styles.btnSm} ${styles.btnPrimary}`}
                              onClick={() => setActionTarget({ row, action: 'resolve' })}
                              title="Tandai selesai"
                            >
                              Selesai
                            </button>
                          </div>
                        )}
                        {row.status === 'ACKNOWLEDGED' && (
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                            <button
                              className={`${styles.btn} ${styles.btnSm} ${styles.btnPrimary}`}
                              onClick={() => setActionTarget({ row, action: 'resolve' })}
                            >
                              Selesai
                            </button>
                            <button
                              className={`${styles.btn} ${styles.btnSm} ${styles.btnGhost}`}
                              onClick={() => setActionTarget({ row, action: 'false-positive' })}
                              title="Tandai positif palsu"
                              style={{ fontSize: 10 }}
                            >
                              Palsu
                            </button>
                          </div>
                        )}
                        {(row.status === 'RESOLVED' || row.status === 'FALSE_POSITIVE') && (
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
                            {row.status === 'RESOLVED' ? '✅ Selesai' : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginasi (offset-based) */}
        {!loading && rows.length > 0 && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: 'var(--space-3) var(--space-4)',
            borderTop: '1px solid var(--color-border)',
            fontSize: 'var(--text-sm)', color: 'var(--color-muted)',
          }}>
            <span>Menampilkan {offset + 1}–{offset + rows.length}</span>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button
                className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
              >
                ← Sebelumnya
              </button>
              <button
                className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                disabled={rows.length < limit}
                onClick={() => setOffset(offset + limit)}
              >
                Berikutnya →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Panduan Level ── */}
      <div className={styles.card}>
        <h3 style={{ margin: '0 0 12px', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Panduan Level Urgensi
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {([
            { level: 'LEVEL_1', desc: 'Detak jantung >120, SpO₂ <92%, Suhu >38°C. Monitor intensif, hubungi tim medis.' },
            { level: 'LEVEL_2', desc: 'Detak jantung >150, SpO₂ <88%, Suhu >39°C. Respons cepat diperlukan.' },
            { level: 'LEVEL_3', desc: 'Detak jantung >180, SpO₂ <85%, Suhu >40°C. DARURAT — tindakan segera!' },
          ] as { level: AlertLevel; desc: string }[]).map(({ level, desc }) => {
            const st = LEVEL_STYLE[level];
            return (
              <div key={level} style={{
                padding: '10px 14px', borderRadius: 8,
                background: st.bg, border: `1px solid ${st.color}30`,
              }}>
                <div style={{ fontWeight: 700, color: st.color, marginBottom: 4, fontSize: 'var(--text-sm)' }}>
                  {st.icon} {st.label}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>{desc}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Dialog Konfirmasi Aksi ── */}
      {actionTarget && (
        <ConfirmDialog
          open
          title={getActionLabel(actionTarget.action)}
          message={getActionMessage(actionTarget)}
          confirmLabel={actionBusy ? 'Memproses…' : getActionLabel(actionTarget.action)}
          danger={actionTarget.action === 'false-positive'}
          onConfirm={handleAction}
          onCancel={() => setActionTarget(null)}
        />
      )}
    </div>
  );
}
