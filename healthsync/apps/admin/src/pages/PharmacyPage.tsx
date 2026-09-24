import { useEffect, useState, useCallback, useRef } from 'react';
import { pharmacyClient } from '../api/client';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import { InputField } from '../components/FormField';
import { Modal, ConfirmDialog } from '../components/Modal';
import { Skeleton } from '../components/Skeleton';
import styles from './Page.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Tipe Data
// ─────────────────────────────────────────────────────────────────────────────

interface Pharmacy {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  license_number?: string;
  latitude: string | null;
  longitude: string | null;
  is_active: boolean;
  drug_count?: number;
  low_stock_count?: number;
  operating_hours?: Record<string, { open: string; close: string }>;
}

interface InventoryItem {
  id?: string;
  pharmacy_id: string;
  drug_id: string;
  generic_name: string;
  brand_name: string;
  dosage_form: string;
  strength: string;
  stock_qty: number;
  unit_price: number;
  batch_number: string;
  expires_at: string;
  reorder_level: number;
  is_low_stock?: boolean;
}

interface DrugSearchResult {
  id: string;
  generic_name: string;
  brand_name?: string;
  dosage_form?: string;
  strength?: string;
  requires_prescription: boolean;
}

type InventoryFilter = 'all' | 'low_stock' | 'expiring';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
}

function isExpiringSoon(iso: string, days = 30): boolean {
  const exp = new Date(iso).getTime();
  const now = Date.now();
  return exp > now && exp - now < days * 86_400_000;
}

function isExpired(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}

