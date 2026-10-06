import { useState, useCallback, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useReferrals } from '../hooks/useReferrals';
import { referralClient } from '../api/client';
import { appendLog } from '../hooks/useActivityLog';
import ChartCard from '../components/ChartCard';
import MiniKpiCard from '../components/MiniKpiCard';
import DurasiAktif from '../components/DurasiAktif';
import LastUpdated from '../components/LastUpdated';
import styles from './Page.module.css';

// ─── Konfigurasi badge ──────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  DRAFT:      { label: 'Draft',            cls: styles.badgePending },
  SENT:       { label: 'Menunggu',         cls: styles.badgeWarning },
  ACCEPTED:   { label: 'Diterima',         cls: styles.badgeOk },
  REJECTED:   { label: 'Ditolak',          cls: styles.badgeCritical },
  IN_TRANSIT: { label: 'Dalam Perjalanan', cls: styles.badgePending },
  ARRIVED:    { label: 'Tiba',             cls: styles.badgeOk },
  CANCELLED:  { label: 'Dibatalkan',       cls: styles.badgeCritical },
};

const URGENCY_CONFIG: Record<string, { label: string; cls: string; color: string; barColor: string }> = {
  NORMAL:    { label: 'Normal',   cls: styles.badgeOk,       color: 'var(--color-success)', barColor: '#10b981' },
  URGENT:    { label: 'Mendesak', cls: styles.badgeWarning,  color: 'var(--color-warning)', barColor: '#f59e0b' },
  CRITICAL:  { label: 'Kritis',   cls: styles.badgeCritical, color: 'var(--color-danger)',  barColor: '#ef4444' },
  EMERGENCY: { label: 'Darurat',  cls: styles.badgeCritical, color: 'var(--color-danger)',  barColor: '#dc2626' },
};

// ─── Tipe aksi yang tersedia per status ────────────────────────────────────

interface AksiRujukan {
  label: string;
  endpoint: string;
  style: 'primary' | 'danger' | 'secondary';
  konfirmasi?: string;
}

function getAksiTersedia(status: string): AksiRujukan[] {
  switch (status) {
    case 'SENT':
      return [
        { label: '✓ Terima',    endpoint: 'accept',  style: 'primary',    konfirmasi: 'Terima rujukan ini?' },
        { label: '✗ Tolak',     endpoint: 'reject',  style: 'danger',     konfirmasi: 'Tolak rujukan ini?' },
        { label: '⊘ Batalkan',  endpoint: 'cancel',  style: 'secondary',  konfirmasi: 'Batalkan rujukan ini?' },
      ];
    case 'ACCEPTED':
      return [
        { label: '🚑 Transit', endpoint: 'transit', style: 'primary',   konfirmasi: 'Mulai transit pasien?' },
        { label: '⊘ Batalkan', endpoint: 'cancel',  style: 'secondary', konfirmasi: 'Batalkan rujukan ini?' },
      ];
    case 'IN_TRANSIT':
      return [
        { label: '🏥 Tiba',    endpoint: 'arrive',  style: 'primary',   konfirmasi: 'Konfirmasi pasien telah tiba?' },
        { label: '⊘ Batalkan', endpoint: 'cancel',  style: 'secondary', konfirmasi: 'Batalkan rujukan dalam perjalanan?' },
      ];
    default:
      return [];
  }
}

// ─── SVG Funnel ───────────────────────────────────────────────────────────

interface FunnelStage {
  label: string;
  value: number;
  color: string;
}

