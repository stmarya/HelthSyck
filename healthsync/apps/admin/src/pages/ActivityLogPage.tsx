import { useState, useRef } from 'react';
import styles from './Page.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface LogEntry {
  id: string;
  timestamp: string;
  userEmail: string;
  action: string;
  resource: string;
  ipAddress: string;
  status: 'SUCCESS' | 'FAILURE' | 'WARNING';
  detail?: string;
}

// Audit log data is intentionally empty until a real backend endpoint is available.

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  SUCCESS: { bg: '#f0fdf4', color: '#166534' },
  FAILURE: { bg: '#fef2f2', color: '#991b1b' },
  WARNING: { bg: '#fffbeb', color: '#92400e' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Export CSV helper
// ─────────────────────────────────────────────────────────────────────────────

function exportLogsCsv(logs: LogEntry[]) {
  const header = ['Timestamp', 'User', 'Aksi', 'Resource', 'IP Address', 'Status', 'Detail'];
  const rows = logs.map((l) => [
    l.timestamp, l.userEmail, l.action, l.resource, l.ipAddress, l.status, l.detail ?? '',
  ]);
  const csv = [header, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `activity-log-${Date.now()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main ActivityLogPage
// ─────────────────────────────────────────────────────────────────────────────

export default function ActivityLogPage() {
  const ALL_LOGS = useRef<LogEntry[]>([]);

  const [searchInput, setSearchInput]   = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [autoRefresh, setAutoRefresh]   = useState(false);
  const [page, setPage]                 = useState(1);
  const LIMIT = 25;

  // Auto-refresh is disabled until the audit-log endpoint is available.

  // Filter
  const filtered = ALL_LOGS.current.filter((l) => {
    const q = searchInput.toLowerCase();
    const matchSearch = !q || l.userEmail.includes(q) || l.action.includes(q) || l.resource.includes(q);
    const matchStatus = !statusFilter || l.status === statusFilter;
    const matchAction = !actionFilter || l.action === actionFilter;
    return matchSearch && matchStatus && matchAction;
  });

  const pageCount = Math.ceil(filtered.length / LIMIT);
  const paged = filtered.slice((page - 1) * LIMIT, page * LIMIT);

  const uniqueActions = Array.from(new Set(ALL_LOGS.current.map((l) => l.action))).sort();

  const handleExport = () => exportLogsCsv(filtered);

  return (
    <div className={styles.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 className={styles.title} style={{ margin: 0 }}>Log Aktivitas</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9E9E9E' }}>
            Data audit belum tersedia — endpoint backend GET /v1/auth/admin/logs belum tersedia
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh 30s
          </label>
          <button
            onClick={handleExport}
            style={{ padding: '7px 14px', fontSize: 13, border: '1px solid #E0E0E0', borderRadius: 6, background: '#fff', cursor: 'pointer' }}
          >
            ↓ Export CSV
          </button>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        {(['SUCCESS', 'FAILURE', 'WARNING'] as const).map((s) => {
          const c = STATUS_STYLE[s]!;
          const count = ALL_LOGS.current.filter((l) => l.status === s).length;
          return (
            <div key={s} style={{
              background: c.bg, border: `1px solid ${c.color}40`,
              borderRadius: 8, padding: '14px 18px',
              cursor: 'pointer',
              outline: statusFilter === s ? `2px solid ${c.color}` : 'none',
            }} onClick={() => setStatusFilter((prev) => prev === s ? '' : s)}>
              <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{count}</div>
              <div style={{ fontSize: 12, color: c.color, marginTop: 3 }}>{s}</div>
            </div>
          );
        })}
      </div>

      <div className={styles.card}>
        {/* Toolbar */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <input
            type="search"
            placeholder="Cari user, aksi, atau resource..."
            value={searchInput}
            onChange={(e) => { setSearchInput(e.target.value); setPage(1); }}
            style={{ flex: '1 1 200px', padding: '8px 12px', border: '1px solid #E0E0E0', borderRadius: 6, fontSize: 14 }}
          />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            style={{ padding: '8px 12px', border: '1px solid #E0E0E0', borderRadius: 6, fontSize: 14 }}
          >
            <option value="">Semua Status</option>
            <option value="SUCCESS">Success</option>
            <option value="FAILURE">Failure</option>
            <option value="WARNING">Warning</option>
          </select>
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            style={{ padding: '8px 12px', border: '1px solid #E0E0E0', borderRadius: 6, fontSize: 14 }}
          >
            <option value="">Semua Aksi</option>
            {uniqueActions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div style={{ fontSize: 13, color: '#9E9E9E', marginBottom: 10 }}>
          Menampilkan {paged.length} dari {filtered.length} entri log
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Waktu</th>
                <th>User</th>
                <th>Aksi</th>
                <th>Resource</th>
                <th>IP</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((log) => {
                const sc = STATUS_STYLE[log.status] ?? { bg: '#fff', color: '#000' };
                return (
                  <tr key={log.id} title={log.detail}>
                    <td style={{ fontSize: 12, color: '#9E9E9E', whiteSpace: 'nowrap' }}>
                      {new Date(log.timestamp).toLocaleString('id-ID', {
                        month: 'short', day: '2-digit',
                        hour: '2-digit', minute: '2-digit', second: '2-digit',
                      })}
                    </td>
                    <td style={{ fontSize: 12 }}>{log.userEmail}</td>
                    <td>
                      <code style={{
                        fontSize: 11, background: '#F5F5F5', padding: '2px 6px',
                        borderRadius: 4, fontFamily: 'monospace',
                      }}>
                        {log.action}
                      </code>
                    </td>
                    <td style={{ fontSize: 11, color: '#9E9E9E', fontFamily: 'monospace' }}>{log.resource}</td>
                    <td style={{ fontSize: 12, color: '#9E9E9E', fontFamily: 'monospace' }}>{log.ipAddress}</td>
                    <td>
                      <span style={{
                        ...sc, display: 'inline-block', padding: '2px 8px',
                        borderRadius: 999, fontSize: 11, fontWeight: 600,
                      }}>
                        {log.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className={styles.pagination}>
          <span>{filtered.length} entri total</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className={styles.pageBtn} onClick={() => setPage(1)} disabled={page === 1}>«</button>
            <button className={styles.pageBtn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
            <span style={{ padding: '4px 10px', fontSize: 13 }}>Hal. {page} dari {pageCount || 1}</span>
            <button className={styles.pageBtn} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount}>›</button>
            <button className={styles.pageBtn} onClick={() => setPage(pageCount)} disabled={page >= pageCount}>»</button>
          </div>
        </div>
      </div>
    </div>
  );
}