/** Ekspor inventori ke CSV */
function exportInventoryCSV(pharmacy: Pharmacy, items: InventoryItem[]) {
  const headers = ['Nama Generik', 'Nama Brand', 'Bentuk', 'Kekuatan', 'Stok', 'Harga', 'Batch', 'Kedaluwarsa', 'Min Stok'];
  const lines = items.map((i) =>
    [
      `"${i.generic_name.replace(/"/g, '""')}"`,
      `"${(i.brand_name ?? '').replace(/"/g, '""')}"`,
      i.dosage_form,
      i.strength,
      i.stock_qty,
      i.unit_price,
      i.batch_number,
      i.expires_at ? formatDate(i.expires_at) : '',
      i.reorder_level,
    ].join(','),
  );
  const csv  = [headers.join(','), ...lines].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `inventori-${pharmacy.name.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// PharmacyPage
// ─────────────────────────────────────────────────────────────────────────────

export default function PharmacyPage() {
  const { showToast } = useToast();

  // ── State apotek ──
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [limit]                     = useState(20);

  // ── State search (server-side dengan debounce) ──
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { return () => { if (debounceRef.current) clearTimeout(debounceRef.current); }; }, []);

  // ── State inventori ──
  const [selected,      setSelected]     = useState<Pharmacy | null>(null);
  const [inventory,     setInventory]    = useState<InventoryItem[]>([]);
  const [loadingInv,    setLoadingInv]   = useState(false);
  const [invFilter,     setInvFilter]    = useState<InventoryFilter>('all');

  // ── State adjust stok ──
  const [adjustTarget, setAdjustTarget] = useState<InventoryItem | null>(null);
  const [adjustDelta,  setAdjustDelta]  = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustBusy,   setAdjustBusy]  = useState(false);

  // ── State tambah obat ke inventori ──
  const [showAddDrug,   setShowAddDrug]   = useState(false);
  const [drugSearch,    setDrugSearch]    = useState('');
  const [drugResults,   setDrugResults]   = useState<DrugSearchResult[]>([]);
  const [searchingDrug, setSearchingDrug] = useState(false);
  const [selectedDrug,  setSelectedDrug]  = useState<DrugSearchResult | null>(null);
  const [drugStockQty,  setDrugStockQty]  = useState('');
  const [drugPrice,     setDrugPrice]     = useState('');
  const [drugBatch,     setDrugBatch]     = useState('');
  const [drugExpiry,    setDrugExpiry]    = useState('');
  const [addingDrug,    setAddingDrug]    = useState(false);

  // ── State deactivate ──
  const [deactivateTarget, setDeactivateTarget] = useState<Pharmacy | null>(null);
  const [deactivateBusy,   setDeactivateBusy]   = useState(false);

  // ── State modal form apotek (tambah / edit) ──
  type PharmacyFormMode = 'create' | 'edit';
  const [showPharmacyModal, setShowPharmacyModal] = useState(false);
  const [pharmacyFormMode,  setPharmacyFormMode]  = useState<PharmacyFormMode>('create');
  const [editTarget,        setEditTarget]         = useState<Pharmacy | null>(null);
  const [fName,             setFName]              = useState('');
  const [fSIA,              setFSIA]               = useState('');
  const [fAddress,          setFAddress]           = useState('');
  const [fPhone,            setFPhone]             = useState('');
  const [fLat,              setFLat]               = useState('');
  const [fLng,              setFLng]               = useState('');
  const [savingPharmacy,    setSavingPharmacy]      = useState(false);

  const openCreateModal = () => {
    setPharmacyFormMode('create');
    setEditTarget(null);
    setFName(''); setFSIA(''); setFAddress(''); setFPhone(''); setFLat(''); setFLng('');
    setShowPharmacyModal(true);
  };

  const openEditModal = (pharmacy: Pharmacy) => {
    setPharmacyFormMode('edit');
    setEditTarget(pharmacy);
    setFName(pharmacy.name);
    setFSIA(pharmacy.license_number ?? '');
    setFAddress(pharmacy.address);
    setFPhone(pharmacy.phone ?? '');
    setFLat(pharmacy.latitude ?? '');
    setFLng(pharmacy.longitude ?? '');
    setShowPharmacyModal(true);
  };

  const doSavePharmacy = async () => {
    if (!fName.trim()) { showToast('Nama apotek wajib diisi', 'warning'); return; }
    if (!fSIA.trim())  { showToast('Nomor SIA wajib diisi', 'warning'); return; }
    if (!fAddress.trim()) { showToast('Alamat wajib diisi', 'warning'); return; }

    const payload: Record<string, unknown> = {
      name:           fName.trim(),
      license_number: fSIA.trim(),
      address:        fAddress.trim(),
    };
    if (fPhone.trim())  payload['phone']     = fPhone.trim();
    if (fLat.trim())    payload['latitude']  = parseFloat(fLat);
    if (fLng.trim())    payload['longitude'] = parseFloat(fLng);

    setSavingPharmacy(true);
    try {
      if (pharmacyFormMode === 'create') {
        await pharmacyClient.post('/v1/pharmacies', payload);
        showToast(`Apotek "${fName.trim()}" berhasil ditambahkan`, 'success');
      } else if (editTarget) {
        await pharmacyClient.patch(`/v1/pharmacies/${editTarget.id}`, payload);
        showToast(`Apotek "${fName.trim()}" berhasil diperbarui`, 'success');
        if (selected?.id === editTarget.id) setSelected(null);
      }
      setShowPharmacyModal(false);
      void fetchPharmacies();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
        ?? (err instanceof Error ? err.message : 'Gagal menyimpan apotek');
      showToast(msg, 'error');
    } finally {
      setSavingPharmacy(false);
    }
  };

  // ── Fetch apotek (server-side search) ──
  const fetchPharmacies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      const res = await pharmacyClient.get<{ data: Pharmacy[]; meta: { total: number } }>(
        `/v1/pharmacies?${params.toString()}`
      );
      setPharmacies(res.data.data ?? []);
      setTotal(res.data.meta?.total ?? 0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat daftar apotek';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [page, limit, searchQuery, showToast]);

  useEffect(() => { void fetchPharmacies(); }, [fetchPharmacies]);

  // Debounce search → reset halaman ke 1
  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      setSearchQuery(value);
    }, 400);
  };

  // ── Fetch inventori apotek yang dipilih ──
  const fetchInventory = useCallback(async (pharmacyId: string) => {
    setLoadingInv(true);
    setInventory([]);
    try {
      const res = await pharmacyClient.get<{ data: InventoryItem[] }>(
        `/v1/pharmacies/${pharmacyId}/inventory`
      );
      setInventory(res.data.data ?? []);
    } catch {
      showToast('Gagal memuat inventori apotek', 'error');
    } finally {
      setLoadingInv(false);
    }
  }, [showToast]);

  const handleSelectPharmacy = (pharmacy: Pharmacy) => {
    setSelected(pharmacy);
    setInvFilter('all');
    void fetchInventory(pharmacy.id);
  };

  // ── Penyesuaian stok — FIX: notes → reason (wajib isi) ──
  const doAdjust = async () => {
    if (!adjustTarget || !selected) return;
    const delta = parseInt(adjustDelta, 10);
    if (isNaN(delta) || delta === 0) {
      showToast('Masukkan angka perubahan stok (positif = tambah, negatif = kurangi)', 'warning');
      return;
    }
    if (!adjustReason.trim()) {
      showToast('Keterangan / alasan penyesuaian wajib diisi', 'warning');
      return;
    }
    setAdjustBusy(true);
    try {
      await pharmacyClient.post(`/v1/pharmacies/${selected.id}/inventory/adjust`, {
        drugId: adjustTarget.drug_id,
        delta,
        reason: adjustReason.trim(),   // ← FIX: was 'notes'
      });
      // FIX: toast menampilkan tanda + atau - dengan benar
      const sign = delta > 0 ? '+' : '';
      showToast(`Stok ${adjustTarget.generic_name} berhasil disesuaikan (${sign}${delta})`, 'success');
      setAdjustTarget(null);
      setAdjustDelta('');
      setAdjustReason('');
      await fetchInventory(selected.id);
    } catch {
      showToast('Gagal menyesuaikan stok', 'error');
    } finally {
      setAdjustBusy(false);
    }
  };

  // ── Cari obat untuk ditambahkan ke inventori ──
  const drugSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleDrugSearch = (q: string) => {
    setDrugSearch(q);
    setSelectedDrug(null);
    if (drugSearchRef.current) clearTimeout(drugSearchRef.current);
    if (q.length < 2) { setDrugResults([]); return; }
    drugSearchRef.current = setTimeout(async () => {
      setSearchingDrug(true);
      try {
        const res = await pharmacyClient.get<{ data: DrugSearchResult[] }>(`/v1/drugs/search?q=${encodeURIComponent(q)}`);
        setDrugResults(res.data.data ?? []);
      } catch { setDrugResults([]); }
      finally { setSearchingDrug(false); }
    }, 400);
  };

  // ── Tambah obat ke inventori ──
  const doAddDrug = async () => {
    if (!selected || !selectedDrug) return;
    const qty   = parseInt(drugStockQty, 10);
    const price = parseFloat(drugPrice);
    if (isNaN(qty) || qty < 0) { showToast('Stok awal tidak valid', 'warning'); return; }
    if (isNaN(price) || price <= 0) { showToast('Harga tidak valid', 'warning'); return; }
    if (!drugBatch.trim()) { showToast('No. batch wajib diisi', 'warning'); return; }
    setAddingDrug(true);
    try {
      await pharmacyClient.put(`/v1/pharmacies/${selected.id}/inventory`, {
        drugId:      selectedDrug.id,
        stockQty:    qty,
        unitPrice:   price,
        batchNumber: drugBatch.trim(),
        expiresAt:   drugExpiry ? new Date(drugExpiry).toISOString() : undefined,
      });
      showToast(`${selectedDrug.generic_name} berhasil ditambahkan ke inventori`, 'success');
      setShowAddDrug(false);
      setDrugSearch(''); setDrugResults([]); setSelectedDrug(null);
      setDrugStockQty(''); setDrugPrice(''); setDrugBatch(''); setDrugExpiry('');
      await fetchInventory(selected.id);
    } catch {
      showToast('Gagal menambahkan obat ke inventori', 'error');
    } finally {
      setAddingDrug(false);
    }
  };

  // ── Nonaktifkan apotek (soft delete via DELETE /deactivate) ──
  const doDeactivate = async () => {
    if (!deactivateTarget) return;
    setDeactivateBusy(true);
    try {
      await pharmacyClient.delete(`/v1/pharmacies/${deactivateTarget.id}/deactivate`);
      showToast(`Apotek "${deactivateTarget.name}" berhasil dinonaktifkan`, 'success');
      setDeactivateTarget(null);
      if (selected?.id === deactivateTarget.id) setSelected(null);
      void fetchPharmacies();
    } catch {
      showToast('Gagal menonaktifkan apotek', 'error');
    } finally {
      setDeactivateBusy(false);
    }
  };

  // ── Filter inventori ──
  const filteredInventory = inventory.filter((item) => {
    if (invFilter === 'low_stock')  return item.is_low_stock ?? (item.stock_qty <= item.reorder_level);
    if (invFilter === 'expiring')   return item.expires_at && (isExpiringSoon(item.expires_at) || isExpired(item.expires_at));
    return true;
  });

  // ── Stat inventori ──
  const statLowStock   = inventory.filter((i) => i.is_low_stock ?? (i.stock_qty <= i.reorder_level)).length;
  const statExpiring   = inventory.filter((i) => i.expires_at && isExpiringSoon(i.expires_at)).length;
  const statExpired    = inventory.filter((i) => i.expires_at && isExpired(i.expires_at)).length;
  const statTotalUnits = inventory.reduce((s, i) => s + i.stock_qty, 0);

  const totalPages = Math.ceil(total / limit);

  // ── Render ──
  return (
    <div className={styles.page}>
      <PageHeader
        title="Manajemen Apotek & Obat"
        subtitle={`${total} apotek terdaftar`}
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Apotek' }]}
        actions={
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={openCreateModal}>
            + Tambah Apotek
          </button>
        }
      />

      {/* ── Layout Split ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: selected ? '1fr 1.6fr' : '1fr',
        gap: 16, alignItems: 'start',
      }}>

        {/* ════════════════════════════════════
            Panel Kiri — Daftar Apotek
            ════════════════════════════════════ */}
        <div>
          <div className={styles.card}>
            <div style={{ marginBottom: 'var(--space-3)' }}>
              <InputField
                label="Cari apotek"
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Nama apotek…"
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: 8 }}>
              <span>{total} apotek terdaftar</span>
              <button className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`} onClick={() => void fetchPharmacies()}>↻</button>
            </div>
          </div>

          <div className={styles.card} style={{ padding: 0 }}>
            {loading ? (
              <div style={{ padding: 'var(--space-4)' }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} height={56} style={{ marginBottom: 8 }} />
                ))}
              </div>
            ) : error ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyStateIcon}>⚠️</div>
                <div className={styles.emptyStateTitle}>Gagal memuat data</div>
                <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>{error}</div>
                <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => void fetchPharmacies()}>Coba Lagi</button>
              </div>
            ) : pharmacies.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyStateIcon}>💊</div>
                <div className={styles.emptyStateTitle}>Tidak ada apotek</div>
                <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                  {searchInput ? 'Tidak ada apotek yang cocok dengan pencarian.' : 'Belum ada apotek terdaftar.'}
                </div>
              </div>
            ) : (
              pharmacies.map((p) => (
                <div
                  key={p.id}
                  onClick={() => handleSelectPharmacy(p)}
                  style={{
                    padding: 'var(--space-4)',
                    borderBottom: '1px solid var(--color-border)',
                    cursor: 'pointer',
                    background: selected?.id === p.id ? 'var(--color-accent-light)' : undefined,
                    transition: 'background var(--transition-fast)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 'var(--text-base)', marginBottom: 2 }}>{p.name}</div>
                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>{p.address}</div>
                      {p.phone && (
                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginTop: 2 }}>📞 {p.phone}</div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 7px', borderRadius: 999,
                        fontSize: 11, fontWeight: 600,
                        background: 'var(--color-success-bg)', color: 'var(--color-success)',
                        marginBottom: 4,
                      }}>
                        ● Aktif
                      </span>
                      {p.drug_count != null && (
                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>{p.drug_count} obat</div>
                      )}
                      {(p.low_stock_count ?? 0) > 0 && (
                        <div style={{
                          display: 'inline-block', padding: '2px 7px', borderRadius: 999,
                          fontSize: 11, fontWeight: 600, marginTop: 4,
                          background: 'var(--color-warning-bg)', color: 'var(--color-warning)',
                        }}>
                          ⚠ {p.low_stock_count} stok rendah
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}

            {totalPages > 1 && (
              <div style={{
                display: 'flex', justifyContent: 'center', gap: 8,
                padding: 'var(--space-3)', borderTop: '1px solid var(--color-border)',
              }}>
                <button className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                  disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>←</button>
                <span style={{ lineHeight: '28px', fontSize: 'var(--text-sm)' }}>{page} / {totalPages}</span>
                <button className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                  disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>→</button>
              </div>
            )}
          </div>
        </div>

        {/* ════════════════════════════════════
            Panel Kanan — Detail + Inventori
            ════════════════════════════════════ */}
        {selected && (
          <div>
            {/* Info apotek + aksi */}
            <div className={styles.card} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 'var(--text-lg)', marginBottom: 4 }}>{selected.name}</div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>{selected.address}</div>
                  {selected.phone && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginTop: 4 }}>📞 {selected.phone}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                  <button
                    className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                    onClick={() => openEditModal(selected)}
                  >
                    ✏ Edit
                  </button>
                  <button
                    className={`${styles.btn} ${styles.btnSm} ${styles.btnDangerOutline}`}
                    onClick={() => setDeactivateTarget(selected)}
                  >
                    ⊘ Nonaktifkan
                  </button>
                  <button
                    className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                    onClick={() => setSelected(null)}
                  >
                    ✕ Tutup
                  </button>
                </div>
              </div>

              {/* Stat Cards inventori */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {[
                  { label: 'Jenis Obat',    value: inventory.length,  color: 'var(--color-primary)' },
                  { label: 'Stok Rendah',   value: statLowStock,      color: 'var(--color-warning, #d97706)' },
                  { label: 'Segera Exp.',   value: statExpiring,      color: '#ea580c' },
                  { label: 'Total Unit',    value: statTotalUnits.toLocaleString('id-ID'), color: 'var(--color-text)' },
                ].map((s) => (
                  <div key={s.label} style={{
                    background: 'var(--color-surface-2)', borderRadius: 8,
                    padding: '10px 12px', border: '1px solid var(--color-border)', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Alert kedaluwarsa */}
              {statExpired > 0 && (
                <div style={{
                  marginTop: 12, padding: '8px 12px', borderRadius: 8,
                  background: 'var(--color-danger-bg, #fef2f2)', border: '1px solid #fca5a5',
                  fontSize: 13, color: 'var(--color-danger, #dc2626)', display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  🚨 <strong>{statExpired} item</strong> sudah kedaluwarsa dan tidak boleh diedarkan
                </div>
              )}
            </div>

            {/* Inventori */}
            <div className={styles.card} style={{ padding: 0 }}>
              <div style={{
                padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              }}>
                <span style={{ fontWeight: 600 }}>Inventori Obat</span>

                {/* Filter chip */}
                <div style={{ display: 'flex', gap: 6 }}>
                  {([
                    { key: 'all',       label: `Semua (${inventory.length})` },
                    { key: 'low_stock', label: `⚠ Stok Rendah (${statLowStock})` },
                    { key: 'expiring',  label: `🗓 Segera Exp. (${statExpiring})` },
                  ] as { key: InventoryFilter; label: string }[]).map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setInvFilter(f.key)}
                      style={{
                        padding: '4px 10px', fontSize: 11, borderRadius: 999, cursor: 'pointer',
                        fontWeight: invFilter === f.key ? 700 : 400,
                        background: invFilter === f.key ? 'var(--color-primary)' : 'var(--color-surface-2)',
                        color:      invFilter === f.key ? '#fff' : 'var(--color-muted)',
                        border: `1px solid ${invFilter === f.key ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        transition: 'all 0.15s',
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Aksi kanan */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                    onClick={() => exportInventoryCSV(selected, filteredInventory)}
                    title="Ekspor inventori ke CSV"
                  >
                    ⬇ CSV
                  </button>
                  <button
                    className={`${styles.btn} ${styles.btnSm} ${styles.btnPrimary}`}
                    onClick={() => setShowAddDrug(true)}
                  >
                    + Tambah Obat
                  </button>
                  <button
                    className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                    onClick={() => void fetchInventory(selected.id)}
                  >
                    ↻
                  </button>
                </div>
              </div>

              {loadingInv ? (
                <div style={{ padding: 'var(--space-4)' }}>
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={36} style={{ marginBottom: 6 }} />)}
                </div>
              ) : filteredInventory.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyStateIcon}>📦</div>
                  <div className={styles.emptyStateTitle}>
                    {invFilter === 'all' ? 'Inventori kosong' : 'Tidak ada item dengan filter ini'}
                  </div>
                </div>
              ) : (
                <div className={styles.tableWrapper}>
                  <table className={`${styles.table} ${styles.tableHover}`}>
                    <thead>
                      <tr>
                        <th>Obat</th>
                        <th style={{ textAlign: 'center' }}>Stok</th>
                        <th>Harga</th>
                        <th>Batch / Kedaluwarsa</th>
                        <th style={{ textAlign: 'center' }}>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInventory.map((item) => {
                        const isLow     = item.is_low_stock ?? (item.stock_qty <= item.reorder_level);
                        const expired   = item.expires_at && isExpired(item.expires_at);
                        const expSoon   = item.expires_at && isExpiringSoon(item.expires_at);
                        return (
                          <tr key={`${item.drug_id}-${item.batch_number}`}
                            style={{ background: expired ? 'rgba(239,68,68,0.04)' : undefined }}
                          >
                            <td>
                              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                                {item.generic_name}
                              </div>
                              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
                                {item.brand_name} · {item.dosage_form} {item.strength}
                              </div>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span style={{
                                fontWeight: 700, fontSize: 'var(--text-base)',
                                color: isLow ? 'var(--color-danger, #dc2626)' : 'var(--color-text)',
                              }}>
                                {item.stock_qty.toLocaleString('id-ID')}
                              </span>
                              {isLow && (
                                <div style={{ fontSize: 11, color: 'var(--color-warning, #d97706)' }}>
                                  Min: {item.reorder_level}
                                </div>
                              )}
                            </td>
                            <td style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>
                              {formatCurrency(item.unit_price)}
                            </td>
                            <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
                              <div>{item.batch_number}</div>
                              {item.expires_at && (
                                <div style={{
                                  color: expired ? 'var(--color-danger, #dc2626)' : expSoon ? '#ea580c' : undefined,
                                  fontWeight: (expired || expSoon) ? 600 : undefined,
                                }}>
                                  {expired ? '⚠ ' : expSoon ? '🗓 ' : ''}{formatDate(item.expires_at)}
                                </div>
                              )}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                                onClick={() => { setAdjustTarget(item); setAdjustDelta(''); setAdjustReason(''); }}
                              >
                                ± Stok
                              </button>
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

      {/* ── Modal Penyesuaian Stok ── */}
      {adjustTarget && (
        <Modal open onClose={() => { setAdjustTarget(null); setAdjustDelta(''); setAdjustReason(''); }} title="Penyesuaian Stok Obat" width={440}>
          <div style={{ fontSize: 'var(--text-sm)' }}>
            <div style={{
              background: 'var(--color-surface-2)', borderRadius: 8,
              padding: '12px 16px', marginBottom: 16, border: '1px solid var(--color-border)',
            }}>
              <div style={{ fontWeight: 700 }}>{adjustTarget.generic_name} ({adjustTarget.brand_name})</div>
              <div style={{ color: 'var(--color-muted)', marginTop: 4 }}>
                Stok saat ini: <strong>{adjustTarget.stock_qty.toLocaleString('id-ID')}</strong> unit
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <InputField
                label="Delta Stok (+ tambah / – kurangi)"
                type="number"
                value={adjustDelta}
                onChange={(e) => setAdjustDelta(e.target.value)}
                placeholder="Contoh: 50 atau -10"
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 12 }}>
                Alasan penyesuaian <span style={{ color: 'var(--color-danger)' }}>*</span>
              </label>
              <textarea
                rows={2}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                  padding: '8px 12px', fontSize: 'var(--text-sm)', fontFamily: 'inherit',
                  background: 'var(--color-bg)', color: 'var(--color-text)', resize: 'vertical',
                }}
                placeholder="Contoh: Penerimaan barang dari supplier, Retur stok rusak…"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className={`${styles.btn} ${styles.btnOutline}`}
                onClick={() => { setAdjustTarget(null); setAdjustDelta(''); setAdjustReason(''); }}>
                Batal
              </button>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={adjustBusy || !adjustDelta || !adjustReason.trim()}
                onClick={() => void doAdjust()}
              >
                {adjustBusy ? 'Menyimpan…' : 'Simpan'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal Tambah Obat ke Inventori ── */}
      {showAddDrug && selected && (
        <Modal open onClose={() => setShowAddDrug(false)} title={`Tambah Obat — ${selected.name}`} width={500}>
          <div style={{ fontSize: 'var(--text-sm)' }}>
            {/* Drug autocomplete */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 12 }}>
                Cari Obat <span style={{ color: 'var(--color-danger)' }}>*</span>
              </label>
              <input
                type="text"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                  padding: '8px 12px', fontSize: 'var(--text-sm)', fontFamily: 'inherit',
                  background: 'var(--color-bg)', color: 'var(--color-text)',
                }}
                placeholder="Ketik nama generik atau brand (min 2 karakter)…"
                value={drugSearch}
                onChange={(e) => handleDrugSearch(e.target.value)}
              />
              {searchingDrug && <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 4 }}>Mencari…</div>}
              {drugResults.length > 0 && !selectedDrug && (
                <div style={{
                  border: '1px solid var(--color-border)', borderRadius: 8, marginTop: 4,
                  background: 'var(--color-surface)', maxHeight: 160, overflowY: 'auto',
                }}>
                  {drugResults.map((d) => (
                    <div key={d.id}
                      onClick={() => { setSelectedDrug(d); setDrugSearch(`${d.generic_name}${d.brand_name ? ` (${d.brand_name})` : ''}`); setDrugResults([]); }}
                      style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--color-border)', fontSize: 13 }}
                    >
                      <span style={{ fontWeight: 600 }}>{d.generic_name}</span>
                      {d.brand_name && <span style={{ color: 'var(--color-muted)', marginLeft: 6 }}>({d.brand_name})</span>}
                      {d.dosage_form && <span style={{ color: 'var(--color-muted)', marginLeft: 6 }}>{d.dosage_form} {d.strength}</span>}
                      {d.requires_prescription && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#dc2626' }}>Resep</span>}
                    </div>
                  ))}
                </div>
              )}
              {selectedDrug && (
                <div style={{
                  marginTop: 6, padding: '8px 12px', borderRadius: 8,
                  background: 'var(--color-success-bg)', border: '1px solid var(--color-success)',
                  fontSize: 12, color: 'var(--color-success)', display: 'flex', justifyContent: 'space-between',
                }}>
                  <span>✓ Dipilih: <strong>{selectedDrug.generic_name}</strong></span>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
                    onClick={() => { setSelectedDrug(null); setDrugSearch(''); setDrugResults([]); }}>✕</button>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <InputField label="Stok Awal" type="number" value={drugStockQty} onChange={(e) => setDrugStockQty(e.target.value)} placeholder="0" />
              <InputField label="Harga Satuan (Rp)" type="number" value={drugPrice} onChange={(e) => setDrugPrice(e.target.value)} placeholder="0" />
              <InputField label="No. Batch" value={drugBatch} onChange={(e) => setDrugBatch(e.target.value)} placeholder="Wajib diisi" />
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 12 }}>Tanggal Kedaluwarsa</label>
                <input
                  type="date"
                  style={{
                    width: '100%', boxSizing: 'border-box', border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)', padding: '8px 12px',
                    fontSize: 'var(--text-sm)', fontFamily: 'inherit',
                    background: 'var(--color-bg)', color: 'var(--color-text)',
                  }}
                  value={drugExpiry}
                  onChange={(e) => setDrugExpiry(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className={`${styles.btn} ${styles.btnOutline}`} onClick={() => setShowAddDrug(false)}>Batal</button>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={addingDrug || !selectedDrug}
                onClick={() => void doAddDrug()}
              >
                {addingDrug ? 'Menyimpan…' : 'Tambahkan ke Inventori'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal Form Tambah / Edit Apotek ── */}
      {showPharmacyModal && (
        <Modal
          open
          onClose={() => setShowPharmacyModal(false)}
          title={pharmacyFormMode === 'create' ? 'Tambah Apotek Baru' : `Edit Apotek — ${editTarget?.name ?? ''}`}
          width={520}
        >
          <div style={{ fontSize: 'var(--text-sm)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              {/* Nama apotek — full width */}
              <div style={{ gridColumn: '1 / -1' }}>
                <InputField
                  label="Nama Apotek *"
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  placeholder="Apotek Sehat Bersama"
                />
              </div>
              <InputField
                label="Nomor SIA / Izin *"
                value={fSIA}
                onChange={(e) => setFSIA(e.target.value)}
                placeholder="SIA-2024-XXXXX"
              />
              <InputField
                label="Telepon"
                value={fPhone}
                onChange={(e) => setFPhone(e.target.value)}
                placeholder="021-xxxxxxxx"
              />
              {/* Alamat — full width */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 12 }}>
                  Alamat Lengkap *
                </label>
                <textarea
                  rows={2}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                    padding: '8px 12px', fontSize: 'var(--text-sm)', fontFamily: 'inherit',
                    background: 'var(--color-bg)', color: 'var(--color-text)', resize: 'vertical',
                  }}
                  placeholder="Jl. Contoh No. 1, Kota, Provinsi"
                  value={fAddress}
                  onChange={(e) => setFAddress(e.target.value)}
                />
              </div>
              <InputField
                label="Latitude (opsional)"
                type="number"
                value={fLat}
                onChange={(e) => setFLat(e.target.value)}
                placeholder="-6.175000"
              />
              <InputField
                label="Longitude (opsional)"
                type="number"
                value={fLng}
                onChange={(e) => setFLng(e.target.value)}
                placeholder="106.827000"
              />
            </div>

            <div style={{
              padding: '8px 12px', borderRadius: 8, marginBottom: 16,
              background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
              fontSize: 12, color: 'var(--color-muted)',
            }}>
              💡 Koordinat (lat/lng) digunakan untuk fitur pencarian apotek terdekat. Bisa diisi nanti melalui Edit.
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                className={`${styles.btn} ${styles.btnOutline}`}
                onClick={() => setShowPharmacyModal(false)}
                disabled={savingPharmacy}
              >
                Batal
              </button>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={savingPharmacy || !fName.trim() || !fSIA.trim() || !fAddress.trim()}
                onClick={() => void doSavePharmacy()}
              >
                {savingPharmacy ? 'Menyimpan…' : (pharmacyFormMode === 'create' ? 'Tambah Apotek' : 'Simpan Perubahan')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Konfirmasi Nonaktifkan Apotek ── */}
      <ConfirmDialog
        open={deactivateTarget !== null}
        title="Nonaktifkan Apotek"
        message={`Yakin ingin menonaktifkan "${deactivateTarget?.name ?? ''}"? Apotek tidak akan dapat memproses resep baru.`}
        confirmLabel={deactivateBusy ? 'Menonaktifkan…' : 'Nonaktifkan'}
        danger
        onConfirm={() => void doDeactivate()}
        onCancel={() => setDeactivateTarget(null)}
      />
    </div>
  );
}
