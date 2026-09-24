import { useEffect, useState, useCallback } from 'react';
import { ambulanceClient, hospitalClient } from '../api/client';
import type { Ambulance, AmbulanceStatus, PaginationMeta } from '../types/admin';
import { Modal, ConfirmDialog } from '../components/Modal';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import { InputField, SelectField } from '../components/FormField';
import { Skeleton } from '../components/Skeleton';
import styles from './Page.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Konstanta — sesuai enum backend ambulance-service
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: AmbulanceStatus | ''; label: string }[] = [
  { value: '',             label: 'Semua Status' },
  { value: 'AVAILABLE',    label: 'Tersedia' },
  { value: 'OFFLINE',      label: 'Offline' },
  { value: 'DISPATCHED',   label: 'Dikirim' },
  { value: 'EN_ROUTE',     label: 'Dalam Perjalanan' },
  { value: 'AT_SCENE',     label: 'Di Lokasi' },
  { value: 'TRANSPORTING', label: 'Mengangkut' },
  { value: 'RETURNING',    label: 'Kembali' },
];

const STATUS_STYLE: Record<AmbulanceStatus, { bg: string; color: string }> = {
  AVAILABLE:    { bg: 'var(--color-success-bg)', color: 'var(--color-success)' },
  OFFLINE:      { bg: 'var(--color-danger-bg)',  color: 'var(--color-danger)' },
  DISPATCHED:   { bg: 'var(--color-warning-bg)', color: 'var(--color-warning)' },
  EN_ROUTE:     { bg: '#fff3e0',                 color: '#e65100' },
  AT_SCENE:     { bg: '#ede7f6',                 color: '#7b1fa2' },
  TRANSPORTING: { bg: 'var(--color-info-bg)',    color: 'var(--color-primary)' },
  RETURNING:    { bg: '#e8f5e9',                 color: '#2e7d32' },
};

const STATUS_LABEL: Record<AmbulanceStatus, string> = {
  AVAILABLE:    'Tersedia',
  OFFLINE:      'Offline',
  DISPATCHED:   'Dikirim',
  EN_ROUTE:     'Dalam Perjalanan',
  AT_SCENE:     'Di Lokasi',
  TRANSPORTING: 'Mengangkut',
  RETURNING:    'Kembali',
};

