import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useHospitals } from '../hooks/useHospitals';
import ChartCard from '../components/ChartCard';
import MiniKpiCard from '../components/MiniKpiCard';
import ProgressBar from '../components/ProgressBar';
import ChipFilter from '../components/ChipFilter';
import LastUpdated from '../components/LastUpdated';
import styles from './Page.module.css';

// ─── Tipe sort kolom ──────────────────────────────────────────────────────

type SortKey = 'name' | 'city' | 'available_beds' | 'icu_available';
type SortDir = 'asc' | 'desc';

// ─── Konfigurasi tipe rumah sakit ─────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  RUMAH_SAKIT_UMUM:    { label: 'RSU',       color: '#2563eb' },
  RUMAH_SAKIT_KHUSUS:  { label: 'RSK',       color: '#7c3aed' },
  RUMAH_SAKIT_DAERAH:  { label: 'RSD',       color: '#0284c7' },
  KLINIK:              { label: 'Klinik',    color: '#059669' },
  PUSKESMAS:           { label: 'Puskesmas', color: '#d97706' },
};

// ─── Helper: warna kapasitas bed ─────────────────────────────────────────

function bedColor(available: number | null, total: number | null): string {
  if (!available || !total) return 'var(--color-muted)';
  const ratio = available / total;
  if (ratio < 0.1) return 'var(--color-danger)';
  if (ratio < 0.3) return 'var(--color-warning)';
  return 'var(--color-success)';
}

function bedProgressColor(available: number | null, total: number | null): string {
  if (!available || !total) return 'var(--color-border)';
  const ratio = available / total;
  if (ratio < 0.1) return 'var(--color-danger)';
  if (ratio < 0.3) return 'var(--color-warning)';
  return 'var(--color-success)';
}

// ─── Skeleton loading ─────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr>
      {[180, 60, 80, 100, 80, 80, 80, 160, 60].map((w, i) => (
        <td key={i} style={{ padding: '11px 14px' }}>
          <div style={{
            height: 12, width: w, borderRadius: 6,
            background: 'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.4s ease-in-out infinite',
          }} />
        </td>
      ))}
    </tr>
  );
}

// ─── HospitalsPage utama ──────────────────────────────────────────────────

