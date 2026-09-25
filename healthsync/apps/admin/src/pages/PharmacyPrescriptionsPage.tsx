import { useCallback, useEffect, useState } from 'react';
import { pharmacyClient, prescriptionClient } from '../api/client';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
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

type FilterableStatus = Exclude<PrescriptionStatus, 'CONFIRMED' | 'DELIVERING'>;

interface Prescription {
  id: string;
  consultation_id: string;
  patient_id: string;
  doctor_id: string;
  pharmacy_id: string | null;
  status: PrescriptionStatus;
  fulfillment_type: 'PICKUP' | 'DELIVERY' | null;
  issued_at: string;
  updated_at: string;
  delivery_address: string | null;
}

interface PharmacyOption { id: string; name: string }
interface PharmacyPage {
  data: PharmacyOption[];
  meta: { page: number; total: number; totalPages: number };
}

const STATUS_META: Record<PrescriptionStatus, { label: string; bg: string; color: string }> = {
  ISSUED: { label: 'Diterbitkan', bg: '#eff6ff', color: '#2563eb' },
  SENT_TO_PHARMACY: { label: 'Ke Apotek', bg: '#fefce8', color: '#ca8a04' },
  CONFIRMED: { label: 'Dikonfirmasi', bg: '#fef3c7', color: '#b45309' },
  PREPARING: { label: 'Disiapkan', bg: '#fff7ed', color: '#ea580c' },
  READY: { label: 'Siap Diserahkan', bg: '#f0fdf4', color: '#16a34a' },
  DELIVERING: { label: 'Dalam Pengiriman', bg: '#ffedd5', color: '#9a3412' },
  DELIVERED: { label: 'Selesai', bg: '#ecfdf5', color: '#059669' },
  CANCELLED: { label: 'Dibatalkan', bg: '#fef2f2', color: '#dc2626' },
};

// Backend filter validation does not yet accept the two transition statuses below.
// They remain visible in results, but are not offered as query parameters.
const FILTERABLE_STATUSES: FilterableStatus[] = [
  'ISSUED', 'SENT_TO_PHARMACY', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED',
];

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

