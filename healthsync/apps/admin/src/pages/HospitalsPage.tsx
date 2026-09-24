import { useEffect, useState, useCallback, useRef } from 'react';
import { hospitalClient } from '../api/client';
import type { HospitalType, CreateHospitalForm } from '../types/admin';
import { Modal, ConfirmDialog } from '../components/Modal';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import { InputField, SelectField } from '../components/FormField';
import { Skeleton } from '../components/Skeleton';
import styles from './Page.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Tipe lokal — disesuaikan dengan respons snake_case dari hospital-service
// ─────────────────────────────────────────────────────────────────────────────

interface HospitalRow {
  id: string;
  name: string;
  type: HospitalType;
  license_number?: string;
  address: string;
  city: string;
  province?: string;
  phone?: string;
  igd_phone?: string;
  total_beds: number;
  available_beds: number;
  icu_total: number;
  icu_available: number;
  specializations?: string[];
  is_emt_partner?: boolean;
  is_active?: boolean;
  // BPJS — backend field bisa isBPJSProvider atau is_bpjs_provider
  isBPJSProvider?: boolean;
  is_bpjs_provider?: boolean;
  accreditation?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Konstanta
// ─────────────────────────────────────────────────────────────────────────────

const HOSPITAL_TYPES: { value: HospitalType | ''; label: string }[] = [
  { value: '',           label: 'Semua Tipe' },
  { value: 'TYPE_A',     label: 'Tipe A' },
  { value: 'TYPE_B',     label: 'Tipe B' },
  { value: 'TYPE_C',     label: 'Tipe C' },
  { value: 'TYPE_D',     label: 'Tipe D' },
  { value: 'CLINIC',     label: 'Klinik' },
  { value: 'PUSKESMAS',  label: 'Puskesmas' },
];

const TYPE_BADGE_COLORS: Record<string, { bg: string; color: string }> = {
  TYPE_A:    { bg: 'var(--color-danger-bg)',    color: 'var(--color-danger)' },
  TYPE_B:    { bg: 'var(--color-warning-bg)',   color: 'var(--color-warning)' },
  TYPE_C:    { bg: 'var(--color-info-bg)',      color: 'var(--color-primary)' },
  TYPE_D:    { bg: 'var(--color-success-bg)',   color: 'var(--color-success)' },
  CLINIC:    { bg: 'var(--color-accent-light)', color: 'var(--color-accent)' },
  PUSKESMAS: { bg: '#f5f5f5',                   color: '#616161' },
};

const TYPE_LABEL: Record<string, string> = {
  TYPE_A: 'Tipe A', TYPE_B: 'Tipe B', TYPE_C: 'Tipe C', TYPE_D: 'Tipe D',
  CLINIC: 'Klinik', PUSKESMAS: 'Puskesmas',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isBpjs(h: HospitalRow): boolean {
  return !!(h.isBPJSProvider ?? h.is_bpjs_provider);
}

function getErrorMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    ?? (err instanceof Error ? err.message : fallback);
}

/** Warna ketersediaan bed berdasarkan persentase */
function bedColor(available: number, total: number): string {
  if (total === 0) return 'var(--color-muted)';
  const pct = (available / total) * 100;
  if (pct < 20)  return 'var(--color-danger,  #dc2626)';
  if (pct < 50)  return 'var(--color-warning, #d97706)';
  return 'var(--color-success, #16a34a)';
}

/** Ekspor data ke CSV */
function exportCSV(rows: HospitalRow[]) {
  const headers = ['Nama RS', 'Tipe', 'Kota', 'Provinsi', 'Total Bed', 'Bed Tersedia', 'ICU Total', 'ICU Tersedia', 'BPJS', 'Akreditasi'];
  const lines = rows.map((h) =>
    [
      `"${h.name.replace(/"/g, '""')}"`,
      TYPE_LABEL[h.type] ?? h.type,
      h.city,
      h.province ?? '',
      h.total_beds,
      h.available_beds,
      h.icu_total,
      h.icu_available,
      isBpjs(h) ? 'Ya' : 'Tidak',
      h.accreditation ?? '',
    ].join(','),
  );
  const csv = [headers.join(','), ...lines].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `rumah-sakit-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-komponen TypeBadge
// ─────────────────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const c = TYPE_BADGE_COLORS[type] ?? { bg: '#f5f5f5', color: '#616161' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 999,
      fontSize: 11, fontWeight: 600, background: c.bg, color: c.color, whiteSpace: 'nowrap',
    }}>
      {TYPE_LABEL[type] ?? type}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel Detail Rumah Sakit (kanan)
// ─────────────────────────────────────────────────────────────────────────────

interface DetailPanelProps {
  hospital: HospitalRow | null;
  onEdit: (h: HospitalRow) => void;
  onDeactivate: (h: HospitalRow) => void;
}

function DetailPanel({ hospital, onEdit, onDeactivate }: DetailPanelProps) {
  if (!hospital) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: 'var(--color-muted)', padding: 40, textAlign: 'center', gap: 12,
      }}>
        <div style={{ fontSize: 48, opacity: 0.35 }}>🏥</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          Pilih rumah sakit
        </div>
        <div style={{ fontSize: 13 }}>Klik salah satu baris untuk melihat detail lengkap.</div>
      </div>
    );
  }

  const h = hospital;
  const bedPct = h.total_beds > 0
    ? Math.round((h.available_beds / h.total_beds) * 100)
    : 0;

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', height: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10, background: 'var(--color-accent-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, flexShrink: 0,
          }}>🏥</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3, marginBottom: 6 }}>
              {h.name}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <TypeBadge type={h.type} />
              {isBpjs(h) && (
                <span style={{
                  display: 'inline-block', padding: '2px 8px', borderRadius: 999,
                  fontSize: 11, fontWeight: 600,
                  background: 'var(--color-success-bg)', color: 'var(--color-success)',
                }}>
                  ✓ BPJS
                </span>
              )}
              {h.is_emt_partner && (
                <span style={{
                  display: 'inline-block', padding: '2px 8px', borderRadius: 999,
                  fontSize: 11, fontWeight: 600,
                  background: 'var(--color-warning-bg)', color: 'var(--color-warning)',
                }}>
                  🚑 Mitra EMT
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tombol aksi */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`}
            style={{ flex: 1 }}
            onClick={() => onEdit(h)}
          >
            ✎ Edit RS
          </button>
          <button
            className={`${styles.btn} ${styles.btnSm} ${styles.btnDangerOutline}`}
            onClick={() => onDeactivate(h)}
          >
            ⊘ Nonaktifkan
          </button>
        </div>
      </div>

