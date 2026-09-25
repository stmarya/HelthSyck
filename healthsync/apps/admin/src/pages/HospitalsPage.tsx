import { useCallback, useEffect, useState } from 'react';
import { hospitalClient } from '../api/client';
import type { HospitalType } from '../types/admin';
import { ConfirmDialog, Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import { InputField, SelectField } from '../components/FormField';
import { Skeleton } from '../components/Skeleton';
import styles from './Page.module.css';

interface HospitalRow {
  id: string; name: string; type: HospitalType; address: string; city: string; province: string;
  phone: string | null; email?: string | null; igd_phone: string | null;
  latitude: string | number; longitude: string | number;
  total_beds: number; available_beds: number; icu_total: number; icu_available: number;
  specializations: string[] | null; is_emt_partner: boolean;
}
interface HospitalForm {
  name: string; type: HospitalType; licenseNumber: string; address: string; city: string; province: string;
  phone: string; email: string; igdPhone: string; latitude: string; longitude: string;
  totalBeds: string; icuTotal: string; specializations: string; isEmtPartner: boolean;
}
const EMPTY: HospitalForm = {
  name: '', type: 'TYPE_C', licenseNumber: '', address: '', city: '', province: '', phone: '', email: '',
  igdPhone: '', latitude: '', longitude: '', totalBeds: '0', icuTotal: '0', specializations: '', isEmtPartner: false,
};
const TYPES = ['TYPE_A', 'TYPE_B', 'TYPE_C', 'TYPE_D', 'CLINIC', 'PUSKESMAS'] as const;
const TYPE_LABEL: Record<HospitalType, string> = {
  TYPE_A: 'Tipe A', TYPE_B: 'Tipe B', TYPE_C: 'Tipe C', TYPE_D: 'Tipe D', CLINIC: 'Klinik', PUSKESMAS: 'Puskesmas',
};
function errorMessage(error: unknown): string {
  return (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    ?? (error instanceof Error ? error.message : 'Operasi rumah sakit gagal');
}
function csvCell(value: unknown): string { return `"${String(value ?? '').replace(/"/g, '""')}"`; }
function exportCsv(rows: HospitalRow[]): void {
  const data = [['Nama', 'Tipe', 'Kota', 'Provinsi', 'Telepon', 'Total Bed', 'Bed Tersedia', 'ICU Total', 'ICU Tersedia'],
    ...rows.map((row) => [row.name, TYPE_LABEL[row.type], row.city, row.province, row.phone, row.total_beds, row.available_beds, row.icu_total, row.icu_available])];
  const blob = new Blob(['\uFEFF' + data.map((row) => row.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `rumah-sakit-halaman-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
}

function HospitalModal({ initial, editing, onClose, onSave }: {
  initial: HospitalForm; editing: boolean; onClose: () => void; onSave: (value: HospitalForm) => Promise<void>;
}) {
  const [form, setForm] = useState(initial); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const set = <K extends keyof HospitalForm>(key: K, value: HospitalForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    const latitude = Number(form.latitude); const longitude = Number(form.longitude);
    const totalBeds = Number(form.totalBeds); const icuTotal = Number(form.icuTotal);
    if (!form.name.trim() || !form.address.trim() || !form.city.trim() || !form.province.trim()) return setError('Nama, alamat, kota, dan provinsi wajib diisi.');
    if (!editing && form.licenseNumber.trim().length < 1) return setError('Nomor izin rumah sakit wajib diisi.');
    if (form.phone.trim().length < 8) return setError('Nomor telepon minimal 8 karakter.');
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return setError('Latitude harus berada di antara -90 dan 90.');
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return setError('Longitude harus berada di antara -180 dan 180.');
    if (!Number.isInteger(totalBeds) || totalBeds < 0 || !Number.isInteger(icuTotal) || icuTotal < 0 || icuTotal > totalBeds) return setError('Kapasitas bed tidak valid; ICU tidak boleh melebihi total bed.');
    setSaving(true); try { await onSave(form); } catch (saveError) { setError(errorMessage(saveError)); } finally { setSaving(false); }
  };
  return <Modal open title={editing ? 'Edit Rumah Sakit' : 'Tambah Rumah Sakit'} onClose={onClose} width={700}>
    <form onSubmit={(event) => void submit(event)}>
      {error && <div className={styles.errorState}>⚠ {error}</div>}
      <div className={styles.responsiveTwoCol}>
        <InputField label="Nama Rumah Sakit" required value={form.name} onChange={(event) => set('name', event.target.value)} />
        <SelectField label="Tipe" required value={form.type} onChange={(event) => set('type', event.target.value as HospitalType)}
          options={TYPES.map((value) => ({ value, label: TYPE_LABEL[value] }))} />
        {!editing && <InputField label="Nomor Izin" required value={form.licenseNumber} onChange={(event) => set('licenseNumber', event.target.value)} />}
        <InputField label="Telepon" required type="tel" value={form.phone} onChange={(event) => set('phone', event.target.value)} />
        <div style={{ gridColumn: '1 / -1' }}><InputField label="Alamat" required value={form.address} onChange={(event) => set('address', event.target.value)} /></div>
        <InputField label="Kota" required value={form.city} onChange={(event) => set('city', event.target.value)} />
        <InputField label="Provinsi" required value={form.province} onChange={(event) => set('province', event.target.value)} />
        <InputField label="Latitude" required type="number" value={form.latitude} onChange={(event) => set('latitude', event.target.value)} />
        <InputField label="Longitude" required type="number" value={form.longitude} onChange={(event) => set('longitude', event.target.value)} />
        <InputField label="Email" type="email" value={form.email} onChange={(event) => set('email', event.target.value)} />
        <InputField label="Telepon IGD" type="tel" value={form.igdPhone} onChange={(event) => set('igdPhone', event.target.value)} />
        <InputField label="Total Bed" required type="number" value={form.totalBeds} onChange={(event) => set('totalBeds', event.target.value)} />
        <InputField label="Total ICU" required type="number" value={form.icuTotal} onChange={(event) => set('icuTotal', event.target.value)} />
        <div style={{ gridColumn: '1 / -1' }}><InputField label="Spesialisasi (pisahkan dengan koma)" value={form.specializations}
          onChange={(event) => set('specializations', event.target.value)} placeholder="CARDIOLOGY, INTERNAL_MEDICINE" /></div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={form.isEmtPartner}
          onChange={(event) => set('isEmtPartner', event.target.checked)} />Mitra ambulans/EMT</label>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
        <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose}>Batal</button>
        <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</button>
      </div>
    </form>
  </Modal>;
}

export default function HospitalsPage() {
  const { showToast } = useToast(); const [rows, setRows] = useState<HospitalRow[]>([]); const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [page, setPage] = useState(1);
  const [search, setSearch] = useState(''); const [type, setType] = useState<HospitalType | ''>(''); const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<HospitalRow | null>(null); const [deactivating, setDeactivating] = useState<HospitalRow | null>(null);
  const limit = 20;
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const params = new URLSearchParams({ page: String(page), limit: String(limit) }); if (search.trim()) params.set('search', search.trim()); if (type) params.set('type', type);
      const response = await hospitalClient.get<{ data: HospitalRow[]; meta: { total: number } }>(`/v1/hospitals?${params}`);
      setRows(response.data.data ?? []); setTotal(response.data.meta?.total ?? 0);
    } catch (loadError) { setRows([]); setError(errorMessage(loadError)); } finally { setLoading(false); }
  }, [page, search, type]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 300); return () => window.clearTimeout(timer); }, [load]);
  const payload = (form: HospitalForm) => ({ name: form.name.trim(), type: form.type, address: form.address.trim(), city: form.city.trim(), province: form.province.trim(),
    phone: form.phone.trim(), email: form.email.trim() || undefined, igdPhone: form.igdPhone.trim() || undefined, latitude: Number(form.latitude), longitude: Number(form.longitude),
    totalBeds: Number(form.totalBeds), icuTotal: Number(form.icuTotal), specializations: form.specializations.split(',').map((value) => value.trim()).filter(Boolean), isEmtPartner: form.isEmtPartner });
  const saveNew = async (form: HospitalForm) => { await hospitalClient.post('/v1/hospitals', { ...payload(form), licenseNumber: form.licenseNumber.trim() }); setAdding(false); showToast('Rumah sakit berhasil ditambahkan', 'success'); await load(); };
  const saveEdit = async (form: HospitalForm) => { if (!editing) return; await hospitalClient.patch(`/v1/hospitals/${editing.id}`, payload(form)); setEditing(null); showToast('Rumah sakit berhasil diperbarui', 'success'); await load(); };
  const deactivate = async () => { if (!deactivating) return; try { await hospitalClient.delete(`/v1/hospitals/${deactivating.id}`); showToast('Rumah sakit dinonaktifkan', 'success'); setDeactivating(null); await load(); } catch (failure) { showToast(errorMessage(failure), 'error'); } };
  const editForm = editing ? { name: editing.name, type: editing.type, licenseNumber: '', address: editing.address, city: editing.city, province: editing.province,
    phone: editing.phone ?? '', email: editing.email ?? '', igdPhone: editing.igd_phone ?? '', latitude: String(editing.latitude), longitude: String(editing.longitude),
    totalBeds: String(editing.total_beds), icuTotal: String(editing.icu_total), specializations: editing.specializations?.join(', ') ?? '', isEmtPartner: editing.is_emt_partner } : EMPTY;
  const pages = Math.max(1, Math.ceil(total / limit));
  return <div className={styles.page}>
    <PageHeader title="Manajemen Rumah Sakit" subtitle={`${total.toLocaleString('id-ID')} rumah sakit aktif`}
      breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Rumah Sakit' }]}
      actions={<div style={{ display: 'flex', gap: 8 }}><button className={`${styles.btn} ${styles.btnOutline}`} onClick={() => exportCsv(rows)} disabled={!rows.length}>⬇ CSV halaman ini</button>
        <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setAdding(true)}>+ Tambah RS</button></div>} />
    <div className={styles.card}><div className={styles.toolbar}><div className={styles.toolbarLeft}>
      <input className={styles.searchInput} value={search} placeholder="Cari nama atau kota" onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
      <select className={styles.filterSelect} value={type} onChange={(event) => { setType(event.target.value as HospitalType | ''); setPage(1); }}><option value="">Semua tipe</option>
        {TYPES.map((value) => <option key={value} value={value}>{TYPE_LABEL[value]}</option>)}</select></div></div></div>
    <div className={styles.card} style={{ padding: 0 }}>{loading ? <div style={{ padding: 16 }}>{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} height={44} style={{ marginBottom: 6 }} />)}</div>
      : error ? <div className={styles.errorState}>⚠ {error}<button className={`${styles.btn} ${styles.btnSm}`} onClick={() => void load()}>Coba Lagi</button></div>
      : <div className={styles.tableWrapper}><table className={styles.table}><thead><tr><th>Nama</th><th>Tipe</th><th>Lokasi</th><th>Bed</th><th>ICU</th><th>Telepon</th><th>Aksi</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.name}</strong></td><td>{TYPE_LABEL[row.type]}</td><td>{row.city}, {row.province}</td>
          <td>{row.available_beds}/{row.total_beds}</td><td>{row.icu_available}/{row.icu_total}</td><td>{row.phone ?? '—'}</td><td><div style={{ display: 'flex', gap: 6 }}>
            <button className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`} onClick={() => setEditing(row)}>Edit</button>
            <button className={`${styles.btn} ${styles.btnSm} ${styles.btnDangerOutline}`} onClick={() => setDeactivating(row)}>Nonaktifkan</button></div></td></tr>)}</tbody></table></div>}
      {pages > 1 && <div className={styles.pagination}><span className={styles.paginationInfo}>{page} / {pages}</span><div className={styles.paginationControls}>
        <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>‹</button><button className={styles.pageBtn} disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>›</button></div></div>}
    </div>
    {adding && <HospitalModal initial={EMPTY} editing={false} onClose={() => setAdding(false)} onSave={saveNew} />}
    {editing && <HospitalModal initial={editForm} editing onClose={() => setEditing(null)} onSave={saveEdit} />}
    <ConfirmDialog open={Boolean(deactivating)} title="Nonaktifkan Rumah Sakit" message={`Nonaktifkan ${deactivating?.name ?? ''}?`}
      confirmLabel="Nonaktifkan" danger onConfirm={() => void deactivate()} onCancel={() => setDeactivating(null)} />
  </div>;
}
