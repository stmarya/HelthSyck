import { useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer, Legend,
  LineChart, Line, AreaChart, Area,
} from 'recharts';
import { useAnalytics } from '../hooks/useAnalytics';
import styles from './Page.module.css';
import { SkeletonChart, SkeletonCard } from '../components/Skeleton';

// ─────────────────────────────────────────────────────────────────────────────
// Konstanta & Konfigurasi
// ─────────────────────────────────────────────────────────────────────────────

const CHART_COLORS = ['#7C3AED', '#2563EB', '#059669', '#D97706', '#DC2626', '#0284C7'];
const STATUS_COLORS: Record<string, string> = {
  'Selesai':        '#059669',
  'Dibatalkan':     '#DC2626',
  'Sedang Berjalan':'#2563EB',
  'Menunggu':       '#D97706',
};

// ─────────────────────────────────────────────────────────────────────────────
// KPI Change Card Modern
// ─────────────────────────────────────────────────────────────────────────────

function KpiChangeCard({ metric, current, previous }: { metric: string; current: number; previous: number }) {
  const change = previous > 0
    ? ((current - previous) / previous * 100).toFixed(1)
    : null;
  const isPositive = change !== null && parseFloat(change) >= 0;

  // Warna per metrik — tanpa gradient, hanya warna solid untuk border kiri
  const colorMap: Record<string, string> = {
    'Consultations': '#7C3AED',
    'New Users':     '#059669',
    'Prescriptions': '#D97706',
    'Referrals':     '#0284C7',
  };
  const color = colorMap[metric] ?? '#7C3AED';

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderLeft: `3px solid ${color}`,
      borderRadius: 'var(--radius-lg)',
      padding: '16px 18px',
    }}>
      <div style={{ fontSize: 10, color: 'var(--color-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>
        {metric}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.4px', lineHeight: 1 }}>
        {current.toLocaleString('id-ID')}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
        {change !== null ? (
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: isPositive ? 'var(--color-success)' : 'var(--color-danger)',
            background: isPositive ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
            border: `1px solid ${isPositive ? 'var(--color-success-border)' : 'var(--color-danger-border)'}`,
            padding: '2px 8px', borderRadius: 999,
          }}>
            {isPositive ? '↑' : '↓'} {Math.abs(parseFloat(change))}%
          </span>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>—</span>
        )}
        <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
          vs bulan lalu ({previous.toLocaleString('id-ID')})
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Toggle tipe chart
// ─────────────────────────────────────────────────────────────────────────────

function ChartToggle({ value, onChange }: { value: 'bar' | 'line' | 'area'; onChange: (v: 'bar' | 'line' | 'area') => void }) {
  const options: { value: 'bar' | 'line' | 'area'; label: string; icon: string }[] = [
    { value: 'bar',  label: 'Bar',  icon: '▐' },
    { value: 'line', label: 'Line', icon: '∿' },
    { value: 'area', label: 'Area', icon: '◣' },
  ];
  return (
    <div style={{ display: 'flex', gap: 2, background: 'var(--color-surface-2)', borderRadius: 8, padding: 3, border: '1px solid var(--color-border)' }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: '4px 10px', fontSize: 11, border: 'none', borderRadius: 6, cursor: 'pointer',
            background: value === opt.value ? 'var(--color-surface)' : 'transparent',
            color: value === opt.value ? 'var(--color-text)' : 'var(--color-muted)',
            fontWeight: value === opt.value ? 600 : 400,
            boxShadow: value === opt.value ? 'var(--shadow-sm)' : 'none',
            transition: 'all 0.15s',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip Kustom
// ─────────────────────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ color: string; name: string; value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 10, padding: '10px 14px', boxShadow: 'var(--shadow-lg)', fontSize: 12,
    }}>
      {label && <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--color-muted)', fontSize: 11 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
          <span style={{ color: 'var(--color-muted)' }}>{p.name}:</span>
          <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{p.value.toLocaleString('id-ID')}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart Card Wrapper
// ─────────────────────────────────────────────────────────────────────────────

function ChartCard({
  title, subtitle, badge, controls, children,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  controls?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--color-border)', padding: 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--color-text)', letterSpacing: '-0.2px' }}>
            {title}
          </h2>
          {subtitle && (
            <p style={{ fontSize: 12, color: 'var(--color-muted)', margin: '3px 0 0' }}>{subtitle}</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {badge && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '3px 8px',
              background: 'var(--color-warning-bg)', color: 'var(--color-warning)',
              border: '1px solid var(--color-warning-border)', borderRadius: 999,
              letterSpacing: '0.3px',
            }}>
              {badge}
            </span>
          )}
          {controls}
        </div>
      </div>
      {children}
    </div>
  );
}

