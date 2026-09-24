import { useState, useEffect, useCallback } from 'react';
import { authClient } from '../api/client';
import type { User, PaginationMeta, UserRole } from '../types/admin';

// ─────────────────────────────────────────────────────────────────────────────
// useAdminUsers — paginated user list with search, role filter, sorting
// Endpoint: GET /v1/auth/admin/users
// ─────────────────────────────────────────────────────────────────────────────

export interface UserFilters {
  search: string;
  role: UserRole | '';
  status: string;
  page: number;
  limit: number;
  sortBy: 'name' | 'email' | 'role' | 'createdAt';
  sortDir: 'asc' | 'desc';
}

const DEFAULT_FILTERS: UserFilters = {
  search: '',
  role: '',
  status: '',
  page: 1,
  limit: 20,
  sortBy: 'createdAt',
  sortDir: 'desc',
};

export function useAdminUsers(filters: Partial<UserFilters> = {}) {
  const f: UserFilters = { ...DEFAULT_FILTERS, ...filters };

  const [users, setUsers]     = useState<User[]>([]);
  const [meta, setMeta]       = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const fetchUsers = useCallback(async (opts: UserFilters) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(opts.page),
        limit: String(opts.limit),
      });
      if (opts.search) params.set('q', opts.search);
      if (opts.role)   params.set('role', opts.role);
      if (opts.status) params.set('status', opts.status);

      const res = await authClient.get(`/v1/auth/admin/users?${params.toString()}`);
      const d = res.data as { data: User[]; meta: PaginationMeta };
      // Client-side sort since backend doesn't support sortBy yet
      let rows = d.data ?? [];
      rows = [...rows].sort((a, b) => {
        const av = a[opts.sortBy] ?? '';
        const bv = b[opts.sortBy] ?? '';
        const cmp = String(av).localeCompare(String(bv));
        return opts.sortDir === 'asc' ? cmp : -cmp;
      });
      setUsers(rows);
      setMeta(d.meta ?? null);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Gagal memuat daftar pengguna.';
      setError(msg);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.page, f.limit, f.search, f.role, f.status, f.sortBy, f.sortDir]);

  return { users, meta, loading, error, refetch: () => fetchUsers(f) };
}
