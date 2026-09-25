import { useState, useEffect, useCallback } from 'react';
import {
  PieChart, Pie, Cell,
  BarChart, Bar,
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { consultationClient, ambulanceClient, alertClient, referralClient } from '../api/client';
import styles from './Page.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Tipe data
// ─────────────────────────────────────────────────────────────────────────────

interface KpiShift {
  label: string;
  value: number;
  icon: string;
  color: string;
  keterangan: string;
}

interface PieItem { label: string; value: number; color: string }

// ─────────────────────────────────────────────────────────────────────────────
// Hook: ambil data agregat dari semua service
// ─────────────────────────────────────────────────────────────────────────────

// Periode trend yang bisa dipilih user
type PeriodeDays = 7 | 30;

interface ReportData {
  kpiShift: KpiShift[];
  konsultasiByStatus: PieItem[];
  ambulanceByStatus: PieItem[];
  alertBySeverity: PieItem[];
  referralByUrgency: PieItem[];
  /** Data trend sesuai periode yang dipilih */
  konsultasiTrend: { dates: string[]; values: number[] };
  alertTrend: { dates: string[]; values: number[] };
  loading: boolean;
  error: string | null;
  lastFetch: Date | null;
}

function buildDateLabels(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
  });
}

function countByDate<T extends { created_at: string }>(items: T[], n: number): number[] {
  const counts = Array.from({ length: n }, () => 0);
  const now = new Date();
  items.forEach((item) => {
    const dt = new Date(item.created_at);
    const diffDays = Math.floor((now.getTime() - dt.getTime()) / 86_400_000);
    const idx = n - 1 - diffDays;
    if (idx >= 0 && idx < n) counts[idx]++;
  });
  return counts;
}

