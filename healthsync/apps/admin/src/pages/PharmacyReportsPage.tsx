import { useEffect, useState, useCallback } from 'react';
import { pharmacyClient } from '../api/client';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
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
  drug_count?: number;
  low_stock_count?: number;
}

interface InventoryItem {
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

interface PharmacyReport {
  pharmacy: Pharmacy;
  inventory: InventoryItem[];
  loading: boolean;
  error: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isExpired(iso: string): boolean {
  return new Date(iso) < new Date();
}

function isExpiringSoon(iso: string, days = 30): boolean {
  const limit = new Date();
  limit.setDate(limit.getDate() + days);
  return new Date(iso) >= new Date() && new Date(iso) <= limit;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
}

function exportReportCSV(reports: PharmacyReport[]) {
  const rows: string[] = [];
  rows.push('Apotek,Jenis Obat,Total Unit,Stok Rendah,Segera Kadaluarsa,Sudah Kadaluarsa,Nilai Inventori (Rp)');
  for (const r of reports) {
    if (r.loading || r.error) continue;
    const inv = r.inventory;
    const totalUnit    = inv.reduce((s, i) => s + i.stock_qty, 0);
    const lowStock     = inv.filter((i) => i.is_low_stock ?? (i.stock_qty <= i.reorder_level)).length;
    const expiringSoon = inv.filter((i) => i.expires_at && isExpiringSoon(i.expires_at)).length;
    const expired      = inv.filter((i) => i.expires_at && isExpired(i.expires_at)).length;
    const totalValue   = inv.reduce((s, i) => s + i.stock_qty * i.unit_price, 0);
    rows.push([
      `"${r.pharmacy.name}"`,
      inv.length,
      totalUnit,
      lowStock,
      expiringSoon,
      expired,
      totalValue,
    ].join(','));
  }
  const csv  = rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `laporan-farmasi-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Komponen Utama
// ─────────────────────────────────────────────────────────────────────────────

export default function PharmacyReportsPage() {
  const { showToast } = useToast();

  const [pharmacies,       setPharmacies]       = useState<Pharmacy[]>([]);
  const [loadingList,      setLoadingList]       = useState(true);
  const [reports,          setReports]           = useState<PharmacyReport[]>([]);
  const [loadingReports,   setLoadingReports]    = useState(false);

  // ── Fetch daftar apotek ──
  useEffect(() => {
    const run = async () => {
      setLoadingList(true);
      try {
        const res = await pharmacyClient.get<{ data: Pharmacy[]; meta: { total: number } }>(
          '/v1/pharmacies?limit=100'
        );
        setPharmacies(res.data.data ?? []);
      } catch {
        showToast('Gagal memuat daftar apotek', 'error');
      } finally {
        setLoadingList(false);
      }
    };
    void run();
  }, [showToast]);

  // ── Fetch inventori semua apotek secara paralel ──
  const fetchAllInventory = useCallback(async (list: Pharmacy[]) => {
    setLoadingReports(true);
    // Inisialisasi state loading untuk semua apotek
    setReports(list.map((p) => ({ pharmacy: p, inventory: [], loading: true, error: null })));

    const results = await Promise.allSettled(
      list.map((p) =>
        pharmacyClient
          .get<{ data: InventoryItem[] }>(`/v1/pharmacies/${p.id}/inventory`)
          .then((r) => ({ pharmacyId: p.id, data: r.data.data ?? [] }))
      )
    );

    setReports(list.map((p, i) => {
      const result = results[i];
      if (result?.status === 'fulfilled') {
        return { pharmacy: p, inventory: result.value.data, loading: false, error: null };
      } else {
        return { pharmacy: p, inventory: [], loading: false, error: 'Gagal memuat inventori' };
      }
    }));

    setLoadingReports(false);
  }, []);

  useEffect(() => {
    if (pharmacies.length > 0) void fetchAllInventory(pharmacies);
  }, [pharmacies, fetchAllInventory]);

  // ── Hitung agregat semua apotek ──
  const allInventory = reports.flatMap((r) => r.inventory);
  const grandTotalItems    = allInventory.length;
  const grandTotalUnits    = allInventory.reduce((s, i) => s + i.stock_qty, 0);
  const grandLowStock      = allInventory.filter((i) => i.is_low_stock ?? (i.stock_qty <= i.reorder_level)).length;
  const grandExpiringSoon  = allInventory.filter((i) => i.expires_at && isExpiringSoon(i.expires_at)).length;
  const grandExpired       = allInventory.filter((i) => i.expires_at && isExpired(i.expires_at)).length;
  const grandTotalValue    = allInventory.reduce((s, i) => s + i.stock_qty * i.unit_price, 0);

  // ── Top 10 obat stok terbanyak ──
  const drugAgg = allInventory.reduce<Record<string, { name: string; totalQty: number; totalValue: number }>>((acc, item) => {
    const key = item.drug_id;
    if (!acc[key]) acc[key] = { name: `${item.generic_name}${item.brand_name ? ` (${item.brand_name})` : ''}`, totalQty: 0, totalValue: 0 };
    acc[key]!.totalQty   += item.stock_qty;
    acc[key]!.totalValue += item.stock_qty * item.unit_price;
    return acc;
  }, {});
  const topDrugs = Object.values(drugAgg)
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 10);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Laporan Farmasi"
        subtitle={`Agregat inventori dari ${pharmacies.length} apotek`}
        breadcrumbs={[
          { label: 'Dashboard', to: '/' },
          { label: 'Farmasi', to: '/pharmacy' },
          { label: 'Laporan Farmasi' },
        ]}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={`${styles.btn} ${styles.btnOutline}`}
              onClick={() => { if (pharmacies.length > 0) void fetchAllInventory(pharmacies); }}
              disabled={loadingReports}
            >
              ↻ Refresh
            </button>
            <button
              className={`${styles.btn} ${styles.btnOutline}`}
              onClick={() => exportReportCSV(reports)}
              disabled={reports.length === 0 || loadingReports}
            >
              ⬇ CSV
            </button>
          </div>
        }
      />

      {/* ── KPI Cards Agregat ── */}
      {loadingList || loadingReports ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 20 }}>
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={80} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total Apotek',   value: pharmacies.length,               color: 'var(--color-primary)',      icon: '🏪' },
            { label: 'Jenis Obat',     value: grandTotalItems.toLocaleString('id-ID'), color: 'var(--color-text)', icon: '💊' },
            { label: 'Total Unit',     value: grandTotalUnits.toLocaleString('id-ID'), color: 'var(--color-text)', icon: '📦' },
            { label: 'Stok Rendah',    value: grandLowStock,                   color: '#d97706',                   icon: '⚠' },
            { label: 'Segera Exp.',    value: grandExpiringSoon,               color: '#ea580c',                   icon: '🗓' },
            { label: 'Sudah Exp.',     value: grandExpired,                    color: 'var(--color-danger, #dc2626)', icon: '🚨' },
          ].map((kpi) => (
            <div key={kpi.label} style={{
              background: 'var(--color-surface)', borderRadius: 10, padding: '14px 16px',
              border: '1px solid var(--color-border)', textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{kpi.icon}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: kpi.color, lineHeight: 1 }}>
                {typeof kpi.value === 'number' ? kpi.value.toLocaleString('id-ID') : kpi.value}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 4 }}>{kpi.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Nilai Inventori Total ── */}
      {!loadingReports && (
        <div className={styles.card} style={{ marginBottom: 20, padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 4 }}>TOTAL NILAI INVENTORI</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-primary)' }}>
                {formatCurrency(grandTotalValue)}
              </div>
            </div>
            <div style={{ fontSize: 40 }}>💰</div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>

        {/* ── Tabel Per Apotek ── */}
        <div className={styles.card} style={{ padding: 0 }}>
          <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-border)', fontWeight: 600 }}>
            Ringkasan per Apotek
          </div>
          {loadingList || loadingReports ? (
            <div style={{ padding: 'var(--space-4)' }}>
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={44} style={{ marginBottom: 6 }} />)}
            </div>
          ) : reports.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>🏪</div>
              <div className={styles.emptyStateTitle}>Belum ada apotek terdaftar</div>
            </div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={`${styles.table} ${styles.tableHover}`}>
                <thead>
                  <tr>
                    <th>Apotek</th>
                    <th style={{ textAlign: 'center' }}>Obat</th>
                    <th style={{ textAlign: 'center' }}>Rendah</th>
                    <th style={{ textAlign: 'center' }}>Exp.</th>
                    <th style={{ textAlign: 'right' }}>Nilai (Rp)</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => {
                    const inv          = r.inventory;
                    const lowStockCt   = inv.filter((i) => i.is_low_stock ?? (i.stock_qty <= i.reorder_level)).length;
                    const expiredCt    = inv.filter((i) => i.expires_at && isExpired(i.expires_at)).length;
                    const totalValue   = inv.reduce((s, i) => s + i.stock_qty * i.unit_price, 0);
                    return (
                      <tr key={r.pharmacy.id}>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{r.pharmacy.name}</div>
                          {r.error && <div style={{ fontSize: 11, color: 'var(--color-danger, #dc2626)' }}>⚠ Gagal memuat</div>}
                          {r.loading && <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>Memuat…</div>}
                        </td>
                        <td style={{ textAlign: 'center' }}>{r.loading ? '…' : inv.length}</td>
                        <td style={{ textAlign: 'center' }}>
                          {r.loading ? '…' : (
                            <span style={{ color: lowStockCt > 0 ? '#d97706' : undefined, fontWeight: lowStockCt > 0 ? 700 : undefined }}>
                              {lowStockCt}
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {r.loading ? '…' : (
                            <span style={{ color: expiredCt > 0 ? 'var(--color-danger, #dc2626)' : undefined, fontWeight: expiredCt > 0 ? 700 : undefined }}>
                              {expiredCt}
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                          {r.loading ? '…' : formatCurrency(totalValue)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Top 10 Obat Tertinggi Nilai ── */}
        <div className={styles.card} style={{ padding: 0 }}>
          <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-border)', fontWeight: 600 }}>
            Top 10 Obat — Nilai Inventori Tertinggi
          </div>
          {loadingReports ? (
            <div style={{ padding: 'var(--space-4)' }}>
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={36} style={{ marginBottom: 6 }} />)}
            </div>
          ) : topDrugs.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>📊</div>
              <div className={styles.emptyStateTitle}>Belum ada data inventori</div>
            </div>
          ) : (
            <div style={{ padding: 'var(--space-3)' }}>
              {topDrugs.map((drug, idx) => {
                const pct = grandTotalValue > 0 ? (drug.totalValue / grandTotalValue) * 100 : 0;
                return (
                  <div key={drug.name} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', marginBottom: 3 }}>
                      <span style={{ fontWeight: 600 }}>
                        <span style={{ color: 'var(--color-muted)', marginRight: 6 }}>#{idx + 1}</span>
                        {drug.name}
                      </span>
                      <span style={{ color: 'var(--color-muted)', flexShrink: 0, marginLeft: 8 }}>
                        {drug.totalQty.toLocaleString('id-ID')} unit
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div style={{ height: 6, borderRadius: 999, background: 'var(--color-border)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${pct}%`, borderRadius: 999,
                        background: 'var(--color-primary)', transition: 'width 0.4s',
                      }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2, textAlign: 'right' }}>
                      {formatCurrency(drug.totalValue)} ({pct.toFixed(1)}%)
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
