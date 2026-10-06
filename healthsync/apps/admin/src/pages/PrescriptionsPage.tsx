import { useCallback, useEffect, useState } from 'react';
import { prescriptionClient } from '../api/client';
import type { PaginationMeta, Prescription } from '../types/admin';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import { SelectField } from '../components/FormField';
import { Skeleton } from '../components/Skeleton';
import styles from './Page.module.css';

type PrescriptionStatus =
  | 'ISSUED'
  | 'SENT_TO_PHARMACY'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'DELIVERING'
  | 'DELIVERED'
  | 'CANCELLED';

type PrescriptionRow = Omit<Prescription, 'status'> & { status: PrescriptionStatus };

interface PrescriptionItem {
  id: string;
  drug_id: string;
  quantity: number;
  instructions: string | null;
  generic_name: string | null;
  brand_name: string | null;
  dosage_form: string | null;
  strength: string | null;
}

interface PrescriptionDetail extends PrescriptionRow {
  items?: PrescriptionItem[];
  patient_name?: string | null;
  doctor_email?: string | null;
}

const STATUS_OPTIONS: Array<{ value: PrescriptionStatus | ''; label: string }> = [
  { value: '', label: 'Semua Status' },
  { value: 'ISSUED', label: 'Diterbitkan' },
  { value: 'SENT_TO_PHARMACY', label: 'Dikirim ke Apotek' },
  { value: 'PREPARING', label: 'Sedang Disiapkan' },
  { value: 'READY', label: 'Siap Diserahkan' },
  { value: 'DELIVERED', label: 'Selesai' },
  { value: 'CANCELLED', label: 'Dibatalkan' },
];

const STATUS_LABEL: Record<PrescriptionStatus, string> = {
  ISSUED: 'Diterbitkan',
  SENT_TO_PHARMACY: 'Dikirim ke Apotek',
  CONFIRMED: 'Dikonfirmasi',
  PREPARING: 'Sedang Disiapkan',
  READY: 'Siap Diserahkan',
  DELIVERING: 'Dalam Pengiriman',
  DELIVERED: 'Selesai',
  CANCELLED: 'Dibatalkan',
};

const STATUS_STYLE: Record<PrescriptionStatus, { background: string; color: string }> = {
  ISSUED: { background: 'var(--color-info-bg)', color: 'var(--color-primary)' },
  SENT_TO_PHARMACY: { background: '#e0f2fe', color: '#0369a1' },
  CONFIRMED: { background: 'var(--color-warning-bg)', color: 'var(--color-warning)' },
  PREPARING: { background: '#ede9fe', color: '#6d28d9' },
  READY: { background: '#ecfccb', color: '#3f6212' },
  DELIVERING: { background: '#ffedd5', color: '#9a3412' },
  DELIVERED: { background: 'var(--color-success-bg)', color: 'var(--color-success)' },
  CANCELLED: { background: 'var(--color-danger-bg)', color: 'var(--color-danger)' },
};

