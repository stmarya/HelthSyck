import { useState } from 'react';
import { hospitalClient } from '../api/client';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import { InputField, SelectField } from '../components/FormField';
import { Skeleton } from '../components/Skeleton';
import styles from './Page.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Tipe Data
// ─────────────────────────────────────────────────────────────────────────────

type HospitalType = 'TYPE_A' | 'TYPE_B' | 'TYPE_C' | 'TYPE_D' | 'CLINIC' | 'PUSKESMAS';

interface SearchResult {
  id: string;
  name: string;
  type: HospitalType;
  address: string;
  city: string;
  province: string;
  phone: string | null;
  igd_phone: string | null;
  total_beds: number;
  available_beds: number;
  icu_total: number;
  icu_available: number;
  specializations: string[] | null;
  is_emt_partner: boolean;
  distance_km?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Konstanta
// ─────────────────────────────────────────────────────────────────────────────

const SPECIALIZATIONS = [
  'CARDIOLOGY', 'NEUROLOGY', 'ORTHOPEDICS', 'PEDIATRICS', 'ONCOLOGY',
  'SURGERY', 'INTERNAL_MEDICINE', 'OBSTETRICS', 'DERMATOLOGY', 'PSYCHIATRY',
  'OPHTHALMOLOGY', 'ENT', 'UROLOGY', 'RADIOLOGY', 'EMERGENCY',
];

const TYPE_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  TYPE_A:    { bg: '#fef2f2', color: '#dc2626', label: 'Tipe A' },
  TYPE_B:    { bg: '#fffbeb', color: '#d97706', label: 'Tipe B' },
  TYPE_C:    { bg: '#eff6ff', color: '#2563eb', label: 'Tipe C' },
  TYPE_D:    { bg: '#f0fdf4', color: '#16a34a', label: 'Tipe D' },
  CLINIC:    { bg: '#fdf4ff', color: '#7c3aed', label: 'Klinik' },
  PUSKESMAS: { bg: '#f5f5f5', color: '#6b7280', label: 'Puskesmas' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function bedColor(available: number, total: number): string {
  if (total === 0) return 'var(--color-muted)';
  const p = (available / total) * 100;
  if (p < 20) return '#dc2626';
  if (p < 50) return '#d97706';
  return '#16a34a';
}

function getErrorMessage(err: unknown): string {
  return (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    ?? (err instanceof Error ? err.message : 'Gagal melakukan pencarian rumah sakit');
}

function copyToClipboard(text: string, label: string, showToast: (m: string, t: 'success' | 'info') => void) {
  void navigator.clipboard.writeText(text).then(() => showToast(`${label} disalin ke clipboard`, 'success'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Halaman Utama
// ─────────────────────────────────────────────────────────────────────────────

export default function HospitalSearchPage() {
  const { showToast } = useToast();

  // ── Form filter ──
  const [city,             setCity]             = useState('');
  const [specialization,   setSpecialization]   = useState('');
  const [minAvailableBeds, setMinAvailableBeds] = useState('');
  const [hasIcu,           setHasIcu]           = useState(false);

  // ── State hasil ──
  const [results,  setResults]  = useState<SearchResult[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // ── Detail panel ──
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);

  const handleSearch = async () => {
    const minBeds = minAvailableBeds.trim();
    if (minBeds) {
      const parsed = Number(minBeds);
      if (!Number.isInteger(parsed) || parsed < 0) {
        setError('Minimal bed tersedia harus berupa angka bulat 0 atau lebih.');
        setSearched(false);
        return;
      }
    }
    setLoading(true);
    setSearched(true);
    setSelectedResult(null);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (city.trim())                   params.set('city', city.trim());
      if (specialization)                params.set('specialization', specialization);
      if (minAvailableBeds.trim())       params.set('minAvailableBeds', minAvailableBeds.trim());
      if (hasIcu)                        params.set('hasIcu', 'true');

      const res = await hospitalClient.get<{ data: SearchResult[] }>(
        `/v1/hospitals/search?${params}`
      );
      setResults(res.data.data ?? []);
    } catch (err) {
      const msg = getErrorMessage(err);
      showToast(msg, 'error');
      setError(msg);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setCity(''); setSpecialization(''); setMinAvailableBeds(''); setHasIcu(false);
    setResults([]); setSearched(false); setSelectedResult(null); setError(null);
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Pencarian Lanjutan Rumah Sakit"
        subtitle="Temukan RS berdasarkan kota, spesialisasi, ketersediaan bed, dan ICU"
        breadcrumbs={[
          { label: 'Dashboard', to: '/' },
          { label: 'Rumah Sakit', to: '/hospitals' },
          { label: 'Pencarian Lanjutan' },
        ]}
      />

      {/* ── Form Pencarian ── */}
      <div className={styles.card} style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>🔍 Filter Pencarian</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 14 }}>
          <InputField
            label="Kota"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Contoh: Jakarta, Surabaya…"
          />
          <SelectField
            label="Spesialisasi"
            value={specialization}
            onChange={(e) => setSpecialization(e.target.value)}
            options={[
              { value: '', label: 'Semua Spesialisasi' },
              ...SPECIALIZATIONS.map((s) => ({ value: s, label: s.replace(/_/g, ' ') })),
            ]}
          />
          <InputField
            label="Minimal Bed Tersedia"
            type="number"
            value={minAvailableBeds}
            onChange={(e) => setMinAvailableBeds(e.target.value)}
            placeholder="Contoh: 5"
          />
          {/* ICU toggle */}
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: 12, marginBottom: 8, color: 'var(--color-text)' }}>
              Kebutuhan ICU
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={hasIcu}
                onChange={(e) => setHasIcu(e.target.checked)}
              />
              Hanya RS dengan ICU tersedia
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => void handleSearch()}
            disabled={loading}
          >
            {loading ? '⏳ Mencari…' : '🔍 Cari Rumah Sakit'}
          </button>
          <button
            className={`${styles.btn} ${styles.btnOutline}`}
            onClick={handleReset}
          >
            Reset
          </button>
        </div>
      </div>

      {error && (
        <div className={styles.errorState}>
          <span className={styles.errorStateIcon}>⚠</span>
          <span>{error}</span>
        </div>
      )}

      {/* ── Hasil Pencarian ── */}
      <div className={styles.contentSplit} style={!selectedResult ? { gridTemplateColumns: 'minmax(0, 1fr)' } : undefined}>

        {/* Tabel hasil */}
        <div className={styles.card} style={{ padding: 0 }}>
          {!searched ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>🏥</div>
              <div className={styles.emptyStateTitle}>Isi filter dan tekan "Cari"</div>
              <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                Cari berdasarkan kota, spesialisasi, ketersediaan bed, atau ICU.
              </div>
            </div>
          ) : loading ? (
            <div style={{ padding: 16 }}>
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={56} style={{ marginBottom: 8 }} />)}
            </div>
          ) : results.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>🔍</div>
              <div className={styles.emptyStateTitle}>Tidak ada hasil</div>
              <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                Coba ubah filter atau perluas kriteria pencarian.
              </div>
            </div>
          ) : (
            <>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--color-muted)' }}>
                  Ditemukan <strong style={{ color: 'var(--color-text)' }}>{results.length}</strong> rumah sakit
                  {!city && !specialization && !minAvailableBeds && !hasIcu ? ', urut: bed tersedia terbanyak' : ''}
                </span>
              </div>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Nama RS</th>
                      <th>Tipe</th>
                      <th>Kota</th>
                      <th style={{ textAlign: 'center' }}>Bed Tersedia</th>
                      <th style={{ textAlign: 'center' }}>ICU</th>
                      <th>Spesialisasi</th>
                      <th style={{ textAlign: 'center' }}>Aksi Cepat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => {
                      const tc = TYPE_BADGE[r.type] ?? { bg: '#f5f5f5', color: '#6b7280', label: r.type };
                      return (
                        <tr
                          key={r.id}
                          style={{
                            cursor: 'pointer',
                            background: selectedResult?.id === r.id ? 'var(--color-accent-light)' : undefined,
                          }}
                          onClick={() => setSelectedResult((prev) => prev?.id === r.id ? null : r)}
                        >
                          <td>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>{r.address.substring(0, 40)}…</div>
                          </td>
                          <td>
                            <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: tc.bg, color: tc.color }}>
                              {tc.label}
                            </span>
                          </td>
                          <td style={{ fontSize: 13 }}>{r.city}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ fontWeight: 700, fontSize: 14, color: bedColor(r.available_beds, r.total_beds) }}>
                              {r.available_beds}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--color-muted)' }}> / {r.total_beds}</span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {r.icu_total > 0 ? (
                              <span style={{ fontWeight: 700, fontSize: 13, color: bedColor(r.icu_available, r.icu_total) }}>
                                {r.icu_available}/{r.icu_total}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>—</span>
                            )}
                          </td>
                          <td>
                            {r.specializations && r.specializations.length > 0 ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                {r.specializations.slice(0, 3).map((s) => (
                                  <span key={s} style={{ padding: '1px 6px', borderRadius: 999, fontSize: 10, background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}>
                                    {s.replace(/_/g, ' ')}
                                  </span>
                                ))}
                                {r.specializations.length > 3 && (
                                  <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>+{r.specializations.length - 3}</span>
                                )}
                              </div>
                            ) : (
                              <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>—</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
                              {r.igd_phone && (
                                <button
                                  className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}
                                  onClick={() => copyToClipboard(r.igd_phone!, 'No. IGD', showToast)}
                                  title={`IGD: ${r.igd_phone}`}
                                  style={{ fontSize: 11 }}
                                >
                                  📞 IGD
                                </button>
                              )}
                              {r.phone && (
                                <button
                                  className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                                  onClick={() => copyToClipboard(r.phone!, 'No. Telepon', showToast)}
                                  title={`Tel: ${r.phone}`}
                                  style={{ fontSize: 11 }}
                                >
                                  📋
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* ── Detail panel ── */}
        {selectedResult && (
          <div className={styles.card} style={{ position: 'sticky', top: 24, padding: '20px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{selectedResult.name}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(() => {
                    const tc = TYPE_BADGE[selectedResult.type] ?? { bg: '#f5f5f5', color: '#6b7280', label: selectedResult.type };
                    return <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: tc.bg, color: tc.color }}>{tc.label}</span>;
                  })()}
                  {selectedResult.is_emt_partner && (
                    <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: '#fffbeb', color: '#d97706' }}>🚑 Mitra EMT</span>
                  )}
                </div>
              </div>
              <button className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`} onClick={() => setSelectedResult(null)}>✕</button>
            </div>

            {/* Info grid */}
            {[
              ['Alamat',   selectedResult.address],
              ['Kota',     selectedResult.city],
              ['Provinsi', selectedResult.province],
              ['Telepon',  selectedResult.phone ?? '—'],
              ['IGD',      selectedResult.igd_phone ?? '—'],
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '4px 10px', padding: '6px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 11, color: 'var(--color-muted)', fontWeight: 500 }}>{label}</span>
                <span style={{ fontSize: 13 }}>{val}</span>
              </div>
            ))}

            {/* Kapasitas */}
            <div style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Kapasitas Tempat Tidur</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  ['Total Bed',    selectedResult.total_beds],
                  ['Tersedia',     selectedResult.available_beds],
                  ['ICU Total',    selectedResult.icu_total],
                  ['ICU Tersedia', selectedResult.icu_available],
                ].map(([lbl, val]) => (
                  <div key={String(lbl)} style={{ background: 'var(--color-surface-2)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--color-border)', textAlign: 'center' }}>
                    <div style={{
                      fontSize: 20, fontWeight: 700,
                      color: lbl === 'Tersedia' ? bedColor(selectedResult.available_beds, selectedResult.total_beds)
                        : lbl === 'ICU Tersedia' ? bedColor(selectedResult.icu_available, selectedResult.icu_total)
                        : undefined,
                    }}>{val}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>{lbl}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Spesialisasi */}
            {selectedResult.specializations && selectedResult.specializations.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Spesialisasi</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {selectedResult.specializations.map((s) => (
                    <span key={s} style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                      {s.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Aksi */}
            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              {selectedResult.igd_phone && (
                <button
                  className={`${styles.btn} ${styles.btnDanger}`}
                  style={{ flex: 1, fontSize: 12 }}
                  onClick={() => copyToClipboard(selectedResult.igd_phone!, 'No. IGD', showToast)}
                >
                  📞 Salin No. IGD
                </button>
              )}
              {selectedResult.phone && (
                <button
                  className={`${styles.btn} ${styles.btnOutline}`}
                  style={{ flex: 1, fontSize: 12 }}
                  onClick={() => copyToClipboard(selectedResult.phone!, 'No. Telepon', showToast)}
                >
                  📋 Salin Telepon
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
