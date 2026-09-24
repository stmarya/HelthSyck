import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { DoctorSpecialization, ServiceType, FacilityCategory, SystemConfig } from '../types/admin';
import { ConfirmDialog } from '../components/Modal';
import { Skeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import { hospitalClient } from '../api/client';
import styles from './Page.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Helper — format tanggal ke Bahasa Indonesia
// ─────────────────────────────────────────────────────────────────────────────

function fmtDate(s: string | undefined | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper — ekspor array ke CSV dan trigger download
// ─────────────────────────────────────────────────────────────────────────────

function eksporCsv(header: string[], rows: (string | number)[][], namaFile: string) {
  const csvBaris = [header, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csvBaris], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = namaFile;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock data fallback — digunakan saat backend tidak mengembalikan data
// (Layanan & Fasilitas belum ada endpoint backend)
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_SERVICE_TYPES: ServiceType[] = [
  { id: 'st-1', code: 'RJ',   name: 'Rawat Jalan',  isActive: true,  createdAt: new Date().toISOString() },
  { id: 'st-2', code: 'RI',   name: 'Rawat Inap',   isActive: true,  createdAt: new Date().toISOString() },
  { id: 'st-3', code: 'IGD',  name: 'IGD',          isActive: true,  createdAt: new Date().toISOString() },
  { id: 'st-4', code: 'LAB',  name: 'Laboratorium', isActive: true,  createdAt: new Date().toISOString() },
  { id: 'st-5', code: 'RAD',  name: 'Radiologi',    isActive: true,  createdAt: new Date().toISOString() },
  { id: 'st-6', code: 'FARM', name: 'Farmasi',      isActive: true,  createdAt: new Date().toISOString() },
  { id: 'st-7', code: 'FT',   name: 'Fisioterapi',  isActive: true,  createdAt: new Date().toISOString() },
  { id: 'st-8', code: 'OP',   name: 'Operasi',      isActive: false, createdAt: new Date().toISOString() },
];

const MOCK_FACILITIES: FacilityCategory[] = [
  { id: 'fc-1', code: 'PARKIR',  name: 'Parkir',   isActive: true,  createdAt: new Date().toISOString() },
  { id: 'fc-2', code: 'WIFI',    name: 'WiFi',      isActive: true,  createdAt: new Date().toISOString() },
  { id: 'fc-3', code: 'MUSHOLA', name: 'Mushola',  isActive: true,  createdAt: new Date().toISOString() },
  { id: 'fc-4', code: 'ATM',     name: 'ATM',       isActive: true,  createdAt: new Date().toISOString() },
  { id: 'fc-5', code: 'KANTIN',  name: 'Kantin',   isActive: true,  createdAt: new Date().toISOString() },
  { id: 'fc-6', code: 'AMBU',    name: 'Ambulans', isActive: true,  createdAt: new Date().toISOString() },
  { id: 'fc-7', code: 'HELIPAD', name: 'Helipad',  isActive: false, createdAt: new Date().toISOString() },
  { id: 'fc-8', code: 'BPJS',    name: 'BPJS',      isActive: true,  createdAt: new Date().toISOString() },
];

const INIT_CONFIGS: SystemConfig[] = [
  { key: 'MAX_CONSULTATION_DURATION', value: '60',    type: 'number',  description: 'Durasi maksimum konsultasi (menit)', updatedAt: new Date().toISOString() },
  { key: 'DEFAULT_REMINDER_MINUTES',  value: '30',    type: 'number',  description: 'Pengingat default sebelum jadwal (menit)', updatedAt: new Date().toISOString() },
  { key: 'ENABLE_VIDEO_CALL',         value: 'true',  type: 'boolean', description: 'Aktifkan fitur video call', updatedAt: new Date().toISOString() },
  { key: 'MAINTENANCE_MODE',          value: 'false', type: 'boolean', description: 'Mode pemeliharaan sistem', updatedAt: new Date().toISOString() },
  { key: 'MAX_FILE_UPLOAD_MB',        value: '10',    type: 'number',  description: 'Batas ukuran file upload (MB)', updatedAt: new Date().toISOString() },
  { key: 'SESSION_TIMEOUT_MINUTES',   value: '30',    type: 'number',  description: 'Batas waktu sesi pengguna (menit)', updatedAt: new Date().toISOString() },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tipe — DoctorRow dari GET /v1/doctors
// ─────────────────────────────────────────────────────────────────────────────

interface DoctorRowRingkas {
  specialization: string;
  is_available: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-komponen: Banner mode simulasi
// ─────────────────────────────────────────────────────────────────────────────

function BannerSimulasi() {
  return (
    <div style={{
      padding: '10px 14px',
      background: 'var(--color-warning-bg)',
      borderRadius: 8,
      border: '1px solid var(--color-warning)',
      marginBottom: 16,
      fontSize: 13,
      color: 'var(--color-warning)',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }}>
      <span>⚠</span>
      <span>
        Data ini berjalan dalam <strong>mode simulasi</strong> — perubahan tidak tersimpan ke database.
        Endpoint backend untuk tipe layanan & fasilitas belum tersedia.
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-komponen: Stat Card ringkas
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Sub-komponen: Empty State
// ─────────────────────────────────────────────────────────────────────────────

function KosongState({ pesan }: { pesan: string }) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyStateIcon}>📋</div>
      <div className={styles.emptyStateTitle}>{pesan}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Spesialisasi Dokter — Data REAL dari GET /v1/doctors
// ─────────────────────────────────────────────────────────────────────────────

function TabSpesialisasi() {
  const { showToast } = useToast();

  // State data (derived dari /v1/doctors)
  const [items, setItems]   = useState<DoctorSpecialization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  // State UI
  const [cari, setCari]                   = useState('');
  const [editingId, setEditingId]         = useState<string | null>(null);
  const [editingName, setEditingName]     = useState('');
  const [editingCode, setEditingCode]     = useState('');
  const [deleteTarget, setDeleteTarget]   = useState<DoctorSpecialization | null>(null);
  const [showAdd, setShowAdd]             = useState(false);
  const [newName, setNewName]             = useState('');
  const [newCode, setNewCode]             = useState('');
  const idCounterRef                      = useRef(0);

  // Fungsi derive spesialisasi dari data dokter
  const fetchSpesialisasi = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Ambil semua dokter (limit tinggi agar dapat semua)
      const res = await hospitalClient.get<{ data: DoctorRowRingkas[] }>('/v1/doctors?limit=100');
      const doctors = res.data.data ?? [];

      // Hitung jumlah dokter per spesialisasi
      const hitungMap = new Map<string, number>();
      for (const doc of doctors) {
        const sp = doc.specialization ?? 'LAINNYA';
        hitungMap.set(sp, (hitungMap.get(sp) ?? 0) + 1);
      }

      // Konversi ke DoctorSpecialization[]
      const spesialisasiList: DoctorSpecialization[] = Array.from(hitungMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([kode, jumlah], idx) => ({
          id: `sp-${idx}`,
          code: kode,
          name: formatNamaSpesialisasi(kode),
          doctorCount: jumlah,
          createdAt: new Date().toISOString(),
        }));

      setItems(spesialisasiList);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat data spesialisasi';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void fetchSpesialisasi(); }, [fetchSpesialisasi]);

  // Format kode spesialisasi → nama yang lebih ramah
  function formatNamaSpesialisasi(kode: string): string {
    const peta: Record<string, string> = {
      CARDIOLOGY:        'Kardiologi',
      NEUROLOGY:         'Neurologi',
      ORTHOPEDICS:       'Ortopedi',
      OPHTHALMOLOGY:     'Mata',
      ENT:               'THT',
      DERMATOLOGY:       'Dermatologi',
      PEDIATRIC:         'Pediatri / Anak',
      OBSTETRICS:        'Obstetri & Ginekologi',
      INTERNAL_MEDICINE: 'Penyakit Dalam',
      GENERAL_MEDICINE:  'Umum',
      ONCOLOGY:          'Onkologi',
      PSYCHIATRY:        'Psikiatri',
      RADIOLOGY:         'Radiologi',
      SURGERY:           'Bedah',
      UROLOGY:           'Urologi',
    };
    return peta[kode] ?? kode.replace(/_/g, ' ').toLowerCase()
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  const mkIdLokal = () => {
    idCounterRef.current += 1;
    return `lokal-${Date.now()}-${idCounterRef.current}`;
  };

  const itemsTerfilter = cari.trim()
    ? items.filter((i) =>
        i.name.toLowerCase().includes(cari.toLowerCase()) ||
        i.code.toLowerCase().includes(cari.toLowerCase()),
      )
    : items;

  const handleSimpanEdit = (id: string) => {
    if (!editingName.trim()) { showToast('Nama tidak boleh kosong', 'error'); return; }
    setItems((prev) => prev.map((i) =>
      i.id === id ? { ...i, name: editingName.trim(), code: editingCode.trim().toUpperCase() } : i,
    ));
    setEditingId(null);
    showToast('Spesialisasi berhasil diperbarui (mode lokal)', 'success');
  };

  const handleHapus = () => {
    if (!deleteTarget) return;
    setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
    setDeleteTarget(null);
    showToast('Spesialisasi berhasil dihapus (mode lokal)', 'success');
  };

  const handleTambah = () => {
    if (!newName.trim()) { showToast('Nama tidak boleh kosong', 'error'); return; }
    const kode = newCode.trim().toUpperCase() || newName.toUpperCase().replace(/\s+/g, '_').slice(0, 20);
    const item: DoctorSpecialization = {
      id: mkIdLokal(),
      code: kode,
      name: newName.trim(),
      doctorCount: 0,
      createdAt: new Date().toISOString(),
    };
    setItems((prev) => [...prev, item]);
    setNewName('');
    setNewCode('');
    setShowAdd(false);
    showToast('Spesialisasi berhasil ditambahkan (mode lokal)', 'success');
  };

  const handleEksporCsv = () => {
    eksporCsv(
      ['Kode', 'Nama Spesialisasi', 'Jumlah Dokter', 'Dibuat'],
      itemsTerfilter.map((i) => [i.code, i.name, i.doctorCount, fmtDate(i.createdAt)]),
      `spesialisasi-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    showToast('File CSV berhasil diunduh', 'success');
  };

  // Stat summary
  const totalDokter = items.reduce((sum, i) => sum + i.doctorCount, 0);
  const spTersibuk  = items.reduce(
    (max, i) => (i.doctorCount > max.doctorCount ? i : max),
    { doctorCount: 0, name: '—' } as DoctorSpecialization,
  );

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} height={42} style={{ marginBottom: 4 }} />
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
      {/* ── Info sumber data ── */}
      <div style={{
        padding: '8px 12px',
        background: 'var(--color-success-bg)',
        borderRadius: 8,
        border: '1px solid var(--color-success)',
        marginBottom: 16,
        fontSize: 12,
        color: 'var(--color-success)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span>✅</span>
        <span>Data real dari <strong>hospital-service → /v1/doctors</strong> — dihitung berdasarkan data dokter terdaftar.</span>
      </div>

      {/* ── Stat cards ── */}
      <div className={styles.statGrid} style={{ marginBottom: 16 }}>
        <StatCard label="Total Spesialisasi" value={items.length} color="var(--color-primary)" />
        <StatCard label="Total Dokter Terdaftar" value={totalDokter} color="var(--color-success)" />
        <StatCard label="Spesialisasi Terbanyak" value={spTersibuk.name !== '—' ? `${spTersibuk.name} (${spTersibuk.doctorCount})` : '—'} color="var(--color-warning)" />
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <input
          className={styles.searchInput}
          style={{ flex: '1 1 200px', maxWidth: 280 }}
          placeholder="Cari spesialisasi…"
          value={cari}
          onChange={(e) => setCari(e.target.value)}
        />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            className={`${styles.btn} ${styles.btnOutline}`}
            onClick={fetchSpesialisasi}
            title="Muat ulang dari backend"
          >
            ↻ Muat Ulang
          </button>
          <button
            className={`${styles.btn} ${styles.btnOutline}`}
            onClick={handleEksporCsv}
            disabled={items.length === 0}
          >
            ↓ Ekspor CSV
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setShowAdd(true)}>
            + Tambah
          </button>
        </div>
      </div>

      {/* ── Form tambah ── */}
      {showAdd && (
        <div style={{
          display: 'flex', gap: 8, marginBottom: 12, padding: 14,
          background: 'var(--color-surface-2)', borderRadius: 8,
          border: '1px solid var(--color-border)',
          flexWrap: 'wrap',
        }}>
          <input
            className={styles.searchInput}
            style={{ flex: '1 1 180px' }}
            placeholder="Nama spesialisasi"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleTambah()}
            autoFocus
          />
          <input
            className={styles.searchInput}
            style={{ width: 140 }}
            placeholder="Kode (opsional)"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
          />
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleTambah}>Simpan</button>
          <button
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={() => { setShowAdd(false); setNewName(''); setNewCode(''); }}
          >
            Batal
          </button>
        </div>
      )}

      {/* ── Tabel ── */}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nama Spesialisasi</th>
              <th>Kode</th>
              <th style={{ textAlign: 'center' }}>Jumlah Dokter</th>
              <th>Terakhir Diperbarui</th>
              <th style={{ textAlign: 'center', width: 140 }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {itemsTerfilter.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <KosongState pesan={cari ? `Tidak ada hasil untuk "${cari}"` : 'Belum ada spesialisasi'} />
                </td>
              </tr>
            ) : itemsTerfilter.map((item) => (
              <tr key={item.id}>
                <td>
                  {editingId === item.id ? (
                    <input
                      className={styles.searchInput}
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSimpanEdit(item.id)}
                      autoFocus
                    />
                  ) : (
                    <span style={{ fontWeight: 500 }}>{item.name}</span>
                  )}
                </td>
                <td>
                  {editingId === item.id ? (
                    <input
                      className={styles.searchInput}
                      style={{ width: 140 }}
                      value={editingCode}
                      onChange={(e) => setEditingCode(e.target.value)}
                    />
                  ) : (
                    <code style={{
                      fontSize: 11, background: 'var(--color-surface-2)',
                      padding: '2px 6px', borderRadius: 4,
                    }}>
                      {item.code}
                    </code>
                  )}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{
                    fontWeight: 700,
                    color: item.doctorCount === 0 ? 'var(--color-muted)' : 'var(--color-text)',
                  }}>
                    {item.doctorCount}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                  {fmtDate(item.createdAt)}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {editingId === item.id ? (
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button
                        className={`${styles.btn} ${styles.btnSm} ${styles.btnPrimary}`}
                        onClick={() => handleSimpanEdit(item.id)}
                      >
                        Simpan
                      </button>
                      <button
                        className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`}
                        onClick={() => setEditingId(null)}
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button
                        className={`${styles.btn} ${styles.btnSm} ${styles.btnGhost}`}
                        onClick={() => { setEditingId(item.id); setEditingName(item.name); setEditingCode(item.code); }}
                      >
                        Edit
                      </button>
                      <button
                        className={`${styles.btn} ${styles.btnSm} ${styles.btnDangerOutline}`}
                        onClick={() => setDeleteTarget(item)}
                      >
                        Hapus
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Catatan kaki */}
      <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 8 }}>
        * Data spesialisasi dihitung dari dokter terdaftar di sistem. Edit lokal tidak tersimpan ke database.
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Hapus Spesialisasi"
        message={`Yakin ingin menghapus spesialisasi "${deleteTarget?.name ?? ''}"? Tindakan ini hanya berlaku di sesi ini.`}
        confirmLabel="Hapus"
        danger
        onConfirm={handleHapus}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipe item generik untuk tab Layanan & Fasilitas
// ─────────────────────────────────────────────────────────────────────────────

interface ItemGenerik {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  description?: string;
}

interface PropsTabGenerik {
  dataAwal: ItemGenerik[];
  pesanKosong: string;
  labelTambah: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab Generik: Tipe Layanan & Fasilitas (mode simulasi)
// ─────────────────────────────────────────────────────────────────────────────

function TabGenerikSimulasi({ dataAwal, pesanKosong, labelTambah }: PropsTabGenerik) {
  const { showToast } = useToast();
  const [items, setItems]               = useState<ItemGenerik[]>(dataAwal);
  const [cari, setCari]                 = useState('');
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editingName, setEditingName]   = useState('');
  const [editingCode, setEditingCode]   = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ItemGenerik | null>(null);
  const [showAdd, setShowAdd]           = useState(false);
  const [newName, setNewName]           = useState('');
  const [newCode, setNewCode]           = useState('');
  const idCounterRef                    = useRef(0);

  const mkIdLokal = () => {
    idCounterRef.current += 1;
    return `lokal-${Date.now()}-${idCounterRef.current}`;
  };

  const itemsTerfilter = cari.trim()
    ? items.filter((i) =>
        i.name.toLowerCase().includes(cari.toLowerCase()) ||
        i.code.toLowerCase().includes(cari.toLowerCase()),
      )
    : items;

  const jumlahAktif    = items.filter((i) => i.isActive).length;
  const jumlahNonaktif = items.filter((i) => !i.isActive).length;

  const handleSimpanEdit = (id: string) => {
    if (!editingName.trim()) { showToast('Nama tidak boleh kosong', 'error'); return; }
    setItems((prev) => prev.map((i) =>
      i.id === id ? { ...i, name: editingName.trim(), code: editingCode.trim().toUpperCase() } : i,
    ));
    setEditingId(null);
    showToast('Data berhasil diperbarui (simulasi)', 'success');
  };

  const handleToggleAktif = (id: string) => {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, isActive: !i.isActive } : i));
    showToast('Status berhasil diubah (simulasi)', 'success');
  };

  const handleHapus = () => {
    if (!deleteTarget) return;
    setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
    setDeleteTarget(null);
    showToast('Data berhasil dihapus (simulasi)', 'success');
  };

  const handleTambah = () => {
    if (!newName.trim()) { showToast('Nama tidak boleh kosong', 'error'); return; }
    const kode = newCode.trim().toUpperCase() || newName.toUpperCase().replace(/\s+/g, '_').slice(0, 6);
    const item: ItemGenerik = {
      id: mkIdLokal(),
      code: kode,
      name: newName.trim(),
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    setItems((prev) => [...prev, item]);
    setNewName('');
    setNewCode('');
    setShowAdd(false);
    showToast('Data berhasil ditambahkan (simulasi)', 'success');
  };

  return (
    <div>
      <BannerSimulasi />

      {/* ── Stat cards ── */}
      <div className={styles.statGrid} style={{ marginBottom: 16 }}>
        <StatCard label="Total Item" value={items.length} />
        <StatCard label="Aktif" value={jumlahAktif} color="var(--color-success)" />
        <StatCard label="Nonaktif" value={jumlahNonaktif} color="var(--color-muted)" />
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <input
          className={styles.searchInput}
          style={{ flex: '1 1 200px', maxWidth: 280 }}
          placeholder="Cari…"
          value={cari}
          onChange={(e) => setCari(e.target.value)}
        />
        <button
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={() => setShowAdd(true)}
          style={{ marginLeft: 'auto' }}
        >
          + {labelTambah}
        </button>
      </div>

      {/* ── Form tambah ── */}
      {showAdd && (
        <div style={{
          display: 'flex', gap: 8, marginBottom: 12, padding: 14,
          background: 'var(--color-surface-2)', borderRadius: 8,
          border: '1px solid var(--color-border)', flexWrap: 'wrap',
        }}>
          <input
            className={styles.searchInput}
            style={{ flex: '1 1 180px' }}
            placeholder="Nama"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleTambah()}
            autoFocus
          />
          <input
            className={styles.searchInput}
            style={{ width: 120 }}
            placeholder="Kode"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
          />
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleTambah}>Simpan</button>
          <button
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={() => { setShowAdd(false); setNewName(''); setNewCode(''); }}
          >
            Batal
          </button>
        </div>
      )}

      {/* ── Tabel ── */}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nama</th>
              <th>Kode</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th>Dibuat</th>
              <th style={{ textAlign: 'center', width: 170 }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {itemsTerfilter.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <KosongState pesan={cari ? `Tidak ada hasil untuk "${cari}"` : pesanKosong} />
                </td>
              </tr>
            ) : itemsTerfilter.map((item) => (
              <tr key={item.id}>
                <td>
                  {editingId === item.id ? (
                    <input
                      className={styles.searchInput}
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSimpanEdit(item.id)}
                      autoFocus
                    />
                  ) : (
                    <span style={{ fontWeight: 500 }}>{item.name}</span>
                  )}
                </td>
                <td>
                  {editingId === item.id ? (
                    <input
                      className={styles.searchInput}
                      style={{ width: 90 }}
                      value={editingCode}
                      onChange={(e) => setEditingCode(e.target.value)}
                    />
                  ) : (
                    <code style={{
                      fontSize: 11, background: 'var(--color-surface-2)',
                      padding: '2px 6px', borderRadius: 4,
                    }}>
                      {item.code}
                    </code>
                  )}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 999,
                    fontSize: 11, fontWeight: 600,
                    background: item.isActive ? 'var(--color-success-bg)' : '#f5f5f5',
                    color:      item.isActive ? 'var(--color-success)'    : '#9e9e9e',
                  }}>
                    {item.isActive ? 'Aktif' : 'Nonaktif'}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                  {fmtDate(item.createdAt)}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {editingId === item.id ? (
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button
                        className={`${styles.btn} ${styles.btnSm} ${styles.btnPrimary}`}
                        onClick={() => handleSimpanEdit(item.id)}
                      >
                        Simpan
                      </button>
                      <button
                        className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`}
                        onClick={() => setEditingId(null)}
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button
                        className={`${styles.btn} ${styles.btnSm} ${styles.btnGhost}`}
                        onClick={() => { setEditingId(item.id); setEditingName(item.name); setEditingCode(item.code); }}
                      >
                        Edit
                      </button>
                      <button
                        className={`${styles.btn} ${styles.btnSm} ${styles.btnGhost}`}
                        onClick={() => handleToggleAktif(item.id)}
                        title={item.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                      >
                        {item.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                      <button
                        className={`${styles.btn} ${styles.btnSm} ${styles.btnDangerOutline}`}
                        onClick={() => setDeleteTarget(item)}
                      >
                        Hapus
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Hapus Data"
        message={`Yakin ingin menghapus "${deleteTarget?.name ?? ''}"? Perubahan hanya berlaku di sesi ini.`}
        confirmLabel="Hapus"
        danger
        onConfirm={handleHapus}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Konfigurasi Sistem
// ─────────────────────────────────────────────────────────────────────────────

function TabKonfigurasi() {
  const { showToast } = useToast();
  const [configs, setConfigs]           = useState<SystemConfig[]>(INIT_CONFIGS);
  const [editingKey, setEditingKey]     = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');

  const getJenisTipe = (type: SystemConfig['type']) => {
    const peta = { boolean: 'Boolean', number: 'Angka', string: 'Teks' };
    return peta[type] ?? type;
  };

  const getBadgeTipe = (type: SystemConfig['type']): React.CSSProperties => {
    if (type === 'boolean') return { background: 'var(--color-accent-light)', color: 'var(--color-accent)' };
    if (type === 'number')  return { background: 'var(--color-info-bg)', color: 'var(--color-primary)' };
    return { background: '#f5f5f5', color: '#616161' };
  };

  const validateNilai = (cfg: SystemConfig, nilai: string): string | null => {
    if (cfg.type === 'boolean' && !['true', 'false'].includes(nilai.toLowerCase())) {
      return 'Nilai boolean harus "true" atau "false"';
    }
    if (cfg.type === 'number' && isNaN(Number(nilai))) {
      return 'Nilai angka tidak valid';
    }
    return null;
  };

  const handleSimpan = (key: string) => {
    const cfg = configs.find((c) => c.key === key);
    if (!cfg) return;
    const errValidasi = validateNilai(cfg, editingValue);
    if (errValidasi) { showToast(errValidasi, 'error'); return; }

    setConfigs((prev) => prev.map((c) =>
      c.key === key ? { ...c, value: editingValue.trim(), updatedAt: new Date().toISOString() } : c,
    ));
    setEditingKey(null);
    showToast(`Konfigurasi "${key}" berhasil disimpan (simulasi)`, 'success');
  };

  return (
    <div>
      {/* Banner peringatan */}
      <div style={{
        padding: '10px 14px',
        background: 'var(--color-warning-bg)',
        borderRadius: 8,
        border: '1px solid var(--color-warning)',
        marginBottom: 12,
        fontSize: 13,
        color: 'var(--color-warning)',
      }}>
        ⚠ Perubahan konfigurasi hanya tersimpan di sesi ini (<strong>mode simulasi</strong>).
        Untuk konfigurasi production, ubah melalui environment variables atau config server.
      </div>

      {/* Banner praktik terbaik */}
      <div style={{
        padding: '10px 14px',
        background: 'var(--color-info-bg)',
        borderRadius: 8,
        border: '1px solid var(--color-primary)',
        marginBottom: 16,
        fontSize: 12,
        color: 'var(--color-primary)',
      }}>
        💡 <strong>Best practice:</strong> Konfigurasi sensitif (secret keys, database URLs, dll.)
        tidak boleh ditampilkan di UI admin. Gunakan environment variables di server.
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Key Konfigurasi</th>
              <th>Nilai</th>
              <th style={{ textAlign: 'center' }}>Tipe</th>
              <th>Deskripsi</th>
              <th style={{ fontSize: 11, color: 'var(--color-muted)' }}>Diperbarui</th>
              <th style={{ textAlign: 'center', width: 100 }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {configs.map((cfg) => (
              <tr key={cfg.key}>
                <td>
                  <code style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)' }}>
                    {cfg.key}
                  </code>
                </td>
                <td>
                  {editingKey === cfg.key ? (
                    <input
                      className={styles.searchInput}
                      style={{ width: 140 }}
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSimpan(cfg.key)}
                      autoFocus
                    />
                  ) : (
                    <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600 }}>
                      {cfg.value}
                    </span>
                  )}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 999,
                    fontSize: 11, fontWeight: 600,
                    ...getBadgeTipe(cfg.type),
                  }}>
                    {getJenisTipe(cfg.type)}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                  {cfg.description}
                </td>
                <td style={{ fontSize: 11, color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                  {fmtDate(cfg.updatedAt)}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {editingKey === cfg.key ? (
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button
                        className={`${styles.btn} ${styles.btnSm} ${styles.btnPrimary}`}
                        onClick={() => handleSimpan(cfg.key)}
                      >
                        Simpan
                      </button>
                      <button
                        className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`}
                        onClick={() => setEditingKey(null)}
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <button
                      className={`${styles.btn} ${styles.btnSm} ${styles.btnGhost}`}
                      onClick={() => { setEditingKey(cfg.key); setEditingValue(cfg.value); }}
                    >
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipe dan daftar tab
// ─────────────────────────────────────────────────────────────────────────────

type TabId = 'spesialisasi' | 'layanan' | 'fasilitas' | 'konfigurasi';

interface DefinisiTab {
  id: TabId;
  label: string;
  icon: string;
  badge?: string; // "Simulasi" atau "Real"
}

const TABS: DefinisiTab[] = [
  { id: 'spesialisasi', label: 'Spesialisasi Dokter', icon: '⚕',  badge: 'Data Real' },
  { id: 'layanan',      label: 'Tipe Layanan',        icon: '🩺', badge: 'Simulasi' },
  { id: 'fasilitas',    label: 'Fasilitas',            icon: '🏗', badge: 'Simulasi' },
  { id: 'konfigurasi',  label: 'Konfigurasi Sistem',   icon: '⚙️', badge: 'Simulasi' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Komponen Utama MasterDataPage
// ─────────────────────────────────────────────────────────────────────────────

export default function MasterDataPage() {
  const [activeTab, setActiveTab] = useState<TabId>('spesialisasi');

  return (
    <div className={styles.page}>
      <PageHeader
        title="Master Data"
        subtitle="Kelola data referensi dan pengaturan sistem"
        breadcrumbs={[{ label: 'Beranda', to: '/' }, { label: 'Master Data' }]}
      />

      <div className={styles.card}>
        {/* ── Navigasi Tab ── */}
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
                  background: tab.badge === 'Data Real' ? 'var(--color-success-bg)' : 'var(--color-warning-bg)',
                  color: tab.badge === 'Data Real' ? 'var(--color-success)' : 'var(--color-warning)',
                  marginLeft: 2,
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Konten Tab ── */}
        {activeTab === 'spesialisasi' && <TabSpesialisasi />}

        {activeTab === 'layanan' && (
          <TabGenerikSimulasi
            dataAwal={MOCK_SERVICE_TYPES}
            pesanKosong="Belum ada tipe layanan"
            labelTambah="Tipe Layanan"
          />
        )}

        {activeTab === 'fasilitas' && (
          <TabGenerikSimulasi
            dataAwal={MOCK_FACILITIES}
            pesanKosong="Belum ada fasilitas"
            labelTambah="Fasilitas"
          />
        )}

        {activeTab === 'konfigurasi' && <TabKonfigurasi />}
      </div>
    </div>
  );
}
