import React from 'react';
import styles from './DataTable.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Tipe Publik
// ─────────────────────────────────────────────────────────────────────────────

/** Definisi satu kolom tabel */
export interface Column<T> {
  /** Kunci data dari baris, atau string bebas jika menggunakan render() */
  key: keyof T | string;
  /** Label header kolom */
  header: string;
  /** Render cell kustom — jika tidak ada, nilai `row[key]` akan ditampilkan */
  render?: (row: T) => React.ReactNode;
  /** Apakah kolom ini bisa disorting? Default: false */
  sortable?: boolean;
  /** Lebar kolom, misal '120px', '20%', 'auto' */
  width?: string;
  /** Rata teks: kiri (default), tengah, kanan */
  align?: 'left' | 'center' | 'right';
}

/** Props komponen DataTable */
export interface DataTableProps<T> {
  /** Definisi kolom-kolom tabel */
  columns: Column<T>[];
  /** Data yang akan ditampilkan */
  data: T[];
  /** Tampilkan skeleton loading? */
  loading?: boolean;
  /** Pesan yang ditampilkan saat data kosong */
  emptyMessage?: string;
  /** Callback saat baris diklik */
  onRowClick?: (row: T) => void;
  /** Aktifkan checkbox selection per baris? */
  selectable?: boolean;
  /** Set ID baris yang sedang dipilih */
  selectedIds?: Set<string>;
  /** Callback saat seleksi berubah */
  onSelectChange?: (ids: Set<string>) => void;
  /** Fungsi untuk mendapatkan ID unik dari baris */
  getRowId?: (row: T) => string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: nilai sort yang aman
// ─────────────────────────────────────────────────────────────────────────────

type SortOrder = 'asc' | 'desc';

interface SortState {
  key: string;
  order: SortOrder;
}

function getSortValue(row: Record<string, unknown>, key: string): string | number {
  const val = row[key];
  if (typeof val === 'string' || typeof val === 'number') return val;
  return '';
}

function sortData<T>(data: T[], sort: SortState | null): T[] {
  if (!sort) return data;
  return [...data].sort((a, b) => {
    const aVal = getSortValue(a as Record<string, unknown>, sort.key);
    const bVal = getSortValue(b as Record<string, unknown>, sort.key);
    if (aVal < bVal) return sort.order === 'asc' ? -1 : 1;
    if (aVal > bVal) return sort.order === 'asc' ? 1 : -1;
    return 0;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Komponen: SkeletonRows — tampilkan placeholder loading
// ─────────────────────────────────────────────────────────────────────────────

function SkeletonRows({ count, cols }: { count: number; cols: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, rowIdx) => (
        <tr key={rowIdx} className={styles.skeletonRow}>
          {Array.from({ length: cols }).map((__, colIdx) => (
            <td key={colIdx}>
              <div
                className={styles.skeletonCell}
                style={{ width: colIdx === 0 ? '60%' : colIdx === cols - 1 ? '40%' : '80%' }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DataTable — komponen utama
// ─────────────────────────────────────────────────────────────────────────────

export default function DataTable<T>({
  columns,
  data,
  loading = false,
  emptyMessage = 'Tidak ada data untuk ditampilkan.',
  onRowClick,
  selectable = false,
  selectedIds = new Set<string>(),
  onSelectChange,
  getRowId,
}: DataTableProps<T>) {
  const [sort, setSort] = React.useState<SortState | null>(null);

  // Hitung jumlah kolom total (termasuk kolom checkbox jika selectable)
  const totalCols = columns.length + (selectable ? 1 : 0);

  // Fungsi toggle sort per kolom
  const handleSort = (key: string) => {
    setSort((prev) => {
      if (prev?.key === key) {
        return { key, order: prev.order === 'asc' ? 'desc' : 'asc' };
      }
      return { key, order: 'asc' };
    });
  };

  // Data yang sudah disortir
  const sortedData = React.useMemo(() => sortData(data, sort), [data, sort]);

  // Helper ID baris
  const getRowIdSafe = React.useCallback(
    (row: T, idx: number): string => {
      if (getRowId) return getRowId(row);
      const asRecord = row as Record<string, unknown>;
      if (typeof asRecord['id'] === 'string') return asRecord['id'] as string;
      return String(idx);
    },
    [getRowId],
  );

  // Handle toggle seleksi semua baris
  const handleSelectAll = (checked: boolean) => {
    if (!onSelectChange) return;
    if (checked) {
      const allIds = new Set(sortedData.map((row, idx) => getRowIdSafe(row, idx)));
      onSelectChange(allIds);
    } else {
      onSelectChange(new Set());
    }
  };

  // Handle toggle seleksi satu baris
  const handleSelectRow = (id: string, checked: boolean) => {
    if (!onSelectChange) return;
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    onSelectChange(next);
  };

  const allSelected = sortedData.length > 0 && sortedData.every((row, idx) => selectedIds.has(getRowIdSafe(row, idx)));
  const someSelected = !allSelected && sortedData.some((row, idx) => selectedIds.has(getRowIdSafe(row, idx)));

  return (
    <div className={styles.wrapper}>
      <table className={`${styles.table} ${onRowClick ? styles.clickable : ''}`}>
        {/* ── Header ── */}
        <thead>
          <tr>
            {/* Kolom checkbox "pilih semua" */}
            {selectable && (
              <th className={styles.checkboxTh}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected; }}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  aria-label="Pilih semua baris"
                />
              </th>
            )}

            {columns.map((col) => {
              const isSorted = sort?.key === String(col.key);
              const thStyle: React.CSSProperties = {};
              if (col.width)  thStyle.width    = col.width;
              if (col.align)  thStyle.textAlign = col.align;

              return (
                <th
                  key={String(col.key)}
                  style={thStyle}
                  className={col.sortable ? styles.sortableHeader : undefined}
                  onClick={col.sortable ? () => handleSort(String(col.key)) : undefined}
                  aria-sort={
                    col.sortable
                      ? isSorted
                        ? sort?.order === 'asc' ? 'ascending' : 'descending'
                        : 'none'
                      : undefined
                  }
                >
                  {col.header}
                  {col.sortable && (
                    <span className={`${styles.sortIcon} ${isSorted ? styles.sortIconActive : ''}`}>
                      {isSorted ? (sort?.order === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        {/* ── Tbody ── */}
        <tbody>
          {loading ? (
            /* Skeleton loading */
            <SkeletonRows count={5} cols={totalCols} />
          ) : sortedData.length === 0 ? (
            /* Empty state */
            <tr className={styles.emptyRow}>
              <td colSpan={totalCols}>
                <div className={styles.emptyContent}>
                  <span className={styles.emptyIcon}>📋</span>
                  <span className={styles.emptyMessage}>{emptyMessage}</span>
                </div>
              </td>
            </tr>
          ) : (
            sortedData.map((row, idx) => {
              const rowId    = getRowIdSafe(row, idx);
              const isSelected = selectedIds.has(rowId);

              return (
                <tr
                  key={rowId}
                  className={isSelected ? styles.rowSelected : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  role={onRowClick ? 'button' : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={onRowClick ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onRowClick(row);
                    }
                  } : undefined}
                >
                  {selectable && (
                    <td
                      className={styles.checkboxTd}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={isSelected}
                        onChange={(e) => handleSelectRow(rowId, e.target.checked)}
                        aria-label={`Pilih baris ${idx + 1}`}
                      />
                    </td>
                  )}

                  {columns.map((col) => {
                    const tdStyle: React.CSSProperties = {};
                    if (col.align) tdStyle.textAlign = col.align;

                    const cellValue = col.render
                      ? col.render(row)
                      : (() => {
                          const val = (row as Record<string, unknown>)[String(col.key)];
                          if (val === null || val === undefined) return '—';
                          return String(val);
                        })();

                    return (
                      <td key={String(col.key)} style={tdStyle}>
                        {cellValue}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
