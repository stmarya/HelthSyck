import { useEffect, useState, useCallback } from 'react';
import { hospitalClient } from '../api/client';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import { SelectField } from '../components/FormField';
import { Skeleton } from '../components/Skeleton';
import styles from './Page.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Tipe Data
// ─────────────────────────────────────────────────────────────────────────────

interface HospitalOption {
  id: string;
  name: string;
  city: string;
  type: string;
  total_beds: number;
  available_beds: number;
}

interface DoctorRow {
  id: string;
  email: string;
  phone?: string | null;
  specialization: string | null;
  is_available: boolean;
  rating_avg: number | null;
  consultation_fee: number | null;
  str_number?: string | null;
  sip_number?: string | null;
  experience_years?: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function deriveName(email: string): string {
  return email.split('@')[0]
    .split('.')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

function StarRating({ rating }: { rating: number | null }) {
  if (rating == null) return <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>—</span>;
  const r = Math.round(rating * 10) / 10;
  return (
    <span style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b' }}>
      ★ {r.toFixed(1)}
    </span>
  );
}

function exportCSV(hospital: HospitalOption, doctors: DoctorRow[]) {
  const headers = ['Nama', 'Email', 'Telepon', 'Spesialisasi', 'Tersedia', 'Rating', 'Konsultasi Fee', 'Pengalaman (Tahun)'];
  const lines = doctors.map((d) => [
    `"${deriveName(d.email)}"`,
    d.email,
    d.phone ?? '',
    d.specialization ?? '',
    d.is_available ? 'Ya' : 'Tidak',
    d.rating_avg ?? '',
    d.consultation_fee ?? '',
    d.experience_years ?? '',
  ].join(','));
  const csv  = [headers.join(','), ...lines].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `dokter-${hospital.name.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Halaman Utama
// ─────────────────────────────────────────────────────────────────────────────

export default function HospitalDoctorsPage() {
  const { showToast } = useToast();

  const [hospitals,        setHospitals]        = useState<HospitalOption[]>([]);
  const [hospitalsLoading, setHospitalsLoading] = useState(true);
  const [selectedHospital, setSelectedHospital] = useState<HospitalOption | null>(null);
  const [hospitalSearch,   setHospitalSearch]   = useState('');

  const [doctors,         setDoctors]         = useState<DoctorRow[]>([]);
  const [doctorsLoading,  setDoctorsLoading]  = useState(false);
  const [specFilter,      setSpecFilter]      = useState('');
  const [availFilter,     setAvailFilter]     = useState('');
  const [searchQuery,     setSearchQuery]     = useState('');

  // Fetch daftar RS
  useEffect(() => {
    setHospitalsLoading(true);
    hospitalClient.get<{ data: HospitalOption[] }>('/v1/hospitals?limit=100')
      .then((r) => setHospitals(r.data.data ?? []))
      .catch(() => showToast('Gagal memuat daftar rumah sakit', 'error'))
      .finally(() => setHospitalsLoading(false));
  }, [showToast]);

  // Fetch dokter RS yang dipilih
  const fetchDoctors = useCallback(async (hospitalId: string) => {
    setDoctorsLoading(true);
    try {
      const res = await hospitalClient.get<{ data: DoctorRow[] }>(
        `/v1/hospitals/${hospitalId}/doctors`
      );
      setDoctors(res.data.data ?? []);
    } catch {
      showToast('Gagal memuat data dokter', 'error');
      setDoctors([]);
    } finally {
      setDoctorsLoading(false);
    }
  }, [showToast]);

  const handleSelectHospital = (h: HospitalOption) => {
    setSelectedHospital(h);
    setSpecFilter('');
    setAvailFilter('');
    setSearchQuery('');
    void fetchDoctors(h.id);
  };

  // ── Kalkulasi filter & stats ──
  const allSpecs = Array.from(new Set(
    doctors.map((d) => d.specialization).filter(Boolean) as string[]
  )).sort();

  const filtered = doctors.filter((d) => {
    const name = deriveName(d.email).toLowerCase();
    const matchQ     = !searchQuery || name.includes(searchQuery.toLowerCase()) || d.email.includes(searchQuery.toLowerCase());
    const matchSpec  = !specFilter  || d.specialization === specFilter;
    const matchAvail = !availFilter || (availFilter === 'true' ? d.is_available : !d.is_available);
    return matchQ && matchSpec && matchAvail;
  });

  const totalAvailable = doctors.filter((d) => d.is_available).length;
  const avgRating      = doctors.filter((d) => d.rating_avg != null).length > 0
    ? (doctors.reduce((s, d) => s + (d.rating_avg ?? 0), 0) / doctors.filter((d) => d.rating_avg != null).length)
    : null;

  const filteredHospitals = hospitals.filter((h) =>
    h.name.toLowerCase().includes(hospitalSearch.toLowerCase()) ||
    h.city.toLowerCase().includes(hospitalSearch.toLowerCase())
  );

  return (
    <div className={styles.page}>
      <PageHeader
        title="Dokter per Rumah Sakit"
        subtitle="Lihat dan kelola dokter yang bertugas di setiap fasilitas"
        breadcrumbs={[
          { label: 'Dashboard', to: '/' },
          { label: 'Rumah Sakit', to: '/hospitals' },
          { label: 'Dokter per RS' },
        ]}
        actions={
          selectedHospital && doctors.length > 0 ? (
            <button
              className={`${styles.btn} ${styles.btnOutline}`}
              onClick={() => exportCSV(selectedHospital, filtered)}
            >
              ⬇ Ekspor CSV
            </button>
          ) : null
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, alignItems: 'start' }}>

        {/* ════ Panel Kiri: Daftar RS ════ */}
        <div className={styles.card} style={{ padding: '12px 14px', marginBottom: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>🏥 Pilih Rumah Sakit</div>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Cari nama atau kota…"
            value={hospitalSearch}
            onChange={(e) => setHospitalSearch(e.target.value)}
            style={{ marginBottom: 10, width: '100%', boxSizing: 'border-box' }}
          />
          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            {hospitalsLoading
              ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={52} style={{ marginBottom: 6 }} />)
              : filteredHospitals.map((h) => (
                <div
                  key={h.id}
                  onClick={() => handleSelectHospital(h)}
                  style={{
                    padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
                    background: selectedHospital?.id === h.id ? 'var(--color-accent-light)' : 'var(--color-surface-2)',
                    border: `1px solid ${selectedHospital?.id === h.id ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    transition: 'all 0.12s',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{h.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>{h.city}</div>
                </div>
              ))
            }
          </div>
        </div>

        {/* ════ Panel Kanan ════ */}
        {!selectedHospital ? (
          <div className={styles.card} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 360, color: 'var(--color-muted)', gap: 12 }}>
            <div style={{ fontSize: 48, opacity: 0.25 }}>👨‍⚕️</div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Pilih rumah sakit di sebelah kiri</div>
          </div>
        ) : (
          <div>
            {/* ── Stat cards ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'Total Dokter',       value: doctors.length,    color: 'var(--color-primary)',          icon: '👨‍⚕️' },
                { label: 'Dokter Aktif',        value: totalAvailable,    color: 'var(--color-success,#16a34a)',  icon: '✅' },
                { label: 'Spesialisasi Unik',  value: allSpecs.length,   color: 'var(--color-accent)',           icon: '🏷️' },
                { label: 'Rating Rata-rata',   value: avgRating != null ? `★ ${avgRating.toFixed(1)}` : '—', color: '#f59e0b', icon: '⭐' },
              ].map((s) => (
                <div key={s.label} style={{
                  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                  borderRadius: 10, padding: '14px 16px', borderTop: `3px solid ${s.color}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      {doctorsLoading
                        ? <Skeleton width={50} height={26} borderRadius={4} />
                        : <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
                      }
                      <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 4 }}>{s.label}</div>
                    </div>
                    <span style={{ fontSize: 20, opacity: 0.7 }}>{s.icon}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Filter ── */}
            <div className={styles.card} style={{ marginBottom: 0, padding: '12px 16px' }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 200px' }}>
                  <input
                    type="search"
                    className={styles.searchInput}
                    placeholder="Cari nama atau email dokter…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: '0 1 200px' }}>
                  <SelectField
                    label=""
                    value={specFilter}
                    onChange={(e) => setSpecFilter(e.target.value)}
                    options={[
                      { value: '', label: 'Semua Spesialisasi' },
                      ...allSpecs.map((s) => ({ value: s, label: s })),
                    ]}
                  />
                </div>
                <div style={{ flex: '0 1 160px' }}>
                  <SelectField
                    label=""
                    value={availFilter}
                    onChange={(e) => setAvailFilter(e.target.value)}
                    options={[
                      { value: '', label: 'Semua Status' },
                      { value: 'true',  label: '✅ Aktif' },
                      { value: 'false', label: '⛔ Tidak Aktif' },
                    ]}
                  />
                </div>
                <button
                  className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                  onClick={() => { setSpecFilter(''); setAvailFilter(''); setSearchQuery(''); }}
                >
                  Reset
                </button>
                <button
                  className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                  onClick={() => void fetchDoctors(selectedHospital.id)}
                >
                  ↻
                </button>
                <span style={{ fontSize: 12, color: 'var(--color-muted)', marginLeft: 4 }}>
                  {filtered.length} dokter
                </span>
              </div>
            </div>

            {/* ── Tabel Dokter ── */}
            <div className={styles.card} style={{ padding: 0, marginTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
              {doctorsLoading ? (
                <div style={{ padding: 16 }}>
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={52} style={{ marginBottom: 6 }} />)}
                </div>
              ) : filtered.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyStateIcon}>👨‍⚕️</div>
                  <div className={styles.emptyStateTitle}>
                    {doctors.length === 0 ? 'Tidak ada dokter terdaftar di RS ini' : 'Tidak ada dokter yang cocok'}
                  </div>
                </div>
              ) : (
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Dokter</th>
                        <th>Spesialisasi</th>
                        <th style={{ textAlign: 'center' }}>Status</th>
                        <th style={{ textAlign: 'center' }}>Rating</th>
                        <th>Biaya Konsultasi</th>
                        <th>Telepon</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((d) => (
                        <tr key={d.id}>
                          <td>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{deriveName(d.email)}</div>
                            <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>{d.email}</div>
                          </td>
                          <td>
                            {d.specialization ? (
                              <span style={{
                                display: 'inline-block', padding: '2px 9px', borderRadius: 999,
                                fontSize: 11, fontWeight: 600,
                                background: 'var(--color-accent-light)', color: 'var(--color-accent)',
                              }}>
                                {d.specialization}
                              </span>
                            ) : (
                              <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>Umum</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block', padding: '2px 9px', borderRadius: 999,
                              fontSize: 11, fontWeight: 600,
                              background: d.is_available ? 'var(--color-success-bg)' : '#f5f5f5',
                              color:      d.is_available ? 'var(--color-success)' : 'var(--color-muted)',
                            }}>
                              {d.is_available ? '✅ Aktif' : '⛔ Tidak Aktif'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <StarRating rating={d.rating_avg} />
                          </td>
                          <td style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                            {d.consultation_fee != null
                              ? formatCurrency(d.consultation_fee)
                              : '—'}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                            {d.phone ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
