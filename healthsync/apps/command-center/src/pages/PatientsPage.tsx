import { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { usePatients, usePatientVitalsBatch, type PatientVital } from '../hooks/usePatients';
import ChartCard from '../components/ChartCard';
import MiniKpiCard from '../components/MiniKpiCard';
import LastUpdated from '../components/LastUpdated';
import styles from './Page.module.css';

// ─── Tipe sort kolom ──────────────────────────────────────────────────────

type SortKey = 'name' | 'age' | 'gender' | 'blood_type';
type SortDir = 'asc' | 'desc';

// ─── Warna golongan darah ──────────────────────────────────────────────────

const BLOOD_COLORS: Record<string, string> = {
  'A':  '#3b82f6',
  'B':  '#10b981',
  'AB': '#8b5cf6',
  'O':  '#f59e0b',
  'A+': '#2563eb',
  'A-': '#93c5fd',
  'B+': '#059669',
  'B-': '#6ee7b7',
  'AB+':'#7c3aed',
  'AB-':'#c4b5fd',
  'O+': '#d97706',
  'O-': '#fcd34d',
};

// ─── Label kondisi berdasarkan data ──────────────────────────────────────

function BloodTypeBadge({ type }: { type: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 999,
      fontSize: 11, fontWeight: 700,
      background: '#f3f4f6', color: '#374151',
      border: '1px solid #e5e7eb',
      fontFamily: 'monospace',
    }}>
      {type}
    </span>
  );
}

function GenderBadge({ gender }: { gender: string }) {
  const isMale = gender === 'MALE' || gender === 'L';
  const isOther = gender === 'OTHER';
  const label = isMale ? 'L' : isOther ? 'Lainnya' : 'P';
  return (
    <span style={{
      fontSize: 11, fontWeight: 600,
      color: isMale ? '#2563eb' : isOther ? '#6b21a8' : '#be185d',
      background: isMale ? '#dbeafe' : isOther ? '#f3e8ff' : '#fce7f3',
      padding: '2px 7px', borderRadius: 999,
      border: `1px solid ${isMale ? '#bfdbfe' : isOther ? '#e9d5ff' : '#fbcfe8'}`,
    }}>
      {label}
    </span>
  );
}

function formatTanggalLahir(dob: string): string {
  try {
    const d = new Date(dob);
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return `${d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })} (${age} th)`;
  } catch {
    return dob;
  }
}

function getAge(dob: string): number {
  try {
    const d = new Date(dob);
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return Math.max(0, age);
  } catch {
    return 0;
  }
}

// ─── Komponen skeleton loading ────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr>
      {[180, 120, 60, 150, 100, 120].map((w, i) => (
        <td key={i} style={{ padding: '12px 14px' }}>
          <div style={{
            height: 14, width: w, borderRadius: 6,
            background: 'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.4s ease-in-out infinite',
          }} />
        </td>
      ))}
    </tr>
  );
}

// ─── VitalCell: render dari vitalMap (tidak fetch sendiri — anti N+1) ─────
function VitalCell({ vital, loading }: { vital: PatientVital | null | undefined; loading: boolean }) {
  if (loading) {
    return <span style={{ color: 'var(--color-muted)', fontSize: 10 }}>...</span>;
  }
  if (!vital) {
    return <span style={{ color: 'var(--color-disabled)', fontStyle: 'italic', fontSize: 10 }}>—</span>;
  }

  const hr   = vital.heart_rate;
  const spo2 = vital.spo2 != null ? parseFloat(String(vital.spo2)) : null;

  const hrColor = hr == null ? 'var(--color-muted)'
    : hr > 120 || hr < 50 ? 'var(--color-danger)'
    : hr > 100 ? 'var(--color-warning)'
    : 'var(--color-success)';

  const spo2Color = spo2 == null ? 'var(--color-muted)'
    : spo2 < 90 ? 'var(--color-danger)'
    : spo2 < 95 ? 'var(--color-warning)'
    : 'var(--color-success)';

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {hr != null && (
        <span style={{ fontSize: 11, fontWeight: 700, color: hrColor }} title="Detak jantung (bpm)">
          ❤️ {hr}
        </span>
      )}
      {spo2 != null && (
        <span style={{ fontSize: 11, fontWeight: 700, color: spo2Color }} title="Saturasi oksigen (%)">
          💧 {spo2.toFixed(0)}%
        </span>
      )}
      {hr == null && spo2 == null && (
        <span style={{ color: 'var(--color-disabled)', fontStyle: 'italic', fontSize: 10 }}>—</span>
      )}
    </div>
  );
}

