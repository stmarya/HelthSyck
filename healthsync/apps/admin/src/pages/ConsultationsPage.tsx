import { useEffect, useState, useCallback } from 'react';
import { consultationClient } from '../api/client';
import type { ConsultationRow, ConsultationStatus, PaginationMeta } from '../types/admin';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import { InputField, SelectField } from '../components/FormField';
import { Skeleton } from '../components/Skeleton';
import styles from './Page.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Konstanta
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: ConsultationStatus | ''; label: string }[] = [
  { value: '',            label: 'Semua Status' },
  { value: 'PENDING',     label: 'Menunggu' },
  { value: 'ACCEPTED',    label: 'Diterima' },
  { value: 'IN_PROGRESS', label: 'Berlangsung' },
  { value: 'COMPLETED',   label: 'Selesai' },
  { value: 'CANCELLED',   label: 'Dibatalkan' },
  { value: 'EXPIRED',     label: 'Kedaluwarsa' },
];

const STATUS_STYLE: Record<ConsultationStatus, { bg: string; color: string }> = {
  PENDING:     { bg: 'var(--color-warning-bg)',  color: 'var(--color-warning)' },
  ACCEPTED:    { bg: '#ecfeff',                  color: '#0f766e' },
  IN_PROGRESS: { bg: 'var(--color-info-bg)',     color: 'var(--color-primary)' },
  COMPLETED:   { bg: 'var(--color-success-bg)',  color: 'var(--color-success)' },
  CANCELLED:   { bg: 'var(--color-danger-bg)',   color: 'var(--color-danger)' },
  EXPIRED:     { bg: 'var(--color-surface-2)',   color: 'var(--color-muted)' },
};

