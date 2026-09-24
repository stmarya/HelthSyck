import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { Link } from 'react-router-dom';
import { authClient } from '../api/client';
import styles from './Page.module.css';

interface LogEntry {
  id: string;
  timestamp: string;
  userEmail: string;
  action: string;
  resource: string;
  ipAddress?: string;
  status: 'SUCCESS' | 'FAILURE' | 'WARNING';
  detail?: string;
}

interface LogsResponse {
  data: LogEntry[];
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

const STATUS_STYLE: Record<LogEntry['status'], { bg: string; color: string }> = {
  SUCCESS: { bg: 'var(--color-success-bg)', color: 'var(--color-success)' },
  FAILURE: { bg: 'var(--color-danger-bg)', color: 'var(--color-danger)' },
  WARNING: { bg: 'var(--color-warning-bg)', color: 'var(--color-warning)' },
};

const ACTION_OPTIONS = [
  'LOGIN_SUCCESS',
  'LOGIN_FAIL',
  'LOGOUT',
  'TOKEN_REFRESH',
  'PASSWORD_CHANGE',
  'ADMIN_USER_CREATE',
  'ADMIN_USER_STATUS_UPDATE',
];

function getApiErrorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = err.response?.data as { detail?: string } | undefined;
    if (detail?.detail) return detail.detail;
  }
  return err instanceof Error ? err.message : fallback;
}

