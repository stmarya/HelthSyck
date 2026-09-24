import { useEffect, useState, useCallback, useRef } from 'react';
import { isAxiosError } from 'axios';
import { authClient } from '../api/client';
import type { User, UserRole, UserStatus, CreateUserForm } from '../types/admin';
import { Modal, ConfirmDialog } from '../components/Modal';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import { InputField, SelectField } from '../components/FormField';
import styles from './Page.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Konstanta
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_OPTIONS: { value: UserRole | ''; label: string }[] = [
  { value: '',                label: 'Semua Role' },
  { value: 'PATIENT',         label: 'Pasien' },
  { value: 'DOCTOR',          label: 'Dokter' },
  { value: 'COMMAND_CENTER',  label: 'Command Center' },
  { value: 'PHARMACIST',      label: 'Apoteker' },
  { value: 'AMBULANCE_DRIVER',label: 'Pengemudi Ambulans' },
  { value: 'ADMIN',           label: 'Admin' },
];

const STATUS_OPTIONS: { value: UserStatus | ''; label: string }[] = [
  { value: '',                     label: 'Semua Status' },
  { value: 'ACTIVE',               label: 'Aktif' },
  { value: 'INACTIVE',             label: 'Tidak Aktif' },
  { value: 'SUSPENDED',            label: 'Ditangguhkan' },
  { value: 'PENDING_VERIFICATION', label: 'Menunggu Verifikasi' },
];

const LIMIT_OPTIONS = [10, 20, 50, 100];

const ROLE_BADGE: Record<string, { bg: string; color: string }> = {
  PATIENT:          { bg: '#f5f5f5',               color: '#616161' },
  DOCTOR:           { bg: 'var(--color-info-bg)',   color: 'var(--color-primary)' },
  COMMAND_CENTER:   { bg: 'var(--color-warning-bg)',color: 'var(--color-warning)' },
  PHARMACIST:       { bg: '#fce4ec',                color: '#c2185b' },
  AMBULANCE_DRIVER: { bg: '#fff3e0',                color: '#e65100' },
  ADMIN:            { bg: 'var(--color-accent-light)', color: 'var(--color-accent)' },
};

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  ACTIVE:               { bg: 'var(--color-success-bg)', color: 'var(--color-success)' },
  INACTIVE:             { bg: '#f5f5f5',                 color: '#9e9e9e' },
  SUSPENDED:            { bg: 'var(--color-danger-bg)',  color: 'var(--color-danger)' },
  PENDING_VERIFICATION: { bg: 'var(--color-info-bg)',    color: 'var(--color-primary)' },
};

const ROLE_LABEL: Record<string, string> = {
  PATIENT: 'Pasien', DOCTOR: 'Dokter', COMMAND_CENTER: 'Command Center',
  PHARMACIST: 'Apoteker', AMBULANCE_DRIVER: 'Pengemudi Ambulans', ADMIN: 'Admin',
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Aktif', INACTIVE: 'Tidak Aktif',
  SUSPENDED: 'Ditangguhkan', PENDING_VERIFICATION: 'Menunggu Verifikasi',
};

function getApiErrorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = err.response?.data as { detail?: string } | undefined;
    if (detail?.detail) return detail.detail;
  }
  return err instanceof Error ? err.message : fallback;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-komponen Badge
// ─────────────────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const c = ROLE_BADGE[role] ?? { bg: '#f5f5f5', color: '#616161' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 999,
      fontSize: 11, fontWeight: 600, background: c.bg, color: c.color, whiteSpace: 'nowrap',
    }}>
      {ROLE_LABEL[role] ?? role}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_BADGE[status] ?? { bg: '#f5f5f5', color: '#616161' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 999,
      fontSize: 11, fontWeight: 600, background: c.bg, color: c.color, whiteSpace: 'nowrap',
    }}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal Detail Pengguna
// ─────────────────────────────────────────────────────────────────────────────

