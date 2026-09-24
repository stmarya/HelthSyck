import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { DoctorSpecialization } from '../types/admin';
import { Skeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import { ActionGuardNotice, GuardedActionButton } from '../components/ActionGuard';
import { hospitalClient } from '../api/client';
import styles from './Page.module.css';

function fmtDate(value: string | undefined | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function exportCsv(header: string[], rows: (string | number)[][], filename: string) {
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function StatCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statValue} style={{ color: color ?? 'var(--color-primary)' }}>
        {value}
      </div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

function EmptyState({ message, description }: { message: string; description?: string }) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyStateIcon}>📋</div>
      <div className={styles.emptyStateTitle}>{message}</div>
      {description && <div className={styles.emptyStateDesc}>{description}</div>}
    </div>
  );
}

interface DoctorRowRingkas {
  specialization: string;
  is_available: boolean;
}

function formatSpecializationName(code: string): string {
  const map: Record<string, string> = {
    CARDIOLOGY: 'Kardiologi',
    NEUROLOGY: 'Neurologi',
    ORTHOPEDICS: 'Ortopedi',
    OPHTHALMOLOGY: 'Mata',
    ENT: 'THT',
    DERMATOLOGY: 'Dermatologi',
    PEDIATRIC: 'Pediatri / Anak',
    OBSTETRICS: 'Obstetri & Ginekologi',
    INTERNAL_MEDICINE: 'Penyakit Dalam',
    GENERAL_MEDICINE: 'Umum',
    ONCOLOGY: 'Onkologi',
    PSYCHIATRY: 'Psikiatri',
    RADIOLOGY: 'Radiologi',
    SURGERY: 'Bedah',
    UROLOGY: 'Urologi',
  };

  return map[code] ?? code.replace(/_/g, ' ').toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function TabSpesialisasi() {
  const { showToast } = useToast();
  const [items, setItems] = useState<DoctorSpecialization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchSpesialisasi = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await hospitalClient.get<{ data: DoctorRowRingkas[] }>('/v1/doctors?limit=100');
      const doctors = res.data.data ?? [];
      const countBySpecialization = new Map<string, number>();

      for (const doctor of doctors) {
        const specialization = doctor.specialization ?? 'LAINNYA';
        countBySpecialization.set(specialization, (countBySpecialization.get(specialization) ?? 0) + 1);
      }

      const specializationList: DoctorSpecialization[] = Array.from(countBySpecialization.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([code, doctorCount], index) => ({
          id: `sp-${index}`,
          code,
          name: formatSpecializationName(code),
          doctorCount,
          createdAt: new Date().toISOString(),
        }));

      setItems(specializationList);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal memuat data spesialisasi';
      setError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void fetchSpesialisasi();
  }, [fetchSpesialisasi]);

  const filteredItems = search.trim()
    ? items.filter((item) =>
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.code.toLowerCase().includes(search.toLowerCase()),
      )
    : items;

  const totalDoctors = items.reduce((sum, item) => sum + item.doctorCount, 0);
  const busiest = items.reduce(
    (max, item) => (item.doctorCount > max.doctorCount ? item : max),
    { doctorCount: 0, name: '—' } as DoctorSpecialization,
  );

  const handleExportCsv = () => {
    exportCsv(
      ['Kode', 'Nama Spesialisasi', 'Jumlah Dokter', 'Terlihat Pada'],
      filteredItems.map((item) => [item.code, item.name, item.doctorCount, fmtDate(item.createdAt)]),
      `spesialisasi-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    showToast('CSV spesialisasi berhasil diunduh.', 'success');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} height={42} style={{ marginBottom: 4 }} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyStateIcon}>⚠️</div>
        <div className={styles.emptyStateTitle}>Gagal memuat data spesialisasi</div>
        <div style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 12 }}>{error}</div>
        <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={fetchSpesialisasi}>
          Coba Lagi
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className={styles.infoBanner}>
        <span>✅</span>
        <span>
          Data real dari <strong>hospital-service → /v1/doctors</strong>. Admin hanya dapat melihat dan mengekspor ringkasan spesialisasi yang benar-benar tersedia dari backend.
        </span>
      </div>

      <ActionGuardNotice
        action="edit"
        reason="Endpoint CRUD spesialisasi khusus Admin belum tersedia, jadi perubahan data referensi tetap dinonaktifkan di production."
      />

      <div className={styles.statGrid} style={{ marginBottom: 16 }}>
        <StatCard label="Total Spesialisasi" value={items.length} color="var(--color-primary)" />
        <StatCard label="Total Dokter Terdaftar" value={totalDoctors} color="var(--color-success)" />
        <StatCard
          label="Spesialisasi Terbanyak"
          value={busiest.name !== '—' ? `${busiest.name} (${busiest.doctorCount})` : '—'}
          color="var(--color-warning)"
        />
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <input
          className={styles.searchInput}
          style={{ flex: '1 1 220px', maxWidth: 320 }}
          placeholder="Cari spesialisasi…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className={`${styles.btn} ${styles.btnOutline}`}
            onClick={fetchSpesialisasi}
            title="Muat ulang dari backend"
          >
            ↻ Muat Ulang
          </button>
          <GuardedActionButton
            action="export"
            allowed={filteredItems.length > 0}
            deniedReason="Belum ada data spesialisasi real untuk diekspor."
            onClick={handleExportCsv}
            className={`${styles.btn} ${styles.btnOutline}`}
          >
            ↓ Ekspor CSV
          </GuardedActionButton>
          <GuardedActionButton
            action="create"
            allowed={false}
            deniedReason="Penambahan spesialisasi harus dilakukan melalui layanan backend yang resmi."
            className={`${styles.btn} ${styles.btnPrimary}`}
          >
            + Tambah
          </GuardedActionButton>
        </div>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nama Spesialisasi</th>
              <th>Kode</th>
              <th style={{ textAlign: 'center' }}>Jumlah Dokter</th>
              <th>Terlihat Pada</th>
              <th style={{ textAlign: 'center', width: 140 }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    message={search ? `Tidak ada hasil untuk "${search}"` : 'Belum ada spesialisasi real'}
                    description="Tambahkan dokter di hospital-service agar ringkasan spesialisasi muncul otomatis."
                  />
                </td>
              </tr>
            ) : filteredItems.map((item) => (
              <tr key={item.id}>
                <td><span style={{ fontWeight: 500 }}>{item.name}</span></td>
                <td>
                  <code style={{ fontSize: 11, background: 'var(--color-surface-2)', padding: '2px 6px', borderRadius: 4 }}>
                    {item.code}
                  </code>
                </td>
                <td style={{ textAlign: 'center', fontWeight: 700 }}>{item.doctorCount}</td>
                <td style={{ fontSize: 12, color: 'var(--color-muted)' }}>{fmtDate(item.createdAt)}</td>
                <td style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <GuardedActionButton
                      action="edit"
                      allowed={false}
                      deniedReason="Perubahan spesialisasi belum didukung endpoint Admin."
                      className={`${styles.btn} ${styles.btnSm} ${styles.btnGhost}`}
                    >
                      Edit
                    </GuardedActionButton>
                    <GuardedActionButton
                      action="delete"
                      allowed={false}
                      deniedReason="Penghapusan spesialisasi harus dilakukan lewat backend sumber data."
                      className={`${styles.btn} ${styles.btnSm} ${styles.btnDangerOutline}`}
                    >
                      Hapus
                    </GuardedActionButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 8 }}>
        * Ringkasan spesialisasi dihitung langsung dari dokter terdaftar. Tidak ada data referensi lokal atau simulasi yang disimpan di Admin.
      </div>
    </div>
  );
}

function StatusBadge({ active }: { active?: boolean }) {
  const style: CSSProperties = active
    ? { background: 'var(--color-success-bg)', color: 'var(--color-success)' }
    : { background: 'var(--color-surface-2)', color: 'var(--color-muted)' };

  return (
    <span className={styles.badge} style={style}>
      {active ? 'Aktif' : 'Tidak tersedia'}
    </span>
  );
}

function TabEndpointUnavailable({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <ActionGuardNotice action="view" reason={description} />

      <div className={styles.statGrid} style={{ marginBottom: 16 }}>
        <StatCard label="Total Item" value={0} />
        <StatCard label="Aktif" value={0} color="var(--color-success)" />
        <StatCard label="Nonaktif" value={0} color="var(--color-muted)" />
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <input
          className={styles.searchInput}
          style={{ flex: '1 1 220px', maxWidth: 320 }}
          placeholder={`Cari ${title.toLowerCase()}…`}
          disabled
          value=""
          readOnly
        />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <GuardedActionButton
            action="export"
            allowed={false}
            deniedReason={`Ekspor ${title.toLowerCase()} dinonaktifkan sampai endpoint tersedia.`}
            className={`${styles.btn} ${styles.btnOutline}`}
          >
            ↓ Ekspor CSV
          </GuardedActionButton>
          <GuardedActionButton
            action="create"
            allowed={false}
            deniedReason={`Penambahan ${title.toLowerCase()} harus menunggu endpoint backend resmi.`}
            className={`${styles.btn} ${styles.btnPrimary}`}
          >
            + Tambah
          </GuardedActionButton>
        </div>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nama</th>
              <th>Kode</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th>Catatan</th>
              <th style={{ textAlign: 'center', width: 170 }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={5}>
                <EmptyState
                  message={`Endpoint ${title.toLowerCase()} belum tersedia`}
                  description="Admin tidak lagi menampilkan data buatan. Hubungkan endpoint backend agar data dapat muncul di sini."
                />
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: 500 }}>Sumber data backend</td>
              <td><code style={{ fontSize: 11 }}>—</code></td>
              <td style={{ textAlign: 'center' }}><StatusBadge /></td>
              <td style={{ fontSize: 12, color: 'var(--color-muted)' }}>Belum ada respons backend yang aman untuk ditampilkan.</td>
              <td style={{ textAlign: 'center' }}>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <GuardedActionButton
                    action="edit"
                    allowed={false}
                    deniedReason={`Perubahan ${title.toLowerCase()} belum tersedia.`}
                    className={`${styles.btn} ${styles.btnSm} ${styles.btnGhost}`}
                  >
                    Edit
                  </GuardedActionButton>
                  <GuardedActionButton
                    action="delete"
                    allowed={false}
                    deniedReason={`Penghapusan ${title.toLowerCase()} belum tersedia.`}
                    className={`${styles.btn} ${styles.btnSm} ${styles.btnDangerOutline}`}
                  >
                    Hapus
                  </GuardedActionButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabKonfigurasi() {
  return (
    <div>
      <ActionGuardNotice
        action="view"
        reason="Konfigurasi operasional production dikelola melalui environment variables dan service backend, sehingga nilainya tidak ditampilkan atau diubah dari Admin."
      />

      <div className={styles.infoBanner}>
        <span>🔒</span>
        <span>
          Konfigurasi sensitif seperti secret, timeout, ukuran upload, dan mode maintenance harus dikelola di server. Admin hanya menampilkan status ketersediaan endpoint, bukan nilai konfigurasi internal.
        </span>
      </div>

      <div className={styles.statGrid} style={{ marginBottom: 16 }}>
        <StatCard label="Nilai Ditampilkan" value={0} />
        <StatCard label="Perubahan UI" value="Dinonaktifkan" color="var(--color-warning)" />
        <StatCard label="Sumber Konfigurasi" value="Server" color="var(--color-primary)" />
      </div>

      <div className={styles.cardElevated} style={{ marginBottom: 0 }}>
        <EmptyState
          message="Endpoint konfigurasi Admin belum tersedia"
          description="Tidak ada nilai konfigurasi buatan atau lokal yang ditampilkan di production."
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <GuardedActionButton
            action="edit"
            allowed={false}
            deniedReason="Perubahan konfigurasi harus dilakukan melalui deploy server atau endpoint backend yang aman."
            className={`${styles.btn} ${styles.btnSecondary}`}
          >
            Edit Konfigurasi
          </GuardedActionButton>
          <GuardedActionButton
            action="export"
            allowed={false}
            deniedReason="Tidak ada konfigurasi yang aman untuk diekspor dari UI Admin."
            className={`${styles.btn} ${styles.btnOutline}`}
          >
            Ekspor Konfigurasi
          </GuardedActionButton>
        </div>
      </div>
    </div>
  );
}

type TabId = 'spesialisasi' | 'layanan' | 'fasilitas' | 'konfigurasi';

interface TabDefinition {
  id: TabId;
  label: string;
  icon: string;
  badge?: string;
}

const TABS: TabDefinition[] = [
  { id: 'spesialisasi', label: 'Spesialisasi Dokter', icon: '⚕', badge: 'Data Backend' },
  { id: 'layanan', label: 'Tipe Layanan', icon: '🩺', badge: 'Endpoint Belum Tersedia' },
  { id: 'fasilitas', label: 'Fasilitas', icon: '🏗', badge: 'Endpoint Belum Tersedia' },
  { id: 'konfigurasi', label: 'Konfigurasi Sistem', icon: '⚙️', badge: 'Dikelola di Server' },
];

export default function MasterDataPage() {
  const [activeTab, setActiveTab] = useState<TabId>('spesialisasi');

  return (
    <div className={styles.page}>
      <PageHeader
        title="Master Data"
        subtitle="Kelola data referensi dan pengaturan sistem dari sumber backend yang tersedia"
        breadcrumbs={[{ label: 'Beranda', to: '/' }, { label: 'Master Data' }]}
      />

      <div className={styles.card}>
        <div style={{
          display: 'flex',
          gap: 4,
          marginBottom: 20,
          borderBottom: '2px solid var(--color-border)',
          paddingBottom: 0,
          flexWrap: 'wrap',
        }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: activeTab === tab.id ? 600 : 400,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                borderBottom: `2px solid ${activeTab === tab.id ? 'var(--color-primary)' : 'transparent'}`,
                color: activeTab === tab.id ? 'var(--color-primary)' : 'var(--color-muted)',
                marginBottom: -2,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'color 0.15s, border-color 0.15s',
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.badge && (
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '1px 6px',
                  borderRadius: 999,
                  background: tab.badge === 'Data Backend' ? 'var(--color-success-bg)' : 'var(--color-warning-bg)',
                  color: tab.badge === 'Data Backend' ? 'var(--color-success)' : 'var(--color-warning)',
                  marginLeft: 2,
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'spesialisasi' && <TabSpesialisasi />}
        {activeTab === 'layanan' && (
          <TabEndpointUnavailable
            title="tipe layanan"
            description="Tidak ada endpoint backend Admin untuk tipe layanan, sehingga tabel sengaja dibiarkan kosong dan read-only."
          />
        )}
        {activeTab === 'fasilitas' && (
          <TabEndpointUnavailable
            title="fasilitas"
            description="Tidak ada endpoint backend Admin untuk fasilitas rumah sakit, sehingga Admin tidak lagi menampilkan baris buatan."
          />
        )}
        {activeTab === 'konfigurasi' && <TabKonfigurasi />}
      </div>
    </div>
  );
}