export default function HospitalsPage() {
  const {
    hospitals,
    meta,
    loading,
    error,
    page,
    setPage,
    search,
    setSearch,
    criticalCapacity,
    refetch,
  } = useHospitals(30000);

  // ── State sort kolom ──────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // ── State filter tipe & waktu terakhir fetch ──────────────────────────────
  const [filterType, setFilterType] = useState<string>('');
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  useEffect(() => { setLastFetch(new Date()); }, [hospitals]);

  // BUG FIX: Reset ke halaman 1 saat filter tipe berubah
  // (mencegah halaman kosong saat jumlah RS pada tipe baru < page saat ini)
  useEffect(() => {
    setPage(1);
  }, [filterType, setPage]);

  const totalPages = meta?.totalPages ?? 0;
  const total = meta?.total ?? 0;

  // ── Statistik dari halaman ini ─────────────────────────────────────────
  const emtPartners = hospitals.filter((h) => h.is_emt_partner).length;

  const bedsWithData = hospitals.filter(
    (h) => h.available_beds != null && h.total_beds != null && h.total_beds > 0,
  );
  const avgBedAvail = bedsWithData.length > 0
    ? Math.round(
        bedsWithData.reduce((s, h) => s + (h.available_beds! / h.total_beds!) * 100, 0) / bedsWithData.length,
      )
    : 0;

  // Top 8 RS untuk bar chart kapasitas — hanya yang punya data beds
  const top8Beds = [...hospitals]
    .filter((h) => h.total_beds != null && h.total_beds > 0)
    .sort((a, b) => (b.available_beds ?? 0) - (a.available_beds ?? 0))
    .slice(0, 8)
    .map((h) => ({
      name: h.name.length > 18 ? h.name.slice(0, 16) + '…' : h.name,
      tersedia: h.available_beds ?? 0,
      total: h.total_beds ?? 0,
      color: bedProgressColor(h.available_beds, h.total_beds),
    }));

  // ── Fungsi toggle sort ────────────────────────────────────────────────────
  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  // ── RS setelah sort ───────────────────────────────────────────────────────
  const sortedHospitals = [...hospitals].sort((a, b) => {
    let va: string | number = '';
    let vb: string | number = '';
    if (sortKey === 'name')           { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
    else if (sortKey === 'city')      { va = (a.city ?? '').toLowerCase(); vb = (b.city ?? '').toLowerCase(); }
    else if (sortKey === 'available_beds')  { va = a.available_beds ?? -1; vb = b.available_beds ?? -1; }
    else if (sortKey === 'icu_available')   { va = a.icu_available ?? -1; vb = b.icu_available ?? -1; }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  // ── RS setelah filter tipe ────────────────────────────────────────────────
  const displayedHospitals = filterType
    ? sortedHospitals.filter((h) => h.type === filterType)
    : sortedHospitals;

  // ── Chip options tipe RS ──────────────────────────────────────────────────
  const typeChipOptions = Object.entries(
    hospitals.reduce<Record<string, number>>((acc, h) => {
      acc[h.type] = (acc[h.type] ?? 0) + 1;
      return acc;
    }, {})
  ).map(([type, count]) => ({
    value: type,
    label: TYPE_CONFIG[type]?.label ?? type,
    count,
    color: TYPE_CONFIG[type]?.color ?? 'var(--color-primary)',
  }));

  // ── Helper render header kolom sortable ──────────────────────────────────
  function SortTh({ label, colKey }: { label: string; colKey: SortKey }) {
    const active = sortKey === colKey;
    return (
      <th
        style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
        onClick={() => handleSort(colKey)}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {label}
          <span style={{ fontSize: 10, opacity: active ? 1 : 0.35, color: active ? 'var(--color-primary)' : 'inherit' }}>
            {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
          </span>
        </span>
      </th>
    );
  }

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 className={styles.title} style={{ marginBottom: 0 }}>Rumah Sakit</h1>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 4 }}>
            {criticalCapacity > 0 && (
              <span style={{ color: 'var(--color-danger)', fontWeight: 700 }}>
                {criticalCapacity} RS kapasitas kritis · 
              </span>
            )}
            {total > 0 ? `${total} fasilitas kesehatan` : 'Memuat...'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LastUpdated timestamp={lastFetch} />
          <button
            onClick={() => void refetch()}
            className={`${styles.btn} ${styles.btnSecondary}`}
            style={{ fontSize: 13 }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      {!loading && hospitals.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
          <MiniKpiCard label="Total RS"              value={total}           icon="🏥" color="var(--color-primary)"  />
          <MiniKpiCard label="Kapasitas Kritis"      value={criticalCapacity}icon="🔴" color="var(--color-danger)"   trend={criticalCapacity > 0 ? 'up' : 'neutral'} />
          <MiniKpiCard label="Rata-rata Ketersediaan Bed" value={`${avgBedAvail}%`} icon="🛏" color="var(--color-success)" sub="dari RS bertdata" />
          <MiniKpiCard label="EMT Partner"           value={emtPartners}     icon="🚑" color="var(--color-info)"     />
        </div>
      )}

      {/* ── Horizontal Bar Chart kapasitas bed ── */}
      {!loading && top8Beds.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <ChartCard title="Kapasitas Bed — Top 8 RS" subtitle="Bed tersedia vs total (klik untuk detail)">
            <ResponsiveContainer width="100%" height={top8Beds.length * 38 + 20}>
              <BarChart
                data={top8Beds}
                layout="vertical"
                margin={{ top: 4, right: 40, left: 0, bottom: 4 }}
                barSize={14}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={130} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--color-border)' }}
                  formatter={(value: number, name: string) => [value, name === 'tersedia' ? 'Bed Tersedia' : 'Total Bed']}
                />
                <Bar dataKey="total"    name="Total Bed"    fill="#e5e7eb" radius={[0, 4, 4, 0]} />
                <Bar dataKey="tersedia" name="Bed Tersedia" radius={[0, 4, 4, 0]}>
                  {top8Beds.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      <div className={styles.card}>
        {/* ── Filter tipe RS ── */}
        {!loading && hospitals.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <ChipFilter
              options={typeChipOptions}
              value={filterType}
              onChange={(v) => { setFilterType(v); setPage(1); }}
              allLabel="Semua Tipe"
            />
          </div>
        )}

        {/* ── Toolbar ── */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            type="search"
            placeholder="Cari nama atau kota..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{
              flex: 1, minWidth: 200, padding: '8px 12px',
              border: '1px solid var(--color-border)', borderRadius: 6,
              fontSize: 13, background: 'var(--color-surface-2)',
              color: 'var(--color-text)',
            }}
          />
        </div>

        {/* ── Error state ── */}
        {error && (
          <div style={{
            background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)',
            borderRadius: 6, padding: '12px 16px', marginBottom: 16,
            fontSize: 13, color: 'var(--color-danger)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>{error}</span>
            <button
              onClick={() => void refetch()}
              style={{ padding: '4px 10px', background: 'transparent', border: '1px solid var(--color-danger-border)', borderRadius: 4, fontSize: 12, cursor: 'pointer', color: 'var(--color-danger)' }}
            >
              Coba Lagi
            </button>
          </div>
        )}

        {/* ── Tabel ── */}
        {loading ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nama</th>
                <th>Tipe</th>
                <th>Kota</th>
                <th>Provinsi</th>
                <th>Bed Tersedia</th>
                <th>ICU</th>
                <th>EMT Partner</th>
                <th>Spesialisasi</th>
                <th>Telepon</th>
              </tr>
            </thead>
            <tbody>{Array.from({ length: 8 }, (_, i) => <SkeletonRow key={i} />)}</tbody>
          </table>
        ) : hospitals.length === 0 ? (
          <div className={styles.emptyState}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🏥</div>
            <div style={{ fontWeight: 600 }}>
              {search ? `Tidak ada RS dengan kata kunci "${search}"` : 'Tidak ada rumah sakit ditemukan'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 4 }}>
              Data fasilitas kesehatan belum tersedia
            </div>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <SortTh label="Nama" colKey="name" />
                <th>Tipe</th>
                <SortTh label="Kota" colKey="city" />
                <th>Provinsi</th>
                <SortTh label="Bed Tersedia" colKey="available_beds" />
                <SortTh label="ICU" colKey="icu_available" />
                <th>EMT Partner</th>
                <th>Spesialisasi</th>
                <th>Telepon IGD</th>
              </tr>
            </thead>
            <tbody>
              {displayedHospitals.map((h) => {
                const typeCfg = TYPE_CONFIG[h.type] ?? { label: h.type, color: 'var(--color-muted)' };
                const bColor  = bedColor(h.available_beds, h.total_beds);
                const icuColor = bedColor(h.icu_available, h.icu_total);
                const bedPercent = h.available_beds != null && h.total_beds != null && h.total_beds > 0
                  ? (h.available_beds / h.total_beds) * 100
                  : null;
                const icuPercent = h.icu_available != null && h.icu_total != null && h.icu_total > 0
                  ? (h.icu_available / h.icu_total) * 100
                  : null;
                return (
                  <tr
                    key={h.id}
                    style={h.available_beds != null && h.total_beds != null && h.total_beds > 0
                      && (h.available_beds / h.total_beds) < 0.1
                      ? { background: 'var(--color-danger-bg)' }
                      : undefined}
                  >
                    <td style={{ fontWeight: 500 }}>{h.name}</td>
                    <td>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 7px',
                        borderRadius: 4,
                        background: `${typeCfg.color}18`,
                        color: typeCfg.color,
                        border: `1px solid ${typeCfg.color}30`,
                      }}>
                        {typeCfg.label}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{h.city}</td>
                    <td style={{ fontSize: 12, color: 'var(--color-muted)' }}>{h.province}</td>
                    <td style={{ minWidth: 110 }}>
                      {bedPercent != null ? (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: bColor, marginBottom: 3 }}>
                            {h.available_beds} / {h.total_beds}
                          </div>
                          <ProgressBar value={bedPercent} color={bColor} />
                        </div>
                      ) : (
                        <span style={{ color: 'var(--color-disabled)', fontStyle: 'italic', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={{ minWidth: 100 }}>
                      {icuPercent != null ? (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: icuColor, marginBottom: 3 }}>
                            {h.icu_available} / {h.icu_total}
                          </div>
                          <ProgressBar value={icuPercent} color={icuColor} />
                        </div>
                      ) : (
                        <span style={{ color: 'var(--color-disabled)', fontStyle: 'italic', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={`${styles.badge} ${h.is_emt_partner ? styles.badgeOk : styles.badgePending}`}>
                        {h.is_emt_partner ? 'Ya' : 'Tidak'}
                      </span>
                    </td>
                    <td style={{ fontSize: 11, maxWidth: 160, overflow: 'hidden' }}>
                      {h.specializations && h.specializations.length > 0 ? (
                        <span title={h.specializations.join(', ')}>
                          {h.specializations.slice(0, 2).join(', ')}
                          {h.specializations.length > 2 && (
                            <span style={{ color: 'var(--color-muted)' }}> +{h.specializations.length - 2}</span>
                          )}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-disabled)', fontStyle: 'italic' }}>—</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                      {h.igd_phone ?? h.phone ?? (
                        <span style={{ color: 'var(--color-disabled)', fontStyle: 'italic' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* ── Pagination ── */}
        {!loading && (
          <div className={styles.pagination}>
            <span>Total: {total} fasilitas</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className={`${styles.btn} ${styles.btnSecondary}`}
                style={{ padding: '4px 10px', fontSize: 12 }}
              >
                ← Prev
              </button>
              <span style={{ fontSize: 13, color: 'var(--color-muted)', minWidth: 80, textAlign: 'center' }}>
                Hal. {page} / {totalPages || 1}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
                className={`${styles.btn} ${styles.btnSecondary}`}
                style={{ padding: '4px 10px', fontSize: 12 }}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
