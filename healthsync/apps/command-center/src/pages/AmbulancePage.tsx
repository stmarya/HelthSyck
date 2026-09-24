import { useState, useCallback } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useAmbulances } from '../hooks/useAmbulances';
import ChartCard from '../components/ChartCard';
import ChipFilter from '../components/ChipFilter';
import DurasiAktif from '../components/DurasiAktif';
import LastUpdated from '../components/LastUpdated';
import { appendLog } from '../hooks/useActivityLog';
import styles from './Page.module.css';

// ─── Helper: konversi koordinat (string atau number) ke tampilan ──────────
function formatKoordinat(val: string | number | null, desimal = 4): string | null {
  if (val === null || val === undefined) return null;
  const n = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(n)) return null;
  return n.toFixed(desimal);
}

// ─── Konfigurasi badge status ──────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; cls: string; dot: string; color: string }> = {
  AVAILABLE:    { label: 'Siap',              cls: styles.badgeOk,       dot: 'var(--color-success)', color: '#10b981' },
  DISPATCHED:   { label: 'Dikirim',           cls: styles.badgeWarning,  dot: 'var(--color-warning)', color: '#f59e0b' },
  EN_ROUTE:     { label: 'Dalam Perjalanan',  cls: styles.badgeWarning,  dot: 'var(--color-warning)', color: '#f59e0b' },
  AT_SCENE:     { label: 'Di Lokasi',         cls: styles.badgeCritical, dot: 'var(--color-danger)',  color: '#ef4444' },
  TRANSPORTING: { label: 'Mengangkut',        cls: styles.badgePending,  dot: 'var(--color-info)',    color: '#0284c7' },
  RETURNING:    { label: 'Kembali',           cls: styles.badgePending,  dot: 'var(--color-info)',    color: '#0284c7' },
  OFFLINE:      { label: 'Offline',           cls: styles.badgeCritical, dot: '#9ca3af',              color: '#9ca3af' },
};

