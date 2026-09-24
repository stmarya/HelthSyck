import { useState, useEffect, useCallback } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { prescriptionClient, pharmacyClient } from '../api/client';
import ChartCard from '../components/ChartCard';
import MiniKpiCard from '../components/MiniKpiCard';
import DurasiAktif from '../components/DurasiAktif';
import LastUpdated from '../components/LastUpdated';
import styles from './Page.module.css';

// ─── Tipe data ─────────────────────────────────────────────────────────────

interface Prescription {
  id: string;
  patient_id: string;
  doctor_id: string;
  status: 'ISSUED' | 'SENT_TO_PHARMACY' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'DELIVERING' | 'DELIVERED' | 'CANCELLED';
  created_at: string;
  notes: string | null;
}

interface Pharmacy {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  operating_hours: string | null;
}

interface PharmaciesMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Konfigurasi badge status resep ───────────────────────────────────────

const RESEP_STATUS: Record<string, { label: string; cls: string; color: string }> = {
  ISSUED:    { label: 'Diterbitkan', cls: styles.badgeWarning,  color: '#f59e0b' },
  SENT_TO_PHARMACY: { label: 'Ke Apotek', cls: styles.badgeWarning, color: '#f59e0b' },
  CONFIRMED: { label: 'Dikonfirmasi', cls: styles.badgeWarning, color: '#d97706' },
  PREPARING: { label: 'Disiapkan',   cls: styles.badgeWarning,  color: '#ea580c' },
  READY:     { label: 'Siap',        cls: styles.badgeOk,       color: '#16a34a' },
  DELIVERING:{ label: 'Sedang Diantar', cls: styles.badgeOk,    color: '#2563eb' },
  DELIVERED: { label: 'Diterima',    cls: styles.badgeOk,       color: '#10b981' },
  CANCELLED: { label: 'Dibatalkan',  cls: styles.badgeCritical, color: '#ef4444' },
  EXPIRED:   { label: 'Kedaluwarsa', cls: styles.badgeCritical, color: '#dc2626' },
};

// ─── Skeleton loading ─────────────────────────────────────────────────────