function SvgFunnel({ stages }: { stages: FunnelStage[] }) {
  const maxVal = Math.max(...stages.map((s) => s.value), 1);
  const height = 36;
  const gap = 6;
  const totalH = stages.length * height + (stages.length - 1) * gap;
  const maxW = 260;

  return (
    <svg viewBox={`0 0 300 ${totalH + 8}`} style={{ width: '100%', maxWidth: 300, display: 'block', margin: '0 auto' }}>
      {stages.map((stage, idx) => {
        const w = Math.max(40, (stage.value / maxVal) * maxW);
        const x = (300 - w) / 2;
        const y = idx * (height + gap);
        return (
          <g key={stage.label}>
            <rect x={x} y={y} width={w} height={height} rx={5} fill={stage.color} opacity={0.85} />
            <text x={150} y={y + height / 2 + 1} textAnchor="middle" dominantBaseline="middle" fontSize={11} fontWeight={700} fill="#fff">
              {stage.label}
            </text>
            <text x={x + w + 6} y={y + height / 2 + 1} dominantBaseline="middle" fontSize={11} fontWeight={700} fill={stage.color}>
              {stage.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Skeleton loading ─────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr>
      {[80, 120, 100, 140, 180, 100, 140].map((w, i) => (
        <td key={i} style={{ padding: '11px 14px' }}>
          <div style={{
            height: 12, width: w, borderRadius: 6,
            background: 'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.4s ease-in-out infinite',
          }} />
        </td>
      ))}
    </tr>
  );
}

// ─── ReferralsPage utama ──────────────────────────────────────────────────

export default function ReferralsPage() {
  const {
    referrals,
    meta,
    loading,
    error,
    page,
    setPage,
    statusFilter,
    setStatusFilter,
    urgencyFilter,
    setUrgencyFilter,
    emergencyCount,
    inTransitCount,
    refetch,
  } = useReferrals(15000);

  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  useEffect(() => {
    setLastFetch(new Date());
  }, [referrals]);

  const totalPages = meta?.totalPages ?? 0;
  const total = meta?.total ?? 0;

  // ── Hitung status counts dari data yang ada ────────────────────────────
  const statusCounts: Record<string, number> = {};
  const urgencyCounts: Record<string, number> = {};
  for (const r of referrals) {
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
    if (r.urgency_level) urgencyCounts[r.urgency_level] = (urgencyCounts[r.urgency_level] ?? 0) + 1;
  }

  const pendingCount    = statusCounts['SENT']       ?? 0;
  const acceptedCount   = statusCounts['ACCEPTED']   ?? 0;
  const transitCount    = statusCounts['IN_TRANSIT'] ?? 0;
  const cancelledCount  = statusCounts['CANCELLED']  ?? 0;

  // Funnel stages: Sent → Accepted → In Transit → Arrived
  const arrivedCount = statusCounts['ARRIVED'] ?? 0;
  const funnelStages: FunnelStage[] = [
    { label: 'Menunggu',         value: pendingCount,  color: '#f59e0b' },
    { label: 'Diterima',         value: acceptedCount, color: '#6366f1' },
    { label: 'Dalam Perjalanan', value: transitCount,  color: '#0284c7' },
    { label: 'Tiba / Selesai',   value: arrivedCount,  color: '#10b981' },
  ].filter((s) => s.value > 0 || pendingCount > 0);

  // Bar chart urgensi
  const urgencyChartData = ['NORMAL', 'URGENT', 'CRITICAL', 'EMERGENCY'].map((key) => ({
    name: URGENCY_CONFIG[key]?.label ?? key,
    value: urgencyCounts[key] ?? 0,
    color: URGENCY_CONFIG[key]?.barColor ?? '#9ca3af',
  })).filter((d) => d.value > 0);

  // ── Handler aksi rujukan ──────────────────────────────────────────────────
  const handleAksi = useCallback(
    async (referralId: string, endpoint: string, konfirmasi?: string) => {
      if (konfirmasi && !window.confirm(konfirmasi)) return;
      let body: { rejectedReason?: string } | undefined;
      if (endpoint === 'reject') {
        const rejectedReason = window.prompt('Masukkan alasan penolakan (minimal 10 karakter):')?.trim() ?? '';
        if (rejectedReason.length < 10) {
          setActionError('Alasan penolakan minimal 10 karakter.');
          return;
        }
        body = { rejectedReason };
      }
      setActionLoading((prev) => ({ ...prev, [`${referralId}-${endpoint}`]: true }));
      setActionError(null);
      try {
        await referralClient.put(`/v1/referrals/${referralId}/${endpoint}`, body);
        setActionSuccess(`Aksi "${endpoint}" berhasil diterapkan.`);
        setTimeout(() => setActionSuccess(null), 4000);
        appendLog({
          level: 'success',
          actor: localStorage.getItem('cc_user_email') ?? 'sistem',
          action: `rujukan-${endpoint}`,
          detail: `Aksi rujukan "${endpoint}" berhasil diterapkan pada ID ${referralId}`,
          page: 'ReferralsPage',
        });
        await refetch();
      } catch (err: unknown) {
        const e = err as { response?: { data?: { detail?: string; message?: string } } };
        const errMsg = e.response?.data?.detail ?? e.response?.data?.message ?? `Gagal melakukan aksi: ${endpoint}`;
        setActionError(errMsg);
        setTimeout(() => setActionError(null), 5000);
        appendLog({
          level: 'danger',
          actor: localStorage.getItem('cc_user_email') ?? 'sistem',
          action: `rujukan-${endpoint}-gagal`,
          detail: `Gagal aksi rujukan "${endpoint}" pada ID ${referralId}: ${errMsg}`,
          page: 'ReferralsPage',
        });
      } finally {
        setActionLoading((prev) => {
          const next = { ...prev };
          delete next[`${referralId}-${endpoint}`];
          return next;
        });
      }
    },
    [refetch],
  );

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 className={styles.title} style={{ marginBottom: 0 }}>Rujukan Pasien</h1>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 4 }}>
            {emergencyCount > 0 && <span style={{ color: 'var(--color-danger)', fontWeight: 700 }}>{emergencyCount} Kritis/Darurat · </span>}
            {inTransitCount > 0 && <span style={{ color: 'var(--color-info)', fontWeight: 700 }}>{inTransitCount} Dalam Perjalanan · </span>}
            {total > 0 ? `${total} Total` : 'Memuat...'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LastUpdated timestamp={lastFetch} />
          <button
            onClick={() => void refetch()}
            className={`${styles.btn} ${styles.btnSecondary}`}
            style={{ fontSize: 13 }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* ── Notifikasi aksi ── */}
      {actionSuccess && (
        <div style={{
          background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)',
          borderRadius: 6, padding: '12px 16px', marginBottom: 16,
          fontSize: 13, color: 'var(--color-success)', fontWeight: 500,
          animation: 'fadeInUp 0.3s ease both',
        }}>
          ✅ {actionSuccess}
        </div>
      )}

      {actionError && (
        <div style={{
          background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)',
          borderRadius: 6, padding: '12px 16px', marginBottom: 16,
          fontSize: 13, color: 'var(--color-danger)',
          animation: 'fadeInUp 0.3s ease both',
        }}>
          ⚠️ {actionError}
        </div>
      )}

      {/* ── KPI Cards ── */}
      {!loading && referrals.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14, marginBottom: 24 }}>
          <MiniKpiCard label="Total"            value={total}          icon="📋" color="var(--color-primary)"  />
          <MiniKpiCard label="Menunggu"         value={pendingCount}   icon="⏳" color="#f59e0b"               />
          <MiniKpiCard label="Diterima"         value={acceptedCount}  icon="✔" color="#6366f1"               />
          <MiniKpiCard label="Dalam Perjalanan" value={transitCount}   icon="🚑" color="#0284c7"               trend={transitCount > 0 ? 'up' : 'neutral'} />
          <MiniKpiCard label="Tiba"             value={arrivedCount}   icon="✅" color="#10b981"               />
          <MiniKpiCard label="Dibatalkan"       value={cancelledCount} icon="❌" color="#ef4444"               />
        </div>
      )}

      {/* ── Charts row: Funnel + Bar Chart urgensi ── */}
      {!loading && referrals.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          {/* SVG Funnel pipeline rujukan */}
          <ChartCard title="Pipeline Rujukan" subtitle="Alur status: Menunggu → Tiba/Selesai">
            <div style={{ paddingTop: 8 }}>
              <SvgFunnel stages={funnelStages} />
            </div>
          </ChartCard>

          {/* Bar Chart distribusi urgensi */}
          <ChartCard title="Distribusi Urgensi" subtitle="Jumlah rujukan per tingkat urgensi">
            {urgencyChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={urgencyChartData} margin={{ top: 8, right: 8, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--color-border)' }}
                    formatter={(value: number) => [value, 'Rujukan']}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {urgencyChartData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--color-muted)', fontSize: 13, paddingTop: 60 }}>
                Tidak ada data urgensi
              </div>
            )}
          </ChartCard>
        </div>
      )}

      <div className={styles.card}>
        {/* ── Toolbar filter ── */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            style={{
              padding: '8px 12px', border: '1px solid var(--color-border)',
              borderRadius: 6, fontSize: 13, background: 'var(--color-surface-2)',
              color: 'var(--color-text)', cursor: 'pointer',
            }}
          >
            <option value="">Semua Status</option>
            <option value="DRAFT">Draft</option>
            <option value="SENT">Menunggu</option>
            <option value="ACCEPTED">Diterima</option>
            <option value="REJECTED">Ditolak</option>
            <option value="IN_TRANSIT">Dalam Perjalanan</option>
            <option value="ARRIVED">Tiba</option>
            <option value="CANCELLED">Dibatalkan</option>
          </select>
          <select
            value={urgencyFilter}
            onChange={(e) => { setUrgencyFilter(e.target.value); setPage(1); }}
            style={{
              padding: '8px 12px', border: '1px solid var(--color-border)',
              borderRadius: 6, fontSize: 13, background: 'var(--color-surface-2)',
              color: 'var(--color-text)', cursor: 'pointer',
            }}
          >
            <option value="">Semua Urgensi</option>
            <option value="NORMAL">Normal</option>
            <option value="URGENT">Mendesak</option>
            <option value="CRITICAL">Kritis</option>
            <option value="EMERGENCY">Darurat</option>
          </select>
        </div>

        {/* ── Error state ── */}
        {error && (
          <div style={{
            background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)',
            borderRadius: 6, padding: '12px 16px', marginBottom: 16,
            fontSize: 13, color: 'var(--color-danger)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>{error}</span>
            <button
              onClick={() => void refetch()}
              style={{ padding: '4px 10px', background: 'transparent', border: '1px solid var(--color-danger-border)', borderRadius: 4, fontSize: 12, cursor: 'pointer', color: 'var(--color-danger)' }}
            >
              Coba Lagi
            </button>
          </div>
        )}

        {/* ── Tabel ── */}
        {loading ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Urgensi</th>
                <th>Status</th>
                <th>Pasien</th>
                <th>Alasan</th>
                <th>RS Asal → RS Tujuan</th>
                <th>Tanggal</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>{Array.from({ length: 6 }, (_, i) => <SkeletonRow key={i} />)}</tbody>
          </table>
        ) : referrals.length === 0 ? (
          <div className={styles.emptyState}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
            <div style={{ fontWeight: 600 }}>
              {statusFilter || urgencyFilter
                ? 'Tidak ada rujukan dengan filter yang dipilih'
                : 'Tidak ada rujukan ditemukan'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 4 }}>
              Data rujukan akan muncul setelah dokter membuat permintaan rujukan
            </div>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Urgensi</th>
                <th>Status</th>
                <th>Pasien</th>
                <th>Alasan</th>
                <th>RS Asal → RS Tujuan</th>
                <th>Tanggal</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {referrals.map((r) => {
                const statusCfg = STATUS_CONFIG[r.status] ?? { label: r.status, cls: '' };
                const urgencyCfg = URGENCY_CONFIG[r.urgency_level] ?? { label: r.urgency_level, cls: '', color: 'var(--color-muted)', barColor: '#9ca3af' };
                const aksiList = getAksiTersedia(r.status);
                return (
                  <tr
                    key={r.id}
                    style={(r.urgency_level === 'EMERGENCY' || r.urgency_level === 'CRITICAL')
                      ? { background: 'var(--color-danger-bg)' }
                      : undefined}
                  >
                    <td>
                      <span className={`${styles.badge} ${urgencyCfg.cls}`}>
                        {urgencyCfg.label}
                      </span>
                    </td>
                    <td>
                      <span className={`${styles.badge} ${statusCfg.cls}`}>
                        {statusCfg.label}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--color-muted)' }}>
                      {r.patient_id.slice(0, 8)}…
                    </td>
                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                      {r.reason ?? <span style={{ color: 'var(--color-disabled)', fontStyle: 'italic' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                      <span title={r.from_hospital_id ?? '—'}>
                        {r.from_hospital_id ? r.from_hospital_id.slice(0, 6) + '…' : '—'}
                      </span>
                      <span style={{ margin: '0 4px' }}>→</span>
                      <span title={r.to_hospital_id ?? '—'}>
                        {r.to_hospital_id ? r.to_hospital_id.slice(0, 6) + '…' : '—'}
                      </span>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                      <div>{new Date(r.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                      {(r.status === 'SENT' || r.status === 'ACCEPTED') && (
                        <DurasiAktif
                          isoString={r.created_at}
                          warnAfterMinutes={r.urgency_level === 'EMERGENCY' ? 5 : r.urgency_level === 'CRITICAL' ? 10 : 30}
                          criticalAfterMinutes={r.urgency_level === 'EMERGENCY' ? 10 : r.urgency_level === 'CRITICAL' ? 20 : 60}
                        />
                      )}
                    </td>
                    <td>
                      {aksiList.length === 0 ? (
                        <span style={{ fontSize: 11, color: 'var(--color-disabled)', fontStyle: 'italic' }}>—</span>
                      ) : (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {aksiList.map((aksi) => {
                            const isLoading = actionLoading[`${r.id}-${aksi.endpoint}`] === true;
                            return (
                              <button
                                key={aksi.endpoint}
                                onClick={() => void handleAksi(r.id, aksi.endpoint, aksi.konfirmasi)}
                                disabled={isLoading}
                                className={`${styles.btn} ${
                                  aksi.style === 'primary' ? styles.btnPrimary
                                  : aksi.style === 'danger' ? styles.btnDanger
                                  : styles.btnSecondary
                                }`}
                                style={{
                                  padding: '3px 8px', fontSize: 10, height: 'auto',
                                  cursor: isLoading ? 'not-allowed' : 'pointer',
                                  opacity: isLoading ? 0.6 : 1,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {isLoading ? '⏳' : aksi.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* ── Pagination ── */}
        {!loading && (
          <div className={styles.pagination}>
            <span>Total: {total} rujukan</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className={`${styles.btn} ${styles.btnSecondary}`}
                style={{ padding: '4px 10px', fontSize: 12 }}
              >
                ← Prev
              </button>
              <span style={{ fontSize: 13, color: 'var(--color-muted)', minWidth: 80, textAlign: 'center' }}>
                Hal. {page} / {totalPages || 1}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
                className={`${styles.btn} ${styles.btnSecondary}`}
                style={{ padding: '4px 10px', fontSize: 12 }}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
