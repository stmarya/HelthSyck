import { useCallback, useEffect, useState } from 'react';
import { pharmacyClient } from '../api/client';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import { Skeleton } from '../components/Skeleton';
import styles from './Page.module.css';

interface PharmacySummary {
  id: string;
  name: string;
  license_number: string;
  is_active: boolean;
  drug_count: number;
  total_units: number;
  low_stock_count: number;
  expired_count: number;
  expiring_soon_count: number;
  total_value: string | number;
}
interface Totals {
  pharmacy_count: number;
  drug_count: number;
  total_units: number;
  low_stock_count: number;
  expired_count: number;
  expiring_soon_count: number;
  total_value: string | number;
}
interface TopDrug {
  id: string;
  generic_name: string;
  brand_name: string | null;
  total_units: number;
  total_value: string | number;
}
interface ReportData {
  pharmacies: PharmacySummary[];
  totals: Totals;
  topDrugs: TopDrug[];
  generatedAt: string;
}

function money(value: string | number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value));
}
function csv(value: unknown): string { return `"${String(value ?? '').replace(/"/g, '""')}"`; }
function message(error: unknown): string {
  return (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    ?? (error instanceof Error ? error.message : 'Gagal memuat laporan farmasi');
}
function exportCsv(report: ReportData): void {
  const rows = [
    ['Apotek', 'Status', 'Jenis Obat', 'Total Unit', 'Stok Rendah', 'Segera Kedaluwarsa', 'Kedaluwarsa', 'Nilai Inventori'],
    ...report.pharmacies.map((item) => [
      item.name, item.is_active ? 'Aktif' : 'Nonaktif', item.drug_count, item.total_units,
      item.low_stock_count, item.expiring_soon_count, item.expired_count, Number(item.total_value),
    ]),
  ];
  const blob = new Blob(['\uFEFF' + rows.map((row) => row.map(csv).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `laporan-farmasi-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function PharmacyReportsPage() {
  const { showToast } = useToast();
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await pharmacyClient.get<{ data: ReportData }>('/v1/pharmacies/reports/summary');
      setReport(response.data.data);
    } catch (loadError) {
      const detail = message(loadError);
      setError(detail);
      setReport(null);
      showToast(detail, 'error');
    } finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const totals = report?.totals;
  return <div className={styles.page}>
    <PageHeader title="Laporan Farmasi"
      subtitle={report ? `Snapshot konsisten ${new Date(report.generatedAt).toLocaleString('id-ID')}` : 'Agregasi inventori server-side'}
      breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Farmasi', to: '/pharmacy' }, { label: 'Laporan Farmasi' }]}
      actions={<div style={{ display: 'flex', gap: 8 }}>
        <button className={`${styles.btn} ${styles.btnOutline}`} onClick={() => void load()} disabled={loading}>↻ Refresh</button>
        <button className={`${styles.btn} ${styles.btnOutline}`} onClick={() => report && exportCsv(report)} disabled={!report || loading}>⬇ CSV lengkap</button>
      </div>}
    />

    {error ? <div className={styles.errorState}><span>⚠ {error}</span>
      <button className={`${styles.btn} ${styles.btnSm}`} onClick={() => void load()}>Coba Lagi</button></div> : null}

    {loading ? <div className={styles.statGrid}>{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} height={88} />)}</div>
      : totals ? <>
        <div className={styles.statGrid}>
          {[
            ['Total Apotek', totals.pharmacy_count, '🏪'], ['Jenis/Bets Obat', totals.drug_count, '💊'],
            ['Total Unit', totals.total_units, '📦'], ['Stok Rendah', totals.low_stock_count, '⚠'],
            ['Segera Kedaluwarsa', totals.expiring_soon_count, '🗓'], ['Sudah Kedaluwarsa', totals.expired_count, '🚨'],
          ].map(([label, value, icon]) => <div key={String(label)} className={styles.statCard}>
            <div style={{ fontSize: 22 }}>{icon}</div><div className={styles.statValue}>{Number(value).toLocaleString('id-ID')}</div>
            <div className={styles.statLabel}>{label}</div></div>)}
        </div>
        <div className={styles.card}><div style={{ color: 'var(--color-muted)', fontSize: 12 }}>TOTAL NILAI INVENTORI</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-primary)' }}>{money(totals.total_value)}</div></div>

        <div className={styles.responsiveTwoCol}>
          <div className={styles.card} style={{ padding: 0 }}>
            <div style={{ padding: 16, fontWeight: 600, borderBottom: '1px solid var(--color-border)' }}>Ringkasan per Apotek</div>
            <div className={styles.tableWrapper}><table className={styles.table}>
              <thead><tr><th>Apotek</th><th>Status</th><th>Obat</th><th>Rendah</th><th>Kedaluwarsa</th><th>Nilai</th></tr></thead>
              <tbody>{report!.pharmacies.map((item) => <tr key={item.id}>
                <td><strong>{item.name}</strong><div><code>{item.license_number}</code></div></td>
                <td><span className={styles.badge} style={{ color: item.is_active ? 'var(--color-success)' : 'var(--color-danger)' }}>
                  {item.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
                <td>{item.drug_count}</td><td>{item.low_stock_count}</td><td>{item.expired_count}</td><td>{money(item.total_value)}</td>
              </tr>)}</tbody>
            </table></div>
          </div>
          <div className={styles.card} style={{ padding: 0 }}>
            <div style={{ padding: 16, fontWeight: 600, borderBottom: '1px solid var(--color-border)' }}>Top 10 Nilai Inventori</div>
            {report!.topDrugs.length === 0 ? <div className={styles.emptyState}>Belum ada inventori</div>
              : <div style={{ padding: 16 }}>{report!.topDrugs.map((drug, index) => {
                const percentage = Number(totals.total_value) > 0 ? Number(drug.total_value) / Number(totals.total_value) * 100 : 0;
                return <div key={drug.id} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong>#{index + 1} {drug.generic_name}{drug.brand_name ? ` (${drug.brand_name})` : ''}</strong>
                    <span>{Number(drug.total_units).toLocaleString('id-ID')} unit</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--color-border)', borderRadius: 99, overflow: 'hidden', margin: '5px 0' }}>
                    <div style={{ height: '100%', width: `${percentage}%`, background: 'var(--color-primary)' }} /></div>
                  <div style={{ textAlign: 'right', color: 'var(--color-muted)', fontSize: 12 }}>{money(drug.total_value)} ({percentage.toFixed(1)}%)</div>
                </div>;
              })}</div>}
          </div>
        </div>
      </> : null}
  </div>;
}