function SkeletonRow({ cols }: { cols: number }) {
  const widths = [80, 120, 100, 140, 110, 100, 120];
  return (
    <tr>
      {Array.from({ length: cols }, (_, i) => (
        <td key={i} style={{ padding: '11px 14px' }}>
          <div style={{
            height: 12, width: widths[i] ?? 100, borderRadius: 6,
            background: 'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.4s ease-in-out infinite',
          }} />
        </td>
      ))}
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab Resep
// ─────────────────────────────────────────────────────────────────────────────

function TabResep() {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const LIMIT = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Tidak gunakan ?status= karena backend mengembalikan 422
      const res = await prescriptionClient.get(`/v1/prescriptions?page=${page}&limit=${LIMIT}`);
      const body = res.data as { data: Prescription[]; meta?: { total: number; totalPages: number } };
      setPrescriptions(body.data ?? []);
      setTotal(body.meta?.total ?? body.data?.length ?? 0);
      setTotalPages(body.meta?.totalPages ?? 1);
      setError(null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail ?? 'Gagal memuat data resep');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void fetchData();
    const iv = setInterval(() => void fetchData(), 15000);
    return () => clearInterval(iv);
  }, [fetchData]);

  useEffect(() => { setLastFetch(new Date()); }, [prescriptions]);

  // ── Hitung statistik dari data yang ada ─────────────────────────────────
  const statusCounts: Record<string, number> = {};
  for (const p of prescriptions) {
    statusCounts[p.status] = (statusCounts[p.status] ?? 0) + 1;
  }
  const pending   = (statusCounts['ISSUED'] ?? 0) + (statusCounts['SENT_TO_PHARMACY'] ?? 0);
  const dispensed = statusCounts['DELIVERED'] ?? 0;
  const cancelled = statusCounts['CANCELLED'] ?? 0;
  const expired   = statusCounts['EXPIRED']   ?? 0;

  // Data Donut Chart distribusi status
  const donutData = Object.entries(statusCounts)
    .map(([key, value]) => ({
      name: RESEP_STATUS[key]?.label ?? key,
      value,
      color: RESEP_STATUS[key]?.color ?? '#9ca3af',
    }))
    .filter((d) => d.value > 0);

  return (
    <div>
      {/* KPI Cards */}
      {!loading && prescriptions.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 24 }}>
          <MiniKpiCard label="Menunggu"     value={pending}   icon="⏳" color="#f59e0b" trend={pending > 0 ? 'up' : 'neutral'} />
          <MiniKpiCard label="Selesai"      value={dispensed} icon="✅" color="#10b981" />
          <MiniKpiCard label="Dibatalkan"   value={cancelled} icon="❌" color="#ef4444" />
          <MiniKpiCard label="Kedaluwarsa"  value={expired}   icon="⌛" color="#dc2626" />
          <MiniKpiCard label="Total Resep"  value={total}     icon="📋" color="var(--color-primary)" />
        </div>
      )}

      {/* Indikator waktu pembaruan terakhir */}
      <div style={{ marginBottom: 12 }}>
        <LastUpdated timestamp={lastFetch} />
      </div>

      {/* Donut Chart distribusi status resep */}
      {!loading && donutData.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <ChartCard title="Distribusi Status Resep" subtitle="Berdasarkan data halaman ini">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%" cy="50%"
                  innerRadius={60} outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {donutData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--color-border)' }}
                  formatter={(value: number) => [value, 'Resep']}
                />
                <Legend
                  iconType="circle" iconSize={9}
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(value: string) => <span style={{ color: 'var(--color-text)' }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div style={{
          background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)',
          borderRadius: 6, padding: '12px 16px', marginBottom: 16,
          fontSize: 13, color: 'var(--color-danger)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>{error}</span>
          <button onClick={() => void fetchData()} style={{ padding: '4px 10px', background: 'transparent', border: '1px solid var(--color-danger-border)', borderRadius: 4, fontSize: 12, cursor: 'pointer', color: 'var(--color-danger)' }}>
            Coba Lagi
          </button>
        </div>
      )}

      {/* Tabel resep */}
      <div className={styles.card}>
        {loading ? (
          <table className={styles.table}>
            <thead><tr><th>ID Resep</th><th>ID Pasien</th><th>ID Dokter</th><th>Catatan</th><th>Tanggal</th><th>Waktu Tunggu</th><th>Status</th></tr></thead>
            <tbody>{Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} cols={7} />)}</tbody>
          </table>
        ) : prescriptions.length === 0 ? (
          <div className={styles.emptyState}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>💊</div>
            <div style={{ fontWeight: 600 }}>Tidak ada resep ditemukan</div>
            <div style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 4 }}>
              Resep akan muncul setelah dokter menuliskan resep untuk pasien
            </div>
          </div>
        ) : (
          <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ID Resep</th>
                  <th>ID Pasien</th>
                  <th>ID Dokter</th>
                  <th>Catatan</th>
                  <th>Tanggal</th>
                  <th>Waktu Tunggu</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {prescriptions.map((p) => {
                  const cfg = RESEP_STATUS[p.status] ?? { label: p.status, cls: '', color: '#9ca3af' };
                  return (
                    <tr
                      key={p.id}
                      style={p.status === 'CANCELLED' ? { background: 'var(--color-danger-bg)' }
                        : (p.status === 'ISSUED' || p.status === 'SENT_TO_PHARMACY') ? { background: 'rgba(245,158,11,0.05)' }
                        : undefined}
                    >
                      <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--color-muted)' }}>{p.id.slice(0, 8)}…</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--color-muted)' }}>{p.patient_id.slice(0, 8)}…</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--color-muted)' }}>{p.doctor_id.slice(0, 8)}…</td>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                        {p.notes ?? <span style={{ color: 'var(--color-disabled)', fontStyle: 'italic' }}>—</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(p.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td>
                        {p.status === 'ISSUED' || p.status === 'SENT_TO_PHARMACY' ? (
                          <DurasiAktif
                            isoString={p.created_at}
                            warnAfterMinutes={30}
                            criticalAfterMinutes={60}
                            prefix="⏳ "
                          />
                        ) : (
                          <span style={{ color: 'var(--color-disabled)', fontStyle: 'italic', fontSize: 11 }}>—</span>
                        )}
                      </td>
                      <td><span className={`${styles.badge} ${cfg.cls}`}>{cfg.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className={styles.pagination}>
              <span>Total: {total} resep</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className={`${styles.btn} ${styles.btnSecondary}`} style={{ padding: '4px 10px', fontSize: 12 }}>← Prev</button>
                <span style={{ fontSize: 13, color: 'var(--color-muted)', minWidth: 80, textAlign: 'center' }}>Hal. {page} / {totalPages}</span>
                <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages} className={`${styles.btn} ${styles.btnSecondary}`} style={{ padding: '4px 10px', fontSize: 12 }}>Next →</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab Apotek
// ─────────────────────────────────────────────────────────────────────────────

function TabApotek() {
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [meta, setMeta] = useState<PharmaciesMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (search) params.set('search', search);
      const res = await pharmacyClient.get(`/v1/pharmacies?${params.toString()}`);
      const body = res.data as { data: Pharmacy[]; meta: PharmaciesMeta };
      setPharmacies(body.data ?? []);
      setMeta(body.meta ?? null);
      setError(null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail ?? 'Gagal memuat data apotek');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    void fetchData();
    const iv = setInterval(() => void fetchData(), 30000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const aktif = pharmacies.filter((p) => p.is_active).length;
  const tidakAktif = pharmacies.length - aktif;

  // Bar chart aktif vs tidak aktif
  const barData = [
    { name: 'Aktif',        value: aktif,      fill: '#10b981' },
    { name: 'Tidak Aktif',  value: tidakAktif, fill: '#ef4444' },
  ];

  return (
    <div>
      {/* KPI Cards */}
      {!loading && pharmacies.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 24 }}>
          <MiniKpiCard label="Apotek Aktif"   value={aktif}                        icon="🟢" color="#10b981" />
          <MiniKpiCard label="Tidak Aktif"    value={tidakAktif}                   icon="🔴" color="#ef4444" trend={tidakAktif > 0 ? 'down' : 'neutral'} />
          <MiniKpiCard label="Total Apotek"   value={meta?.total ?? pharmacies.length} icon="🏪" color="var(--color-primary)" />
        </div>
      )}

      {/* Bar Chart aktif vs tidak aktif */}
      {!loading && pharmacies.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <ChartCard title="Status Apotek" subtitle="Aktif vs Tidak Aktif">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={barData} margin={{ top: 8, right: 16, left: -20, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--color-border)' }}
                  formatter={(value: number) => [value, 'Apotek']}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {barData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      {/* Toolbar pencarian */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="🔍 Cari nama atau alamat apotek..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{
            padding: '8px 12px', border: '1px solid var(--color-border)',
            borderRadius: 6, fontSize: 13, width: 320, maxWidth: '100%',
            background: 'var(--color-surface)', color: 'var(--color-text)',
          }}
        />
      </div>

      {/* Error state */}
      {error && (
        <div style={{
          background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)',
          borderRadius: 6, padding: '12px 16px', marginBottom: 16,
          fontSize: 13, color: 'var(--color-danger)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>{error}</span>
          <button onClick={() => void fetchData()} style={{ padding: '4px 10px', background: 'transparent', border: '1px solid var(--color-danger-border)', borderRadius: 4, fontSize: 12, cursor: 'pointer', color: 'var(--color-danger)' }}>
            Coba Lagi
          </button>
        </div>
      )}

      {/* Tabel apotek */}
      <div className={styles.card}>
        {loading ? (
          <table className={styles.table}>
            <thead><tr><th>Nama Apotek</th><th>Alamat</th><th>Telepon</th><th>Jam Operasional</th><th>Status</th></tr></thead>
            <tbody>{Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} cols={5} />)}</tbody>
          </table>
        ) : pharmacies.length === 0 ? (
          <div className={styles.emptyState}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🏪</div>
            <div style={{ fontWeight: 600 }}>{search ? 'Tidak ada apotek yang cocok' : 'Tidak ada apotek terdaftar'}</div>
          </div>
        ) : (
          <>
            <table className={styles.table}>
              <thead>
                <tr><th>Nama Apotek</th><th>Alamat</th><th>Telepon</th><th>Jam Operasional</th><th>Status</th></tr>
              </thead>
              <tbody>
                {pharmacies.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td style={{ fontSize: 12, color: 'var(--color-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.address ?? <span style={{ fontStyle: 'italic' }}>—</span>}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{p.phone ?? '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--color-muted)' }}>{p.operating_hours ?? '—'}</td>
                    <td>
                      <span className={`${styles.badge} ${p.is_active ? styles.badgeOk : styles.badgeCritical}`}>
                        {p.is_active ? 'Aktif' : 'Tidak Aktif'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {meta && (
              <div className={styles.pagination}>
                <span>Total: {meta.total} apotek</span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className={`${styles.btn} ${styles.btnSecondary}`} style={{ padding: '4px 10px', fontSize: 12 }}>← Prev</button>
                  <span style={{ fontSize: 13, color: 'var(--color-muted)', minWidth: 80, textAlign: 'center' }}>Hal. {page} / {meta.totalPages || 1}</span>
                  <button onClick={() => setPage((p) => p + 1)} disabled={page >= meta.totalPages} className={`${styles.btn} ${styles.btnSecondary}`} style={{ padding: '4px 10px', fontSize: 12 }}>Next →</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PharmacyPage utama
// ─────────────────────────────────────────────────────────────────────────────

export default function PharmacyPage() {
  const [tab, setTab] = useState<'resep' | 'apotek'>('resep');

  return (
    <div className={styles.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 className={styles.title} style={{ marginBottom: 0 }}>Farmasi & Apotek</h1>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 4 }}>
            Antrian resep pasien dan direktori apotek terdaftar
          </p>
        </div>
      </div>

      {/* ── Tab navigasi ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--color-border)' }}>
        {([
          { key: 'resep',  label: '📋 Antrian Resep' },
          { key: 'apotek', label: '🏪 Daftar Apotek' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '8px 16px',
              fontSize: 13, fontWeight: tab === key ? 700 : 500,
              background: 'transparent', border: 'none',
              borderBottom: tab === key ? '2px solid var(--color-primary)' : '2px solid transparent',
              color: tab === key ? 'var(--color-primary)' : 'var(--color-muted)',
              cursor: 'pointer', transition: 'all 0.15s',
              marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'resep' ? <TabResep /> : <TabApotek />}

      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
