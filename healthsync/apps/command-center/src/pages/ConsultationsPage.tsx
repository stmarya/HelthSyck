import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useConsultations } from '../hooks/useConsultations';
import ChartCard from '../components/ChartCard';
import MiniKpiCard from '../components/MiniKpiCard';
import DurasiAktif from '../components/DurasiAktif';
import LastUpdated from '../components/LastUpdated';
import styles from './Page.module.css';

// ─── Konfigurasi status ────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; cls: string; color: string }> = {
  PENDING:     { label: 'Menunggu',    cls: styles.badgePending,  color: '#0284c7' },
  ACCEPTED:    { label: 'Diterima',    cls: styles.badgePending,  color: '#6366f1' },
  IN_PROGRESS: { label: 'Berlangsung', cls: styles.badgeWarning,  color: '#d97706' },
  COMPLETED:   { label: 'Selesai',     cls: styles.badgeOk,       color: '#10b981' },
  CANCELLED:   { label: 'Dibatalkan',  cls: styles.badgeCritical, color: '#ef4444' },
  EXPIRED:     { label: 'Kedaluwarsa', cls: styles.badgeCritical, color: '#6b7280' },
};

// ─── Skeleton loading ─────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr>
      {[160, 160, 80, 120, 80, 200, 100].map((w, i) => (
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

// ─── ConsultationsPage utama ──────────────────────────────────────────────

export default function ConsultationsPage() {
  const {
    consultations,
    meta,
    loading,
    error,
    page,
    setPage,
    statusFilter,
    setStatusFilter,
    activeCount,
    pendingCount,
    refetch,
  } = useConsultations(15000);

  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [sortField, setSortField] = useState<'created_at' | 'started_at' | 'status'>('status');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => { if (consultations.length >= 0) setLastFetch(new Date()); }, [consultations]);

  // ── Sort logic ─────────────────────────────────────────────────────────
  // Konsultasi IN_PROGRESS selalu di atas, lalu sort sesuai field
  const sortedConsultations = [...consultations].sort((a, b) => {
    // IN_PROGRESS selalu di atas
    if (a.status === 'IN_PROGRESS' && b.status !== 'IN_PROGRESS') return -1;
    if (b.status === 'IN_PROGRESS' && a.status !== 'IN_PROGRESS') return 1;

    let va: string = '';
    let vb: string = '';
    if (sortField === 'created_at') { va = a.created_at; vb = b.created_at; }
    else if (sortField === 'started_at') { va = a.started_at ?? ''; vb = b.started_at ?? ''; }
    else if (sortField === 'status') { va = a.status; vb = b.status; }

    return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  function toggleSort(field: 'created_at' | 'started_at' | 'status') {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  }

  function SortTh({ field, label }: { field: 'created_at' | 'started_at' | 'status'; label: string }) {
    const active = sortField === field;
    return (
      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(field)}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {label}
          <span style={{ fontSize: 10, opacity: active ? 1 : 0.3, color: active ? 'var(--color-primary)' : 'inherit' }}>
            {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
          </span>
        </span>
      </th>
    );
  }

  const totalPages = meta?.totalPages ?? 0;
  const total = meta?.total ?? 0;

  // ── Hitung distribusi status dari data yang ada ────────────────────────
  const statusCounts: Record<string, number> = {};
  for (const c of consultations) {
    statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1;
  }

  const completedCount  = statusCounts['COMPLETED']   ?? 0;
  const cancelledCount  = statusCounts['CANCELLED']   ?? 0;
  const acceptedCount   = statusCounts['ACCEPTED']    ?? 0;

  const donutData = Object.entries(statusCounts)
    .map(([key, value]) => ({
      name: STATUS_CONFIG[key]?.label ?? key,
      value,
      color: STATUS_CONFIG[key]?.color ?? '#9ca3af',
    }))
    .filter((d) => d.value > 0);

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 className={styles.title} style={{ marginBottom: 0 }}>Konsultasi</h1>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 4 }}>
            {activeCount > 0 && <span style={{ color: '#d97706', fontWeight: 700 }}>{activeCount} Berlangsung · </span>}
            {pendingCount > 0 && <span style={{ color: '#0284c7', fontWeight: 700 }}>{pendingCount} Menunggu · </span>}
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

      {/* ── KPI Cards ── */}
      {!loading && consultations.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
          <MiniKpiCard label="Total"        value={total}          icon="📋" color="var(--color-primary)"  />
          <MiniKpiCard label="Berlangsung"  value={activeCount}    icon="⚡" color="#d97706"               trend={activeCount > 0 ? 'up' : 'neutral'} />
          <MiniKpiCard label="Menunggu"     value={pendingCount}   icon="⏳" color="#0284c7"               />
          <MiniKpiCard label="Diterima"     value={acceptedCount}  icon="✔" color="#6366f1"               />
          <MiniKpiCard label="Selesai"      value={completedCount} icon="✅" color="#10b981"               />
          <MiniKpiCard label="Dibatalkan"   value={cancelledCount} icon="❌" color="#ef4444"               trend={cancelledCount > 0 ? 'down' : 'neutral'} />
        </div>
      )}

      {/* ── Donut Chart distribusi status ── */}
      {!loading && donutData.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <ChartCard title="Distribusi Status Konsultasi" subtitle="Berdasarkan data halaman ini">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {donutData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--color-border)' }}
                  formatter={(value: number) => [value, 'Konsultasi']}
                />
                <Legend
                  iconType="circle"
                  iconSize={9}
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(value: string) => <span style={{ color: 'var(--color-text)' }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
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
            <option value="PENDING">Menunggu</option>
            <option value="ACCEPTED">Diterima</option>
            <option value="IN_PROGRESS">Berlangsung</option>
            <option value="COMPLETED">Selesai</option>
            <option value="CANCELLED">Dibatalkan</option>
            <option value="EXPIRED">Kedaluwarsa</option>
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
                <th>Pasien</th>
                <th>Dokter (Email)</th>
                <th>Status</th>
                <th>Keluhan Utama</th>
                <th>Diagnosis</th>
                <th>Mulai</th>
                <th>Dibuat</th>
              </tr>
            </thead>
            <tbody>{Array.from({ length: 8 }, (_, i) => <SkeletonRow key={i} />)}</tbody>
          </table>
        ) : consultations.length === 0 ? (
          <div className={styles.emptyState}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🩺</div>
            <div style={{ fontWeight: 600 }}>
              {statusFilter ? `Tidak ada konsultasi dengan status "${statusFilter}"` : 'Tidak ada konsultasi ditemukan'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 4 }}>
              Data konsultasi akan muncul setelah pasien membuat permintaan
            </div>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Pasien</th>
                <th>Dokter (Email)</th>
                <SortTh field="status" label="Status" />
                <th>Keluhan Utama</th>
                <th>Diagnosis</th>
                <SortTh field="started_at" label="Mulai" />
                <SortTh field="created_at" label="Dibuat" />
              </tr>
            </thead>
            <tbody>
              {sortedConsultations.map((c) => {
                const statusCfg = STATUS_CONFIG[c.status] ?? { label: c.status, cls: '', color: '#9ca3af' };
                return (
                  <tr key={c.id} style={c.status === 'IN_PROGRESS' ? { background: 'rgba(217,119,6,0.05)' } : undefined}>
                    <td style={{ fontWeight: 500 }}>
                      {c.patient_name ?? (
                        <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--color-muted)' }}>
                          {c.patient_id.slice(0, 8)}…
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                      {c.doctor_email ?? (
                        <span style={{ fontFamily: 'monospace' }}>{c.doctor_id.slice(0, 8)}…</span>
                      )}
                    </td>
                    <td>
                      <span className={`${styles.badge} ${statusCfg.cls}`}>
                        {statusCfg.label}
                      </span>
                    </td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                      {c.chief_complaint ?? <span style={{ color: 'var(--color-disabled)', fontStyle: 'italic' }}>—</span>}
                    </td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                      {c.diagnosis ?? <span style={{ color: 'var(--color-disabled)', fontStyle: 'italic' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                      {c.started_at ? (
                        <>
                          <div>{new Date(c.started_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                          {c.status === 'IN_PROGRESS' && (
                            <DurasiAktif
                              isoString={c.started_at}
                              warnAfterMinutes={120}
                              criticalAfterMinutes={180}
                            />
                          )}
                        </>
                      ) : (
                        <span style={{ color: 'var(--color-disabled)', fontStyle: 'italic' }}>Belum mulai</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(c.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
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
            <span>Total: {total} konsultasi</span>
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
      `}</style>
    </div>
  );
}
