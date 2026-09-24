import { useEffect, useState, useCallback, useRef } from 'react';
import { prescriptionClient, pharmacyClient } from '../api/client';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import { Skeleton } from '../components/Skeleton';
import styles from './Page.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Tipe Data
// ─────────────────────────────────────────────────────────────────────────────

type PrescriptionStatus =
  | 'ISSUED'
  | 'SENT_TO_PHARMACY'
  | 'PREPARING'
  | 'READY'
  | 'DISPENSED'
  | 'DELIVERED'
  | 'CANCELLED';

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

interface PharmacyOption {
  id: string;
  name: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Konstanta
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_META: Record<PrescriptionStatus, { label: string; bg: string; color: string }> = {
  ISSUED:            { label: 'Diterbitkan',   bg: '#eff6ff', color: '#2563eb' },
  SENT_TO_PHARMACY:  { label: 'Ke Apotek',     bg: '#fefce8', color: '#ca8a04' },
  PREPARING:         { label: 'Disiapkan',     bg: '#fff7ed', color: '#ea580c' },
  READY:             { label: 'Siap Ambil',    bg: '#f0fdf4', color: '#16a34a' },
  DISPENSED:         { label: 'Diserahkan',    bg: '#f5f3ff', color: '#7c3aed' },
  DELIVERED:         { label: 'Dikirim',       bg: '#ecfdf5', color: '#059669' },
  CANCELLED:         { label: 'Dibatalkan',    bg: '#fef2f2', color: '#dc2626' },
};

const ALL_STATUSES = Object.keys(STATUS_META) as PrescriptionStatus[];

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

function exportCSV(rows: Prescription[], pharmacyName: string) {
  const header = ['ID', 'Status', 'Apotek', 'Jenis', 'Tanggal Resep', 'Diperbarui'];
  const data = rows.map((r) => [
    r.id,
    STATUS_META[r.status]?.label ?? r.status,
    pharmacyName,
    r.fulfillment_type ?? '-',
    formatDateTime(r.issued_at),
    formatDateTime(r.updated_at),
  ]);
  const csv = [header, ...data].map((row) => row.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `resep-apotek-${pharmacyName.replace(/\s+/g, '_')}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Komponen Utama
// ─────────────────────────────────────────────────────────────────────────────

export default function PharmacyPrescriptionsPage() {
  const { showToast } = useToast();

  // ── State pilihan apotek ──
  const [pharmacies,       setPharmacies]       = useState<PharmacyOption[]>([]);
  const [loadingPharmacy,  setLoadingPharmacy]  = useState(true);
  const [selectedPharmacy, setSelectedPharmacy] = useState<PharmacyOption | null>(null);

  // ── State filter & paginasi ──
  const [filterStatus, setFilterStatus] = useState<PrescriptionStatus | ''>('');
  const [page,         setPage]         = useState(1);
  const limit = 20;
  const [total, setTotal] = useState(0);

  // ── State data resep ──
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  // ── State detail resep yang dipilih ──
  const [detail, setDetail] = useState<Prescription | null>(null);

  // Debounce ref untuk auto-refresh
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch daftar apotek ──
  useEffect(() => {
    const run = async () => {
      setLoadingPharmacy(true);
      try {
        const res = await pharmacyClient.get<{ data: PharmacyOption[]; meta: { total: number } }>(
          '/v1/pharmacies?limit=100'
        );
        const list = res.data.data ?? [];
        setPharmacies(list);
        if (list.length > 0) setSelectedPharmacy(list[0] ?? null);
      } catch {
        showToast('Gagal memuat daftar apotek', 'error');
      } finally {
        setLoadingPharmacy(false);
      }
    };
    void run();
  }, [showToast]);

  // ── Fetch resep berdasarkan apotek & filter ──
  const fetchPrescriptions = useCallback(async () => {
    if (!selectedPharmacy) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page:       String(page),
        limit:      String(limit),
        pharmacyId: selectedPharmacy.id,
      });
      if (filterStatus) params.set('status', filterStatus);

      const res = await prescriptionClient.get<{
        data: Prescription[];
        meta: { total: number; page: number; limit: number };
      }>(`/v1/prescriptions?${params.toString()}`);

      setPrescriptions(res.data.data ?? []);
      setTotal(res.data.meta?.total ?? 0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat resep';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedPharmacy, page, limit, filterStatus, showToast]);

  useEffect(() => {
    void fetchPrescriptions();
  }, [fetchPrescriptions]);

  // ── Auto-refresh setiap 30 detik ──
  useEffect(() => {
    refreshTimer.current = setInterval(() => { void fetchPrescriptions(); }, 30_000);
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
  }, [fetchPrescriptions]);

  // Reset halaman ke 1 saat filter/apotek berubah
  const handleChangePharmacy = (pharmacyId: string) => {
    const found = pharmacies.find((p) => p.id === pharmacyId) ?? null;
    setSelectedPharmacy(found);
    setPage(1);
    setDetail(null);
  };

  const handleChangeStatus = (s: string) => {
    setFilterStatus(s as PrescriptionStatus | '');
    setPage(1);
  };

  const totalPages = Math.ceil(total / limit);

  // ── Statistik per status ──
  const statusCounts = prescriptions.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className={styles.page}>
      <PageHeader
        title="Resep per Apotek"
        subtitle={selectedPharmacy ? `Apotek: ${selectedPharmacy.name}` : 'Pilih apotek terlebih dahulu'}
        breadcrumbs={[
          { label: 'Dashboard', to: '/' },
          { label: 'Farmasi', to: '/pharmacy' },
          { label: 'Resep per Apotek' },
        ]}
        actions={
          <button
            className={`${styles.btn} ${styles.btnOutline}`}
            onClick={() => exportCSV(prescriptions, selectedPharmacy?.name ?? '')}
            disabled={prescriptions.length === 0}
          >
            ⬇ CSV
          </button>
        }
      />

      {/* ── Filter Bar ── */}
      <div className={styles.card} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {/* Pilih apotek */}
          <div style={{ minWidth: 240, flex: 1 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 12 }}>
              Apotek
            </label>
            {loadingPharmacy ? (
              <Skeleton height={36} />
            ) : (
              <select
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)', fontSize: 'var(--text-sm)',
                  background: 'var(--color-bg)', color: 'var(--color-text)',
                }}
                value={selectedPharmacy?.id ?? ''}
                onChange={(e) => handleChangePharmacy(e.target.value)}
              >
                <option value="">— Pilih Apotek —</option>
                {pharmacies.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Filter status */}
          <div style={{ minWidth: 180 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 12 }}>
              Status
            </label>
            <select
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)', fontSize: 'var(--text-sm)',
                background: 'var(--color-bg)', color: 'var(--color-text)',
              }}
              value={filterStatus}
              onChange={(e) => handleChangeStatus(e.target.value)}
            >
              <option value="">Semua Status</option>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_META[s].label}</option>
              ))}
            </select>
          </div>

          {/* Tombol refresh */}
          <button
            className={`${styles.btn} ${styles.btnOutline}`}
            onClick={() => void fetchPrescriptions()}
            title="Refresh data"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* ── Stat Chips ── */}
      {prescriptions.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {ALL_STATUSES.filter((s) => (statusCounts[s] ?? 0) > 0).map((s) => {
            const meta = STATUS_META[s];
            return (
              <button
                key={s}
                onClick={() => handleChangeStatus(filterStatus === s ? '' : s)}
                style={{
                  padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', border: `1.5px solid ${meta.color}`,
                  background: filterStatus === s ? meta.color : meta.bg,
                  color: filterStatus === s ? '#fff' : meta.color,
                  transition: 'all 0.15s',
                }}
              >
                {meta.label} ({statusCounts[s]})
              </button>
            );
          })}
        </div>
      )}

      {/* ── Layout Split (tabel + detail) ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: detail ? '1fr 380px' : '1fr',
        gap: 16, alignItems: 'start',
      }}>
        {/* ── Tabel Resep ── */}
        <div className={styles.card} style={{ padding: 0 }}>
          <div style={{
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontWeight: 600 }}>
              {total} resep {filterStatus ? `(${STATUS_META[filterStatus as PrescriptionStatus]?.label ?? filterStatus})` : ''}
            </span>
            <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>Auto-refresh 30 dtk</span>
          </div>

          {loading ? (
            <div style={{ padding: 'var(--space-4)' }}>
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={44} style={{ marginBottom: 6 }} />)}
            </div>
          ) : error ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>⚠️</div>
              <div className={styles.emptyStateTitle}>Gagal memuat data</div>
              <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>{error}</div>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => void fetchPrescriptions()}>
                Coba Lagi
              </button>
            </div>
          ) : !selectedPharmacy ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>🏥</div>
              <div className={styles.emptyStateTitle}>Pilih apotek terlebih dahulu</div>
            </div>
          ) : prescriptions.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>📋</div>
              <div className={styles.emptyStateTitle}>Tidak ada resep</div>
              <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                {filterStatus
                  ? `Tidak ada resep dengan status "${STATUS_META[filterStatus as PrescriptionStatus]?.label ?? filterStatus}".`
                  : 'Apotek ini belum memiliki resep yang diteruskan.'}
              </div>
            </div>
          ) : (
            <>
              <div className={styles.tableWrapper}>
                <table className={`${styles.table} ${styles.tableHover}`}>
                  <thead>
                    <tr>
                      <th>ID Resep</th>
                      <th>Status</th>
                      <th>Jenis</th>
                      <th>Tanggal Resep</th>
                      <th>Diperbarui</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prescriptions.map((rx) => {
                      const meta = STATUS_META[rx.status] ?? { label: rx.status, bg: '#f5f5f5', color: '#666' };
                      return (
                        <tr
                          key={rx.id}
                          onClick={() => setDetail(detail?.id === rx.id ? null : rx)}
                          style={{
                            cursor: 'pointer',
                            background: detail?.id === rx.id ? 'var(--color-accent-light)' : undefined,
                          }}
                        >
                          <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                            {rx.id.slice(0, 8)}…
                          </td>
                          <td>
                            <span style={{
                              padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                              background: meta.bg, color: meta.color,
                            }}>
                              {meta.label}
                            </span>
                          </td>
                          <td style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>
                            {rx.fulfillment_type === 'PICKUP' ? '🏪 Ambil Sendiri'
                              : rx.fulfillment_type === 'DELIVERY' ? '🚚 Dikirim'
                              : '—'}
                          </td>
                          <td style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>
                            {formatDateTime(rx.issued_at)}
                          </td>
                          <td style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>
                            {formatDateTime(rx.updated_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Paginasi */}
              {totalPages > 1 && (
                <div style={{
                  display: 'flex', justifyContent: 'center', gap: 8,
                  padding: 'var(--space-3)', borderTop: '1px solid var(--color-border)',
                }}>
                  <button className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                    disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
                  <span style={{ lineHeight: '28px', fontSize: 'var(--text-sm)' }}>
                    {page} / {totalPages}
                  </span>
                  <button className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                    disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Panel Detail Resep ── */}
        {detail && (
          <div className={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontWeight: 700, fontSize: 'var(--text-base)' }}>Detail Resep</span>
              <button
                className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                onClick={() => setDetail(null)}
              >
                ✕
              </button>
            </div>

            {(() => {
              const meta = STATUS_META[detail.status] ?? { label: detail.status, bg: '#f5f5f5', color: '#666' };
              return (
                <>
                  <div style={{
                    padding: '10px 14px', borderRadius: 8, marginBottom: 14,
                    background: meta.bg, border: `1.5px solid ${meta.color}`,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span style={{ fontWeight: 700, color: meta.color, fontSize: 14 }}>{meta.label}</span>
                  </div>

                  {[
                    { label: 'ID Resep',         value: detail.id },
                    { label: 'ID Konsultasi',    value: detail.consultation_id },
                    { label: 'ID Pasien',        value: detail.patient_id },
                    { label: 'ID Dokter',        value: detail.doctor_id },
                    { label: 'Jenis Pengambilan', value: detail.fulfillment_type === 'PICKUP' ? '🏪 Ambil Sendiri' : detail.fulfillment_type === 'DELIVERY' ? '🚚 Dikirim' : '—' },
                    { label: 'Tgl Resep',        value: formatDateTime(detail.issued_at) },
                    { label: 'Diperbarui',       value: formatDateTime(detail.updated_at) },
                  ].map(({ label, value }) => (
                    <div key={label} style={{
                      display: 'flex', justifyContent: 'space-between', gap: 8,
                      padding: '6px 0', borderBottom: '1px solid var(--color-border)',
                      fontSize: 'var(--text-sm)',
                    }}>
                      <span style={{ color: 'var(--color-muted)', flexShrink: 0 }}>{label}</span>
                      <span style={{
                        fontWeight: 500, textAlign: 'right',
                        fontFamily: value.length > 20 ? 'monospace' : undefined,
                        fontSize: value.length > 20 ? 11 : undefined,
                        wordBreak: 'break-all',
                      }}>
                        {value}
                      </span>
                    </div>
                  ))}

                  {detail.delivery_address && (
                    <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
                      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4, color: 'var(--color-muted)' }}>ALAMAT PENGIRIMAN</div>
                      <div style={{ fontSize: 'var(--text-sm)' }}>{detail.delivery_address}</div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