const STATUS_LABEL: Record<ConsultationStatus, string> = {
  PENDING: 'Menunggu', ACCEPTED: 'Diterima', IN_PROGRESS: 'Berlangsung',
  COMPLETED: 'Selesai', CANCELLED: 'Dibatalkan', EXPIRED: 'Kedaluwarsa',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function calcDuration(start: string | null, end: string | null): string {
  if (!start || !end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return '—';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} menit`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} jam ${m > 0 ? `${m} menit` : ''}`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Props: bisa dipakai untuk sub-route /active, /history
// ─────────────────────────────────────────────────────────────────────────────

interface ConsultationsPageProps {
  defaultStatus?: ConsultationStatus;
  title?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ConsultationsPage
// ─────────────────────────────────────────────────────────────────────────────

export default function ConsultationsPage({
  defaultStatus,
  title = 'Semua Konsultasi',
}: ConsultationsPageProps) {
  const { showToast } = useToast();

  // ── State ──
  const [rows, setRows]         = useState<ConsultationRow[]>([]);
  const [meta, setMeta]         = useState<PaginationMeta | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const [search, setSearch]     = useState('');
  const [status, setStatus]     = useState<ConsultationStatus | ''>(defaultStatus ?? '');
  const [page, setPage]         = useState(1);
  const [limit]                 = useState(20);

  const [selected, setSelected] = useState<ConsultationRow | null>(null);

  // ── Fetch ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (status) params.set('status', status);
      if (search.trim()) params.set('search', search.trim());

      const res = await consultationClient.get<{
        data: ConsultationRow[];
        meta: PaginationMeta;
      }>(`/v1/consultations?${params.toString()}`);

      setRows(res.data.data ?? []);
      setMeta(res.data.meta ?? null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat konsultasi';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [page, limit, status, search, showToast]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Reset ke hal. 1 saat filter berubah
  useEffect(() => { setPage(1); }, [status, search]);

  // ── Render ──
  return (
    <div className={styles.page}>
      <PageHeader
        title={title}
        breadcrumbs={[
          { label: 'Dashboard', to: '/' },
          { label: 'Konsultasi', to: '/consultations' },
          ...(title !== 'Semua Konsultasi' ? [{ label: title }] : []),
        ]}
      />

      {/* ── Filter Bar ── */}
      <div className={styles.card}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 220px' }}>
            <InputField
              label="Cari pasien / dokter"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nama pasien atau email dokter…"
            />
          </div>
          <div style={{ flex: '0 1 180px' }}>
            <SelectField
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ConsultationStatus | '')}
              options={STATUS_OPTIONS}
            />
          </div>
          <button
            className={`${styles.btn} ${styles.btnOutline}`}
            onClick={() => { setSearch(''); setStatus(defaultStatus ?? ''); setPage(1); }}
          >
            Reset
          </button>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={fetchData}
            style={{ marginLeft: 'auto' }}
          >
            ↻ Muat Ulang
          </button>
        </div>
      </div>

      {/* ── Tabel ── */}
      <div className={styles.card} style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 'var(--space-6)' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} height={36} style={{ marginBottom: 'var(--space-2)' }} />
            ))}
          </div>
        ) : error ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>⚠️</div>
            <div className={styles.emptyTitle}>Gagal memuat data</div>
            <div className={styles.emptyDesc}>{error}</div>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={fetchData}>
              Coba Lagi
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>💬</div>
            <div className={styles.emptyTitle}>Tidak ada konsultasi</div>
            <div className={styles.emptyDesc}>Belum ada data yang sesuai dengan filter.</div>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={`${styles.table} ${styles.tableHover} ${styles.tableClickable}`}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Pasien</th>
                  <th>Dokter</th>
                  <th>Status</th>
                  <th>Keluhan Utama</th>
                  <th>Mulai</th>
                  <th>Durasi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} onClick={() => setSelected(row)}>
                    <td style={{ fontFamily: 'monospace', fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
                      {row.id.slice(0, 8)}…
                    </td>
                    <td>{row.patient_name ?? <span style={{ color: 'var(--color-muted)' }}>—</span>}</td>
                    <td style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>
                      {row.doctor_email ?? '—'}
                    </td>
                    <td>
                      <span
                        className={styles.badge}
                        style={STATUS_STYLE[row.status]}
                      >
                        {STATUS_LABEL[row.status]}
                      </span>
                    </td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.chief_complaint ?? <span style={{ color: 'var(--color-muted)' }}>—</span>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 'var(--text-sm)' }}>
                      {formatDateTime(row.started_at)}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 'var(--text-sm)' }}>
                      {calcDuration(row.started_at, row.ended_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Paginasi ── */}
        {meta && meta.totalPages > 1 && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: 'var(--space-3) var(--space-4)',
            borderTop: '1px solid var(--color-border)',
            fontSize: 'var(--text-sm)', color: 'var(--color-muted)',
          }}>
            <span>Total: {meta.total} konsultasi</span>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button
                className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Sebelumnya
              </button>
              <span style={{ lineHeight: '28px' }}>Hal. {page} / {meta.totalPages}</span>
              <button
                className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Berikutnya →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal Detail ── */}
      {selected && (
        <Modal
          open
          onClose={() => setSelected(null)}
          title={`Detail Konsultasi — ${selected.id.slice(0, 8)}…`}
          width={640}
        >
          <DetailPanel row={selected} />
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DetailPanel — isi modal detail konsultasi
// ─────────────────────────────────────────────────────────────────────────────

function DetailPanel({ row }: { row: ConsultationRow }) {
  const fields: { label: string; value: React.ReactNode }[] = [
    { label: 'ID', value: <code style={{ fontSize: 'var(--text-xs)' }}>{row.id}</code> },
    { label: 'Pasien ID', value: row.patient_id },
    { label: 'Nama Pasien', value: row.patient_name ?? '—' },
    { label: 'Dokter ID', value: row.doctor_id },
    { label: 'Email Dokter', value: row.doctor_email ?? '—' },
    {
      label: 'Status',
      value: (
        <span
          style={{
            display: 'inline-block',
            padding: '2px 10px',
            borderRadius: 'var(--radius-full)',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            ...STATUS_STYLE[row.status],
          }}
        >
          {STATUS_LABEL[row.status]}
        </span>
      ),
    },
    { label: 'Keluhan Utama', value: row.chief_complaint ?? '—' },
    { label: 'Diagnosis', value: row.diagnosis ?? '—' },
    { label: 'Catatan', value: row.notes ?? '—' },
    { label: 'Dimulai', value: formatDateTime(row.started_at) },
    { label: 'Selesai', value: formatDateTime(row.ended_at) },
    { label: 'Durasi', value: calcDuration(row.started_at, row.ended_at) },
    { label: 'Dibuat', value: formatDateTime(row.created_at) },
    { label: 'Diperbarui', value: formatDateTime(row.updated_at) },
  ];

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
      <tbody>
        {fields.map(({ label, value }) => (
          <tr key={label} style={{ borderBottom: '1px solid var(--color-border)' }}>
            <td style={{
              padding: 'var(--space-2) var(--space-3)',
              color: 'var(--color-muted)',
              fontWeight: 600,
              width: '40%',
              verticalAlign: 'top',
            }}>
              {label}
            </td>
            <td style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text)' }}>
              {value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
