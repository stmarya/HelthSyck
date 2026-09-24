import { useEffect, useState, useCallback } from 'react';
import { prescriptionClient } from '../api/client';
import type { Prescription, PrescriptionStatus, PaginationMeta } from '../types/admin';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import { SelectField } from '../components/FormField';
import { Skeleton } from '../components/Skeleton';
import styles from './Page.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Konstanta
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: PrescriptionStatus | ''; label: string }[] = [
  { value: '',          label: 'Semua Status' },
  { value: 'ISSUED',    label: 'Diterbitkan' },
  { value: 'CONFIRMED', label: 'Dikonfirmasi' },
  { value: 'DISPENSED', label: 'Disiapkan' },
  { value: 'DELIVERED', label: 'Dikirim' },
  { value: 'CANCELLED', label: 'Dibatalkan' },
];

const STATUS_STYLE: Record<PrescriptionStatus, { bg: string; color: string }> = {
  ISSUED:    { bg: 'var(--color-info-bg)',    color: 'var(--color-primary)' },
  CONFIRMED: { bg: 'var(--color-warning-bg)', color: 'var(--color-warning)' },
  DISPENSED: { bg: '#ede7f6',                 color: '#7b1fa2' },
  DELIVERED: { bg: 'var(--color-success-bg)', color: 'var(--color-success)' },
  CANCELLED: { bg: 'var(--color-danger-bg)',  color: 'var(--color-danger)' },
};

const STATUS_LABEL: Record<PrescriptionStatus, string> = {
  ISSUED: 'Diterbitkan', CONFIRMED: 'Dikonfirmasi',
  DISPENSED: 'Disiapkan', DELIVERED: 'Dikirim', CANCELLED: 'Dibatalkan',
};