function errorMessage(error: unknown, fallback: string): string {
  return (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    ?? (error instanceof Error ? error.message : fallback);
}

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function exportCSV(rows: Prescription[], pharmacyName: string): void {
  const lines = [
    ['ID', 'Status', 'Apotek', 'Jenis', 'Tanggal Resep', 'Diperbarui'],
    ...rows.map((row) => [
      row.id,
      STATUS_META[row.status].label,
      pharmacyName,
      row.fulfillment_type ?? '-',
      formatDateTime(row.issued_at),
      formatDateTime(row.updated_at),
    ]),
  ].map((row) => row.map(csvCell).join(','));
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `resep-apotek-${pharmacyName.replace(/[^a-z0-9]+/gi, '_')}-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function loadAllPharmacies(): Promise<PharmacyOption[]> {
  const all: PharmacyOption[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const response = await pharmacyClient.get<PharmacyPage>(`/v1/pharmacies?page=${page}&limit=100`);
    all.push(...(response.data.data ?? []));
    totalPages = Math.max(1, response.data.meta?.totalPages ?? 1);
    page += 1;
  } while (page <= totalPages);
  return all;
}

export default function PharmacyPrescriptionsPage() {
  const { showToast } = useToast();
  const [pharmacies, setPharmacies] = useState<PharmacyOption[]>([]);
  const [loadingPharmacies, setLoadingPharmacies] = useState(true);
  const [selectedPharmacyId, setSelectedPharmacyId] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterableStatus | ''>('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<Prescription[]>([]);
  const [selected, setSelected] = useState<Prescription | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const limit = 20;
  const selectedPharmacy = pharmacies.find((item) => item.id === selectedPharmacyId) ?? null;

  useEffect(() => {
    let active = true;
    const run = async () => {
      setLoadingPharmacies(true);
      try {
        const list = await loadAllPharmacies();
        if (!active) return;
        setPharmacies(list);
        setSelectedPharmacyId((current) => current || list[0]?.id || '');
      } catch (loadError) {
        if (active) showToast(errorMessage(loadError, 'Gagal memuat seluruh daftar apotek'), 'error');
      } finally {
        if (active) setLoadingPharmacies(false);
      }
    };
    void run();
    return () => { active = false; };
  }, [showToast]);

  const fetchRows = useCallback(async (silent = false) => {
    if (!selectedPharmacyId) {
      setRows([]);
      setTotal(0);
      return;
    }
    if (!silent) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page), limit: String(limit), pharmacyId: selectedPharmacyId,
      });
      if (filterStatus) params.set('status', filterStatus);
      const response = await prescriptionClient.get<{
        data: Prescription[];
        meta: { total: number; totalPages?: number };
      }>(`/v1/prescriptions?${params.toString()}`);
      setRows(response.data.data ?? []);
      setTotal(response.data.meta?.total ?? 0);
    } catch (loadError) {
      const message = errorMessage(loadError, 'Gagal memuat resep apotek');
      setRows([]);
      setTotal(0);
      setError(message);
      if (!silent) showToast(message, 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filterStatus, page, selectedPharmacyId, showToast]);

  useEffect(() => { void fetchRows(); }, [fetchRows]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void fetchRows(true);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [fetchRows]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const counts = rows.reduce<Partial<Record<PrescriptionStatus, number>>>((result, row) => {
    result[row.status] = (result[row.status] ?? 0) + 1;
    return result;
  }, {});

  return (
    <div className={styles.page}>
      <PageHeader
        title="Resep per Apotek"
        subtitle={selectedPharmacy ? `Apotek: ${selectedPharmacy.name}` : 'Pilih apotek terlebih dahulu'}
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Farmasi', to: '/pharmacy' }, { label: 'Resep per Apotek' }]}
        actions={
          <button className={`${styles.btn} ${styles.btnOutline}`}
            onClick={() => exportCSV(rows, selectedPharmacy?.name ?? 'apotek')}
            disabled={!selectedPharmacy || rows.length === 0}
            title="Ekspor hanya data pada halaman aktif">
            ⬇ CSV halaman ini
          </button>
        }
      />

      <div className={styles.card}>
        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft}>
            {loadingPharmacies ? <Skeleton height={36} width={280} /> : (
              <select className={styles.filterSelect} value={selectedPharmacyId}
                onChange={(event) => { setSelectedPharmacyId(event.target.value); setPage(1); setSelected(null); }}>
                <option value="">— Pilih Apotek —</option>
                {pharmacies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            )}
            <select className={styles.filterSelect} value={filterStatus}
              onChange={(event) => { setFilterStatus(event.target.value as FilterableStatus | ''); setPage(1); }}>
              <option value="">Semua Status</option>
              {FILTERABLE_STATUSES.map((status) => <option key={status} value={status}>{STATUS_META[status].label}</option>)}
            </select>
          </div>
          <button className={`${styles.btn} ${styles.btnOutline}`} onClick={() => void fetchRows()}>↻ Refresh</button>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-muted)' }}>
          Memuat seluruh halaman apotek. Status Dikonfirmasi dan Dalam Pengiriman tetap ditampilkan, tetapi belum tersedia sebagai filter sampai backend menerima kedua nilai tersebut.
        </div>
      </div>

      {rows.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {(Object.keys(STATUS_META) as PrescriptionStatus[]).filter((status) => counts[status]).map((status) => (
            <span key={status} style={{ padding: '4px 10px', borderRadius: 999, fontSize: 12,
              background: STATUS_META[status].bg, color: STATUS_META[status].color }}>
              {STATUS_META[status].label}: {counts[status]} (halaman ini)
            </span>
          ))}
        </div>
      )}

      <div className={styles.contentSplit} style={!selected ? { gridTemplateColumns: 'minmax(0, 1fr)' } : undefined}>
        <div className={styles.card} style={{ padding: 0 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', fontWeight: 600 }}>
            {total.toLocaleString('id-ID')} resep
          </div>
          {loading ? (
            <div style={{ padding: 16 }}>{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} height={44} style={{ marginBottom: 6 }} />)}</div>
          ) : error ? (
            <div className={styles.errorState}><span>⚠ {error}</span><button className={`${styles.btn} ${styles.btnSm}`} onClick={() => void fetchRows()}>Coba Lagi</button></div>
          ) : !selectedPharmacy ? (
            <div className={styles.emptyState}><div className={styles.emptyStateTitle}>Pilih apotek terlebih dahulu</div></div>
          ) : rows.length === 0 ? (
            <div className={styles.emptyState}><div className={styles.emptyStateTitle}>Tidak ada resep</div></div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={`${styles.table} ${styles.tableHover}`}>
                <thead><tr><th>ID Resep</th><th>Status</th><th>Jenis</th><th>Tanggal Resep</th><th>Diperbarui</th></tr></thead>
                <tbody>{rows.map((row) => {
                  const meta = STATUS_META[row.status];
                  return <tr key={row.id} onClick={() => setSelected(selected?.id === row.id ? null : row)} style={{ cursor: 'pointer' }}>
                    <td><code>{row.id.slice(0, 8)}…</code></td>
                    <td><span style={{ padding: '2px 8px', borderRadius: 999, background: meta.bg, color: meta.color }}>{meta.label}</span></td>
                    <td>{row.fulfillment_type === 'PICKUP' ? 'Ambil Sendiri' : row.fulfillment_type === 'DELIVERY' ? 'Dikirim' : '—'}</td>
                    <td>{formatDateTime(row.issued_at)}</td><td>{formatDateTime(row.updated_at)}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          )}
          {totalPages > 1 && <div className={styles.pagination}>
            <span className={styles.paginationInfo}>Halaman {page} dari {totalPages}</span>
            <div className={styles.paginationControls}>
              <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>‹</button>
              <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>›</button>
            </div>
          </div>}
        </div>

        {selected && <div className={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}><strong>Detail Resep</strong>
            <button className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`} onClick={() => setSelected(null)}>✕</button></div>
          {[
            ['ID Resep', selected.id], ['ID Konsultasi', selected.consultation_id], ['ID Pasien', selected.patient_id],
            ['ID Dokter', selected.doctor_id], ['Status', STATUS_META[selected.status].label],
            ['Jenis', selected.fulfillment_type ?? '—'], ['Tanggal', formatDateTime(selected.issued_at)],
            ['Diperbarui', formatDateTime(selected.updated_at)], ['Alamat', selected.delivery_address ?? '—'],
          ].map(([label, value]) => <div key={label} style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 8,
            padding: '7px 0', borderBottom: '1px solid var(--color-border)', fontSize: 13 }}>
            <span style={{ color: 'var(--color-muted)' }}>{label}</span><span style={{ wordBreak: 'break-word' }}>{value}</span>
          </div>)}
        </div>}
      </div>
    </div>
  );
}