// ─── Skeleton loading ─────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr>
      {[120, 100, 100, 120, 140, 80, 120, 100].map((w, i) => (
        <td key={i} style={{ padding: '12px 14px' }}>
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

// ─── SVG Gauge ───────────────────────────────────────────────────────────

interface GaugeProps {
  value: number; // 0-100
  label: string;
  color: string;
}

function SvgGauge({ value, label, color }: GaugeProps) {
  const radius = 60;
  const cx = 90;
  const cy = 80;
  const startAngle = Math.PI;
  const endAngle = 0;
  const clampedValue = Math.min(100, Math.max(0, value));
  const angle = startAngle + (clampedValue / 100) * (endAngle - startAngle);

  const arcPath = (start: number, end: number, r: number) => {
    // Pastikan tidak menghasilkan NaN jika nilai sama persis (arc nol)
    const safeEnd = Math.abs(end - start) < 0.001 ? start + 0.001 : end;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(safeEnd);
    const y2 = cy + r * Math.sin(safeEnd);
    const largeArc = safeEnd - start > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
  };

  const needleX = cx + (radius - 10) * Math.cos(angle);
  const needleY = cy + (radius - 10) * Math.sin(angle);

  return (
    <svg viewBox="0 0 180 100" style={{ width: '100%', maxWidth: 220, display: 'block', margin: '0 auto' }}>
      {/* Background arc */}
      <path d={arcPath(Math.PI, 0, radius)} fill="none" stroke="#e5e7eb" strokeWidth={14} strokeLinecap="round" />
      {/* Value arc */}
      <path d={arcPath(Math.PI, angle, radius)} fill="none" stroke={color} strokeWidth={14} strokeLinecap="round" />
      {/* Needle */}
      <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={5} fill={color} />
      {/* Value text */}
      <text x={cx} y={cy - 14} textAnchor="middle" fontSize={20} fontWeight={800} fill={color}>
        {clampedValue.toFixed(0)}%
      </text>
      <text x={cx} y={cy + 16} textAnchor="middle" fontSize={10} fill="#57606a">
        {label}
      </text>
    </svg>
  );
}

// ─── Modal Dispatch ────────────────────────────────────────────────────────

interface ModalDispatchProps {
  ambulanceId: string;
  plateNumber: string;
  onDispatch: (patientId: string, destination: string) => Promise<void>;
  onTutup: () => void;
}

function ModalDispatch({ ambulanceId: _aid, plateNumber, onDispatch, onTutup }: ModalDispatchProps) {
  const [patientId, setPatientId] = useState('');
  const [destination, setDestination] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId.trim() || !destination.trim()) {
      setError('ID Pasien dan Tujuan wajib diisi.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onDispatch(patientId.trim(), destination.trim());
      onTutup();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string; message?: string } } };
      setError(e.response?.data?.detail ?? e.response?.data?.message ?? 'Gagal mengirim ambulans. Coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.55)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      animation: 'fadeInUp 0.2s ease both',
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: 28,
        width: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        border: '1px solid var(--color-border)',
      }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: 'var(--color-text)' }}>
            🚑 Kirim Ambulans
          </h2>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 4 }}>
            Ambulans: <strong style={{ fontFamily: 'monospace' }}>{plateNumber}</strong>
          </p>
        </div>

        {error && (
          <div style={{
            background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)',
            borderRadius: 6, padding: '10px 14px', marginBottom: 16,
            fontSize: 13, color: 'var(--color-danger)',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={(e) => { void handleSubmit(e); }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              ID Pasien *
            </label>
            <input
              type="text"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              placeholder="Contoh: uuid-pasien..."
              required
              style={{
                width: '100%', padding: '9px 12px', fontSize: 13,
                border: '1px solid var(--color-border)', borderRadius: 6,
                background: 'var(--color-surface)', color: 'var(--color-text)',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Tujuan / Lokasi Darurat *
            </label>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Contoh: IGD RSUD Cipto Jakarta"
              required
              style={{
                width: '100%', padding: '9px 12px', fontSize: 13,
                border: '1px solid var(--color-border)', borderRadius: 6,
                background: 'var(--color-surface)', color: 'var(--color-text)',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={onTutup}
              disabled={loading}
              style={{
                flex: 1, padding: '10px 16px',
                background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
                borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 500,
                color: 'var(--color-text)',
              }}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1, padding: '10px 16px',
                background: loading ? '#9ca3af' : 'var(--color-primary)',
                color: '#fff', border: 'none', borderRadius: 6,
                fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: 700, transition: 'background 0.2s',
              }}
            >
              {loading ? '⏳ Mengirim...' : '🚑 Kirim Ambulans'}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ─── AmbulancePage utama ──────────────────────────────────────────────────

export default function AmbulancePage() {
  const { ambulances, available, dispatched, offline, loading, error, dispatch, refetch } = useAmbulances(15000);

  const [modalAmbulance, setModalAmbulance] = useState<{ id: string; plate: string } | null>(null);
  const [dispatchSuccess, setDispatchSuccess] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [lastFetch] = useState<Date>(new Date());

  const activeCount = dispatched.length;
  const offlineCount = offline.length;

  // ── Filter ambulans berdasarkan status ────────────────────────────────
  const displayedAmbulances = filterStatus
    ? ambulances.filter((a) => a.status === filterStatus)
    : ambulances;

  // ── Opsi chip filter status ───────────────────────────────────────────
  const statusChipOptions = [
    { value: 'AVAILABLE',    label: 'Siap',       count: available.length,                                        color: '#10b981' },
    { value: 'DISPATCHED',   label: 'Dikirim',    count: ambulances.filter(a => a.status === 'DISPATCHED').length,   color: '#f59e0b' },
    { value: 'EN_ROUTE',     label: 'En Route',   count: ambulances.filter(a => a.status === 'EN_ROUTE').length,     color: '#f97316' },
    { value: 'AT_SCENE',     label: 'Di Lokasi',  count: ambulances.filter(a => a.status === 'AT_SCENE').length,     color: '#ef4444' },
    { value: 'TRANSPORTING', label: 'Mengangkut', count: ambulances.filter(a => a.status === 'TRANSPORTING').length, color: '#0284c7' },
    { value: 'OFFLINE',      label: 'Offline',    count: offlineCount,                                            color: '#9ca3af' },
  ].filter(opt => opt.count > 0);

  // ── Distribusi status untuk donut ──────────────────────────────────────
  const statusMap: Record<string, number> = {};
  for (const a of ambulances) {
    statusMap[a.status] = (statusMap[a.status] ?? 0) + 1;
  }
  const donutData = Object.entries(statusMap)
    .map(([key, value]) => ({
      name: STATUS_CONFIG[key]?.label ?? key,
      value,
      color: STATUS_CONFIG[key]?.color ?? '#9ca3af',
    }))
    .filter((d) => d.value > 0);

  // ── Gauge: % armada aktif ──────────────────────────────────────────────
  const activeStatuses = ['DISPATCHED', 'EN_ROUTE', 'AT_SCENE', 'TRANSPORTING'];
  const activeFleet = ambulances.filter((a) => activeStatuses.includes(a.status)).length;
  const utilizationPct = ambulances.length > 0 ? (activeFleet / ambulances.length) * 100 : 0;

  const handleDispatch = useCallback(
    async (patientId: string, destination: string) => {
      if (!modalAmbulance) return;
      await dispatch(modalAmbulance.id, patientId, destination);
      setDispatchSuccess(`Ambulans ${modalAmbulance.plate} berhasil dikirim ke ${destination}`);
      setTimeout(() => setDispatchSuccess(null), 5000);
      appendLog({
        level: 'success',
        actor: localStorage.getItem('cc_user_email') ?? 'sistem',
        action: 'dispatch-ambulans',
        detail: `Dispatch ambulans ${modalAmbulance.plate} ke "${destination}" (pasien: ${patientId})`,
        page: 'AmbulancePage',
      });
    },
    [dispatch, modalAmbulance],
  );

  return (
    <div className={styles.page}>
      {/* ── Modal Dispatch ── */}
      {modalAmbulance && (
        <ModalDispatch
          ambulanceId={modalAmbulance.id}
          plateNumber={modalAmbulance.plate}
          onDispatch={handleDispatch}
          onTutup={() => setModalAmbulance(null)}
        />
      )}

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 className={styles.title} style={{ marginBottom: 0 }}>Fleet Ambulans</h1>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 4 }}>
            {available.length > 0 && <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>{available.length} Siap · </span>}
            {activeCount > 0 && <span style={{ color: 'var(--color-warning)', fontWeight: 700 }}>{activeCount} Aktif · </span>}
            {offlineCount > 0 && <span style={{ color: 'var(--color-danger)', fontWeight: 700 }}>{offlineCount} Offline · </span>}
            {ambulances.length > 0 ? `${ambulances.length} Total` : 'Memuat...'}
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

      {/* ── Notifikasi sukses dispatch ── */}
      {dispatchSuccess && (
        <div style={{
          background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)',
          borderRadius: 6, padding: '12px 16px', marginBottom: 16,
          fontSize: 13, color: 'var(--color-success)', fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 8,
          animation: 'fadeInUp 0.3s ease both',
        }}>
          ✅ {dispatchSuccess}
        </div>
      )}

      {/* ── KPI Cards ── */}
      {!loading && ambulances.length > 0 && (
        <div className={styles.statGrid} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginBottom: 20 }}>
          {[
            { label: 'Siap Bertugas',   value: available.length,   color: 'var(--color-success)', icon: '🟢' },
            { label: 'Aktif Bertugas',  value: activeCount,        color: 'var(--color-warning)', icon: '🔶' },
            { label: 'Offline',         value: offlineCount,       color: 'var(--color-danger)',  icon: '🔴' },
            { label: 'Total Armada',    value: ambulances.length,  color: 'var(--color-info)',    icon: '🚑' },
          ].map((item) => (
            <div key={item.label} className={styles.statCard} style={{ borderLeft: `3px solid ${item.color}` }}>
              <div style={{ fontSize: 22 }}>{item.icon}</div>
              <div>
                <div className={styles.statValue}>{item.value}</div>
                <div className={styles.statLabel}>{item.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Charts row: Donut + Gauge ── */}
      {!loading && ambulances.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          {/* Donut distribusi status */}
          <ChartCard title="Distribusi Status Armada" subtitle="Status real-time seluruh unit ambulans">
            {donutData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {donutData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--color-border)' }}
                    formatter={(value: number) => [value, 'Unit']}
                  />
                  <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--color-muted)', fontSize: 13, paddingTop: 60 }}>
                Tidak ada data armada
              </div>
            )}
          </ChartCard>

          {/* SVG Gauge utilisasi armada */}
          <ChartCard title="Utilisasi Armada" subtitle="Persentase unit aktif (dikirim/dalam perjalanan/di lokasi/mengangkut)">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 8 }}>
              <SvgGauge
                value={utilizationPct}
                label="Armada Aktif"
                color={utilizationPct >= 80 ? '#ef4444' : utilizationPct >= 50 ? '#f59e0b' : '#10b981'}
              />
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-muted)', textAlign: 'center' }}>
                {activeFleet} dari {ambulances.length} unit sedang bertugas
              </div>
            </div>
          </ChartCard>
        </div>
      )}

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

      <div className={styles.card}>
        {/* ── Filter status cepat ── */}
        {!loading && ambulances.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <ChipFilter
              options={statusChipOptions}
              value={filterStatus}
              onChange={setFilterStatus}
              allLabel="Semua Status"
            />
          </div>
        )}

        {loading ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Plat Nomor</th>
                <th>Tipe</th>
                <th>Status</th>
                <th>Rumah Sakit</th>
                <th>Lokasi Terakhir</th>
                <th>Kecepatan</th>
                <th>Kontak Pengemudi</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>{Array.from({ length: 6 }, (_, i) => <SkeletonRow key={i} />)}</tbody>
          </table>
        ) : ambulances.length === 0 ? (
          <div className={styles.emptyState}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🚑</div>
            <div style={{ fontWeight: 600 }}>Tidak ada ambulans terdaftar</div>
            <div style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 4 }}>
              Ambulans akan muncul setelah didaftarkan ke sistem
            </div>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Plat Nomor</th>
                <th>Tipe</th>
                <th>Status</th>
                <th>Rumah Sakit</th>
                <th>Lokasi Terakhir</th>
                <th>Kecepatan</th>
                <th>Kontak Pengemudi</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {displayedAmbulances.map((a) => {
                const statusCfg = STATUS_CONFIG[a.status] ?? { label: a.status, cls: '', dot: '#9ca3af', color: '#9ca3af' };
                const bisaDispatch = a.status === 'AVAILABLE';
                return (
                  <tr
                    key={a.id}
                    style={a.status === 'AT_SCENE' ? { background: 'var(--color-danger-bg)' } : undefined}
                  >
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: statusCfg.dot, flexShrink: 0,
                          animation: a.status !== 'OFFLINE' ? 'pulseDot 2s ease-in-out infinite' : 'none',
                        }} />
                        <strong style={{ fontFamily: 'monospace', fontSize: 13 }}>{a.plate_number}</strong>
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>{a.type}</td>
                    <td>
                      <span className={`${styles.badge} ${statusCfg.cls}`}>
                        {statusCfg.label}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                      {a.hospital_name ?? <span style={{ color: 'var(--color-disabled)', fontStyle: 'italic' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                      {a.latitude != null && a.longitude != null ? (
                        <a
                          href={`https://maps.google.com/?q=${formatKoordinat(a.latitude)},${formatKoordinat(a.longitude)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontFamily: 'monospace', color: 'var(--color-primary)', textDecoration: 'none', fontSize: 11 }}
                          title="Buka di Google Maps"
                        >
                          {formatKoordinat(a.latitude)}, {formatKoordinat(a.longitude)} 🗺️
                        </a>
                      ) : (
                        <span style={{ color: 'var(--color-disabled)', fontStyle: 'italic' }}>Tidak diketahui</span>
                      )}
                      {a.last_location_at && (
                        <div>
                          <DurasiAktif
                            isoString={a.last_location_at}
                            warnAfterMinutes={15}
                            criticalAfterMinutes={30}
                            prefix="📍 "
                          />
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'monospace' }}>
                      {a.speed_kmh != null && parseFloat(String(a.speed_kmh)) > 0
                        ? `${parseFloat(String(a.speed_kmh)).toFixed(0)} km/j`
                        : <span style={{ color: 'var(--color-disabled)', fontStyle: 'italic' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                      {a.driver_phone ?? <span style={{ color: 'var(--color-disabled)', fontStyle: 'italic' }}>—</span>}
                    </td>
                    <td>
                      <button
                        onClick={() => setModalAmbulance({ id: a.id, plate: a.plate_number })}
                        disabled={!bisaDispatch}
                        className={`${styles.btn} ${bisaDispatch ? styles.btnPrimary : styles.btnSecondary}`}
                        style={{
                          padding: '4px 10px', fontSize: 11, height: 'auto',
                          cursor: bisaDispatch ? 'pointer' : 'not-allowed',
                          opacity: bisaDispatch ? 1 : 0.5,
                        }}
                        title={bisaDispatch ? 'Kirim ambulans ke lokasi darurat' : 'Hanya ambulans berstatus Siap yang bisa dikirim'}
                      >
                        🚑 Kirim
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes pulseDot {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.6; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