const TYPE_OPTIONS = [
  { value: 'BLS',  label: 'BLS — Basic Life Support' },
  { value: 'ALS',  label: 'ALS — Advanced Life Support' },
  { value: 'NICU', label: 'NICU — Neonatal ICU' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Form shape
// ─────────────────────────────────────────────────────────────────────────────

interface AmbulanceForm {
  hospitalId:  string;
  plateNumber: string;
  type:        'BLS' | 'ALS' | 'NICU';
  driverId:    string;
}

const EMPTY_FORM: AmbulanceForm = {
  hospitalId:  '',
  plateNumber: '',
  type:        'BLS',
  driverId:    '',
};

interface HospitalOption { id: string; name: string; }

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatCoord(lat: string | null, lon: string | null): string {
  if (!lat || !lon) return '—';
  return `${parseFloat(lat).toFixed(4)}, ${parseFloat(lon).toFixed(4)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// AmbulancesPage
// ─────────────────────────────────────────────────────────────────────────────

export default function AmbulancesPage() {
  const { showToast } = useToast();

  const [rows, setRows]         = useState<Ambulance[]>([]);
  const [meta, setMeta]         = useState<PaginationMeta | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const [status, setStatus]     = useState<AmbulanceStatus | ''>('');
  const [page, setPage]         = useState(1);
  const [limit]                 = useState(20);

  const [selected, setSelected] = useState<Ambulance | null>(null);

  // ── Hospitals list untuk form ──
  const [hospitals, setHospitals] = useState<HospitalOption[]>([]);

  // ── Modal states ──
  const [showAdd,  setShowAdd]  = useState(false);
  const [editRow,  setEditRow]  = useState<Ambulance | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Ambulance | null>(null);

  const [form, setForm]         = useState<AmbulanceForm>(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ── Fetch hospitals for form dropdown ──
  useEffect(() => {
    hospitalClient.get<{ data: HospitalOption[] }>('/v1/hospitals?limit=100')
      .then((r) => setHospitals(r.data.data ?? []))
      .catch(() => {/* abaikan — form tetap bisa diisi manual */});
  }, []);

  // ── Fetch ambulances ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });

      const res = await ambulanceClient.get<{
        data: Ambulance[];
        meta?: PaginationMeta;
      }>(`/v1/ambulances?${params.toString()}`);

      let data: Ambulance[] = res.data.data ?? [];
      if (status) data = data.filter((a) => a.status === status);

      setRows(data);
      setMeta(res.data.meta ?? null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat data ambulans';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [page, limit, status, showToast]);

  useEffect(() => { void fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [status]);

  // ── Buka modal tambah ──
  const openAdd = () => {
    setForm(EMPTY_FORM);
    setShowAdd(true);
  };

  // ── Buka modal edit ──
  const openEdit = (row: Ambulance) => {
    setForm({
      hospitalId:  row.hospital_id ?? '',
      plateNumber: row.plate_number ?? '',
      type:        'BLS',
      driverId:    row.driver_id ?? '',
    });
    setEditRow(row);
  };

  // ── Submit tambah ──
  const handleAddSubmit = async () => {
    if (!form.hospitalId || !form.plateNumber) {
      showToast('ID Rumah Sakit dan Plat Nomor wajib diisi', 'error');
      return;
    }
    setSaving(true);
    try {
      await ambulanceClient.post('/v1/ambulances', {
        hospitalId:  form.hospitalId,
        plateNumber: form.plateNumber.toUpperCase(),
        type:        form.type,
        ...(form.driverId ? { driverId: form.driverId } : {}),
      });
      showToast('Ambulans berhasil ditambahkan', 'success');
      setShowAdd(false);
      void fetchData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menambahkan ambulans';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Submit edit ──
  const handleEditSubmit = async () => {
    if (!editRow) return;
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      if (form.hospitalId  && form.hospitalId  !== editRow.hospital_id)  payload['hospitalId']  = form.hospitalId;
      if (form.plateNumber && form.plateNumber !== editRow.plate_number) payload['plateNumber'] = form.plateNumber.toUpperCase();
      if (form.type)                                                       payload['type']        = form.type;
      if (form.driverId    !== (editRow.driver_id ?? ''))                  payload['driverId']    = form.driverId || null as unknown as string;

      await ambulanceClient.patch(`/v1/ambulances/${editRow.id}`, payload);
      showToast('Ambulans berhasil diperbarui', 'success');
      setEditRow(null);
      void fetchData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memperbarui ambulans';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Nonaktifkan ambulans ──
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await ambulanceClient.delete(`/v1/ambulances/${deleteTarget.id}`);
      showToast(`Ambulans ${deleteTarget.plate_number ?? deleteTarget.id.slice(0, 8)} berhasil dinonaktifkan`, 'success');
      setDeleteTarget(null);
      void fetchData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menonaktifkan ambulans';
      showToast(msg, 'error');
    } finally {
      setDeleting(false);
    }
  };

  // ── Status summary counts (semua, tanpa filter) ──
  const counts = (['AVAILABLE', 'OFFLINE', 'DISPATCHED', 'EN_ROUTE', 'AT_SCENE', 'TRANSPORTING', 'RETURNING'] as AmbulanceStatus[]).map(
    (s) => ({ status: s, count: rows.filter((r) => r.status === s).length }),
  );

  // ── Opsi RS untuk dropdown ──
  const hospitalSelectOpts = [
    { value: '', label: 'Pilih Rumah Sakit…' },
    ...hospitals.map((h) => ({ value: h.id, label: h.name })),
  ];

  // ── Render ──
  return (
    <div className={styles.page}>
      <PageHeader
        title="Manajemen Ambulans"
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Ambulans' }]}
        actions={
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={openAdd}>
            + Tambah Ambulans
          </button>
        }
      />

      {/* ── Status Summary Cards ── */}
      <div className={styles.statGrid}>
        {counts.map(({ status: s, count }) => (
          <div key={s} className={styles.statCard}>
            <div className={styles.statValue} style={{ fontSize: 28, color: STATUS_STYLE[s].color }}>
              {count}
            </div>
            <div className={styles.statLabel}>{STATUS_LABEL[s]}</div>
          </div>
        ))}
      </div>

      {/* ── Filter ── */}
      <div className={styles.card}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '0 1 200px' }}>
            <SelectField
              label="Filter Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as AmbulanceStatus | '')}
              options={STATUS_OPTIONS}
            />
          </div>
          <button
            className={`${styles.btn} ${styles.btnOutline}`}
            onClick={() => { setStatus(''); setPage(1); }}
          >Reset</button>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={fetchData}
            style={{ marginLeft: 'auto' }}
          >↻ Muat Ulang</button>
        </div>
      </div>

      {/* ── Tabel ── */}
      <div className={styles.card} style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 'var(--space-6)' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} height={36} style={{ marginBottom: 'var(--space-2)' }} />
            ))}
          </div>
        ) : error ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>⚠️</div>
            <div className={styles.emptyTitle}>Gagal memuat data</div>
            <div className={styles.emptyDesc}>{error}</div>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={fetchData}>Coba Lagi</button>
          </div>
        ) : rows.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🚑</div>
            <div className={styles.emptyTitle}>Tidak ada ambulans</div>
            <div className={styles.emptyDesc}>Belum ada data ambulans yang terdaftar.</div>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={`${styles.table} ${styles.tableHover}`}>
              <thead>
                <tr>
                  <th>Plat Nomor</th>
                  <th>Rumah Sakit</th>
                  <th>Status</th>
                  <th>Telepon Pengemudi</th>
                  <th>Koordinat</th>
                  <th>Kecepatan</th>
                  <th>Update Lokasi</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} onClick={() => setSelected(row)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 700, letterSpacing: 1 }}>
                      {row.plate_number ?? <span style={{ color: 'var(--color-muted)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 'var(--text-sm)' }}>
                      {row.hospital_name ?? <span style={{ color: 'var(--color-muted)' }}>—</span>}
                    </td>
                    <td>
                      <span className={styles.badge} style={STATUS_STYLE[row.status]}>
                        {STATUS_LABEL[row.status]}
                      </span>
                    </td>
                    <td style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>
                      {row.driver_phone ?? '—'}
                    </td>
                    <td style={{ fontSize: 'var(--text-xs)', fontFamily: 'monospace', color: 'var(--color-muted)' }}>
                      {formatCoord(row.latitude, row.longitude)}
                    </td>
                    <td style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>
                      {row.speed_kmh != null ? `${row.speed_kmh} km/j` : '—'}
                    </td>
                    <td style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                      {formatDateTime(row.last_location_at)}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                        <button
                          className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                          onClick={() => openEdit(row)}
                          title="Edit ambulans"
                        >
                          Edit
                        </button>
                        <button
                          className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}
                          onClick={() => setDeleteTarget(row)}
                          title="Nonaktifkan ambulans"
                        >
                          Nonaktifkan
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {meta && meta.totalPages > 1 && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: 'var(--space-3) var(--space-4)',
            borderTop: '1px solid var(--color-border)',
            fontSize: 'var(--text-sm)', color: 'var(--color-muted)',
          }}>
            <span>Total: {meta.total} ambulans</span>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button
                className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >← Sebelumnya</button>
              <span style={{ lineHeight: '28px' }}>Hal. {page} / {meta.totalPages}</span>
              <button
                className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >Berikutnya →</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal Detail ── */}
      {selected && (
        <Modal open onClose={() => setSelected(null)} title={`Detail Ambulans — ${selected.plate_number ?? selected.id.slice(0, 8)}`} width={520}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
            <tbody>
              {[
                { label: 'ID', value: <code style={{ fontSize: 'var(--text-xs)' }}>{selected.id}</code> },
                { label: 'Plat Nomor', value: selected.plate_number ?? '—' },
                { label: 'Rumah Sakit', value: selected.hospital_name ?? '—' },
                { label: 'ID RS', value: selected.hospital_id ?? '—' },
                { label: 'Status', value: (
                  <span className={styles.badge} style={STATUS_STYLE[selected.status]}>
                    {STATUS_LABEL[selected.status]}
                  </span>
                )},
                { label: 'ID Pengemudi', value: selected.driver_id ?? '—' },
                { label: 'Telepon Pengemudi', value: selected.driver_phone ?? '—' },
                { label: 'Koordinat', value: formatCoord(selected.latitude, selected.longitude) },
                { label: 'Arah (heading)', value: selected.heading != null ? `${selected.heading}°` : '—' },
                { label: 'Kecepatan', value: selected.speed_kmh != null ? `${selected.speed_kmh} km/jam` : '—' },
                { label: 'Update Lokasi Terakhir', value: formatDateTime(selected.last_location_at) },
              ].map(({ label, value }) => (
                <tr key={label} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-muted)', fontWeight: 600, width: '45%' }}>{label}</td>
                  <td style={{ padding: 'var(--space-2) var(--space-3)' }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 'var(--space-4)', display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
            <button className={`${styles.btn} ${styles.btnOutline}`} onClick={() => { setSelected(null); openEdit(selected); }}>
              Edit
            </button>
            <button className={`${styles.btn} ${styles.btnOutline}`} onClick={() => setSelected(null)}>Tutup</button>
          </div>
        </Modal>
      )}

      {/* ── Modal Tambah ── */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Tambah Ambulans Baru" width={480}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <SelectField
            label="Rumah Sakit *"
            value={form.hospitalId}
            onChange={(e) => setForm((f) => ({ ...f, hospitalId: e.target.value }))}
            options={hospitalSelectOpts}
          />
          <InputField
            label="Plat Nomor *"
            value={form.plateNumber}
            onChange={(e) => setForm((f) => ({ ...f, plateNumber: e.target.value }))}
            placeholder="Contoh: B 1234 ABC"
          />
          <SelectField
            label="Tipe Ambulans"
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as AmbulanceForm['type'] }))}
            options={TYPE_OPTIONS}
          />
          <InputField
            label="ID Pengemudi (opsional)"
            value={form.driverId}
            onChange={(e) => setForm((f) => ({ ...f, driverId: e.target.value }))}
            placeholder="UUID pengemudi…"
          />
        </div>
        <div style={{ marginTop: 'var(--space-5)', display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
          <button className={`${styles.btn} ${styles.btnOutline}`} onClick={() => setShowAdd(false)} disabled={saving}>Batal</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleAddSubmit} disabled={saving}>
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </Modal>

      {/* ── Modal Edit ── */}
      <Modal open={!!editRow} onClose={() => setEditRow(null)} title={`Edit Ambulans — ${editRow?.plate_number ?? ''}`} width={480}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <SelectField
            label="Rumah Sakit"
            value={form.hospitalId}
            onChange={(e) => setForm((f) => ({ ...f, hospitalId: e.target.value }))}
            options={hospitalSelectOpts}
          />
          <InputField
            label="Plat Nomor"
            value={form.plateNumber}
            onChange={(e) => setForm((f) => ({ ...f, plateNumber: e.target.value }))}
          />
          <SelectField
            label="Tipe Ambulans"
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as AmbulanceForm['type'] }))}
            options={TYPE_OPTIONS}
          />
          <InputField
            label="ID Pengemudi (kosongkan untuk hapus)"
            value={form.driverId}
            onChange={(e) => setForm((f) => ({ ...f, driverId: e.target.value }))}
            placeholder="UUID pengemudi…"
          />
        </div>
        <div style={{ marginTop: 'var(--space-5)', display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
          <button className={`${styles.btn} ${styles.btnOutline}`} onClick={() => setEditRow(null)} disabled={saving}>Batal</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleEditSubmit} disabled={saving}>
            {saving ? 'Menyimpan…' : 'Perbarui'}
          </button>
        </div>
      </Modal>

      {/* ── Confirm Delete ── */}
      {deleteTarget && (
        <ConfirmDialog
          open
          title="Nonaktifkan Ambulans"
          message={`Ambulans "${deleteTarget.plate_number ?? deleteTarget.id.slice(0, 8)}" akan dinonaktifkan. Tindakan ini dapat dibatalkan oleh admin.`}
          confirmLabel={deleting ? 'Menonaktifkan…' : 'Nonaktifkan'}
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