function exportLogsCsv(logs: LogEntry[]) {
  const header = ['Timestamp', 'User', 'Aksi', 'Resource', 'IP Address', 'Status', 'Detail'];
  const rows = logs.map((l) => [
    l.timestamp, l.userEmail, l.action, l.resource, l.ipAddress ?? '', l.status, l.detail ?? '',
  ]);
  const csv = [header, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `activity-log-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ActivityLogPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<LogEntry['status'] | ''>('');
  const [actionFilter, setActionFilter] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const LIMIT = 25;

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(LIMIT),
    });
    if (searchQuery) params.set('q', searchQuery);
    if (statusFilter) params.set('status', statusFilter);
    if (actionFilter) params.set('action', actionFilter);
    return params.toString();
  }, [LIMIT, actionFilter, page, searchQuery, statusFilter]);

  useEffect(() => () => {
    mountedRef.current = false;
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(1);
    }, 400);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;

    const loadLogs = async () => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);
      try {
        const res = await authClient.get<LogsResponse>('/v1/auth/admin/logs?' + buildQuery());
        if (cancelled || !mountedRef.current || requestId !== requestIdRef.current) return;
        setLogs(res.data.data ?? []);
        setTotal(res.data.meta?.total ?? 0);
        setPageCount(Math.max(1, res.data.meta?.totalPages ?? 1));
      } catch (err) {
        if (cancelled || !mountedRef.current || requestId !== requestIdRef.current) return;
        setLogs([]);
        setTotal(0);
        setPageCount(1);
        setError(getApiErrorMessage(err, 'Gagal memuat log aktivitas.'));
      } finally {
        if (!cancelled && mountedRef.current && requestId === requestIdRef.current) setLoading(false);
      }
    };

    void loadLogs();
    return () => { cancelled = true; };
  }, [buildQuery, reloadKey]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      const requestId = ++requestIdRef.current;
      void authClient.get<LogsResponse>('/v1/auth/admin/logs?' + buildQuery())
        .then((res) => {
          if (!mountedRef.current || requestId !== requestIdRef.current) return;
          setLogs(res.data.data ?? []);
          setTotal(res.data.meta?.total ?? 0);
          setPageCount(Math.max(1, res.data.meta?.totalPages ?? 1));
          setError(null);
        })
        .catch((err) => {
          if (!mountedRef.current || requestId !== requestIdRef.current) return;
          setError(getApiErrorMessage(err, 'Gagal menyegarkan log aktivitas.'));
        });
    }, 30_000);
    return () => clearInterval(id);
  }, [autoRefresh, buildQuery]);

  const uniqueActions = useMemo(
    () => Array.from(new Set([...ACTION_OPTIONS, ...logs.map((log) => log.action)])).sort(),
    [logs],
  );

  const handleExport = () => exportLogsCsv(logs);

  const permissionDenied = error?.toLowerCase().includes('admin role required') || error?.toLowerCase().includes('forbidden');
  const unavailable = error?.toLowerCase().includes('not found') || error?.toLowerCase().includes('belum tersedia');

  return (
    <div className={styles.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className={styles.title} style={{ margin: 0 }}>Log Aktivitas</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-muted)' }}>
            Audit log admin dari auth-service.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
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
            disabled={loading || logs.length === 0}
            className={`${styles.btn} ${styles.btnSecondary}`}
          >
            Export Halaman Ini
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        {(['SUCCESS', 'FAILURE', 'WARNING'] as const).map((status) => {
          const palette = STATUS_STYLE[status];
          const count = logs.filter((entry) => entry.status === status).length;
          const active = statusFilter === status;
          return (
            <button
              key={status}
              type="button"
              onClick={() => {
                setStatusFilter((prev) => prev === status ? '' : status);
                setPage(1);
              }}
              style={{
                background: palette.bg,
                border: `1px solid ${palette.color}40`,
                borderRadius: 8,
                padding: '14px 18px',
                cursor: 'pointer',
                outline: active ? `2px solid ${palette.color}` : 'none',
                textAlign: 'left',
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 800, color: palette.color }}>{count}</div>
              <div style={{ fontSize: 12, color: palette.color, marginTop: 3 }}>{status}</div>
            </button>
          );
        })}
      </div>

      <div className={styles.card}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <input
            type="search"
            placeholder="Cari user, aksi, atau metadata..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{ flex: '1 1 200px', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 14 }}
          />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as LogEntry['status'] | ''); setPage(1); }}
            style={{ padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 14 }}
          >
            <option value="">Semua Status</option>
            <option value="SUCCESS">Success</option>
            <option value="FAILURE">Failure</option>
            <option value="WARNING">Warning</option>
          </select>
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            style={{ padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 14 }}
          >
            <option value="">Semua Aksi</option>
            {uniqueActions.map((action) => <option key={action} value={action}>{action}</option>)}
          </select>
        </div>

        {error && (
          <div className={styles.errorState}>
            <span className={styles.errorStateIcon}>{permissionDenied ? '⛔' : unavailable ? 'ℹ️' : '⚠️'}</span>
            <div>
              <div>{error}</div>
              {permissionDenied && <div style={{ fontSize: 12 }}>Hanya admin yang dapat melihat log ini.</div>}
              {unavailable && (
                <div style={{ fontSize: 12 }}>
                  Endpoint audit belum tersedia penuh. Lihat juga <Link to="/health">Health Check</Link> untuk status layanan.
                </div>
              )}
            </div>
            <button
              className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`}
              style={{ marginLeft: 'auto' }}
              onClick={() => setReloadKey((prev) => prev + 1)}
            >
              Coba Lagi
            </button>
          </div>
        )}

        {!error && (
          <>
            <div style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 10 }}>
              Menampilkan {logs.length} dari {total} entri log • ekspor mencakup halaman ini
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
                  {loading ? (
                    Array.from({ length: 5 }).map((_, index) => (
                      <tr key={index}>
                        <td colSpan={6}>
                          <div style={{ height: 16, borderRadius: 6, background: 'var(--color-surface-2)', animation: 'pulse 1.5s ease infinite' }} />
                        </td>
                      </tr>
                    ))
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div className={styles.emptyState}>
                          <div className={styles.emptyStateIcon}>🗂️</div>
                          <div className={styles.emptyStateTitle}>Belum ada log aktivitas</div>
                          <div className={styles.emptyStateDesc}>
                            Coba ubah filter pencarian atau tunggu aktivitas admin baru tercatat.
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => {
                      const palette = STATUS_STYLE[log.status];
                      return (
                        <tr key={log.id} title={log.detail}>
                          <td style={{ fontSize: 12, color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                            {new Date(log.timestamp).toLocaleString('id-ID', {
                              month: 'short', day: '2-digit',
                              hour: '2-digit', minute: '2-digit', second: '2-digit',
                            })}
                          </td>
                          <td style={{ fontSize: 12 }}>{log.userEmail}</td>
                          <td>
                            <code style={{
                              fontSize: 11,
                              background: 'var(--color-surface-2)',
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontFamily: 'monospace',
                            }}>
                              {log.action}
                            </code>
                          </td>
                          <td style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'monospace' }}>{log.resource}</td>
                          <td style={{ fontSize: 12, color: 'var(--color-muted)', fontFamily: 'monospace' }}>{log.ipAddress ?? '—'}</td>
                          <td>
                            <span style={{
                              background: palette.bg,
                              color: palette.color,
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 600,
                            }}>
                              {log.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className={styles.pagination}>
              <span>{total} entri total</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button className={styles.pageBtn} onClick={() => setPage(1)} disabled={page === 1}>«</button>
                <button className={styles.pageBtn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
                <span style={{ padding: '4px 10px', fontSize: 13 }}>Hal. {page} dari {pageCount || 1}</span>
                <button className={styles.pageBtn} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount}>›</button>
                <button className={styles.pageBtn} onClick={() => setPage(pageCount)} disabled={page >= pageCount}>»</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