function UserDetailModal({
  user,
  onClose,
  onUpdateStatus,
  statusUpdating,
}: {
  user: User;
  onClose: () => void;
  onUpdateStatus: (status: UserStatus) => void;
  statusUpdating: boolean;
}) {
  const fmt = (val: string | undefined) => val ?? '—';
  const fmtDate = (s: string | undefined) => {
    if (!s) return '—';
    return new Date(s).toLocaleDateString('id-ID', {
      day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };
  const row = (label: string, value: string | JSX.Element) => (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px 16px', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
      <span style={{ fontSize: 12, color: 'var(--color-muted)', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--color-text)' }}>{value}</span>
    </div>
  );
  return (
    <Modal open title={`Detail Pengguna`} onClose={onClose} width={520}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%', background: 'var(--color-accent-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, fontWeight: 700, color: 'var(--color-accent)', flexShrink: 0,
        }}>
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{user.name}</div>
          <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>{user.email}</div>
        </div>
      </div>
      {row('ID', fmt(user.id))}
      {row('Email', fmt(user.email))}
      {row('Telepon', fmt(user.phone))}
      {row('Role', <RoleBadge role={user.role} />)}
      {row('Status', <StatusBadge status={user.status} />)}
      {row('Terdaftar', fmtDate(user.createdAt))}
      {row('Login Terakhir', fmtDate(user.lastLoginAt))}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--color-muted)', fontWeight: 600, marginBottom: 8 }}>
          Ubah Status
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['ACTIVE', 'INACTIVE', 'SUSPENDED'] as const).map((status) => (
            <button
              key={status}
              type="button"
              className={`${styles.btn} ${status === 'SUSPENDED' ? styles.btnDangerOutline : styles.btnSecondary}`}
              disabled={statusUpdating || user.status === status}
              onClick={() => onUpdateStatus(status)}
            >
              {STATUS_LABEL[status]}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal Tambah Pengguna
// ─────────────────────────────────────────────────────────────────────────────

interface AddUserModalProps {
  onClose: () => void;
  onSubmit: (form: CreateUserForm) => void | Promise<void>;
  submitting: boolean;
}

function AddUserModal({ onClose, onSubmit, submitting }: AddUserModalProps) {
  const [form, setForm] = useState<CreateUserForm>({
    name: '', email: '', password: '', role: 'PATIENT', phone: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof CreateUserForm, string>>>({});

  const validate = (): boolean => {
    const errs: Partial<Record<keyof CreateUserForm, string>> = {};
    if (!form.name.trim()) errs.name = 'Nama lengkap wajib diisi';
    if (!form.email.trim()) errs.email = 'Email wajib diisi';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Format email tidak valid';
    if (!form.password) errs.password = 'Password wajib diisi';
    else if (form.password.length < 8) errs.password = 'Password minimal 8 karakter';
    if (!form.role) errs.role = 'Role wajib dipilih';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate() && !submitting) void onSubmit(form);
  };

  const set = <K extends keyof CreateUserForm>(key: K, val: CreateUserForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const roleSelectOptions = ROLE_OPTIONS.filter((r) => r.value !== '').map((r) => ({
    value: r.value as string, label: r.label,
  }));

  return (
    <Modal open title="Tambah Pengguna Baru" onClose={onClose} width={500}>
      <form onSubmit={handleSubmit} noValidate>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <InputField
            label="Nama Lengkap" required value={form.name}
            onChange={(e) => set('name', e.target.value)}
            error={errors.name} placeholder="Masukkan nama lengkap"
          />
          <InputField
            label="Email" required type="email" value={form.email}
            onChange={(e) => set('email', e.target.value)}
            error={errors.email} placeholder="contoh@email.com"
          />
          <InputField
            label="Password" required type="password" value={form.password}
            onChange={(e) => set('password', e.target.value)}
            error={errors.password} placeholder="Minimal 8 karakter"
          />
          <SelectField
            label="Role" required value={form.role}
            onChange={(e) => set('role', e.target.value as UserRole)}
            options={roleSelectOptions}
            error={errors.role}
          />
          <InputField
            label="Telepon" type="tel" value={form.phone ?? ''}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="Opsional"
          />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
          <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose} disabled={submitting}>
            Batal
          </button>
          <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={submitting}>
            {submitting ? 'Menyimpan…' : 'Tambah Pengguna'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ekspor CSV
// ─────────────────────────────────────────────────────────────────────────────

function exportToCsv(users: User[], filename = 'pengguna.csv') {
  const headers = ['ID', 'Nama', 'Email', 'Telepon', 'Role', 'Status', 'Terdaftar', 'Login Terakhir'];
  const rows = users.map((u) => [
    u.id, u.name, u.email, u.phone ?? '',
    ROLE_LABEL[u.role] ?? u.role,
    STATUS_LABEL[u.status] ?? u.status,
    new Date(u.createdAt).toLocaleDateString('id-ID'),
    u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('id-ID') : '',
  ]);
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Komponen Utama UsersPage
// ─────────────────────────────────────────────────────────────────────────────

interface UsersPageProps {
  defaultRole?: UserRole;
  title?: string;
}

export default function UsersPage({ defaultRole, title }: UsersPageProps) {
  const { showToast } = useToast();

  // ── State data ──
  const [users, setUsers]         = useState<User[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [total, setTotal]         = useState(0);

  // ── State filter ──
  const [searchInput, setSearchInput]   = useState('');
  const [searchQuery, setSearchQuery]   = useState('');
  const [roleFilter, setRoleFilter]     = useState<UserRole | ''>(defaultRole ?? '');
  const [statusFilter, setStatusFilter] = useState<UserStatus | ''>('');
  const [limit, setLimit]               = useState(20);
  const [page, setPage]                 = useState(1);

  // ── State UI ──
  const [selectedIds, setSelectedIds]       = useState<Set<string>>(new Set());
  const [detailUser, setDetailUser]         = useState<User | null>(null);
  const [showAddModal, setShowAddModal]     = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk]       = useState<{ open: boolean; action: string; label: string }>({
    open: false, action: '', label: '',
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Cleanup debounce ──
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  // ── Sinkron defaultRole jika berubah ──
  useEffect(() => {
    setRoleFilter(defaultRole ?? '');
    setPage(1);
  }, [defaultRole]);

  // ── Fetch pengguna ──
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (searchQuery)  params.set('q', searchQuery);
      if (roleFilter)   params.set('role', roleFilter);
      if (statusFilter) params.set('status', statusFilter);
      const res = await authClient.get(`/v1/auth/admin/users?${params.toString()}`);
      const body = res.data as { data: User[]; meta: { total: number } };
      setUsers(body.data ?? []);
      setTotal(body.meta?.total ?? 0);
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Gagal memuat daftar pengguna. Silakan coba lagi.');
      setError(msg);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [page, limit, searchQuery, roleFilter, statusFilter]);

  useEffect(() => { void fetchUsers(); }, [fetchUsers]);

  // ── Debounce search ──
  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearchQuery(value), 400);
  };

  // ── Seleksi ──
  const allIds = users.map((u) => u.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  const someSelected = !allSelected && allIds.some((id) => selectedIds.has(id));
  const selectedCount = selectedIds.size;

  const handleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(allIds) : new Set());
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  // ── Bulk action ──
  const triggerBulkAction = (action: string, label: string) => {
    setConfirmBulk({ open: true, action, label });
  };

  const updateUserStatus = useCallback(async (user: User, nextStatus: UserStatus) => {
    if (statusUpdatingId || user.status === nextStatus) return;
    setStatusUpdatingId(user.id);
    try {
      const res = await authClient.patch('/v1/auth/admin/users/' + user.id, { status: nextStatus });
      const updated = (res.data as { data?: User }).data;
      if (updated) {
        setUsers((prev) => prev.map((item) => (item.id === user.id ? { ...item, ...updated } : item)));
        setDetailUser((prev) => (prev?.id === user.id ? { ...prev, ...updated } : prev));
      }
      showToast(`Status ${user.email} diperbarui ke ${STATUS_LABEL[nextStatus]}.`, 'success');
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Gagal memperbarui status pengguna.'), 'error');
    } finally {
      setStatusUpdatingId(null);
    }
  }, [showToast, statusUpdatingId]);

  const executeBulkAction = async () => {
    if (bulkSubmitting || selectedIds.size === 0) return;
    const nextStatusMap: Record<string, UserStatus> = {
      activate: 'ACTIVE',
      deactivate: 'INACTIVE',
      suspend: 'SUSPENDED',
    };
    const nextStatus = nextStatusMap[confirmBulk.action];
    if (!nextStatus) return;
    const selectedUsers = users.filter((user) => selectedIds.has(user.id) && user.status !== nextStatus);
    if (selectedUsers.length === 0) {
      setConfirmBulk((prev) => ({ ...prev, open: false }));
      setSelectedIds(new Set());
      showToast('Semua pengguna terpilih sudah memiliki status tersebut.', 'info');
      return;
    }
    setBulkSubmitting(true);
    setConfirmBulk((prev) => ({ ...prev, open: false }));
    try {
      const results = await Promise.allSettled(
        selectedUsers.map((user) => authClient.patch('/v1/auth/admin/users/' + user.id, { status: nextStatus })),
      );
      const successCount = results.filter((result) => result.status === 'fulfilled').length;
      const firstFailure = results.find((result) => result.status === 'rejected');

      if (successCount > 0) {
        showToast(`${successCount} pengguna berhasil diperbarui ke ${STATUS_LABEL[nextStatus]}.`, 'success');
        setSelectedIds(new Set());
        await fetchUsers();
      }
      if (firstFailure?.status === 'rejected') {
        showToast(getApiErrorMessage(firstFailure.reason, 'Sebagian perubahan status gagal diproses.'), 'warning');
      }
      if (successCount === 0 && !firstFailure) {
        showToast('Tidak ada perubahan status yang perlu diterapkan.', 'info');
      }
    } finally {
      setBulkSubmitting(false);
    }
  };

  // ── Tambah pengguna ──
  const handleAddUser = async (form: CreateUserForm) => {
    if (createSubmitting) return;
    setCreateSubmitting(true);
    try {
      await authClient.post('/v1/auth/admin/users', form);
      setShowAddModal(false);
      showToast(`Pengguna ${form.email} berhasil dibuat.`, 'success');
      await fetchUsers();
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Gagal membuat pengguna baru.'), 'error');
    } finally {
      setCreateSubmitting(false);
    }
  };

  // ── Export CSV ──
  const handleExport = () => {
    const toExport = selectedCount > 0 ? users.filter((u) => selectedIds.has(u.id)) : users;
    exportToCsv(toExport, `pengguna-${new Date().toISOString().slice(0, 10)}.csv`);
    showToast(`${toExport.length} data diekspor ke CSV`, 'success');
  };

  // ── Paginasi ──
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const pageNumbers = () => {
    const pages: (number | '...')[] = [];
    if (pageCount <= 7) {
      for (let i = 1; i <= pageCount; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('...');
      for (let i = Math.max(2, page - 1); i <= Math.min(pageCount - 1, page + 1); i++) pages.push(i);
      if (page < pageCount - 2) pages.push('...');
      pages.push(pageCount);
    }
    return pages;
  };

  // ── Format tanggal ──
  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

  const pageTitle = title ?? 'Manajemen Pengguna';
  const fromIdx = total === 0 ? 0 : (page - 1) * limit + 1;
  const toIdx = Math.min(page * limit, total);

  return (
    <div className={styles.page}>
      <PageHeader
        title={pageTitle}
        subtitle={`${total.toLocaleString('id-ID')} pengguna terdaftar`}
        breadcrumbs={[{ label: 'Beranda', to: '/' }, { label: pageTitle }]}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={handleExport}>
              ↓ Ekspor CSV
            </button>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setShowAddModal(true)}>
              + Tambah Pengguna
            </button>
          </div>
        }
      />

      <div className={styles.card}>
        {/* ── Toolbar Filter ── */}
        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft}>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Cari nama atau email..."
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
            <select
              className={styles.filterSelect}
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value as UserRole | ''); setPage(1); }}
            >
              {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <select
              className={styles.filterSelect}
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as UserStatus | ''); setPage(1); }}
            >
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select
              className={styles.filterSelect}
              value={limit}
              onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
            >
              {LIMIT_OPTIONS.map((l) => <option key={l} value={l}>{l} per halaman</option>)}
            </select>
          </div>
        </div>

        {/* ── Toolbar Bulk Action ── */}
        {selectedCount > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
            background: 'var(--color-accent-light)', borderRadius: 8, marginBottom: 12,
            border: '1px solid var(--color-accent)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-accent)', flex: 1 }}>
              {selectedCount} pengguna dipilih
            </span>
            <button className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`}
              onClick={() => triggerBulkAction('activate', 'Aktifkan')}>
              ✓ Aktifkan
            </button>
            <button className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`}
              onClick={() => triggerBulkAction('deactivate', 'Nonaktifkan')}>
              ○ Nonaktifkan
            </button>
            <button className={`${styles.btn} ${styles.btnSm} ${styles.btnDangerOutline}`}
              onClick={() => triggerBulkAction('suspend', 'Tangguhkan')}>
              ⊘ Tangguhkan
            </button>
            <button className={`${styles.btn} ${styles.btnSm} ${styles.btnGhost}`}
              onClick={() => setSelectedIds(new Set())}>
              × Batal
            </button>
          </div>
        )}

        {/* ── Error State ── */}
        {error && (
          <div className={styles.errorState}>
            <span className={styles.errorStateIcon}>⚠</span>
            <span>{error}</span>
            <button
              className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`}
              style={{ marginLeft: 'auto' }}
              onClick={() => void fetchUsers()}
            >
              Coba Lagi
            </button>
          </div>
        )}

        {/* ── Tabel ── */}
        {!error && (
          <div className={styles.tableWrapper}>
            <table className={styles.table} style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected; }}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      aria-label="Pilih semua"
                    />
                  </th>
                  <th>Pengguna</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Terdaftar</th>
                  <th style={{ width: 80, textAlign: 'center' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j}>
                          <div style={{
                            height: 14, borderRadius: 4,
                            background: 'var(--color-surface-2)',
                            width: j === 0 ? '60%' : j === 5 ? '40%' : '80%',
                            animation: 'pulse 1.5s ease infinite',
                          }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className={styles.emptyState}>
                        <div className={styles.emptyStateIcon}>👥</div>
                        <div className={styles.emptyStateTitle}>Tidak ada pengguna ditemukan</div>
                        <div className={styles.emptyStateDesc}>
                          {searchInput || roleFilter || statusFilter
                            ? 'Coba ubah filter pencarian Anda.'
                            : 'Belum ada pengguna yang terdaftar.'}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr
                      key={user.id}
                      className={selectedIds.has(user.id) ? styles.tableRowSelected : ''}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className={styles.checkbox}
                          checked={selectedIds.has(user.id)}
                          onChange={(e) => handleSelectRow(user.id, e.target.checked)}
                          aria-label={`Pilih ${user.name}`}
                        />
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: 'var(--color-accent-light)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 13, fontWeight: 700, color: 'var(--color-accent)', flexShrink: 0,
                          }}>
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{user.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td><RoleBadge role={user.role} /></td>
                      <td><StatusBadge status={user.status} /></td>
                      <td style={{ fontSize: 12, color: 'var(--color-muted)' }}>{fmtDate(user.createdAt)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className={`${styles.btn} ${styles.btnSm} ${styles.btnGhost}`}
                          onClick={() => setDetailUser(user)}
                        >
                          Detail
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Paginasi ── */}
        {!error && (
          <div className={styles.pagination}>
            <span className={styles.paginationInfo}>
              {total === 0 ? 'Tidak ada data' : `Menampilkan ${fromIdx}–${toIdx} dari ${total.toLocaleString('id-ID')}`}
            </span>
            <div className={styles.paginationControls}>
              <button className={styles.pageBtn} onClick={() => setPage(1)} disabled={page === 1} title="Halaman pertama">«</button>
              <button className={styles.pageBtn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
              {pageNumbers().map((p, i) =>
                p === '...' ? (
                  <span key={`dots-${i}`} style={{ padding: '0 4px', color: 'var(--color-muted)' }}>…</span>
                ) : (
                  <button
                    key={p}
                    className={`${styles.pageBtn} ${p === page ? styles.pageBtnActive : ''}`}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                )
              )}
              <button className={styles.pageBtn} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount}>›</button>
              <button className={styles.pageBtn} onClick={() => setPage(pageCount)} disabled={page >= pageCount} title="Halaman terakhir">»</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal Detail ── */}
      {detailUser && (
        <UserDetailModal
          user={detailUser}
          onClose={() => setDetailUser(null)}
          onUpdateStatus={(status) => { void updateUserStatus(detailUser, status); }}
          statusUpdating={statusUpdatingId === detailUser.id}
        />
      )}

      {/* ── Modal Tambah Pengguna ── */}
      {showAddModal && (
        <AddUserModal onClose={() => setShowAddModal(false)} onSubmit={handleAddUser} submitting={createSubmitting} />
      )}

      {/* ── Konfirmasi Bulk Action ── */}
      <ConfirmDialog
        open={confirmBulk.open}
        title={`${confirmBulk.label} Pengguna`}
        message={`Tindakan ini akan diterapkan ke ${selectedCount} pengguna terpilih. Yakin melanjutkan?`}
        confirmLabel={confirmBulk.label}
        cancelLabel="Batal"
        danger={confirmBulk.action === 'suspend'}
        onConfirm={executeBulkAction}
        onCancel={() => setConfirmBulk((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}
