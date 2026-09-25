import { useCallback, useEffect, useState } from 'react';
import { pharmacyClient } from '../api/client';
import { ConfirmDialog, Modal } from '../components/Modal';
import { InputField } from '../components/FormField';
import PageHeader from '../components/PageHeader';
import { Skeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import styles from './Page.module.css';

interface Pharmacy {
  id: string; name: string; license_number: string; address: string; phone: string | null;
  latitude: string | null; longitude: string | null; is_active: boolean; drug_count: number; low_stock_count: number;
}
interface InventoryItem {
  id: string; drug_id: string; generic_name: string; brand_name: string | null; dosage_form: string | null;
  strength: string | null; stock_qty: number; unit_price: number; batch_number: string;
  expires_at: string | null; reorder_level: number; is_low_stock: boolean;
}
interface Drug { id: string; generic_name: string; brand_name: string | null; dosage_form: string | null; strength: string | null }
interface PharmacyForm { name: string; license_number: string; address: string; phone: string; latitude: string; longitude: string }
const EMPTY: PharmacyForm = { name: '', license_number: '', address: '', phone: '', latitude: '', longitude: '' };
function detail(error: unknown, fallback: string): string {
  return (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? (error instanceof Error ? error.message : fallback);
}
function money(value: number): string { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value); }
function date(value: string | null): string { return value ? new Date(value).toLocaleDateString('id-ID') : '—'; }

function PharmacyFormModal({ initial, editing, onClose, onSave }: { initial: PharmacyForm; editing: boolean; onClose: () => void; onSave: (form: PharmacyForm) => Promise<void> }) {
  const [form, setForm] = useState(initial); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const set = (key: keyof PharmacyForm, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    setError(''); const latitude = form.latitude ? Number(form.latitude) : undefined; const longitude = form.longitude ? Number(form.longitude) : undefined;
    if (form.name.trim().length < 2 || form.license_number.trim().length < 3 || form.address.trim().length < 5) return setError('Nama, nomor izin, dan alamat belum valid.');
    if (form.phone && form.phone.trim().length < 8) return setError('Nomor telepon minimal 8 karakter.');
    if (latitude !== undefined && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) return setError('Latitude tidak valid.');
    if (longitude !== undefined && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) return setError('Longitude tidak valid.');
    setSaving(true); try { await onSave(form); } catch (failure) { setError(detail(failure, 'Gagal menyimpan apotek')); } finally { setSaving(false); }
  };
  return <Modal open title={editing ? 'Edit Apotek' : 'Tambah Apotek'} onClose={onClose} width={560}>
    {error && <div className={styles.errorState}>⚠ {error}</div>}
    <div className={styles.responsiveTwoCol}>
      <InputField label="Nama Apotek" required value={form.name} onChange={(event) => set('name', event.target.value)} />
      <InputField label="Nomor SIA/Izin" required value={form.license_number} onChange={(event) => set('license_number', event.target.value)} />
      <div style={{ gridColumn: '1 / -1' }}><InputField label="Alamat" required value={form.address} onChange={(event) => set('address', event.target.value)} /></div>
      <InputField label="Telepon" value={form.phone} onChange={(event) => set('phone', event.target.value)} />
      <InputField label="Latitude" type="number" value={form.latitude} onChange={(event) => set('latitude', event.target.value)} />
      <InputField label="Longitude" type="number" value={form.longitude} onChange={(event) => set('longitude', event.target.value)} />
    </div>
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}><button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose}>Batal</button>
      <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={saving} onClick={() => void submit()}>{saving ? 'Menyimpan…' : 'Simpan'}</button></div>
  </Modal>;
}

