import { useEffect, useState, useCallback } from 'react';
import { patientClient } from '../api/client';
import type { Patient, PaginationMeta } from '../types/admin';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import { InputField } from '../components/FormField';
import { Skeleton } from '../components/Skeleton';
import styles from './Page.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Tipe tambahan untuk detail pasien
// ─────────────────────────────────────────────────────────────────────────────

interface PatientCondition {
  id: string;
  icd10_code: string | null;
  description: string;
  diagnosed_at: string | null;
  is_active: boolean;
  notes: string | null;
}

interface PatientAllergy {
  id: string;
  allergen: string;
  reaction: string | null;
  severity: string | null;
}

interface PatientDetail extends Patient {
  conditions?: PatientCondition[];
  allergies?: PatientAllergy[];
  address?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

function calcAge(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const parsed = new Date(dob).getTime();
  if (Number.isNaN(parsed)) return null;
  return Math.floor((Date.now() - parsed) / (1000 * 60 * 60 * 24 * 365.25));
}

const GENDER_LABEL: Record<string, string> = { MALE: 'Laki-laki', FEMALE: 'Perempuan' };

const BLOOD_COLOR: Record<string, string> = {
  'A+': '#e53935', 'A-': '#e53935', 'B+': '#e65100', 'B-': '#e65100',
  'O+': '#1e88e5', 'O-': '#1e88e5', 'AB+': '#6d4c41', 'AB-': '#6d4c41', 'UNKNOWN': '#9e9e9e',
};

const SEVERITY_STYLE: Record<string, { bg: string; color: string }> = {
  MILD:     { bg: '#e8f5e9', color: '#2e7d32' },
  MODERATE: { bg: 'var(--color-warning-bg)', color: 'var(--color-warning)' },
  SEVERE:   { bg: 'var(--color-danger-bg)',  color: 'var(--color-danger)' },
};

// ─────────────────────────────────────────────────────────────────────────────
// PatientsPage
// ─────────────────────────────────────────────────────────────────────────────

export default function PatientsPage() {
  const { showToast } = useToast();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [meta, setMeta]         = useState<PaginationMeta | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const [search, setSearch]     = useState('');
  const [page, setPage]         = useState(1);
  const [limit]                 = useState(20);

  const [selected, setSelected]   = useState<PatientDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // ── Fetch list pasien ──
  // Response shape dari /v1/patients:
  //   { data: { patients: Patient[], meta: PaginationMeta }, meta: { timestamp } }
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search.trim()) params.set('search', search.trim());
      const res = await patientClient.get<{
        data: { patients: Patient[]; meta: PaginationMeta };
        meta: { timestamp: string };
      }>(`/v1/patients?${params.toString()}`);