// ─── PatientsPage utama ──────────────────────────────────────────────────

export default function PatientsPage() {
  const {
    patients,
    meta,
    loading,
    error,
    page,
    setPage,
    search,
    setSearch,
    refetch,
  } = usePatients(30000);

  // ── State sort kolom ──────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // ── State waktu fetch terakhir ─────────────────────────────────────────────
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  useEffect(() => { setLastFetch(new Date()); }, [patients]);

  // ── Batch fetch vital untuk semua pasien di halaman ini (anti N+1) ─────────
  // Ambil semua patient IDs dari halaman saat ini sebagai key stabil
  const patientIds = useMemo(() => patients.map((p) => p.id), [patients]);
  const { vitalMap, loading: vitalLoading } = usePatientVitalsBatch(patientIds);

  const totalPages = meta.totalPages ?? 0;

  // ── Hitung statistik dari data pasien yang ada ──────────────────────────
  const maleCount   = patients.filter((p) => p.gender === 'MALE' || p.gender === 'L').length;
  const femaleCount = patients.filter((p) => p.gender === 'FEMALE' || p.gender === 'P').length;
  const otherCount  = patients.filter((p) => p.gender === 'OTHER').length;

  const ages = patients.map((p) => getAge(p.date_of_birth)).filter((a) => a > 0);
  const avgAge = ages.length > 0 ? Math.round(ages.reduce((s, a) => s + a, 0) / ages.length) : 0;

  // Distribusi golongan darah
  const bloodMap: Record<string, number> = {};
  for (const p of patients) {
    bloodMap[p.blood_type] = (bloodMap[p.blood_type] ?? 0) + 1;
  }
  const bloodData = Object.entries(bloodMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Distribusi usia (5 kelompok)
  const ageGroups = [
    { name: '0–17', value: 0, color: '#6366f1' },
    { name: '18–35', value: 0, color: '#3b82f6' },
    { name: '36–50', value: 0, color: '#10b981' },
    { name: '51–65', value: 0, color: '#f59e0b' },
    { name: '65+', value: 0, color: '#ef4444' },
  ];
  for (const p of patients) {
    const a = getAge(p.date_of_birth);
    if (a <= 17)      ageGroups[0].value++;
    else if (a <= 35) ageGroups[1].value++;
    else if (a <= 50) ageGroups[2].value++;
    else if (a <= 65) ageGroups[3].value++;
    else              ageGroups[4].value++;
  }

  // Data gender untuk BarChart sederhana
  const genderData = [
    { name: 'Laki-laki', value: maleCount,   fill: '#3b82f6' },
    { name: 'Perempuan', value: femaleCount,  fill: '#ec4899' },
    { name: 'Lainnya', value: otherCount, fill: '#8b5cf6' },
  ];

  // ── Fungsi toggle sort ────────────────────────────────────────────────────
  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  // ── Pasien setelah sort (sort hanya pada halaman yang dimuat) ─────────────
  const sortedPatients = [...patients].sort((a, b) => {
    let va: string | number = '';
    let vb: string | number = '';
    if (sortKey === 'name')       { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
    else if (sortKey === 'age')   { va = getAge(a.date_of_birth); vb = getAge(b.date_of_birth); }
    else if (sortKey === 'gender'){ va = a.gender; vb = b.gender; }
    else if (sortKey === 'blood_type') { va = a.blood_type; vb = b.blood_type; }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

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
          <h1 className={styles.title} style={{ marginBottom: 0 }}>Daftar Pasien</h1>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 4 }}>
            {meta.total > 0 ? `${meta.total} pasien terdaftar` : 'Memuat data...'}
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
      {!loading && patients.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
          <MiniKpiCard label="Total Pasien"    value={meta.total || patients.length} icon="👥" color="var(--color-primary)" />
          <MiniKpiCard label="Laki-laki"        value={maleCount}                    icon="👨" color="#3b82f6"              />
          <MiniKpiCard label="Perempuan"        value={femaleCount}                  icon="👩" color="#ec4899"              />
          <MiniKpiCard label="Rata-rata Usia"   value={`${avgAge} th`}               icon="📅" color="var(--color-success)" sub="dari halaman ini" />
        </div>
      )}

      {/* ── Charts row (3 kolom) ── */}
      {!loading && patients.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
          {/* Donut Chart golongan darah */}
          <ChartCard title="Distribusi Golongan Darah" subtitle="Berdasarkan pasien pada halaman ini">
            {bloodData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={bloodData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {bloodData.map((entry, idx) => (
                      <Cell key={idx} fill={BLOOD_COLORS[entry.name] ?? `hsl(${idx * 45}, 65%, 55%)`} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--color-border)' }}
                    formatter={(value: number) => [value, 'Pasien']}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--color-muted)', fontSize: 13, paddingTop: 60 }}>
                Tidak ada data golongan darah
              </div>
            )}
          </ChartCard>

          {/* Bar Chart gender */}
          <ChartCard title="Distribusi Gender" subtitle="Laki-laki vs Perempuan pada halaman ini">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={genderData} margin={{ top: 16, right: 16, left: -20, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--color-border)' }}
                  formatter={(value: number) => [value, 'Pasien']}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="value" name="Jumlah" radius={[6, 6, 0, 0]}>
                  {genderData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Bar Chart distribusi usia */}
          <ChartCard title="Distribusi Kelompok Usia" subtitle="5 kelompok usia pasien">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={ageGroups} margin={{ top: 10, right: 8, left: -20, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--color-border)' }}
                  formatter={(value: number) => [value, 'Pasien']}
                />
                <Bar dataKey="value" name="Pasien" radius={[4, 4, 0, 0]}>
                  {ageGroups.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      <div className={styles.card}>
        {/* ── Toolbar pencarian ── */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <input
            type="search"
            placeholder="Cari berdasarkan nama pasien..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{
              flex: 1, padding: '8px 12px',
              border: '1px solid var(--color-border)', borderRadius: 6,
              fontSize: 14, background: 'var(--color-surface-2)',
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

        {/* ── Tabel data ── */}
        {loading ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nama</th><th>Tanggal Lahir</th>
                <th>Gol. Darah</th><th>Gender</th><th>Telepon</th>
                <th>Vital Terakhir</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 8 }, (_, i) => <SkeletonRow key={i} />)}
            </tbody>
          </table>
        ) : patients.length === 0 ? (
          <div className={styles.emptyState}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🏥</div>
            <div style={{ fontWeight: 600 }}>
              {search ? `Tidak ada pasien dengan nama "${search}"` : 'Tidak ada data pasien'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 4 }}>
              {search ? 'Coba kata kunci lain' : 'Pasien belum terdaftar di sistem'}
            </div>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <SortTh label="Nama" colKey="name" />
                <SortTh label="Usia / Tgl Lahir" colKey="age" />
                <SortTh label="Gol. Darah" colKey="blood_type" />
                <SortTh label="Gender" colKey="gender" />
                <th>Telepon</th>
                <th>Vital Terakhir</th>
              </tr>
            </thead>
            <tbody>
              {sortedPatients.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                    {formatTanggalLahir(p.date_of_birth)}
                  </td>
                  <td><BloodTypeBadge type={p.blood_type} /></td>
                  <td><GenderBadge gender={p.gender} /></td>
                  <td style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                    {p.phone ?? <span style={{ color: 'var(--color-disabled)', fontStyle: 'italic' }}>—</span>}
                  </td>
                  <td style={{ fontSize: 11 }}>
                    {/* Gunakan vitalMap dari batch hook — tidak ada per-row API call */}
                    <VitalCell
                      vital={vitalMap.get(p.id)}
                      loading={vitalLoading && !vitalMap.has(p.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ── Pagination ── */}
        {!loading && (
          <div className={styles.pagination}>
            <span>Total: {meta.total} pasien</span>
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

    </div>
  );
}