function useReportData(periode: PeriodeDays): ReportData {
  const [data, setData] = useState<ReportData>({
    kpiShift: [],
    konsultasiByStatus: [],
    ambulanceByStatus: [],
    alertBySeverity: [],
    referralByUrgency: [],
    konsultasiTrend: { dates: [], values: [] },
    alertTrend: { dates: [], values: [] },
    loading: true,
    error: null,
    lastFetch: null,
  });

  const fetch = useCallback(async () => {
    setData((prev) => ({ ...prev, loading: true, error: null }));
    try {
      // Ambil semua data secara paralel
      const [konsultasiRes, ambulanceRes, alertRes, referralRes] = await Promise.allSettled([
        consultationClient.get('/v1/consultations?limit=200'),
        ambulanceClient.get('/v1/ambulances?limit=100'),
        alertClient.get('/v1/alerts/active?limit=200'),
        referralClient.get('/v1/referrals?limit=200'),
      ]);

      // ── Konsultasi ──
      const consultations: Array<{ status: string; created_at: string }> =
        konsultasiRes.status === 'fulfilled'
          ? (konsultasiRes.value.data as { data: Array<{ status: string; created_at: string }> }).data ?? []
          : [];

      // ── Ambulans ──
      const ambulances: Array<{ status: string }> =
        ambulanceRes.status === 'fulfilled'
          ? (ambulanceRes.value.data as { data: Array<{ status: string }> }).data ?? []
          : [];

      // ── Alert ──
      const alerts: Array<{ level: string; created_at: string }> =
        alertRes.status === 'fulfilled'
          ? (alertRes.value.data as { data: Array<{ level: string; created_at: string }> }).data ?? []
          : [];

      // ── Referral ──
      const referrals: Array<{ urgency_level: string; status: string }> =
        referralRes.status === 'fulfilled'
          ? (referralRes.value.data as { data: Array<{ urgency_level: string; status: string }> }).data ?? []
          : [];

      // ── KPI Shift ──
      const pendingKonsultasi = consultations.filter((c) => c.status === 'PENDING').length;
      const activeAmbulance   = ambulances.filter((a) => ['DISPATCHED', 'EN_ROUTE', 'AT_SCENE', 'TRANSPORTING'].includes(a.status)).length;
      const criticalAlerts    = alerts.filter((a) => a.level === 'LEVEL_3' || a.level === 'LEVEL_2').length;
      const pendingReferrals  = referrals.filter((r) => r.status === 'SENT').length;

      const kpiShift: KpiShift[] = [
        { label: 'Konsultasi Aktif',  value: pendingKonsultasi, icon: '🩺', color: 'var(--color-info)',    keterangan: 'Status PENDING saat ini' },
        { label: 'Ambulans Bertugas', value: activeAmbulance,   icon: '🚑', color: 'var(--color-warning)', keterangan: 'Dispatched / En Route / At Scene' },
        { label: 'Alert Kritis',      value: criticalAlerts,    icon: '⚠️', color: 'var(--color-danger)',  keterangan: 'Level 2 atau Level 3' },
        { label: 'Rujukan Menunggu',  value: pendingReferrals,  icon: '📋', color: 'var(--color-primary)', keterangan: 'Belum direspon' },
      ];

      // ── Distribusi status konsultasi ──
      const konsStatCount: Record<string, number> = {};
      consultations.forEach((c) => { konsStatCount[c.status] = (konsStatCount[c.status] ?? 0) + 1; });
      const KONS_COLORS: Record<string, string> = {
        PENDING: '#f59e0b', ACCEPTED: '#6366f1', IN_PROGRESS: '#3b82d4',
        COMPLETED: '#22c55e', CANCELLED: '#ef4444', EXPIRED: '#6b7280',
      };
      const konsultasiByStatus: PieItem[] = Object.entries(konsStatCount).map(([k, v]) => ({
        label: { PENDING: 'Menunggu', ACCEPTED: 'Diterima', IN_PROGRESS: 'Berlangsung', COMPLETED: 'Selesai', CANCELLED: 'Dibatalkan', EXPIRED: 'Kedaluwarsa' }[k] ?? k,
        value: v,
        color: KONS_COLORS[k] ?? '#9ca3af',
      }));

      // ── Distribusi status ambulans ──
      const ambStatCount: Record<string, number> = {};
      ambulances.forEach((a) => { ambStatCount[a.status] = (ambStatCount[a.status] ?? 0) + 1; });
      const AMB_COLORS: Record<string, string> = {
        AVAILABLE: '#22c55e', DISPATCHED: '#f59e0b', EN_ROUTE: '#f97316',
        AT_SCENE: '#ef4444', TRANSPORTING: '#3b82d4', RETURNING: '#7c5cd8', OFFLINE: '#9ca3af',
      };
      const ambulanceByStatus: PieItem[] = Object.entries(ambStatCount).map(([k, v]) => ({
        label: { AVAILABLE: 'Siap', DISPATCHED: 'Dikirim', EN_ROUTE: 'Dalam Perjalanan', AT_SCENE: 'Di Lokasi', TRANSPORTING: 'Mengangkut', RETURNING: 'Kembali', OFFLINE: 'Offline' }[k] ?? k,
        value: v,
        color: AMB_COLORS[k] ?? '#9ca3af',
      }));

      // ── Distribusi severity alert ──
      const alertSevCount: Record<string, number> = {};
      alerts.forEach((a) => { alertSevCount[a.level] = (alertSevCount[a.level] ?? 0) + 1; });
      const ALERT_COLORS: Record<string, string> = { LEVEL_3: '#ef4444', LEVEL_2: '#f97316', LEVEL_1: '#f59e0b' };
      const alertBySeverity: PieItem[] = Object.entries(alertSevCount).map(([k, v]) => ({
        label: { LEVEL_3: 'Level 3 — Kritis', LEVEL_2: 'Level 2 — Mendesak', LEVEL_1: 'Level 1 — Peringatan' }[k] ?? k,
        value: v,
        color: ALERT_COLORS[k] ?? '#9ca3af',
      }));

      // ── Distribusi urgensi rujukan ──
      const refUrgCount: Record<string, number> = {};
      referrals.forEach((r) => { refUrgCount[r.urgency_level] = (refUrgCount[r.urgency_level] ?? 0) + 1; });
      const REF_COLORS: Record<string, string> = { NORMAL: '#22c55e', URGENT: '#f59e0b', CRITICAL: '#f97316', EMERGENCY: '#ef4444' };
      const referralByUrgency: PieItem[] = Object.entries(refUrgCount).map(([k, v]) => ({
        label: { NORMAL: 'Normal', URGENT: 'Mendesak', CRITICAL: 'Kritis', EMERGENCY: 'Darurat' }[k] ?? k,
        value: v,
        color: REF_COLORS[k] ?? '#9ca3af',
      }));

      // ── Trend N hari (berdasarkan created_at jika tersedia) ──
      const DAYS = periode;
      const dateLabels = buildDateLabels(DAYS);
      const konsultasiValues = countByDate(
        consultations.filter((c) => c.created_at) as Array<{ created_at: string }>,
        DAYS,
      );
      const alertValues = countByDate(
        alerts.filter((a) => a.created_at) as Array<{ created_at: string }>,
        DAYS,
      );

      setData({
        kpiShift,
        konsultasiByStatus,
        ambulanceByStatus,
        alertBySeverity,
        referralByUrgency,
        konsultasiTrend: { dates: dateLabels, values: konsultasiValues },
        alertTrend: { dates: dateLabels, values: alertValues },
        loading: false,
        error: null,
        lastFetch: new Date(),
      });
    } catch (err: unknown) {
      const e = err as { message?: string };
      setData((prev) => ({ ...prev, loading: false, error: e.message ?? 'Gagal memuat data laporan' }));
    }
  }, []);

  useEffect(() => {
    void fetch();
    const iv = setInterval(() => void fetch(), 30000);
    return () => clearInterval(iv);
  }, [fetch, periode]);

  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fungsi export CSV
// ─────────────────────────────────────────────────────────────────────────────

function exportCSV(report: ReportData) {
  // Buat baris CSV dari KPI shift dan semua distribusi data
  const rows: string[][] = [
    ['Kategori', 'Label', 'Nilai'],
    ...report.kpiShift.map(k => ['KPI Shift', k.label, String(k.value)]),
    ['', '', ''],
    ['Status', 'Label', 'Jumlah'],
    ...report.konsultasiByStatus.map(d => ['Konsultasi', d.label, String(d.value)]),
    ...report.ambulanceByStatus.map(d => ['Ambulans', d.label, String(d.value)]),
    ...report.alertBySeverity.map(d => ['Alert', d.label, String(d.value)]),
    ...report.referralByUrgency.map(d => ['Rujukan', d.label, String(d.value)]),
    ['', '', ''],
    ['Tanggal', 'Konsultasi Baru', 'Alert Aktif'],
    ...report.konsultasiTrend.dates.map((d, i) => [
      d,
      String(report.konsultasiTrend.values[i] ?? 0),
      String(report.alertTrend.values[i] ?? 0),
    ]),
  ];
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `laporan-healthsync-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// ReportsPage utama
// ─────────────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  // ── Toggle periode trend ──
  const [periode, setPeriode] = useState<PeriodeDays>(7);
  const report = useReportData(periode);

  const waktuUpdate = report.lastFetch
    ? report.lastFetch.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  // Konversi PieItem ke format Recharts (label → name)
  const konsultasiPieData = (
    report.konsultasiByStatus.length > 0
      ? report.konsultasiByStatus
      : [{ label: 'Tidak ada data', value: 1, color: '#e5e7eb' }]
  ).map(d => ({ ...d, name: d.label }));

  const ambulancePieData = (
    report.ambulanceByStatus.length > 0
      ? report.ambulanceByStatus
      : [{ label: 'Tidak ada data', value: 1, color: '#e5e7eb' }]
  ).map(d => ({ ...d, name: d.label }));

  const alertBarData = (
    report.alertBySeverity.length > 0
      ? report.alertBySeverity
      : [{ label: 'Tidak ada data', value: 0, color: '#e5e7eb' }]
  ).map(d => ({ ...d, name: d.label }));

  const referralBarData = (
    report.referralByUrgency.length > 0
      ? report.referralByUrgency
      : [{ label: 'Tidak ada data', value: 0, color: '#e5e7eb' }]
  ).map(d => ({ ...d, name: d.label }));

  // Buat data gabungan untuk trend sesuai periode
  const trendData = report.konsultasiTrend.dates.map((d, i) => ({
    date: d,
    Konsultasi: report.konsultasiTrend.values[i] ?? 0,
    Alert: report.alertTrend.values[i] ?? 0,
  }));

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 className={styles.title} style={{ marginBottom: 0 }}>Laporan &amp; Analitik</h1>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 4 }}>
            Ringkasan KPI shift aktif · Data diperbarui otomatis setiap 30 detik
            {report.lastFetch && <span> · Terakhir: <strong>{waktuUpdate}</strong></span>}
          </p>
        </div>
        {/* Tombol Export CSV */}
        <button
          onClick={() => exportCSV(report)}
          disabled={report.loading}
          className={`${styles.btn} ${styles.btnPrimary}`}
          style={{ fontSize: 13 }}
        >
          ⬇ Export CSV
        </button>
      </div>

      {/* ── Error state ── */}
      {report.error && (
        <div style={{
          background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)',
          borderRadius: 6, padding: '12px 16px', marginBottom: 20,
          fontSize: 13, color: 'var(--color-danger)',
        }}>
          ⚠️ {report.error} — Sebagian data mungkin tidak tersedia. Mencoba ulang secara otomatis.
        </div>
      )}

      {/* ── KPI Shift ── */}
      <div className={styles.statGrid} style={{ marginBottom: 24 }}>
        {report.loading
          ? Array.from({ length: 4 }, (_, i) => (
              <div key={i} className={styles.statCard}>
                <div style={{
                  height: 40, width: '100%', borderRadius: 6,
                  background: 'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 1.4s ease-in-out infinite',
                }} />
              </div>
            ))
          : report.kpiShift.map((kpi) => (
              <div key={kpi.label} className={styles.statCard} style={{ borderLeft: `3px solid ${kpi.color}` }}>
                <div style={{ fontSize: 24 }}>{kpi.icon}</div>
                <div>
                  <div className={styles.statValue} style={{ color: kpi.color }}>{kpi.value}</div>
                  <div className={styles.statLabel}>{kpi.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-disabled)', marginTop: 2 }}>{kpi.keterangan}</div>
                </div>
              </div>
            ))}
      </div>

      {/* ── Baris 1: Distribusi Konsultasi + Distribusi Ambulans ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 20 }}>
        {/* Donut — Status Konsultasi */}
        <div className={styles.card} style={{ marginBottom: 0 }}>
          {report.loading ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-muted)', fontSize: 13 }}>
              Memuat...
            </div>
          ) : (
            <>
              <h2 className={styles.cardTitle}>Distribusi Status Konsultasi</h2>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={konsultasiPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {konsultasiPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
                    formatter={(v: number, name: string) => [v, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </>
          )}
        </div>

        {/* Donut — Status Ambulans */}
        <div className={styles.card} style={{ marginBottom: 0 }}>
          {report.loading ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-muted)', fontSize: 13 }}>
              Memuat...
            </div>
          ) : (
            <>
              <h2 className={styles.cardTitle}>Distribusi Status Armada Ambulans</h2>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={ambulancePieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {ambulancePieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
                    formatter={(v: number, name: string) => [v, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      </div>

      {/* ── Baris 2: Distribusi Alert + Distribusi Rujukan ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 20 }}>
        {/* Bar — Alert Berdasarkan Severity */}
        <div className={styles.card} style={{ marginBottom: 0 }}>
          {report.loading ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-muted)', fontSize: 13 }}>Memuat...</div>
          ) : (
            <>
              <h2 className={styles.cardTitle}>Alert Berdasarkan Tingkat Keparahan</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={alertBarData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)' }} />
                  <Bar dataKey="value" name="Jumlah" radius={[4, 4, 0, 0]} maxBarSize={40}>
                    {alertBarData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </div>

        {/* Bar — Rujukan Berdasarkan Urgensi */}
        <div className={styles.card} style={{ marginBottom: 0 }}>
          {report.loading ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-muted)', fontSize: 13 }}>Memuat...</div>
          ) : (
            <>
              <h2 className={styles.cardTitle}>Rujukan Berdasarkan Tingkat Urgensi</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={referralBarData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)' }} />
                  <Bar dataKey="value" name="Jumlah" radius={[4, 4, 0, 0]} maxBarSize={40}>
                    {referralBarData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      </div>

      {/* ── Baris 3: Trend Periode ── */}
      <div className={styles.card}>
        {/* Header row: judul + toggle periode */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 className={styles.cardTitle} style={{ marginBottom: 0 }}>
            Tren {periode} Hari Terakhir — Konsultasi vs Alert
          </h2>
          {/* Toggle 7 / 30 hari */}
          <div style={{
            display: 'inline-flex', borderRadius: 6, overflow: 'hidden',
            border: '1px solid var(--color-border)',
          }}>
            {([7, 30] as PeriodeDays[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriode(p)}
                style={{
                  padding: '4px 14px',
                  fontSize: 12,
                  fontWeight: periode === p ? 600 : 400,
                  border: 'none',
                  cursor: 'pointer',
                  background: periode === p ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: periode === p ? '#fff' : 'var(--color-muted)',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {p} Hari
              </button>
            ))}
          </div>
        </div>

        {report.loading ? (
          <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-muted)', fontSize: 13 }}>Memuat...</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={trendData} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="gradKonsultasi" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82d4" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#3b82d4" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradAlert" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: periode === 30 ? 9 : 10, fill: 'var(--color-muted)' }}
                axisLine={false}
                tickLine={false}
                interval={periode === 30 ? 4 : 0}
              />
              <YAxis tick={{ fontSize: 10, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
                labelStyle={{ fontWeight: 600, marginBottom: 4 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area
                type="monotone"
                dataKey="Konsultasi"
                stroke="#3b82d4"
                strokeWidth={2.5}
                fill="url(#gradKonsultasi)"
                dot={periode === 7 ? { r: 3 } : false}
                activeDot={{ r: 5 }}
              />
              <Area
                type="monotone"
                dataKey="Alert"
                stroke="#ef4444"
                strokeWidth={2.5}
                fill="url(#gradAlert)"
                dot={periode === 7 ? { r: 3 } : false}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
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