      setPatients(res.data.data?.patients ?? []);
      setMeta(res.data.data?.meta ?? null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat data pasien';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, showToast]);

  useEffect(() => { void fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [search]);

  // ── Fetch detail pasien (termasuk riwayat kondisi & alergi) ──
  const handleSelectPatient = useCallback(async (patient: Patient) => {
    setSelected(patient);
    setLoadingDetail(true);
    try {
      const res = await patientClient.get<{ data: PatientDetail }>(`/v1/patients/${patient.id}`);
      setSelected(res.data.data);
    } catch {
      // Detail gagal dimuat, tetap tampilkan data dasar
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  // ── Render ──
  return (
    <div className={styles.page}>
      <PageHeader
        title="Manajemen Pasien"
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Pasien' }]}
      />

      {/* ── Filter ── */}
      <div className={styles.card}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 220px' }}>
            <InputField
              label="Cari nama pasien"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ketik nama pasien…"
            />
          </div>
          <button className={`${styles.btn} ${styles.btnOutline}`}
            onClick={() => { setSearch(''); setPage(1); }}>Reset</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={fetchData} style={{ marginLeft: 'auto' }}>
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
        ) : patients.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🧑‍⚕️</div>
            <div className={styles.emptyTitle}>Tidak ada pasien</div>
            <div className={styles.emptyDesc}>Belum ada data pasien yang terdaftar.</div>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={`${styles.table} ${styles.tableHover} ${styles.tableClickable}`}>
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Jenis Kelamin</th>
                  <th>Tanggal Lahir</th>
                  <th>Usia</th>
                  <th>Gol. Darah</th>
                  <th>Telepon</th>
                  <th>Terdaftar</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => (
                  (() => {
                    const age = calcAge(p.date_of_birth);
                    return (
                     <tr key={p.id} onClick={() => void handleSelectPatient(p)}>
                       <td style={{ fontWeight: 600 }}>{p.name}</td>
                       <td>{GENDER_LABEL[p.gender] ?? p.gender}</td>
                       <td>{formatDate(p.date_of_birth)}</td>
                       <td>{age != null ? `${age} th` : '—'}</td>
                       <td>
                         <span className={styles.badge} style={{
                           background: BLOOD_COLOR[p.blood_type] + '20',
                           color: BLOOD_COLOR[p.blood_type],
                         }}>
                           {p.blood_type}
                         </span>
                       </td>
                       <td style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>{p.phone ?? '—'}</td>
                       <td style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>{formatDate(p.created_at)}</td>
                     </tr>
                    );
                  })()
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
            <span>Total: {meta.total} pasien</span>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Sebelumnya</button>
              <span style={{ lineHeight: '28px' }}>Hal. {page} / {meta.totalPages}</span>
              <button className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>Berikutnya →</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal Detail Lengkap ── */}
      {selected && (
        <Modal open onClose={() => setSelected(null)} title={`Detail Pasien — ${selected.name}`} width={640}>
          {loadingDetail ? (
            <div>
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={32} style={{ marginBottom: 8 }} />)}
            </div>
          ) : (
            <div style={{ fontSize: 'var(--text-sm)' }}>
              {(() => {
                const selectedAge = calcAge(selected.date_of_birth);
                return (
                  <>
              {/* Info Dasar */}
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Data Pribadi
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
                <tbody>
                  {[
                    { label: 'ID Profil', value: <code style={{ fontSize: 11 }}>{selected.id}</code> },
                    { label: 'ID Pengguna', value: <code style={{ fontSize: 11 }}>{selected.user_id}</code> },
                    { label: 'Nama', value: selected.name },
                    { label: 'Jenis Kelamin', value: GENDER_LABEL[selected.gender] ?? selected.gender },
                    { label: 'Tanggal Lahir', value: `${formatDate(selected.date_of_birth)}${selectedAge != null ? ` (${selectedAge} tahun)` : ''}` },
                    { label: 'Golongan Darah', value: (
                      <span className={styles.badge} style={{ background: BLOOD_COLOR[selected.blood_type] + '20', color: BLOOD_COLOR[selected.blood_type] }}>
                        {selected.blood_type}
                      </span>
                    )},
                    { label: 'Telepon', value: selected.phone ?? '—' },
                    { label: 'Alamat', value: selected.address ?? '—' },
                    { label: 'Kontak Darurat', value: selected.emergency_contact_name
                      ? `${selected.emergency_contact_name} (${selected.emergency_contact_phone ?? '—'})`
                      : '—' },
                    { label: 'Terdaftar', value: formatDate(selected.created_at) },
                  ].map(({ label, value }) => (
                    <tr key={label} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '6px 8px', color: 'var(--color-muted)', fontWeight: 600, width: '38%' }}>{label}</td>
                      <td style={{ padding: '6px 8px' }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Kondisi Medis */}
              {(selected.conditions?.length ?? 0) > 0 && (
                <>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Riwayat Kondisi Medis
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                    {selected.conditions!.map((c) => (
                      <div key={c.id} style={{
                        background: 'var(--color-surface-2)', borderRadius: 8,
                        padding: '10px 14px', border: '1px solid var(--color-border)',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <span style={{ fontWeight: 600 }}>{c.description}</span>
                            {c.icd10_code && (
                              <span style={{
                                marginLeft: 8, fontSize: 11, padding: '1px 6px',
                                background: 'var(--color-info-bg)', color: 'var(--color-primary)',
                                borderRadius: 4, fontFamily: 'monospace',
                              }}>{c.icd10_code}</span>
                            )}
                          </div>
                          <span className={styles.badge} style={c.is_active
                            ? { background: 'var(--color-success-bg)', color: 'var(--color-success)' }
                            : { background: 'var(--color-surface-2)', color: 'var(--color-muted)' }}>
                            {c.is_active ? 'Aktif' : 'Riwayat'}
                          </span>
                        </div>
                        {c.notes && <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 6 }}>{c.notes}</div>}
                        {c.diagnosed_at && <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 4 }}>Terdiagnosis: {formatDate(c.diagnosed_at)}</div>}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Alergi */}
              {(selected.allergies?.length ?? 0) > 0 && (
                <>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Alergi
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {selected.allergies!.map((a) => (
                      <div key={a.id} style={{
                        background: 'var(--color-danger-bg)', borderRadius: 8,
                        padding: '8px 14px', border: '1px solid var(--color-danger)',
                      }}>
                        <div style={{ fontWeight: 700, color: 'var(--color-danger)', fontSize: 13 }}>
                          ⚠ {a.allergen}
                        </div>
                        {a.severity && (
                          <span className={styles.badge} style={{ ...SEVERITY_STYLE[a.severity], marginTop: 4 }}>
                            {a.severity}
                          </span>
                        )}
                        {a.reaction && <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 4 }}>{a.reaction}</div>}
                      </div>
                    ))}
                  </div>
                </>
              )}
                  </>
                );
              })()}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