function UnavailableState({ message }: { message: string }) {
  return (
    <div className={styles.emptyState} style={{ padding: '30px 0' }}>
      <div className={styles.emptyStateTitle}>Data belum tersedia</div>
      <div className={styles.emptyStateDesc}>{message}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AnalyticsPage Utama
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Export CSV helper
// ─────────────────────────────────────────────────────────────────────────────

function exportAnalyticsCSV(data: ReturnType<typeof useAnalytics>['data']) {
  if (!data) return;
  const rows: string[][] = [
    ['Kategori', 'Label', 'Nilai'],
    ...data.kpis.map((k) => ['KPI', k.metric, String(k.current)]),
    ['', '', ''],
    ['Konsultasi per Hari', 'Hari', 'Jumlah'],
    ...data.consultationsByDay.map((d) => ['Konsultasi', d.day, String(d.count)]),
    ['', '', ''],
    ['Distribusi Peran', 'Peran', 'Jumlah'],
    ...data.usersByRole.map((r) => ['Role', r.name, String(r.value)]),
  ];
  if (data.consultationStatus.length > 0) {
    rows.push(
      ['', '', ''],
      ['Status Konsultasi', 'Status', 'Jumlah'],
      ...data.consultationStatus.map((entry) => ['Status', entry.name, String(entry.value)]),
    );
  }
  if (data.userGrowth.length > 0) {
    rows.push(
      ['', '', ''],
      ['Pertumbuhan Pengguna', 'Bulan', 'Total'],
      ...data.userGrowth.map((g) => ['Pertumbuhan', g.label, String(g.total)]),
    );
  }
  if (data.topDoctors.length > 0) {
    rows.push(
      ['', '', ''],
      ['Top Dokter', 'Nama', 'Konsultasi'],
      ...data.topDoctors.map((d) => ['Dokter', d.name, String(d.consultations)]),
    );
  }
  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `analitik-healthsync-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// AnalyticsPage Utama
// ─────────────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { data, loading, error } = useAnalytics();
  const hasUnavailableData = Boolean(
    data?.consultationStatusUnavailableReason
    || data?.userGrowthUnavailableReason
    || data?.topDoctorsUnavailableReason,
  );

  const [consultChartType, setConsultChartType] = useState<'bar' | 'line' | 'area'>('area');
  const [growthChartType,  setGrowthChartType]  = useState<'line' | 'bar' | 'area'>('area');

  const handleExport = useCallback(() => exportAnalyticsCSV(data), [data]);

  if (error && !data) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Analitik & Laporan</h1>
        <div className={styles.errorState}>
          <span className={styles.errorStateIcon}>⚠️</span>
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--color-text)', margin: 0, letterSpacing: '-0.3px' }}>
            Analitik & Laporan
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 4, margin: '4px 0 0' }}>
            Data performa sistem HealthSync berdasarkan endpoint yang tersedia
          </p>
        </div>
        {/* Kanan: badge status + tombol export CSV */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 11,
            color: hasUnavailableData ? 'var(--color-warning)' : 'var(--color-success)',
            fontWeight: 600,
            background: hasUnavailableData ? 'var(--color-warning-bg)' : 'var(--color-success-bg)',
            border: `1px solid ${hasUnavailableData ? 'var(--color-warning-border)' : 'var(--color-success-border)'}`,
            borderRadius: 999, padding: '4px 12px',
          }}>
            <span style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: hasUnavailableData ? 'var(--color-warning)' : 'var(--color-success)',
              display: 'inline-block',
            }} />
            {hasUnavailableData ? 'Sebagian data belum tersedia' : 'Data real-time'}
          </div>
          <button
            onClick={handleExport}
            disabled={loading || !data}
            className={`${styles.btn} ${styles.btnSecondary}`}
            style={{ fontSize: 12, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            ⬇ Export CSV
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          (data?.kpis ?? []).map((kpi) => (
            <KpiChangeCard
              key={kpi.metric}
              metric={kpi.metric}
              current={kpi.current}
              previous={kpi.previous}
            />
          ))
        )}
      </div>

      {/* ── Charts Row 1: Konsultasi + Status ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Konsultasi per hari */}
        <ChartCard
          title="Konsultasi Minggu Ini"
          subtitle="Volume konsultasi 7 hari terakhir"
          controls={<ChartToggle value={consultChartType} onChange={setConsultChartType} />}
        >
          {loading ? <SkeletonChart height={240} /> : (
            <ResponsiveContainer width="100%" height={240}>
              {consultChartType === 'bar' ? (
                <BarChart data={data?.consultationsByDay ?? []} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Konsultasi" fill="#7C3AED" radius={[6, 6, 0, 0]} />
                </BarChart>
              ) : consultChartType === 'line' ? (
                <LineChart data={data?.consultationsByDay ?? []} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone" dataKey="count" name="Konsultasi"
                    stroke="#7C3AED" strokeWidth={2.5}
                    dot={{ r: 4, fill: '#7C3AED', strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              ) : (
                <AreaChart data={data?.consultationsByDay ?? []} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="acGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#7C3AED" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#7C3AED" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone" dataKey="count" name="Konsultasi"
                    stroke="#7C3AED" fill="url(#acGrad)" strokeWidth={2.5}
                    dot={{ r: 4, fill: '#7C3AED', strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 6 }}
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Status Konsultasi — Donut Chart */}
        <ChartCard
          title="Status Konsultasi"
          subtitle="Komposisi berdasarkan status"
          badge={data?.consultationStatusUnavailableReason ? 'Belum tersedia' : undefined}
        >
          {loading ? <SkeletonChart height={240} /> : (data?.consultationStatus ?? []).length === 0 ? (
            <UnavailableState message={data?.consultationStatusUnavailableReason ?? 'Data status konsultasi belum tersedia.'} />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={data?.consultationStatus ?? []}
                  cx="50%" cy="45%"
                  innerRadius={60} outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ percent }: { percent: number }) => `${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {(data?.consultationStatus ?? []).map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? '#9E9E9E'} />
                  ))}
                </Pie>
                <Legend
                  iconSize={8} iconType="circle"
                  wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
                />
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* ── Charts Row 2: Pertumbuhan Pengguna + Distribusi Role ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Pertumbuhan pengguna */}
        <ChartCard
          title="Pertumbuhan Pengguna"
          subtitle="Tren pertumbuhan total, pasien, dan dokter"
          badge={data?.userGrowthUnavailableReason ? 'Belum tersedia' : undefined}
          controls={
            <ChartToggle
              value={growthChartType}
              onChange={(v) => setGrowthChartType(v as 'line' | 'bar' | 'area')}
            />
          }
        >
          {loading ? <SkeletonChart height={240} /> : (data?.userGrowth ?? []).length === 0 ? (
            <UnavailableState message={data?.userGrowthUnavailableReason ?? 'Data historis belum tersedia.'} />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              {growthChartType === 'area' ? (
                <AreaChart data={data?.userGrowth ?? []} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#7C3AED" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#7C3AED" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="patientGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#2563EB" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="total"    name="Total"  stroke="#7C3AED" fill="url(#totalGrad)"   strokeWidth={2.5} />
                  <Area type="monotone" dataKey="patients" name="Pasien" stroke="#2563EB" fill="url(#patientGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="doctors"  name="Dokter" stroke="#059669" fill="none"              strokeWidth={2} strokeDasharray="4 2" />
                </AreaChart>
              ) : growthChartType === 'line' ? (
                <LineChart data={data?.userGrowth ?? []} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="total"    name="Total"  stroke="#7C3AED" strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="patients" name="Pasien" stroke="#2563EB" strokeWidth={2}   dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="doctors"  name="Dokter" stroke="#059669" strokeWidth={2}   dot={{ r: 3 }} />
                </LineChart>
              ) : (
                <BarChart data={data?.userGrowth ?? []} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="patients" name="Pasien" fill="#2563EB" radius={[4, 4, 0, 0]} stackId="a" />
                  <Bar dataKey="doctors"  name="Dokter" fill="#059669" radius={[0, 0, 0, 0]} stackId="a" />
                </BarChart>
              )}
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Distribusi pengguna per role — Donut Chart */}
        <ChartCard
          title="Distribusi Peran Pengguna"
          subtitle="Proporsi peran dalam sistem"
        >
          {loading ? <SkeletonChart height={240} /> : (data?.usersByRole ?? []).length === 0 ? (
            <div className={styles.emptyState} style={{ padding: '30px 0' }}>
              Tidak ada data.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={data?.usersByRole ?? []}
                  cx="50%" cy="45%"
                  innerRadius={60} outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ percent }: { percent: number }) => `${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {(data?.usersByRole ?? []).map((_, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* ── Top 5 Dokter — Horizontal Bar ── */}
      <ChartCard
        title="Top 5 Dokter berdasarkan Konsultasi"
        subtitle="Ranking dokter berdasarkan jumlah konsultasi ditangani"
        badge={data?.topDoctorsUnavailableReason ? 'Belum tersedia' : undefined}
      >
        {loading ? <SkeletonChart height={200} /> : (data?.topDoctors ?? []).length === 0 ? (
          <UnavailableState message={data?.topDoctorsUnavailableReason ?? 'Data ranking dokter belum tersedia.'} />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              layout="vertical"
              data={data?.topDoctors ?? []}
              margin={{ top: 0, right: 30, bottom: 0, left: 110 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }} width={105} axisLine={false} tickLine={false} />
              <Tooltip
                content={<CustomTooltip />}
                formatter={(v: number) => [`${v} konsultasi`, 'Jumlah']}
              />
              <Bar dataKey="consultations" radius={[0, 8, 8, 0]}>
                {(data?.topDoctors ?? []).map((_, index) => (
                  <Cell key={`bar-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* ── Charts Row 4: Distribusi Status Konsultasi + Pertumbuhan Pengguna per Bulan ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 20 }}>

        {/* Tren Konsultasi berdasarkan status — Stacked Bar */}
        <ChartCard
          title="Komposisi Status Konsultasi"
          subtitle="Proporsi setiap status terhadap total konsultasi"
          badge={data?.consultationStatusUnavailableReason ? 'Belum tersedia' : undefined}
        >
          {loading ? <SkeletonChart height={220} /> : (data?.consultationStatus ?? []).length === 0 ? (
            <UnavailableState message={data?.consultationStatusUnavailableReason ?? 'Data status konsultasi belum tersedia.'} />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={[{
                  name: 'Status',
                  Selesai:          data?.consultationStatus?.find(c => c.name === 'Selesai')?.value ?? 0,
                  'Sedang Berjalan': data?.consultationStatus?.find(c => c.name === 'Sedang Berjalan')?.value ?? 0,
                  Menunggu:          data?.consultationStatus?.find(c => c.name === 'Menunggu')?.value ?? 0,
                  Dibatalkan:        data?.consultationStatus?.find(c => c.name === 'Dibatalkan')?.value ?? 0,
                }]}
                layout="vertical"
                margin={{ top: 0, right: 30, bottom: 0, left: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" hide />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Selesai"          fill="#059669" radius={[0, 0, 0, 0]} stackId="a" />
                <Bar dataKey="Sedang Berjalan"  fill="#2563EB" radius={[0, 0, 0, 0]} stackId="a" />
                <Bar dataKey="Menunggu"         fill="#D97706" radius={[0, 0, 0, 0]} stackId="a" />
                <Bar dataKey="Dibatalkan"       fill="#DC2626" radius={[0, 4, 4, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Tren Pertumbuhan Pengguna Bulanan — Line ringkas */}
        <ChartCard
          title="Tren Pertumbuhan Pengguna Bulanan"
          subtitle="Total pengguna baru per bulan (9 bulan terakhir)"
          badge={data?.userGrowthUnavailableReason ? 'Belum tersedia' : undefined}
        >
          {loading ? <SkeletonChart height={220} /> : (data?.userGrowth ?? []).length === 0 ? (
            <UnavailableState message={data?.userGrowthUnavailableReason ?? 'Data historis belum tersedia.'} />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data?.userGrowth ?? []} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="totalGradR4" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#059669" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone" dataKey="total" name="Total Pengguna"
                  stroke="#059669" fill="url(#totalGradR4)" strokeWidth={2.5}
                  dot={{ r: 3, fill: '#059669' }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