const FULFILLMENT_LABEL: Record<string, string> = {
  PICKUP: 'Ambil di Apotek',
  DELIVERY: 'Diantar',
};

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function getErrorMessage(error: unknown): string {
  return (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    ?? (error instanceof Error ? error.message : 'Gagal memuat resep');
}

export default function PrescriptionsPage() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<PrescriptionRow[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<PrescriptionStatus | ''>('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<PrescriptionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const limit = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (status) params.set('status', status);
      const response = await prescriptionClient.get<{ data: PrescriptionRow[]; meta: PaginationMeta }>(
        `/v1/prescriptions?${params.toString()}`,
      );
      setRows(response.data.data ?? []);
      setMeta(response.data.meta ?? null);
    } catch (fetchError) {
      const message = getErrorMessage(fetchError);
      setError(message);
      setRows([]);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [page, status, showToast]);

  useEffect(() => { void fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [status]);

  const openDetail = useCallback(async (row: PrescriptionRow) => {
    setSelected(row);
    setDetailLoading(true);
    try {
      const response = await prescriptionClient.get<{ data: PrescriptionDetail }>(
        `/v1/prescriptions/${row.id}`,
      );
      setSelected(response.data.data);
    } catch (detailError) {
      showToast(getErrorMessage(detailError), 'error');
    } finally {
      setDetailLoading(false);
    }
  }, [showToast]);

  const currentPageStats = Object.entries(STATUS_LABEL).map(([value, label]) => ({
    value: value as PrescriptionStatus,
    label,
    count: rows.filter((row) => row.status === value).length,
  })).filter((item) => item.count > 0);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Manajemen Resep"
        subtitle="Status mengikuti siklus resep pada prescription-service"
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Resep' }]}
      />

      {currentPageStats.length > 0 && (
        <div className={styles.statGrid}>
          {currentPageStats.map((item) => (
            <div key={item.value} className={styles.statCard}>
              <div className={styles.statValue} style={{ color: STATUS_STYLE[item.value].color }}>{item.count}</div>
              <div className={styles.statLabel}>{item.label} (halaman ini)</div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.card}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '0 1 240px' }}>
            <SelectField
              label="Filter Status"
              value={status}
              onChange={(event) => setStatus(event.target.value as PrescriptionStatus | '')}
              options={STATUS_OPTIONS}
            />
          </div>
          <button className={`${styles.btn} ${styles.btnOutline}`} onClick={() => setStatus('')}>Reset</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => void fetchData()} style={{ marginLeft: 'auto' }}>
            ↻ Muat Ulang
          </button>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
          Ringkasan di atas hanya menghitung data pada halaman aktif. Status transisi tetap ditampilkan pada tabel meskipun belum tersedia sebagai filter backend.
        </p>
      </div>

      <div className={styles.card} style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 'var(--space-6)' }}>
            {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} height={36} style={{ marginBottom: 'var(--space-2)' }} />)}
          </div>
        ) : error ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>⚠️</div>
            <div className={styles.emptyTitle}>Gagal memuat data</div>
            <div className={styles.emptyDesc}>{error}</div>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => void fetchData()}>Coba Lagi</button>
          </div>
        ) : rows.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>💊</div>
            <div className={styles.emptyTitle}>Tidak ada resep</div>
            <div className={styles.emptyDesc}>Belum ada data resep yang sesuai filter.</div>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={`${styles.table} ${styles.tableHover} ${styles.tableClickable}`}>
              <thead><tr><th>ID Resep</th><th>ID Konsultasi</th><th>Status</th><th>Cara Pengambilan</th><th>Diterbitkan</th><th>Kedaluwarsa</th><th>Catatan</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} onClick={() => { void openDetail(row); }}>
                    <td><code>{row.id.slice(0, 8)}…</code></td>
                    <td><code>{row.consultation_id.slice(0, 8)}…</code></td>
                    <td><span className={styles.badge} style={STATUS_STYLE[row.status]}>{STATUS_LABEL[row.status]}</span></td>
                    <td>{row.fulfillment_type ? FULFILLMENT_LABEL[row.fulfillment_type] ?? row.fulfillment_type : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(row.issued_at)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(row.expires_at)}</td>
                    <td>{row.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {meta && meta.totalPages > 1 && (
          <div className={styles.pagination}>
            <span className={styles.paginationInfo}>Total: {meta.total} resep</span>
            <div className={styles.paginationControls}>
              <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>‹</button>
              <span style={{ lineHeight: '32px' }}>{page} / {meta.totalPages}</span>
              <button className={styles.pageBtn} disabled={page >= meta.totalPages} onClick={() => setPage((value) => value + 1)}>›</button>
            </div>
          </div>
        )}
      </div>

      {selected && (
        <Modal open onClose={() => setSelected(null)} title={`Detail Resep — ${selected.id.slice(0, 8)}…`} width={620}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
            <tbody>
              {[
                ['ID Resep', selected.id],
                ['ID Konsultasi', selected.consultation_id],
                ['Pasien', selected.patient_name ?? selected.patient_id],
                ['Dokter', selected.doctor_email ?? selected.doctor_id],
                ['ID Apotek', selected.pharmacy_id ?? '—'],
                ['Status', STATUS_LABEL[selected.status]],
                ['Cara Pengambilan', selected.fulfillment_type ? FULFILLMENT_LABEL[selected.fulfillment_type] ?? selected.fulfillment_type : '—'],
                ['Alamat Pengiriman', selected.delivery_address ?? '—'],
                ['Catatan', selected.notes ?? '—'],
                ['Diterbitkan', formatDateTime(selected.issued_at)],
                ['Kedaluwarsa', formatDateTime(selected.expires_at)],
              ].map(([label, value]) => (
                <tr key={label} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-muted)', fontWeight: 600, width: '36%' }}>{label}</td>
                  <td style={{ padding: 'var(--space-2) var(--space-3)', wordBreak: 'break-word' }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 'var(--space-4)' }}>
            <strong>Daftar Obat</strong>
            {detailLoading ? <Skeleton height={80} style={{ marginTop: 8 }} /> : selected.items?.length ? (
              <div className={styles.tableWrapper} style={{ marginTop: 8 }}>
                <table className={styles.table}>
                  <thead><tr><th>Nama Obat</th><th>Bentuk / Kekuatan</th><th>Jumlah</th><th>Instruksi</th></tr></thead>
                  <tbody>
                    {selected.items.map((item) => (
                      <tr key={item.id}>
                        <td><strong>{item.generic_name ?? '—'}</strong>{item.brand_name ? <div>{item.brand_name}</div> : null}</td>
                        <td>{[item.dosage_form, item.strength].filter(Boolean).join(' — ') || '—'}</td>
                        <td>{item.quantity}</td>
                        <td>{item.instructions ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p style={{ color: 'var(--color-muted)' }}>Tidak ada obat dalam resep ini.</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}
