import { useState, useCallback, useRef } from 'react';
import { pharmacyClient } from '../api/client';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import { InputField, SelectField } from '../components/FormField';
import { Skeleton } from '../components/Skeleton';
import styles from './Page.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Tipe Data
// ─────────────────────────────────────────────────────────────────────────────

interface DrugRow {
  id: string;
  generic_name: string;
  brand_name: string | null;
  dosage_form: string | null;
  strength: string | null;
  unit: string | null;
  drug_class: string | null;
  requires_prescription: boolean;
  created_at?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Konstanta
// ─────────────────────────────────────────────────────────────────────────────

const DOSAGE_FORMS = [
  '', 'TABLET', 'CAPSULE', 'SYRUP', 'INJECTION', 'CREAM', 'OINTMENT',
  'DROPS', 'INHALER', 'SUPPOSITORY', 'PATCH',
];

const DRUG_CLASSES = [
  '', 'ANALGESIC', 'ANTIBIOTIC', 'ANTIHYPERTENSIVE', 'ANTIDIABETIC',
  'ANTIHISTAMINE', 'ANTIVIRAL', 'ANTIFUNGAL', 'CARDIOVASCULAR',
  'GASTROINTESTINAL', 'RESPIRATORY', 'NEUROLOGICAL', 'PSYCHIATRIC',
  'VITAMIN_SUPPLEMENT', 'HORMONAL',
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function exportCSV(drugs: DrugRow[]) {
  const headers = ['Nama Generik', 'Nama Brand', 'Bentuk', 'Kekuatan', 'Unit', 'Kelas', 'Perlu Resep'];
  const lines = drugs.map((d) => [
    `"${d.generic_name.replace(/"/g, '""')}"`,
    `"${(d.brand_name ?? '').replace(/"/g, '""')}"`,
    d.dosage_form ?? '',
    d.strength ?? '',
    d.unit ?? '',
    d.drug_class ?? '',
    d.requires_prescription ? 'Ya' : 'Tidak',
  ].join(','));
  const csv  = [headers.join(','), ...lines].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `katalog-obat-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Halaman Utama
// ─────────────────────────────────────────────────────────────────────────────

export default function DrugCatalogPage() {
  const { showToast } = useToast();

  const [drugs,      setDrugs]      = useState<DrugRow[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [searched,   setSearched]   = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // Filter
  const [query,         setQuery]         = useState('');
  const [draftQuery,    setDraftQuery]    = useState('');
  const [dosageFilter,  setDosageFilter]  = useState('');
  const [classFilter,   setClassFilter]   = useState('');
  const [rxFilter,      setRxFilter]      = useState('');

  // Detail
  const [selected, setSelected] = useState<DrugRow | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchDrugs = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      showToast('Kata kunci minimal 2 karakter', 'warning');
      return;
    }
    setLoading(true);
    setError(null);
    setSearched(true);
    setSelected(null);
    try {
      const res = await pharmacyClient.get<{ data: DrugRow[] }>(
        `/v1/drugs/search?q=${encodeURIComponent(q.trim())}`
      );
      setDrugs(res.data.data ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mencari data obat';
      setError(msg);
      showToast(msg, 'error');
      setDrugs([]);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const handleQueryChange = (val: string) => {
    setDraftQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length >= 2) {
      debounceRef.current = setTimeout(() => {
        setQuery(val);
        void fetchDrugs(val);
      }, 500);
    }
  };

  const handleSearch = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery(draftQuery);
    void fetchDrugs(draftQuery);
  };

  const handleReset = () => {
    setDraftQuery(''); setQuery('');
    setDosageFilter(''); setClassFilter(''); setRxFilter('');
    setDrugs([]); setSearched(false); setSelected(null); setError(null);
  };

  // ── Filter client-side (bentuk, kelas, resep) ──
  const filtered = drugs.filter((d) => {
    const matchDosage = !dosageFilter || d.dosage_form === dosageFilter;
    const matchClass  = !classFilter  || d.drug_class  === classFilter;
    const matchRx     = !rxFilter     || (rxFilter === 'true' ? d.requires_prescription : !d.requires_prescription);
    return matchDosage && matchClass && matchRx;
  });

  // ── Statistik dari results ──
  const totalRx     = drugs.filter((d) => d.requires_prescription).length;
  const totalOtc    = drugs.filter((d) => !d.requires_prescription).length;
  const uniqueForms = Array.from(new Set(drugs.map((d) => d.dosage_form).filter(Boolean))).length;
  const uniqueClass = Array.from(new Set(drugs.map((d) => d.drug_class).filter(Boolean))).length;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Katalog Obat"
        subtitle="Cari dan lihat informasi master data obat"
        breadcrumbs={[
          { label: 'Dashboard', to: '/' },
          { label: 'Apotek', to: '/pharmacy' },
          { label: 'Katalog Obat' },
        ]}
        actions={
          filtered.length > 0 ? (
            <button
              className={`${styles.btn} ${styles.btnOutline}`}
              onClick={() => exportCSV(filtered)}
            >
              ⬇ Ekspor CSV ({filtered.length})
            </button>
          ) : undefined
        }
      />

      {/* ── Search Box ── */}
      <div className={styles.card} style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>💊 Cari Obat</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 300px' }}>
            <InputField
              label=""
              value={draftQuery}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Ketik nama generik atau brand obat (min. 2 karakter)…"
            />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={handleSearch}
              disabled={loading || draftQuery.trim().length < 2}
            >
              {loading ? '⏳ Mencari…' : '🔍 Cari'}
            </button>
            <button
              className={`${styles.btn} ${styles.btnOutline}`}
              onClick={handleReset}
            >
              Reset
            </button>
          </div>
        </div>

        {/* Filter chip (hanya tampil setelah ada hasil) */}
        {drugs.length > 0 && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
            <div style={{ flex: '0 1 200px' }}>
              <SelectField
                label=""
                value={dosageFilter}
                onChange={(e) => setDosageFilter(e.target.value)}
                options={[
                  { value: '', label: 'Semua Bentuk Sediaan' },
                  ...DOSAGE_FORMS.filter(Boolean).map((f) => ({ value: f, label: formatLabel(f) })),
                ]}
              />
            </div>
            <div style={{ flex: '0 1 220px' }}>
              <SelectField
                label=""
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                options={[
                  { value: '', label: 'Semua Kelas Obat' },
                  ...DRUG_CLASSES.filter(Boolean).map((c) => ({ value: c, label: formatLabel(c) })),
                ]}
              />
            </div>
            <div style={{ flex: '0 1 180px' }}>
              <SelectField
                label=""
                value={rxFilter}
                onChange={(e) => setRxFilter(e.target.value)}
                options={[
                  { value: '', label: 'Resep & OTC' },
                  { value: 'true',  label: '📋 Perlu Resep' },
                  { value: 'false', label: '🟢 OTC (Bebas)' },
                ]}
              />
            </div>
            {(dosageFilter || classFilter || rxFilter) && (
              <button
                className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                style={{ alignSelf: 'center' }}
                onClick={() => { setDosageFilter(''); setClassFilter(''); setRxFilter(''); }}
              >
                Reset Filter
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Stat Cards (setelah pencarian) ── */}
      {searched && drugs.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'Total Ditemukan', value: drugs.length,   color: 'var(--color-primary)', icon: '💊' },
            { label: 'Perlu Resep',     value: totalRx,        color: '#dc2626',               icon: '📋' },
            { label: 'OTC (Bebas)',     value: totalOtc,       color: '#16a34a',               icon: '🟢' },
            { label: 'Bentuk Sediaan', value: uniqueForms,    color: 'var(--color-accent)',   icon: '🧪' },
            { label: 'Kelas Obat',     value: uniqueClass,    color: '#d97706',               icon: '🏷️' },
          ].map((s) => (
            <div key={s.label} style={{
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 10, padding: '12px 14px', borderTop: `3px solid ${s.color}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 3 }}>{s.label}</div>
                </div>
                <span style={{ fontSize: 18, opacity: 0.7 }}>{s.icon}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabel + Detail ── */}
      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 340px' : '1fr', gap: 16 }}>

        <div className={styles.card} style={{ padding: 0 }}>
          {!searched ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>💊</div>
              <div className={styles.emptyStateTitle}>Cari obat di atas</div>
              <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                Ketik nama generik atau brand obat untuk mulai mencari.
              </div>
            </div>
          ) : loading ? (
            <div style={{ padding: 16 }}>
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={52} style={{ marginBottom: 8 }} />)}
            </div>
          ) : error ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>⚠️</div>
              <div className={styles.emptyStateTitle}>Gagal memuat data</div>
              <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>{error}</div>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => void fetchDrugs(query)}>Coba Lagi</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>🔍</div>
              <div className={styles.emptyStateTitle}>
                {drugs.length === 0 ? `Tidak ada obat dengan kata kunci "${query}"` : 'Tidak ada yang cocok dengan filter'}
              </div>
            </div>
          ) : (
            <>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border)', fontSize: 12, color: 'var(--color-muted)', display: 'flex', justifyContent: 'space-between' }}>
                <span>Menampilkan <strong style={{ color: 'var(--color-text)' }}>{filtered.length}</strong> dari {drugs.length} hasil untuk <em>"{query}"</em></span>
              </div>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Nama Obat</th>
                      <th>Bentuk Sediaan</th>
                      <th>Kelas</th>
                      <th style={{ textAlign: 'center' }}>Resep</th>
                      <th style={{ textAlign: 'center' }}>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((d) => (
                      <tr
                        key={d.id}
                        style={{
                          cursor: 'pointer',
                          background: selected?.id === d.id ? 'var(--color-accent-light)' : undefined,
                        }}
                        onClick={() => setSelected((prev) => prev?.id === d.id ? null : d)}
                      >
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{d.generic_name}</div>
                          {d.brand_name && (
                            <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>{d.brand_name}</div>
                          )}
                        </td>
                        <td>
                          {d.dosage_form ? (
                            <span style={{
                              display: 'inline-block', padding: '2px 8px', borderRadius: 999,
                              fontSize: 11, fontWeight: 600,
                              background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
                              color: 'var(--color-text-secondary)',
                            }}>
                              {formatLabel(d.dosage_form)}
                              {d.strength ? ` ${d.strength}` : ''}
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>—</span>
                          )}
                        </td>
                        <td>
                          {d.drug_class ? (
                            <span style={{
                              display: 'inline-block', padding: '2px 8px', borderRadius: 999,
                              fontSize: 11, fontWeight: 600,
                              background: 'var(--color-accent-light)', color: 'var(--color-accent)',
                            }}>
                              {formatLabel(d.drug_class)}
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>—</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {d.requires_prescription ? (
                            <span style={{
                              display: 'inline-block', padding: '2px 8px', borderRadius: 999,
                              fontSize: 11, fontWeight: 600, background: '#fef2f2', color: '#dc2626',
                            }}>
                              📋 Resep
                            </span>
                          ) : (
                            <span style={{
                              display: 'inline-block', padding: '2px 8px', borderRadius: 999,
                              fontSize: 11, fontWeight: 600, background: '#f0fdf4', color: '#16a34a',
                            }}>
                              🟢 OTC
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: 11, color: 'var(--color-primary)' }}>
                            {selected?.id === d.id ? '▲ Tutup' : '▼ Lihat'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* ── Detail Panel ── */}
        {selected && (
          <div className={styles.card} style={{ position: 'sticky', top: 24, padding: '20px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{selected.generic_name}</div>
              <button className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`} onClick={() => setSelected(null)}>✕</button>
            </div>

            {[
              ['Nama Brand',     selected.brand_name ?? '—'],
              ['Bentuk Sediaan', selected.dosage_form ? formatLabel(selected.dosage_form) : '—'],
              ['Kekuatan',       selected.strength ?? '—'],
              ['Unit',           selected.unit ?? '—'],
              ['Kelas Obat',     selected.drug_class ? formatLabel(selected.drug_class) : '—'],
            ].map(([label, val]) => (
              <div key={String(label)} style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '4px 10px', padding: '7px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 11, color: 'var(--color-muted)', fontWeight: 500 }}>{label}</span>
                <span style={{ fontSize: 13 }}>{val}</span>
              </div>
            ))}

            {/* Status resep */}
            <div style={{
              marginTop: 16, padding: '12px 14px', borderRadius: 10,
              background: selected.requires_prescription ? '#fef2f2' : '#f0fdf4',
              border: `1px solid ${selected.requires_prescription ? '#fca5a5' : '#86efac'}`,
            }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: selected.requires_prescription ? '#dc2626' : '#16a34a', marginBottom: 4 }}>
                {selected.requires_prescription ? '📋 Obat Keras — Perlu Resep Dokter' : '🟢 Obat Bebas (OTC)'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                {selected.requires_prescription
                  ? 'Tidak boleh diserahkan tanpa resep dokter yang valid.'
                  : 'Dapat diberikan kepada pasien tanpa resep dokter.'}
              </div>
            </div>

            {/* ID untuk referensi */}
            <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 2 }}>ID Obat (untuk integrasi sistem)</div>
              <code style={{ fontSize: 11, color: 'var(--color-text)' }}>{selected.id}</code>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
