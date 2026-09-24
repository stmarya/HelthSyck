import React, { useEffect, useState, useCallback } from 'react';
import { hospitalClient } from '../api/client';
import type { PaginationMeta } from '../types/admin';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import { InputField } from '../components/FormField';
import { Skeleton } from '../components/Skeleton';
import styles from './Page.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Tipe
// ─────────────────────────────────────────────────────────────────────────────

interface DoctorRow {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  user_status: string;
  str_number: string;
  sip_number: string;
  specialization: string;
  sub_specialization: string | null;
  hospital_id: string | null;
  hospital_name: string | null;
  years_experience: number | null;
  consultation_fee: string;
  is_available: boolean;
  rating_avg: string | null;
  rating_count: number;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Konstanta
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  ACTIVE:               { background: 'var(--color-success-bg)', color: 'var(--color-success)' },
  INACTIVE:             { background: '#f5f5f5',                 color: '#9e9e9e' },
  SUSPENDED:            { background: 'var(--color-danger-bg)',  color: 'var(--color-danger)' },
  PENDING_VERIFICATION: { background: 'var(--color-info-bg)',    color: 'var(--color-primary)' },
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Aktif', INACTIVE: 'Tidak Aktif',
  SUSPENDED: 'Ditangguhkan', PENDING_VERIFICATION: 'Menunggu Verifikasi',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatCurrency(value: string | number | null | undefined): string {
  if (value == null) return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return `Rp ${num.toLocaleString('id-ID')}`;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DoctorsPage
// Data dari GET /v1/doctors (hospital-service) — JOIN doctors + users + hospitals
// ─────────────────────────────────────────────────────────────────────────────

export default function DoctorsPage() {
  const { showToast } = useToast();

  const [doctors, setDoctors] = useState<DoctorRow[]>([]);
  const [meta, setMeta]       = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [page, setPage]     = useState(1);
  const [limit]             = useState(20);

  const [selected, setSelected] = useState<DoctorRow | null>(null);

  // ── Fetch ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page:  String(page),
        limit: String(limit),
      });
      if (search.trim()) params.set('q', search.trim());

      const res = await hospitalClient.get<{
        data: DoctorRow[];
        meta: PaginationMeta;
      }>(`/v1/doctors?${params.toString()}`);

      setDoctors(res.data.data ?? []);
      setMeta(res.data.meta ?? null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat data dokter';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, showToast]);

  useEffect(() => { void fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [search]);

  // ── Render ──
  return (
    <div className={styles.page}>
      <PageHeader
        title="Manajemen Dokter"
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Dokter' }]}
      />

      {/* ── Filter ── */}
      <div className={styles.card}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 240px' }}>
            <InputField
              label="Cari nama / email / spesialisasi"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ketik untuk mencari…"
            />
          </div>
          <button
            className={`${styles.btn} ${styles.btnOutline}`}
            onClick={() => { setSearch(''); setPage(1); }}
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
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={fetchData}>Coba Lagi</button>
          </div>
        ) : doctors.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>👨‍⚕️</div>
            <div className={styles.emptyTitle}>Tidak ada dokter</div>
            <div className={styles.emptyDesc}>Belum ada dokter yang terdaftar.</div>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={`${styles.table} ${styles.tableHover} ${styles.tableClickable}`}>
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Spesialisasi</th>
                  <th>Rumah Sakit</th>
                  <th>Biaya Konsultasi</th>
                  <th>Rating</th>
                  <th>Tersedia</th>
                  <th>Status Akun</th>
                  <th>STR / SIP</th>
                </tr>
              </thead>
              <tbody>
                {doctors.map((doc) => (
                  <tr key={doc.id} onClick={() => setSelected(doc)}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{doc.name}</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>{doc.email}</div>
                    </td>
                    <td style={{ fontSize: 'var(--text-sm)' }}>
                      <div>{doc.specialization}</div>
                      {doc.sub_specialization && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>{doc.sub_specialization}</div>
                      )}
                    </td>
                    <td style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>
                      {doc.hospital_name ?? '—'}
                    </td>
                    <td style={{ fontSize: 'var(--text-sm)', whiteSpace: 'nowrap' }}>
                      {formatCurrency(doc.consultation_fee)}
                    </td>
                    <td style={{ fontSize: 'var(--text-sm)' }}>
                      {doc.rating_avg ? (
                        <span>⭐ {parseFloat(doc.rating_avg).toFixed(1)} <span style={{ color: 'var(--color-muted)', fontSize: 'var(--text-xs)' }}>({doc.rating_count})</span></span>
                      ) : '—'}
                    </td>
                    <td>
                      <span
                        className={styles.badge}
                        style={doc.is_available
                          ? { background: 'var(--color-success-bg)', color: 'var(--color-success)' }
                          : { background: '#f5f5f5', color: '#9e9e9e' }
                        }
                      >
                        {doc.is_available ? 'Ya' : 'Tidak'}
                      </span>
                    </td>
                    <td>
                      <span className={styles.badge} style={STATUS_STYLE[doc.user_status] ?? { background: '#eee', color: '#666' }}>
                        {STATUS_LABEL[doc.user_status] ?? doc.user_status}
                      </span>
                    </td>
                    <td style={{ fontSize: 'var(--text-xs)', fontFamily: 'monospace', color: 'var(--color-muted)' }}>
                      <div>{doc.str_number}</div>
                      <div>{doc.sip_number}</div>
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
            <span>Total: {meta.total} dokter</span>
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
        <Modal open onClose={() => setSelected(null)} title={`Detail Dokter — ${selected.name}`} width={520}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
            <tbody>
              {[
                { label: 'ID Dokter', value: <code style={{ fontSize: 'var(--text-xs)' }}>{selected.id}</code> },
                { label: 'Nama', value: selected.name },
                { label: 'Email', value: selected.email },
                { label: 'Telepon', value: selected.phone ?? '—' },
                { label: 'Spesialisasi', value: selected.specialization },
                { label: 'Sub-spesialisasi', value: selected.sub_specialization ?? '—' },
                { label: 'Rumah Sakit', value: selected.hospital_name ?? '—' },
                { label: 'Pengalaman', value: selected.years_experience != null ? `${selected.years_experience} tahun` : '—' },
                { label: 'Biaya Konsultasi', value: formatCurrency(selected.consultation_fee) },
                { label: 'Rating', value: selected.rating_avg ? `${parseFloat(selected.rating_avg).toFixed(2)} / 5.00 (${selected.rating_count} ulasan)` : '—' },
                { label: 'Tersedia', value: selected.is_available ? '✅ Ya' : '❌ Tidak' },
                { label: 'Status Akun', value: (
                  <span className={styles.badge} style={STATUS_STYLE[selected.user_status] ?? { background: '#eee', color: '#666' }}>
                    {STATUS_LABEL[selected.user_status] ?? selected.user_status}
                  </span>
                )},
                { label: 'STR', value: <code style={{ fontSize: 'var(--text-xs)' }}>{selected.str_number}</code> },
                { label: 'SIP', value: <code style={{ fontSize: 'var(--text-xs)' }}>{selected.sip_number}</code> },
                { label: 'Terdaftar', value: formatDateTime(selected.created_at) },
              ].map(({ label, value }) => (
                <tr key={label} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-muted)', fontWeight: 600, width: '40%' }}>{label}</td>
                  <td style={{ padding: 'var(--space-2) var(--space-3)' }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
    </div>
  );
}