      <hr className={styles.divider} />

      {/* Info Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {([
          ['Kode RS',    h.license_number ?? '—'],
          ['Alamat',     h.address],
          ['Kota',       h.city],
          ['Provinsi',   h.province ?? '—'],
          ['Telepon',    h.phone ?? '—'],
          ['IGD',        h.igd_phone ?? '—'],
          ['Akreditasi', h.accreditation ?? '—'],
        ] as [string, string][]).map(([label, value]) => (
          <div key={label} style={{
            display: 'grid', gridTemplateColumns: '100px 1fr',
            gap: '6px 12px', padding: '7px 0',
            borderBottom: '1px solid var(--color-border)',
          }}>
            <span style={{ fontSize: 11, color: 'var(--color-muted)', fontWeight: 500 }}>{label}</span>
            <span style={{ fontSize: 13, wordBreak: 'break-word' }}>{value}</span>
          </div>
        ))}
      </div>

      <hr className={styles.divider} style={{ marginTop: 16 }} />

      {/* Kapasitas */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Kapasitas Tempat Tidur</div>
        <div className={styles.responsiveTwoCol} style={{ marginBottom: 12 }}>
          {([
            ['Total Bed',     h.total_beds],
            ['Tersedia',      h.available_beds],
            ['ICU Total',     h.icu_total],
            ['ICU Tersedia',  h.icu_available],
          ] as [string, number][]).map(([lbl, val]) => (
            <div key={lbl} style={{
              background: 'var(--color-surface-2)', borderRadius: 8,
              padding: '10px 14px', border: '1px solid var(--color-border)',
            }}>
              <div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 4 }}>{lbl}</div>
              <div style={{
                fontSize: 20, fontWeight: 700,
                color: (lbl === 'Tersedia' || lbl === 'ICU Tersedia')
                  ? bedColor(val, lbl === 'Tersedia' ? h.total_beds : h.icu_total)
                  : undefined,
              }}>
                {val ?? '—'}
              </div>
            </div>
          ))}
        </div>
        {h.total_beds > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-muted)', marginBottom: 4 }}>
              <span>Ketersediaan Bed</span>
              <span>{bedPct}%</span>
            </div>
            <div style={{ height: 6, background: 'var(--color-border)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 999,
                width: `${bedPct}%`,
                background: bedPct > 50
                  ? 'var(--color-success, #16a34a)'
                  : bedPct > 20
                    ? 'var(--color-warning, #d97706)'
                    : 'var(--color-danger, #dc2626)',
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
        )}
      </div>

      {/* Spesialisasi */}
      {h.specializations && h.specializations.length > 0 && (
        <>
          <hr className={styles.divider} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Spesialisasi</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {h.specializations.map((spec) => (
                <span key={spec} style={{
                  padding: '3px 10px', borderRadius: 999, fontSize: 11,
                  background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
                  color: 'var(--color-text-secondary)',
                }}>
                  {spec}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal Form Rumah Sakit (Add / Edit)
// ─────────────────────────────────────────────────────────────────────────────

interface HospitalFormModalProps {
  title: string;
  initial: CreateHospitalForm;
  onClose: () => void;
  onSubmit: (form: CreateHospitalForm) => Promise<void>;
}

function HospitalFormModal({ title, initial, onClose, onSubmit }: HospitalFormModalProps) {
  const [form, setForm] = useState<CreateHospitalForm>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof CreateHospitalForm, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = (): boolean => {
    const errs: Partial<Record<keyof CreateHospitalForm, string>> = {};
    if (!form.name.trim())    errs.name    = 'Nama RS wajib diisi';
    if (!form.address.trim()) errs.address = 'Alamat wajib diisi';
    if (!form.city.trim())    errs.city    = 'Kota wajib diisi';
    if (!form.type)           errs.type    = 'Tipe RS wajib dipilih';
    if (!form.kodeRS?.trim()) errs.kodeRS  = 'Kode/Nomor RS wajib diisi (unik)';
    if (form.totalBeds < 0)   errs.totalBeds = 'Jumlah bed tidak boleh negatif';
    if (form.phone && form.phone.trim().length > 0 && form.phone.trim().length < 8) {
      errs.phone = 'Nomor telepon minimal 8 karakter';
    }
    if (form.igdPhone && form.igdPhone.trim().length > 0 && form.igdPhone.trim().length < 8) {
      errs.igdPhone = 'Nomor telepon IGD minimal 8 karakter';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await onSubmit(form);
    } finally {
      setSubmitting(false);
    }
  };

  const set = <K extends keyof CreateHospitalForm>(key: K, val: CreateHospitalForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const typeOptions = HOSPITAL_TYPES.filter((t) => t.value !== '').map((t) => ({
    value: t.value as string, label: t.label,
  }));

  return (
    <Modal open title={title} onClose={onClose} width={600}>
      <form onSubmit={handleSubmit} noValidate>
        <div className={styles.responsiveTwoCol}>
          <div style={{ gridColumn: '1 / -1' }}>
            <InputField
              label="Nama Rumah Sakit" required value={form.name}
              onChange={(e) => set('name', e.target.value)}
              error={errors.name} placeholder="Nama lengkap RS"
            />
          </div>
          <SelectField
            label="Tipe RS" required value={form.type}
            onChange={(e) => set('type', e.target.value as HospitalType)}
            options={typeOptions} error={errors.type}
          />
          <InputField
            label="Kode / No. Izin RS" required value={form.kodeRS ?? ''}
            onChange={(e) => set('kodeRS', e.target.value)}
            error={errors.kodeRS}
            placeholder="Contoh: RS-0001-JKT"
          />
          <div style={{ gridColumn: '1 / -1' }}>
            <InputField
              label="Alamat" required value={form.address}
              onChange={(e) => set('address', e.target.value)}
              error={errors.address} placeholder="Alamat lengkap"
            />
          </div>
          <InputField
            label="Kota" required value={form.city}
            onChange={(e) => set('city', e.target.value)}
            error={errors.city} placeholder="Nama kota"
          />
          <InputField
            label="Provinsi" value={form.province ?? ''}
            onChange={(e) => set('province', e.target.value || undefined)}
            placeholder="Opsional"
          />
          <InputField
            label="Telepon" type="tel" value={form.phone ?? ''}
            onChange={(e) => set('phone', e.target.value || undefined)}
            placeholder="Opsional"
          />
          <InputField
            label="Telepon IGD" type="tel" value={form.igdPhone ?? ''}
            onChange={(e) => set('igdPhone', e.target.value || undefined)}
            placeholder="Opsional"
          />
          <InputField
            label="Total Tempat Tidur" type="number" value={String(form.totalBeds)}
            onChange={(e) => set('totalBeds', Number(e.target.value))}
            error={errors.totalBeds}
          />
          <InputField
            label="Akreditasi" value={form.accreditation ?? ''}
            onChange={(e) => set('accreditation', e.target.value || undefined)}
            placeholder="Opsional (misal: Paripurna)"
          />
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              id="bpjs-check"
              className={styles.checkbox}
              checked={form.isBPJSProvider}
              onChange={(e) => set('isBPJSProvider', e.target.checked)}
            />
            <label htmlFor="bpjs-check" style={{ fontSize: 14, cursor: 'pointer' }}>
              Menerima BPJS Kesehatan
            </label>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose} disabled={submitting}>
            Batal
          </button>
          <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={submitting}>
            {submitting ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Komponen Utama HospitalsPage
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_FORM: CreateHospitalForm = {
  name: '', type: 'TYPE_C', address: '', city: '',
  kodeRS: '', totalBeds: 0, isBPJSProvider: false,
};

export default function HospitalsPage() {
  const { showToast } = useToast();

  // ── State data ──
  const [hospitals, setHospitals]   = useState<HospitalRow[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [total, setTotal]           = useState(0);

  // ── State filter ──
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter,  setTypeFilter]  = useState<HospitalType | ''>('');
  const [bpjsOnly]                    = useState(false);
  const [page, setPage]               = useState(1);
  const LIMIT = 20;

  // ── State UI ──
  const [selectedHospital,  setSelectedHospital]  = useState<HospitalRow | null>(null);
  const [showAddModal,      setShowAddModal]       = useState(false);
  const [editHospital,      setEditHospital]       = useState<HospitalRow | null>(null);
  const [deactivateTarget,  setDeactivateTarget]   = useState<HospitalRow | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  // ── Fetch rumah sakit ──
  const fetchHospitals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (searchQuery) params.set('search', searchQuery);
      if (typeFilter)  params.set('type', typeFilter);
      const res = await hospitalClient.get(`/v1/hospitals?${params.toString()}`);
      const body = res.data as { data: HospitalRow[]; meta: { total: number } };
      setHospitals(body.data ?? []);
      setTotal(body.meta?.total ?? 0);
    } catch (err: unknown) {
      const msg = getErrorMessage(err, 'Gagal memuat daftar rumah sakit. Silakan coba lagi.');
      setError(msg);
      setHospitals([]);
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, typeFilter]);

  useEffect(() => { void fetchHospitals(); }, [fetchHospitals]);

  // ── Debounce search ──
  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearchQuery(value), 400);
  };

  // ── Handler CRUD ──
  const handleAddSubmit = async (form: CreateHospitalForm) => {
    try {
      await hospitalClient.post('/v1/hospitals', {
        name:            form.name,
        type:            form.type,
        licenseNumber:   form.kodeRS!,
        address:         form.address,
        city:            form.city,
        province:        form.province ?? '-',
        latitude:        0,
        longitude:       0,
        phone:           form.phone ?? '-',
        igdPhone:        form.igdPhone,
        totalBeds:       form.totalBeds,
        icuTotal:        0,
        specializations: [],
        isEmtPartner:    false,
      });
      setShowAddModal(false);
      showToast('Rumah sakit berhasil ditambahkan', 'success');
      void fetchHospitals();
    } catch (err) {
      showToast(getErrorMessage(err, 'Gagal menambahkan rumah sakit'), 'error');
    }
  };

  const handleEditSubmit = async (form: CreateHospitalForm) => {
    if (!editHospital) return;
    try {
      await hospitalClient.patch(`/v1/hospitals/${editHospital.id}`, {
        name:      form.name,
        type:      form.type,
        address:   form.address,
        city:      form.city,
        province:  form.province,
        phone:     form.phone,
        igdPhone:  form.igdPhone,
        totalBeds: form.totalBeds,
      });
      setEditHospital(null);
      showToast('Data rumah sakit berhasil diperbarui', 'success');
      setSelectedHospital(null);
      void fetchHospitals();
    } catch (err) {
      showToast(getErrorMessage(err, 'Gagal memperbarui data rumah sakit'), 'error');
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    const id = deactivateTarget.id;
    setDeactivateTarget(null);
    if (selectedHospital?.id === id) setSelectedHospital(null);
    try {
      await hospitalClient.delete(`/v1/hospitals/${id}`);
      showToast('Rumah sakit berhasil dinonaktifkan', 'success');
      void fetchHospitals();
    } catch (err) {
      showToast(getErrorMessage(err, 'Gagal menonaktifkan rumah sakit'), 'error');
    }
  };

  // ── Statistik ringkasan ──
  const totalBeds      = hospitals.reduce((s, h) => s + h.total_beds, 0);
  const totalAvailable = hospitals.reduce((s, h) => s + h.available_beds, 0);
  const totalBpjs      = hospitals.filter((h) => isBpjs(h)).length;
  const totalIcu       = hospitals.reduce((s, h) => s + h.icu_available, 0);

  // ── Paginasi ──
  const pageCount = Math.max(1, Math.ceil(total / LIMIT));

  const fmtBeds = (available: number, tot: number) =>
    tot === 0 ? '—' : `${available} / ${tot}`;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Manajemen Rumah Sakit"
        subtitle={`${total.toLocaleString('id-ID')} rumah sakit terdaftar`}
        breadcrumbs={[{ label: 'Beranda', to: '/' }, { label: 'Rumah Sakit' }]}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={`${styles.btn} ${styles.btnOutline}`}
              onClick={() => exportCSV(hospitals)}
              title="Ekspor halaman ini ke CSV"
            >
              ⬇ Ekspor CSV
            </button>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setShowAddModal(true)}>
              + Tambah RS
            </button>
          </div>
        }
      />

      {/* ── Stat Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total RS',       value: total,         icon: '🏥', color: 'var(--color-primary)' },
          { label: 'Bed Tersedia',   value: totalAvailable, icon: '🛏',  color: 'var(--color-success, #16a34a)' },
          { label: 'ICU Tersedia',   value: totalIcu,       icon: '🏨', color: 'var(--color-warning, #d97706)' },
          { label: 'Terima BPJS',    value: totalBpjs,      icon: '✅', color: 'var(--color-accent)' },
        ].map((s) => (
          <div key={s.label} style={{
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 10, padding: '14px 16px',
            borderTop: `3px solid ${s.color}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                {loading
                  ? <Skeleton width={60} height={28} borderRadius={4} />
                  : <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value.toLocaleString('id-ID')}</div>
                }
                <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 4 }}>{s.label}</div>
              </div>
              <span style={{ fontSize: 22, opacity: 0.7 }}>{s.icon}</span>
            </div>
          </div>
        ))}
        {/* Info total bed */}
        <div style={{
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 10, padding: '14px 16px',
          borderTop: `3px solid var(--color-muted)`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              {loading
                ? <Skeleton width={60} height={28} borderRadius={4} />
                : <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--color-text)' }}>{totalBeds.toLocaleString('id-ID')}</div>
              }
              <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 4 }}>Total Kapasitas Bed</div>
            </div>
            <span style={{ fontSize: 22, opacity: 0.7 }}>🏗</span>
          </div>
        </div>
      </div>

      {/* ── Split View Layout ── */}
      {bpjsOnly && (
        <div className={styles.warningBanner}>
          <span>⚠️</span>
          <span>Filter khusus BPJS belum tersedia di backend Admin, sehingga dinonaktifkan agar pagination tetap akurat.</span>
        </div>
      )}

      <div className={styles.contentSplit} style={!selectedHospital ? { gridTemplateColumns: 'minmax(0, 1fr)' } : undefined}>
        {/* ── Panel Kiri: Daftar RS ── */}
        <div className={styles.card} style={{ marginBottom: 0 }}>
          {/* Toolbar */}
          <div className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
              <input
                type="search"
                className={styles.searchInput}
                placeholder="Cari nama rumah sakit atau kota..."
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
              <select
                className={styles.filterSelect}
                value={typeFilter}
                onChange={(e) => { setTypeFilter(e.target.value as HospitalType | ''); setPage(1); }}
              >
                {HOSPITAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {/* Filter BPJS */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input
                  type="checkbox"
                  checked={bpjsOnly}
                  disabled
                  onChange={() => undefined}
                />
                BPJS saja
              </label>
            </div>
          </div>

          {/* Error State */}
          {error && (
            <div className={styles.errorState}>
              <span className={styles.errorStateIcon}>⚠</span>
              <span>{error}</span>
              <button
                className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`}
                style={{ marginLeft: 'auto' }}
                onClick={() => void fetchHospitals()}
              >
                Coba Lagi
              </button>
            </div>
          )}

          {/* Tabel */}
          {!error && (
            <div className={styles.tableWrapper}>
              <table className={styles.table} style={{ minWidth: 500 }}>
                <thead>
                  <tr>
                    <th>Nama RS</th>
                    <th>Tipe</th>
                    <th>Kota</th>
                    <th style={{ textAlign: 'center' }}>Bed Tersedia</th>
                    <th style={{ textAlign: 'center' }}>ICU</th>
                    <th style={{ textAlign: 'center' }}>BPJS</th>
                    <th>Akreditasi</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 7 }).map((__, j) => (
                          <td key={j}>
                            <Skeleton height={14} width={j === 0 ? '70%' : '55%'} borderRadius={3} />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : hospitals.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <div className={styles.emptyState}>
                          <div className={styles.emptyStateIcon}>🏥</div>
                          <div className={styles.emptyStateTitle}>Tidak ada rumah sakit</div>
                          <div className={styles.emptyStateDesc}>
                            {searchInput || typeFilter || bpjsOnly
                              ? 'Tidak ada RS yang cocok dengan filter.'
                              : 'Belum ada rumah sakit terdaftar.'}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    hospitals.map((h) => (
                      <tr
                        key={h.id}
                        style={{
                          cursor: 'pointer',
                          background: selectedHospital?.id === h.id ? 'var(--color-accent-light)' : undefined,
                        }}
                        onClick={() => setSelectedHospital((prev) => prev?.id === h.id ? null : h)}
                      >
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{h.name}</div>
                          {h.license_number && (
                            <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                              <code>{h.license_number}</code>
                            </div>
                          )}
                        </td>
                        <td><TypeBadge type={h.type} /></td>
                        <td style={{ fontSize: 13 }}>{h.city}</td>
                        <td style={{ textAlign: 'center', fontSize: 13 }}>
                          <span style={{
                            fontWeight: 600,
                            color: bedColor(h.available_beds, h.total_beds),
                          }}>
                            {fmtBeds(h.available_beds, h.total_beds)}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', fontSize: 13 }}>
                          <span style={{
                            fontWeight: 600,
                            color: bedColor(h.icu_available, h.icu_total),
                          }}>
                            {h.icu_total > 0 ? `${h.icu_available}/${h.icu_total}` : '—'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {isBpjs(h)
                            ? <span style={{ color: 'var(--color-success, #16a34a)', fontWeight: 700, fontSize: 13 }}>✓</span>
                            : <span style={{ color: 'var(--color-muted)', fontSize: 13 }}>—</span>
                          }
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                          {h.accreditation ?? '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginasi */}
          {!error && (
            <div className={styles.pagination}>
              <span className={styles.paginationInfo}>
                {total === 0 ? 'Tidak ada data' : `Total: ${total.toLocaleString('id-ID')} RS`}
              </span>
              <div className={styles.paginationControls}>
                <button className={styles.pageBtn} onClick={() => setPage(1)} disabled={page === 1}>«</button>
                <button className={styles.pageBtn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
                <span style={{ padding: '0 10px', fontSize: 13, lineHeight: '32px' }}>
                  {page} / {pageCount}
                </span>
                <button className={styles.pageBtn} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount}>›</button>
                <button className={styles.pageBtn} onClick={() => setPage(pageCount)} disabled={page >= pageCount}>»</button>
              </div>
            </div>
          )}
        </div>

        {/* ── Panel Kanan: Detail RS ── */}
        {selectedHospital && (
          <div
            className={styles.card}
            style={{ marginBottom: 0, padding: 0, minHeight: 500, position: 'sticky', top: 24 }}
          >
            <DetailPanel
              hospital={selectedHospital}
              onEdit={(h) => setEditHospital(h)}
              onDeactivate={(h) => setDeactivateTarget(h)}
            />
          </div>
        )}
      </div>

      {/* ── Modal Tambah RS ── */}
      {showAddModal && (
        <HospitalFormModal
          title="Tambah Rumah Sakit Baru"
          initial={EMPTY_FORM}
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAddSubmit}
        />
      )}

      {/* ── Modal Edit RS ── */}
      {editHospital && (
        <HospitalFormModal
          title={`Edit: ${editHospital.name}`}
          initial={{
            name:          editHospital.name,
            type:          editHospital.type,
            kodeRS:        editHospital.license_number,
            address:       editHospital.address,
            city:          editHospital.city,
            province:      editHospital.province,
            phone:         editHospital.phone,
            igdPhone:      editHospital.igd_phone,
            totalBeds:     editHospital.total_beds,
            accreditation: editHospital.accreditation,
            isBPJSProvider: isBpjs(editHospital),
          }}
          onClose={() => setEditHospital(null)}
          onSubmit={handleEditSubmit}
        />
      )}

      {/* ── Konfirmasi Nonaktifkan RS ── */}
      <ConfirmDialog
        open={deactivateTarget !== null}
        title="Nonaktifkan Rumah Sakit"
        message={`Yakin ingin menonaktifkan "${deactivateTarget?.name ?? ''}"? RS tidak akan muncul di pencarian publik. Data tetap tersimpan dan dapat diaktifkan kembali oleh administrator database.`}
        confirmLabel="Nonaktifkan"
        danger
        onConfirm={handleDeactivate}
        onCancel={() => setDeactivateTarget(null)}
      />
    </div>
  );
}