export default function PharmacyPage() {
  const { showToast } = useToast(); const [rows, setRows] = useState<Pharmacy[]>([]); const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1); const [search, setSearch] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [selected, setSelected] = useState<Pharmacy | null>(null); const [inventory, setInventory] = useState<InventoryItem[]>([]); const [loadingInventory, setLoadingInventory] = useState(false);
  const [creating, setCreating] = useState(false); const [editing, setEditing] = useState<Pharmacy | null>(null); const [deactivating, setDeactivating] = useState<Pharmacy | null>(null);
  const [adjusting, setAdjusting] = useState<InventoryItem | null>(null); const [delta, setDelta] = useState(''); const [reason, setReason] = useState(''); const [mutating, setMutating] = useState(false);
  const [adding, setAdding] = useState(false); const [drugQuery, setDrugQuery] = useState(''); const [drugs, setDrugs] = useState<Drug[]>([]); const [drug, setDrug] = useState<Drug | null>(null);
  const [stock, setStock] = useState('0'); const [price, setPrice] = useState(''); const [batch, setBatch] = useState(''); const [expiry, setExpiry] = useState('');
  const limit = 20;
  const load = useCallback(async () => { setLoading(true); setError(''); try { const params = new URLSearchParams({ page: String(page), limit: String(limit) }); if (search.trim()) params.set('q', search.trim());
    const response = await pharmacyClient.get<{ data: Pharmacy[]; meta: { total: number } }>(`/v1/pharmacies?${params}`); setRows(response.data.data ?? []); setTotal(response.data.meta?.total ?? 0);
  } catch (failure) { setRows([]); setError(detail(failure, 'Gagal memuat apotek')); } finally { setLoading(false); } }, [page, search]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 300); return () => window.clearTimeout(timer); }, [load]);
  const loadInventory = useCallback(async (pharmacy: Pharmacy) => { setSelected(pharmacy); setLoadingInventory(true); setInventory([]); if (!pharmacy.is_active) { setLoadingInventory(false); return; }
    try { const response = await pharmacyClient.get<{ data: InventoryItem[] }>(`/v1/pharmacies/${pharmacy.id}/inventory`); setInventory(response.data.data ?? []); }
    catch (failure) { showToast(detail(failure, 'Gagal memuat inventori'), 'error'); } finally { setLoadingInventory(false); } }, [showToast]);
  const save = async (form: PharmacyForm) => { const payload = { name: form.name.trim(), license_number: form.license_number.trim(), address: form.address.trim(),
    phone: form.phone.trim() || undefined, latitude: form.latitude ? Number(form.latitude) : undefined, longitude: form.longitude ? Number(form.longitude) : undefined };
    if (editing) await pharmacyClient.patch(`/v1/pharmacies/${editing.id}`, payload); else await pharmacyClient.post('/v1/pharmacies', payload);
    setEditing(null); setCreating(false); showToast('Data apotek berhasil disimpan', 'success'); await load(); };
  const deactivate = async () => { if (!deactivating) return; setMutating(true); try { await pharmacyClient.delete(`/v1/pharmacies/${deactivating.id}/deactivate`); setSelected(null); setDeactivating(null); showToast('Apotek dinonaktifkan', 'success'); await load(); }
    catch (failure) { showToast(detail(failure, 'Gagal menonaktifkan apotek'), 'error'); } finally { setMutating(false); } };
  const adjust = async () => { if (!selected || !adjusting) return; const amount = Number(delta); if (!Number.isInteger(amount) || amount === 0 || reason.trim().length < 3) return showToast('Delta dan alasan penyesuaian belum valid', 'warning');
    setMutating(true); try { await pharmacyClient.post(`/v1/pharmacies/${selected.id}/inventory/adjust`, { drugId: adjusting.drug_id, delta: amount, reason: reason.trim() });
      setAdjusting(null); setDelta(''); setReason(''); showToast('Stok berhasil disesuaikan dan dicatat', 'success'); await loadInventory(selected); }
    catch (failure) { showToast(detail(failure, 'Gagal menyesuaikan stok'), 'error'); } finally { setMutating(false); } };
  useEffect(() => { if (drugQuery.trim().length < 2) { setDrugs([]); return; } const timer = window.setTimeout(async () => { try { const response = await pharmacyClient.get<{ data: Drug[] }>(`/v1/drugs/search?q=${encodeURIComponent(drugQuery.trim())}&limit=20`); setDrugs(response.data.data ?? []); } catch { setDrugs([]); } }, 300); return () => window.clearTimeout(timer); }, [drugQuery]);
  const addDrug = async () => { if (!selected || !drug) return; const qty = Number(stock); const unitPrice = Number(price); if (!Number.isInteger(qty) || qty < 0 || !Number.isFinite(unitPrice) || unitPrice <= 0 || batch.trim().length < 1) return showToast('Stok, harga, dan batch wajib valid', 'warning');
    setMutating(true); try { await pharmacyClient.put(`/v1/pharmacies/${selected.id}/inventory`, { drugId: drug.id, stockQty: qty, unitPrice, batchNumber: batch.trim(), expiresAt: expiry || undefined });
      setAdding(false); setDrug(null); setDrugQuery(''); setStock('0'); setPrice(''); setBatch(''); setExpiry(''); showToast('Obat ditambahkan ke inventori', 'success'); await loadInventory(selected); }
    catch (failure) { showToast(detail(failure, 'Gagal menambahkan obat'), 'error'); } finally { setMutating(false); } };
  const pages = Math.max(1, Math.ceil(total / limit));
  return <div className={styles.page}>
    <PageHeader title="Manajemen Apotek & Obat" subtitle={`${total.toLocaleString('id-ID')} apotek termasuk status nonaktif`}
      breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Apotek' }]}
      actions={<button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setCreating(true)}>+ Tambah Apotek</button>} />
    <div className={styles.contentSplit} style={!selected ? { gridTemplateColumns: 'minmax(0, 1fr)' } : undefined}>
      <div><div className={styles.card}><InputField label="Cari apotek, alamat, atau nomor izin" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></div>
        <div className={styles.card} style={{ padding: 0 }}>{loading ? <div style={{ padding: 16 }}>{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} height={56} style={{ marginBottom: 6 }} />)}</div>
          : error ? <div className={styles.errorState}>⚠ {error}</div> : rows.map((item) => <button key={item.id} onClick={() => void loadInventory(item)} style={{ width: '100%', textAlign: 'left', padding: 16,
            background: selected?.id === item.id ? 'var(--color-accent-light)' : 'transparent', border: 0, borderBottom: '1px solid var(--color-border)', cursor: 'pointer', color: 'inherit' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><div><strong>{item.name}</strong><div style={{ color: 'var(--color-muted)', fontSize: 13 }}>{item.address}</div>
              <code>{item.license_number}</code></div><div style={{ textAlign: 'right' }}><span className={styles.badge} style={{ color: item.is_active ? 'var(--color-success)' : 'var(--color-danger)' }}>
                ● {item.is_active ? 'Aktif' : 'Nonaktif'}</span><div>{item.drug_count} obat</div>{item.low_stock_count > 0 && <div style={{ color: 'var(--color-warning)' }}>⚠ {item.low_stock_count} rendah</div>}</div></div></button>)}
          {pages > 1 && <div className={styles.pagination}><span className={styles.paginationInfo}>{page} / {pages}</span><div className={styles.paginationControls}>
            <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>‹</button><button className={styles.pageBtn} disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>›</button></div></div>}</div></div>
      {selected && <div><div className={styles.card}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><div><strong>{selected.name}</strong><div>{selected.address}</div></div>
        <div style={{ display: 'flex', gap: 6 }}><button className={`${styles.btn} ${styles.btnSm}`} onClick={() => setEditing(selected)}>Edit</button>{selected.is_active && <button className={`${styles.btn} ${styles.btnSm} ${styles.btnDangerOutline}`} onClick={() => setDeactivating(selected)}>Nonaktifkan</button>}
          <button className={`${styles.btn} ${styles.btnSm}`} onClick={() => setSelected(null)}>✕</button></div></div>
        {!selected.is_active && <div className={styles.warningBanner}>Apotek nonaktif bersifat read-only dan tidak dapat memproses inventori baru.</div>}</div>
        {selected.is_active && <div className={styles.card} style={{ padding: 0 }}><div style={{ padding: 14, display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)' }}><strong>Inventori</strong>
          <button className={`${styles.btn} ${styles.btnSm} ${styles.btnPrimary}`} onClick={() => setAdding(true)}>+ Tambah Obat</button></div>
          {loadingInventory ? <div style={{ padding: 16 }}><Skeleton height={80} /></div> : <div className={styles.tableWrapper}><table className={styles.table}><thead><tr><th>Obat</th><th>Stok</th><th>Harga</th><th>Batch</th><th>Kedaluwarsa</th><th>Aksi</th></tr></thead>
            <tbody>{inventory.map((item) => <tr key={item.id}><td><strong>{item.generic_name}</strong><div>{item.brand_name ?? ''} {item.strength ?? ''}</div></td><td style={{ color: item.is_low_stock ? 'var(--color-danger)' : undefined }}>{item.stock_qty}</td>
              <td>{money(item.unit_price)}</td><td>{item.batch_number}</td><td>{date(item.expires_at)}</td><td><button className={`${styles.btn} ${styles.btnSm}`} onClick={() => setAdjusting(item)}>± Stok</button></td></tr>)}</tbody></table></div>}</div>}</div>}
    </div>
    {(creating || editing) && <PharmacyFormModal editing={Boolean(editing)} initial={editing ? { name: editing.name, license_number: editing.license_number, address: editing.address, phone: editing.phone ?? '', latitude: editing.latitude ?? '', longitude: editing.longitude ?? '' } : EMPTY}
      onClose={() => { setCreating(false); setEditing(null); }} onSave={save} />}
    {adjusting && <Modal open title="Penyesuaian Stok" onClose={() => setAdjusting(null)} width={440}><InputField label="Delta (+/-)" type="number" value={delta} onChange={(event) => setDelta(event.target.value)} />
      <InputField label="Alasan audit" value={reason} onChange={(event) => setReason(event.target.value)} /><div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={mutating} onClick={() => void adjust()}>Simpan</button></div></Modal>}
    {adding && <Modal open title="Tambah Obat ke Inventori" onClose={() => setAdding(false)} width={560}><InputField label="Cari obat" value={drugQuery} onChange={(event) => { setDrugQuery(event.target.value); setDrug(null); }} />
      {!drug && drugs.map((item) => <button key={item.id} style={{ display: 'block', width: '100%', padding: 8, textAlign: 'left' }} onClick={() => { setDrug(item); setDrugQuery(item.generic_name); setDrugs([]); }}>{item.generic_name} {item.brand_name ? `(${item.brand_name})` : ''}</button>)}
      <div className={styles.responsiveTwoCol}><InputField label="Stok" type="number" value={stock} onChange={(event) => setStock(event.target.value)} /><InputField label="Harga" type="number" value={price} onChange={(event) => setPrice(event.target.value)} />
        <InputField label="Batch" value={batch} onChange={(event) => setBatch(event.target.value)} /><InputField label="Kedaluwarsa" type="date" value={expiry} onChange={(event) => setExpiry(event.target.value)} /></div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}><button className={`${styles.btn} ${styles.btnPrimary}`} disabled={!drug || mutating} onClick={() => void addDrug()}>Tambahkan</button></div></Modal>}
    <ConfirmDialog open={Boolean(deactivating)} title="Nonaktifkan Apotek" message={`Nonaktifkan ${deactivating?.name ?? ''}?`} confirmLabel={mutating ? 'Memproses…' : 'Nonaktifkan'} danger
      onConfirm={() => void deactivate()} onCancel={() => setDeactivating(null)} />
  </div>;
}