const FULFILLMENT_LABEL: Record<string, string> = {
  PICKUP: 'Ambil di Apotek',
  DELIVERY: 'Diantar',
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

// ─────────────────────────────────────────────────────────────────────────────
// PrescriptionsPage
// ─────────────────────────────────────────────────────────────────────────────

// ── Tipe prescription item dari GET /v1/prescriptions/:id ──
interface PrescriptionItem {
  id: string;
  drug_id: string;
  quantity: number;
  dosage_instructions: string | null;
  generic_name: string | null;
  brand_name: string | null;
  dosage_form: string | null;
  strength: string | null;
}

interface PrescriptionDetail extends Prescription {
  items?: PrescriptionItem[];
  patient_name?: string | null;
  doctor_email?: string | null;
}

export default function PrescriptionsPage() {
  const { showToast } = useToast();

  const [rows, setRows]         = useState<Prescription[]>([]);
  const [meta, setMeta]         = useState<PaginationMeta | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const [status, setStatus]     = useState<PrescriptionStatus | ''>('');
  const [page, setPage]         = useState(1);
  const [limit]                 = useState(20);

  const [selected, setSelected]       = useState<PrescriptionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // ── Fetch ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (status) params.set('status', status);

      const res = await prescriptionClient.get<{
        data: Prescription[];
        meta: PaginationMeta;
      }>(`/v1/prescriptions?${params.toString()}`);

      setRows(res.data.data ?? []);
      setMeta(res.data.meta ?? null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat resep';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [page, limit, status, showToast]);

  useEffect(() => { void fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [status]);

  // ── Fetch detail + items saat row diklik ──
  const openDetail = useCallback(async (row: Prescription) => {
    setSelected(row);
    setDetailLoading(true);
    try {
      const res = await prescriptionClient.get<{ data: PrescriptionDetail }>(
        `/v1/prescriptions/${row.id}`,
      );
      setSelected(res.data.data);
    } catch {
      // Tetap tampilkan data list jika detail gagal
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // ── Stat Cards ──
  const stats = STATUS_OPTIONS.slice(1).map((opt) => ({
    label: opt.label,
    count: rows.filter((r) => r.status === opt.value).length,
    style: STATUS_STYLE[opt.value as PrescriptionStatus],
  }));

  // ── Render ──
  return (
    <div className={styles.page}>
      <PageHeader
        title="Manajemen Resep"
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Resep' }]}
      />

      {/* ── Stat Cards ── */}
      <div className={styles.statGrid}>
        {stats.map((s) => (
          <div key={s.label} className={styles.statCard}>
            <div className={styles.statValue} style={{ fontSize: 28, color: s.style.color }}>
              {s.count}
            </div>
            <div className={styles.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Filter ── */}
      <div className={styles.card}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '0 1 200px' }}>
            <SelectField
              label="Filter Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as PrescriptionStatus | '')}
              options={STATUS_OPTIONS}
            />
          </div>
          <button
            className={`${styles.btn} ${styles.btnOutline}`}
            onClick={() => { setStatus(''); setPage(1); }}
          >Reset</button>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={fetchData}
            style={{ marginLeft: 'auto' }}
          >↻ Muat Ulang</button>
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
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={fetchData}>Coba Lagi</button>
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
              <thead>
                <tr>
                  <th>ID Resep</th>
                  <th>ID Konsultasi</th>
                  <th>Status</th>
                  <th>Cara Pengambilan</th>
                  <th>Diterbitkan</th>
                  <th>Kedaluwarsa</th>
                  <th>Catatan</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} onClick={() => { void openDetail(row); }}>
                    <td style={{ fontFamily: 'monospace', fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
                      {row.id.slice(0, 8)}…
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
                      {row.consultation_id.slice(0, 8)}…
                    </td>
                    <td>
                      <span className={styles.badge} style={STATUS_STYLE[row.status]}>
                        {STATUS_LABEL[row.status]}
                      </span>
                    </td>
                    <td style={{ fontSize: 'var(--text-sm)' }}>
                      {row.fulfillment_type ? FULFILLMENT_LABEL[row.fulfillment_type] ?? row.fulfillment_type : '—'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 'var(--text-sm)' }}>
                      {formatDateTime(row.issued_at)}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>
                      {formatDateTime(row.expires_at)}
                    </td>
                    <td style={{
                      maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap', fontSize: 'var(--text-sm)', color: 'var(--color-muted)',
                    }}>
                      {row.notes ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {meta && meta.totalPages > 1 && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: 'var(--space-3) var(--space-4)',
            borderTop: '1px solid var(--color-border)',
            fontSize: 'var(--text-sm)', color: 'var(--color-muted)',
          }}>
            <span>Total: {meta.total} resep</span>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button
                className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >← Sebelumnya</button>
              <span style={{ lineHeight: '28px' }}>Hal. {page} / {meta.totalPages}</span>
              <button
                className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >Berikutnya →</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal Detail ── */}
      {selected && (
        <Modal open onClose={() => setSelected(null)} title={`Detail Resep — ${selected.id.slice(0, 8)}…`} width={560}>
          {/* Info dasar */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
            <tbody>
              {[
                { label: 'ID Resep', value: <code style={{ fontSize: 'var(--text-xs)' }}>{selected.id}</code> },
                { label: 'ID Konsultasi', value: <code style={{ fontSize: 'var(--text-xs)' }}>{selected.consultation_id}</code> },
                { label: 'Pasien', value: selected.patient_name ?? selected.patient_id },
                { label: 'Dokter', value: selected.doctor_email ?? selected.doctor_id },
                { label: 'ID Apotek', value: selected.pharmacy_id ?? '—' },
                { label: 'Status', value: (
                  <span className={styles.badge} style={STATUS_STYLE[selected.status]}>
                    {STATUS_LABEL[selected.status]}
                  </span>
                )},
                { label: 'Cara Pengambilan', value: selected.fulfillment_type ? FULFILLMENT_LABEL[selected.fulfillment_type] ?? selected.fulfillment_type : '—' },
                { label: 'Alamat Pengiriman', value: selected.delivery_address ?? '—' },
                { label: 'Catatan', value: selected.notes ?? '—' },
                { label: 'Diterbitkan', value: formatDateTime(selected.issued_at) },
                { label: 'Kedaluwarsa', value: formatDateTime(selected.expires_at) },
                { label: 'Diperbarui', value: formatDateTime(selected.updated_at) },
              ].map(({ label, value }) => (
                <tr key={label} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-muted)', fontWeight: 600, width: '40%' }}>{label}</td>
                  <td style={{ padding: 'var(--space-2) var(--space-3)' }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Daftar obat */}
          <div style={{ marginTop: 'var(--space-4)' }}>
            <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', marginBottom: 'var(--space-2)', color: 'var(--color-text)' }}>
              Daftar Obat
            </div>
            {detailLoading ? (
              <Skeleton height={80} />
            ) : selected.items && selected.items.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                <thead>
                  <tr style={{ background: 'var(--color-surface)', borderBottom: '2px solid var(--color-border)' }}>
                    <th style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'left', fontWeight: 600, color: 'var(--color-muted)' }}>Nama Obat</th>
                    <th style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'left', fontWeight: 600, color: 'var(--color-muted)' }}>Bentuk / Kekuatan</th>
                    <th style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'right', fontWeight: 600, color: 'var(--color-muted)' }}>Jumlah</th>
                    <th style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'left', fontWeight: 600, color: 'var(--color-muted)' }}>Instruksi</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.items.map((item) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: 'var(--space-2) var(--space-3)' }}>
                        <div style={{ fontWeight: 600 }}>{item.generic_name ?? '—'}</div>
                        {item.brand_name && (
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>{item.brand_name}</div>
                        )}
                      </td>
                      <td style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-muted)', fontSize: 'var(--text-xs)' }}>
                        {[item.dosage_form, item.strength].filter(Boolean).join(' — ') || '—'}
                      </td>
                      <td style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'right', fontWeight: 600 }}>
                        {item.quantity}
                      </td>
                      <td style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-muted)', fontSize: 'var(--text-xs)' }}>
                        {item.dosage_instructions ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)', padding: 'var(--space-3)' }}>
                Tidak ada obat dalam resep ini.
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
