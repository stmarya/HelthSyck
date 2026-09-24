import { useEffect, useState, useCallback } from 'react';
import { hospitalClient } from '../api/client';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import { Modal, ConfirmDialog } from '../components/Modal';
import { InputField, SelectField } from '../components/FormField';
import { Skeleton } from '../components/Skeleton';
import styles from './Page.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Tipe Data
// ─────────────────────────────────────────────────────────────────────────────

type BedStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'MAINTENANCE';

interface HospitalOption {
  id: string;
  name: string;
  city: string;
  total_beds: number;
  available_beds: number;
  icu_total: number;
  icu_available: number;
}

interface WardSummary {
  ward: string;
  total: number;
  available: number;
  occupied: number;
  reserved: number;
  maintenance: number;
}

interface BedRow {
  id: string;
  ward: string;
  room_number: string;
  bed_number: string;
  status: BedStatus;
  patient_id: string | null;
  admitted_at: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Konstanta
// ─────────────────────────────────────────────────────────────────────────────

const WARD_OPTIONS = [
  { value: '', label: 'Semua Ward' },
  { value: 'ICU',       label: 'ICU' },
  { value: 'GENERAL',   label: 'Umum (General)' },
  { value: 'PEDIATRIC', label: 'Pediatri' },
  { value: 'MATERNITY', label: 'Kebidanan' },
  { value: 'SURGICAL',  label: 'Bedah' },
  { value: 'VIP',       label: 'VIP' },
];

const STATUS_OPTIONS_FILTER = [
  { value: '',            label: 'Semua Status' },
  { value: 'AVAILABLE',  label: 'Tersedia' },
  { value: 'OCCUPIED',   label: 'Terisi' },
  { value: 'RESERVED',   label: 'Dipesan' },
  { value: 'MAINTENANCE',label: 'Maintenance' },
];

const STATUS_OPTIONS_EDIT = STATUS_OPTIONS_FILTER.slice(1);

const BED_STATUS_STYLE: Record<BedStatus, { bg: string; color: string; label: string; dot: string }> = {
  AVAILABLE:   { bg: '#f0fdf4', color: '#15803d', label: 'Tersedia',   dot: '#22c55e' },
  OCCUPIED:    { bg: '#fef2f2', color: '#dc2626', label: 'Terisi',     dot: '#ef4444' },
  RESERVED:    { bg: '#fffbeb', color: '#d97706', label: 'Dipesan',    dot: '#f59e0b' },
  MAINTENANCE: { bg: '#f5f5f5', color: '#6b7280', label: 'Maintenance',dot: '#9ca3af' },
};

const WARD_ICON: Record<string, string> = {
  ICU: '🏥', GENERAL: '🛏', PEDIATRIC: '👶', MATERNITY: '🤱',
  SURGICAL: '⚕️', VIP: '⭐',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function pctColor(available: number, total: number): string {
  if (total === 0) return 'var(--color-muted)';
  const p = (available / total) * 100;
  if (p < 20) return '#dc2626';
  if (p < 50) return '#d97706';
  return '#16a34a';
}

// ─────────────────────────────────────────────────────────────────────────────
// Kartu Ward Summary
// ─────────────────────────────────────────────────────────────────────────────

function WardCard({ w, onClick, active }: { w: WardSummary; onClick: () => void; active: boolean }) {
  const pct = w.total > 0 ? Math.round((w.available / w.total) * 100) : 0;
  return (
    <div
      onClick={onClick}
      style={{
        background: active ? 'var(--color-accent-light)' : 'var(--color-surface)',
        border: `2px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
        borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>
          {WARD_ICON[w.ward] ?? '🛏'} {w.ward}
        </span>
        <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{w.total} bed</span>
      </div>
      {/* Progress bar */}
      <div style={{ height: 6, background: 'var(--color-border)', borderRadius: 999, marginBottom: 8, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 999, width: `${pct}%`,
          background: pctColor(w.available, w.total),
          transition: 'width 0.4s',
        }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
        {[
          { label: 'Tersedia',    val: w.available,    color: '#16a34a' },
          { label: 'Terisi',      val: w.occupied,     color: '#dc2626' },
          { label: 'Dipesan',     val: w.reserved,     color: '#d97706' },
          { label: 'Maintenance', val: w.maintenance,  color: '#6b7280' },
        ].map((s) => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 9, color: 'var(--color-muted)', lineHeight: 1.2 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Halaman Utama
// ─────────────────────────────────────────────────────────────────────────────

export default function BedManagementPage() {
  const { showToast } = useToast();

  // ── State pemilihan RS ──
  const [hospitals,        setHospitals]        = useState<HospitalOption[]>([]);
  const [hospitalsLoading, setHospitalsLoading] = useState(true);
  const [selectedHospital, setSelectedHospital] = useState<HospitalOption | null>(null);
  const [hospitalSearch,   setHospitalSearch]   = useState('');

  // ── State ward & bed ──
  const [wards,        setWards]        = useState<WardSummary[]>([]);
  const [wardsLoading, setWardsLoading] = useState(false);
  const [beds,         setBeds]         = useState<BedRow[]>([]);
  const [bedsLoading,  setBedsLoading]  = useState(false);
  const [wardFilter,   setWardFilter]   = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [activeWard,   setActiveWard]   = useState<string | null>(null);

  // ── State modal tambah bed ──
  const [showAddBed, setShowAddBed] = useState(false);
  const [addForm,    setAddForm]    = useState({ ward: 'GENERAL', roomNumber: '', bedNumber: '' });
  const [addErrors,  setAddErrors]  = useState<Record<string, string>>({});
  const [addBusy,    setAddBusy]    = useState(false);

  // ── State modal update status bed ──
  const [editBed,    setEditBed]    = useState<BedRow | null>(null);
  const [editStatus, setEditStatus] = useState<BedStatus>('AVAILABLE');
  const [editBusy,   setEditBusy]   = useState(false);

  // ── State modal update kapasitas ──
  const [showCapacity,   setShowCapacity]   = useState(false);
  const [capAvailable,   setCapAvailable]   = useState('');
  const [capIcuAvailable,setCapIcuAvailable]= useState('');
  const [capBusy,        setCapBusy]        = useState(false);

  // ── State konfirmasi reset maintenance ──
  const [maintenanceBed, setMaintenanceBed] = useState<BedRow | null>(null);

  // ── Fetch daftar RS ──
  useEffect(() => {
    setHospitalsLoading(true);
    hospitalClient.get<{ data: HospitalOption[]; meta: { total: number } }>('/v1/hospitals?limit=100')
      .then((res) => setHospitals(res.data.data ?? []))
      .catch(() => showToast('Gagal memuat daftar rumah sakit', 'error'))
      .finally(() => setHospitalsLoading(false));
  }, [showToast]);

  // ── Fetch ward summary ──
  const fetchWards = useCallback(async (hospitalId: string) => {
    setWardsLoading(true);
    try {
      const res = await hospitalClient.get<{ data: { wards: WardSummary[] } }>(
        `/v1/hospitals/${hospitalId}/capacity`
      );
      setWards(res.data.data?.wards ?? []);
    } catch {
      showToast('Gagal memuat ringkasan ward', 'error');
    } finally {
      setWardsLoading(false);
    }
  }, [showToast]);

  // ── Fetch beds ──
  const fetchBeds = useCallback(async (hospitalId: string, ward?: string, status?: string) => {
    setBedsLoading(true);
    try {
      const params = new URLSearchParams();
      if (ward)   params.set('ward', ward);
      if (status) params.set('status', status);
      const res = await hospitalClient.get<{ data: BedRow[] }>(
        `/v1/hospitals/${hospitalId}/beds?${params}`
      );
      setBeds(res.data.data ?? []);
    } catch {
      showToast('Gagal memuat data bed', 'error');
    } finally {
      setBedsLoading(false);
    }
  }, [showToast]);

  // Saat RS dipilih
  const handleSelectHospital = (h: HospitalOption) => {
    setSelectedHospital(h);
    setActiveWard(null);
    setWardFilter('');
    setStatusFilter('');
    setBeds([]);
    void fetchWards(h.id);
    void fetchBeds(h.id);
  };

  // Saat klik ward card
  const handleWardClick = (ward: string) => {
    if (!selectedHospital) return;
    const next = activeWard === ward ? null : ward;
    setActiveWard(next);
    setWardFilter(next ?? '');
    void fetchBeds(selectedHospital.id, next ?? undefined, statusFilter || undefined);
  };

  // Saat filter berubah
  const applyFilters = (ward: string, status: string) => {
    if (!selectedHospital) return;
    void fetchBeds(selectedHospital.id, ward || undefined, status || undefined);
  };

  // ── Tambah Bed ──
  const doAddBed = async () => {
    const errs: Record<string, string> = {};
    if (!addForm.ward)       errs.ward       = 'Ward wajib dipilih';
    if (!addForm.roomNumber) errs.roomNumber = 'No. ruangan wajib diisi';
    if (!addForm.bedNumber)  errs.bedNumber  = 'No. bed wajib diisi';
    setAddErrors(errs);
    if (Object.keys(errs).length > 0 || !selectedHospital) return;

    setAddBusy(true);
    try {
      await hospitalClient.post(`/v1/hospitals/${selectedHospital.id}/beds`, {
        ward: addForm.ward,
        roomNumber: addForm.roomNumber.trim(),
        bedNumber:  addForm.bedNumber.trim(),
      });
      showToast(`Bed ${addForm.roomNumber}/${addForm.bedNumber} berhasil ditambahkan`, 'success');
      setShowAddBed(false);
      setAddForm({ ward: 'GENERAL', roomNumber: '', bedNumber: '' });
      await fetchWards(selectedHospital.id);
      await fetchBeds(selectedHospital.id, wardFilter || undefined, statusFilter || undefined);
    } catch {
      showToast('Gagal menambahkan bed (mungkin sudah ada)', 'error');
    } finally {
      setAddBusy(false);
    }
  };

  // ── Update Status Bed ──
  const doUpdateBed = async () => {
    if (!editBed || !selectedHospital) return;
    setEditBusy(true);
    try {
      await hospitalClient.put(`/v1/hospitals/${selectedHospital.id}/beds/${editBed.id}`, {
        status: editStatus,
        patientId: editStatus === 'OCCUPIED' ? undefined : undefined,
      });
      const st = BED_STATUS_STYLE[editStatus];
      showToast(`Bed ${editBed.room_number}/${editBed.bed_number} diubah ke ${st.label}`, 'success');
      setEditBed(null);
      await fetchWards(selectedHospital.id);
      await fetchBeds(selectedHospital.id, wardFilter || undefined, statusFilter || undefined);
      // Update selectedHospital aggregate jika ada
      const rs = await hospitalClient.get<{ data: HospitalOption }>(`/v1/hospitals/${selectedHospital.id}`);
      if (rs.data.data) setSelectedHospital(rs.data.data as HospitalOption);
    } catch {
      showToast('Gagal mengubah status bed', 'error');
    } finally {
      setEditBusy(false);
    }
  };

  // ── Update Kapasitas (sync manual) ──
  const doUpdateCapacity = async () => {
    if (!selectedHospital) return;
    const av  = parseInt(capAvailable, 10);
    const icu = parseInt(capIcuAvailable, 10);
    if (isNaN(av) || av < 0) { showToast('Jumlah bed tersedia tidak valid', 'warning'); return; }
    if (isNaN(icu) || icu < 0) { showToast('Jumlah ICU tersedia tidak valid', 'warning'); return; }
    setCapBusy(true);
    try {
      await hospitalClient.put(`/v1/hospitals/${selectedHospital.id}/capacity`, {
        availableBeds: av,
        icuAvailable:  icu,
        notes:         'Diperbarui manual dari admin panel',
      });
      showToast('Kapasitas berhasil diperbarui', 'success');
      setShowCapacity(false);
      setSelectedHospital((prev) => prev ? { ...prev, available_beds: av, icu_available: icu } : prev);
      await fetchWards(selectedHospital.id);
    } catch {
      showToast('Gagal memperbarui kapasitas', 'error');
    } finally {
      setCapBusy(false);
    }
  };

  // ── Reset bed dari MAINTENANCE ke AVAILABLE ──
  const doResetMaintenance = async () => {
    if (!maintenanceBed || !selectedHospital) return;
    try {
      await hospitalClient.put(`/v1/hospitals/${selectedHospital.id}/beds/${maintenanceBed.id}`, {
        status: 'AVAILABLE',
      });
      showToast(`Bed ${maintenanceBed.room_number}/${maintenanceBed.bed_number} sudah tersedia kembali`, 'success');
      setMaintenanceBed(null);
      await fetchWards(selectedHospital.id);
      await fetchBeds(selectedHospital.id, wardFilter || undefined, statusFilter || undefined);
    } catch {
      showToast('Gagal mereset status bed', 'error');
    }
  };

  // ── Filter display ──
  const filteredHospitals = hospitals.filter((h) =>
    h.name.toLowerCase().includes(hospitalSearch.toLowerCase()) ||
    h.city.toLowerCase().includes(hospitalSearch.toLowerCase())
  );

  // ── Stat aggregate dari wards ──
  const totalBeds   = wards.reduce((s, w) => s + Number(w.total), 0);
  const totalAvail  = wards.reduce((s, w) => s + Number(w.available), 0);
  const totalOccup  = wards.reduce((s, w) => s + Number(w.occupied), 0);
  const totalMaint  = wards.reduce((s, w) => s + Number(w.maintenance), 0);
  const occupPct    = totalBeds > 0 ? Math.round((totalOccup / totalBeds) * 100) : 0;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Manajemen Tempat Tidur"
        subtitle="Kelola kapasitas dan status bed seluruh rumah sakit"
        breadcrumbs={[
          { label: 'Dashboard', to: '/' },
          { label: 'Rumah Sakit', to: '/hospitals' },
          { label: 'Manajemen Bed' },
        ]}
        actions={
          selectedHospital ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className={`${styles.btn} ${styles.btnOutline}`}
                onClick={() => {
                  setCapAvailable(String(selectedHospital.available_beds));
                  setCapIcuAvailable(String(selectedHospital.icu_available));
                  setShowCapacity(true);
                }}
              >
                🔄 Update Kapasitas
              </button>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={() => setShowAddBed(true)}
              >
                + Tambah Bed
              </button>
            </div>
          ) : null
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, alignItems: 'start' }}>

        {/* ════ Panel Kiri: Daftar RS ════ */}
        <div>
          <div className={styles.card} style={{ padding: '12px 14px', marginBottom: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: 'var(--color-text)' }}>
              🏥 Pilih Rumah Sakit
            </div>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Cari nama atau kota…"
              value={hospitalSearch}
              onChange={(e) => setHospitalSearch(e.target.value)}
              style={{ marginBottom: 10, width: '100%', boxSizing: 'border-box' }}
            />
            <div style={{ maxHeight: 480, overflowY: 'auto' }}>
              {hospitalsLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} height={52} style={{ marginBottom: 6 }} />
                ))
              ) : filteredHospitals.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--color-muted)', textAlign: 'center', padding: 16 }}>
                  Tidak ada RS ditemukan
                </div>
              ) : (
                filteredHospitals.map((h) => (
                  <div
                    key={h.id}
                    onClick={() => handleSelectHospital(h)}
                    style={{
                      padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
                      background: selectedHospital?.id === h.id ? 'var(--color-accent-light)' : 'var(--color-surface-2)',
                      border: `1px solid ${selectedHospital?.id === h.id ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      transition: 'all 0.12s',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{h.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>{h.city}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      <span style={{ fontSize: 11, color: pctColor(h.available_beds, h.total_beds), fontWeight: 600 }}>
                        🛏 {h.available_beds}/{h.total_beds} tersedia
                      </span>
                      {h.icu_total > 0 && (
                        <span style={{ fontSize: 11, color: pctColor(h.icu_available, h.icu_total), fontWeight: 600 }}>
                          ICU {h.icu_available}/{h.icu_total}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ════ Panel Kanan: Detail RS ════ */}
        {!selectedHospital ? (
          <div className={styles.card} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 360, color: 'var(--color-muted)', gap: 12 }}>
            <div style={{ fontSize: 48, opacity: 0.25 }}>🛏</div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Pilih rumah sakit di sebelah kiri</div>
            <div style={{ fontSize: 13 }}>untuk melihat dan mengelola tempat tidur</div>
          </div>
        ) : (
          <div>
            {/* ── Header RS ── */}
            <div className={styles.card} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{selectedHospital.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 2 }}>{selectedHospital.city}</div>
                </div>
              </div>
              {/* KPI aggregate */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
                {[
                  { label: 'Total Bed', value: totalBeds, color: 'var(--color-text)' },
                  { label: 'Tersedia',  value: totalAvail, color: '#16a34a' },
                  { label: 'Terisi',    value: totalOccup, color: '#dc2626' },
                  { label: 'Dipesan',   value: wards.reduce((s, w) => s + Number(w.reserved), 0), color: '#d97706' },
                  { label: 'Maintenance', value: totalMaint, color: '#6b7280' },
                ].map((s) => (
                  <div key={s.label} style={{
                    background: 'var(--color-surface-2)', borderRadius: 8,
                    padding: '10px 12px', border: '1px solid var(--color-border)', textAlign: 'center',
                  }}>
                    {wardsLoading ? <Skeleton height={24} width={40} style={{ margin: '0 auto' }} />
                      : <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>}
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              {/* Occupancy progress */}
              {totalBeds > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-muted)', marginBottom: 4 }}>
                    <span>Tingkat Keterisian</span>
                    <span style={{ fontWeight: 700, color: pctColor(totalAvail, totalBeds) }}>{occupPct}% terisi</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--color-border)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 999, width: `${occupPct}%`, background: occupPct > 80 ? '#dc2626' : occupPct > 60 ? '#d97706' : '#16a34a', transition: 'width 0.4s' }} />
                  </div>
                </div>
              )}
            </div>

            {/* ── Kartu Ward ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
              {wardsLoading
                ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={110} borderRadius={12} />)
                : wards.length === 0
                  ? (
                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 24, color: 'var(--color-muted)', fontSize: 13 }}>
                      Belum ada data ward. Tambahkan bed terlebih dahulu.
                    </div>
                  )
                  : wards.map((w) => (
                    <WardCard
                      key={w.ward}
                      w={{
                        ...w,
                        total:       Number(w.total),
                        available:   Number(w.available),
                        occupied:    Number(w.occupied),
                        reserved:    Number(w.reserved ?? 0),
                        maintenance: Number(w.maintenance ?? 0),
                      }}
                      active={activeWard === w.ward}
                      onClick={() => handleWardClick(w.ward)}
                    />
                  ))
              }
            </div>

            {/* ── Tabel Bed ── */}
            <div className={styles.card} style={{ padding: 0 }}>
              {/* Toolbar filter */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 14, marginRight: 4 }}>Daftar Bed</span>
                <div style={{ flex: '0 1 180px' }}>
                  <SelectField
                    label=""
                    value={wardFilter}
                    onChange={(e) => {
                      setWardFilter(e.target.value);
                      setActiveWard(e.target.value || null);
                      applyFilters(e.target.value, statusFilter);
                    }}
                    options={WARD_OPTIONS}
                  />
                </div>
                <div style={{ flex: '0 1 180px' }}>
                  <SelectField
                    label=""
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value);
                      applyFilters(wardFilter, e.target.value);
                    }}
                    options={STATUS_OPTIONS_FILTER}
                  />
                </div>
                <button
                  className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                  onClick={() => {
                    setWardFilter(''); setStatusFilter(''); setActiveWard(null);
                    void fetchBeds(selectedHospital.id);
                  }}
                >
                  Reset
                </button>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--color-muted)' }}>
                  {beds.length} bed ditampilkan
                </span>
              </div>

              {bedsLoading ? (
                <div style={{ padding: 16 }}>
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={44} style={{ marginBottom: 6 }} />)}
                </div>
              ) : beds.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyStateIcon}>🛏</div>
                  <div className={styles.emptyStateTitle}>Tidak ada bed</div>
                  <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                    {wardFilter || statusFilter ? 'Ubah filter untuk melihat bed lain.' : 'Klik "+ Tambah Bed" untuk memulai.'}
                  </div>
                </div>
              ) : (
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Ward</th>
                        <th>Ruangan</th>
                        <th>No. Bed</th>
                        <th style={{ textAlign: 'center' }}>Status</th>
                        <th>Masuk Sejak</th>
                        <th style={{ textAlign: 'center', width: 120 }}>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {beds.map((bed) => {
                        const st = BED_STATUS_STYLE[bed.status] ?? BED_STATUS_STYLE.AVAILABLE;
                        return (
                          <tr key={bed.id}>
                            <td>
                              <span style={{ fontSize: 13 }}>{WARD_ICON[bed.ward] ?? '🛏'} {bed.ward}</span>
                            </td>
                            <td style={{ fontSize: 13, fontFamily: 'monospace' }}>{bed.room_number}</td>
                            <td style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 600 }}>{bed.bed_number}</td>
                            <td style={{ textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                                background: st.bg, color: st.color,
                              }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot, flexShrink: 0 }} />
                                {st.label}
                              </span>
                            </td>
                            <td style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                              {bed.admitted_at
                                ? new Date(bed.admitted_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                                : '—'
                              }
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                                <button
                                  className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                                  onClick={() => { setEditBed(bed); setEditStatus(bed.status); }}
                                  title="Ubah status bed"
                                >
                                  ✎
                                </button>
                                {bed.status === 'MAINTENANCE' && (
                                  <button
                                    className={`${styles.btn} ${styles.btnSm} ${styles.btnPrimary}`}
                                    onClick={() => setMaintenanceBed(bed)}
                                    title="Selesaikan maintenance"
                                    style={{ fontSize: 10 }}
                                  >
                                    ✓ Selesai
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
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modal Tambah Bed ── */}
      {showAddBed && (
        <Modal open onClose={() => setShowAddBed(false)} title="Tambah Tempat Tidur Baru" width={420}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SelectField
              label="Ward" required
              value={addForm.ward}
              onChange={(e) => setAddForm((f) => ({ ...f, ward: e.target.value }))}
              options={WARD_OPTIONS.filter((w) => w.value !== '')}
              error={addErrors.ward}
            />
            <InputField
              label="No. Ruangan" required
              value={addForm.roomNumber}
              onChange={(e) => setAddForm((f) => ({ ...f, roomNumber: e.target.value }))}
              placeholder="Contoh: R101"
              error={addErrors.roomNumber}
            />
            <InputField
              label="No. Bed" required
              value={addForm.bedNumber}
              onChange={(e) => setAddForm((f) => ({ ...f, bedNumber: e.target.value }))}
              placeholder="Contoh: B01"
              error={addErrors.bedNumber}
            />
            <div style={{ fontSize: 12, color: 'var(--color-muted)', padding: '8px 12px', borderRadius: 8, background: 'var(--color-surface-2)' }}>
              💡 Bed baru akan langsung berstatus <strong>TERSEDIA</strong> dan menambah kapasitas RS.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className={`${styles.btn} ${styles.btnOutline}`} onClick={() => setShowAddBed(false)}>Batal</button>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={addBusy}
                onClick={() => void doAddBed()}
              >
                {addBusy ? 'Menyimpan…' : 'Tambah Bed'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal Edit Status Bed ── */}
      {editBed && (
        <Modal open onClose={() => setEditBed(null)} title={`Ubah Status Bed — ${editBed.room_number}/${editBed.bed_number}`} width={380}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
              fontSize: 13,
            }}>
              <div style={{ fontWeight: 600 }}>Ward: {editBed.ward}</div>
              <div style={{ color: 'var(--color-muted)', marginTop: 2 }}>
                Status saat ini:{' '}
                <span style={{ fontWeight: 600, color: BED_STATUS_STYLE[editBed.status]?.color }}>
                  {BED_STATUS_STYLE[editBed.status]?.label}
                </span>
              </div>
            </div>
            <SelectField
              label="Status Baru" required
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value as BedStatus)}
              options={STATUS_OPTIONS_EDIT}
            />
            {editStatus === 'OCCUPIED' && (
              <div style={{ fontSize: 12, color: '#d97706', padding: '8px 12px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a' }}>
                ⚠️ Mengisi status TERISI memerlukan ID pasien. Hubungkan melalui sistem admisi pasien.
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className={`${styles.btn} ${styles.btnOutline}`} onClick={() => setEditBed(null)}>Batal</button>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={editBusy || editStatus === editBed.status}
                onClick={() => void doUpdateBed()}
              >
                {editBusy ? 'Menyimpan…' : 'Simpan'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal Update Kapasitas Manual ── */}
      {showCapacity && selectedHospital && (
        <Modal open onClose={() => setShowCapacity(false)} title={`Update Kapasitas — ${selectedHospital.name}`} width={380}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--color-muted)', padding: '8px 12px', borderRadius: 8, background: 'var(--color-surface-2)' }}>
              Gunakan fitur ini untuk menyinkronkan jumlah bed tersedia jika terjadi perbedaan dengan data lapangan.
            </div>
            <InputField
              label="Bed Tersedia (dari total {selectedHospital.total_beds})"
              type="number"
              value={capAvailable}
              onChange={(e) => setCapAvailable(e.target.value)}
              placeholder={`0 – ${selectedHospital.total_beds}`}
            />
            <InputField
              label="ICU Tersedia (dari total {selectedHospital.icu_total})"
              type="number"
              value={capIcuAvailable}
              onChange={(e) => setCapIcuAvailable(e.target.value)}
              placeholder={`0 – ${selectedHospital.icu_total}`}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className={`${styles.btn} ${styles.btnOutline}`} onClick={() => setShowCapacity(false)}>Batal</button>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={capBusy}
                onClick={() => void doUpdateCapacity()}
              >
                {capBusy ? 'Menyimpan…' : 'Update Kapasitas'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Konfirmasi Reset Maintenance ── */}
      <ConfirmDialog
        open={maintenanceBed !== null}
        title="Selesaikan Maintenance"
        message={`Tandai bed ${maintenanceBed?.room_number ?? ''}/${maintenanceBed?.bed_number ?? ''} sebagai selesai maintenance dan kembali TERSEDIA?`}
        confirmLabel="Selesai, Aktifkan Kembali"
        danger={false}
        onConfirm={() => void doResetMaintenance()}
        onCancel={() => setMaintenanceBed(null)}
      />
    </div>
  );
}
