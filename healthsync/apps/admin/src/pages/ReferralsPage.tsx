import { useEffect, useState, useCallback } from 'react';
import { referralClient } from '../api/client';
import type { Referral, ReferralStatus, UrgencyLevel, PaginationMeta } from '../types/admin';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import { SelectField } from '../components/FormField';
import { Skeleton } from '../components/Skeleton';
import styles from './Page.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Konstanta & Tipe
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: ReferralStatus | ''; label: string }[] = [
  { value: '',          label: 'Semua Status' },
  { value: 'DRAFT',     label: 'Draft' },
  { value: 'SENT',      label: 'Terkirim' },
  { value: 'ACCEPTED',  label: 'Diterima' },
  { value: 'REJECTED',  label: 'Ditolak' },
  { value: 'IN_TRANSIT',label: 'Dalam Perjalanan' },
  { value: 'ARRIVED',   label: 'Tiba' },
  { value: 'CANCELLED', label: 'Dibatalkan' },
];

const URGENCY_OPTIONS: { value: UrgencyLevel | ''; label: string }[] = [
  { value: '',          label: 'Semua Tingkat' },
  { value: 'NORMAL',    label: 'Normal' },
  { value: 'URGENT',    label: 'Urgent' },
  { value: 'CRITICAL',  label: 'Kritis' },
];

const STATUS_STYLE: Record<ReferralStatus, { bg: string; color: string }> = {
  DRAFT:      { bg: 'var(--color-surface-2)',  color: 'var(--color-muted)' },
  SENT:       { bg: 'var(--color-info-bg)',    color: 'var(--color-primary)' },
  ACCEPTED:   { bg: 'var(--color-success-bg)', color: 'var(--color-success)' },
  REJECTED:   { bg: 'var(--color-danger-bg)',  color: 'var(--color-danger)' },
  IN_TRANSIT: { bg: 'var(--color-warning-bg)', color: 'var(--color-warning)' },
  ARRIVED:    { bg: '#e8f5e9',                 color: '#2e7d32' },
  CANCELLED:  { bg: '#fafafa',                 color: '#9e9e9e' },
};

const STATUS_LABEL: Record<ReferralStatus, string> = {
  DRAFT: 'Draft', SENT: 'Terkirim', ACCEPTED: 'Diterima',
  REJECTED: 'Ditolak', IN_TRANSIT: 'Dalam Perjalanan',
  ARRIVED: 'Tiba', CANCELLED: 'Dibatalkan',
};

const URGENCY_STYLE: Record<string, { bg: string; color: string }> = {
  NORMAL:    { bg: 'var(--color-surface-2)',  color: 'var(--color-muted)' },
  URGENT:    { bg: 'var(--color-warning-bg)', color: 'var(--color-warning)' },
  CRITICAL:  { bg: 'var(--color-danger-bg)',  color: 'var(--color-danger)' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ReferralsPage
// ─────────────────────────────────────────────────────────────────────────────

export default function ReferralsPage() {
  const { showToast } = useToast();

  const [rows, setRows]         = useState<Referral[]>([]);
  const [meta, setMeta]         = useState<PaginationMeta | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const [status, setStatus]     = useState<ReferralStatus | ''>('');
  const [urgency, setUrgency]   = useState<UrgencyLevel | ''>('');
  const [page, setPage]         = useState(1);
  const [limit]                 = useState(20);

  const [selected, setSelected] = useState<Referral | null>(null);
  // State untuk action konfirmasi
  const [actionTarget, setActionTarget] = useState<{ id: string; action: string; label: string } | null>(null);
  const [actionNote, setActionNote]     = useState('');
  const [actionBusy, setActionBusy]     = useState(false);

  // ── Fetch ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (status) params.set('status', status);
      if (urgency) params.set('urgencyLevel', urgency);

      const res = await referralClient.get<{
        data: Referral[];
        meta: PaginationMeta;
      }>(`/v1/referrals?${params.toString()}`);

      setRows(res.data.data ?? []);
      setMeta(res.data.meta ?? null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat data rujukan';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [page, limit, status, urgency, showToast]);

  useEffect(() => { void fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [status, urgency]);

  // ── Statistik status ──
  const stats = STATUS_OPTIONS.slice(1).map((opt) => ({
    label: opt.label,
    count: rows.filter((r) => r.status === opt.value).length,
    style: STATUS_STYLE[opt.value as ReferralStatus],
  }));

  // ── Aksi transisi status ──
  const doAction = async () => {
    if (!actionTarget) return;
    setActionBusy(true);
    try {
      const { id, action } = actionTarget;
      const body = actionNote.trim() ? { notes: actionNote, rejectedReason: actionNote } : {};
      await referralClient.put(`/v1/referrals/${id}/${action}`, body);
      showToast(`Rujukan berhasil diperbarui`, 'success');
      setActionTarget(null);
      setActionNote('');
      setSelected(null);
      void fetchData();
    } catch {
      showToast('Gagal memperbarui status rujukan', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  // ── Render ──
  return (
    <div className={styles.page}>
      <PageHeader
        title="Manajemen Rujukan"
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Rujukan' }]}
      />

      {/* ── Stat Cards ── */}
      <div className={styles.statGrid} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
        {stats.map((s) => (
          <div
            key={s.label}
            className={styles.statCard}
            style={{ cursor: 'pointer', borderLeft: `3px solid ${s.style.color}` }}
            onClick={() => { setStatus(STATUS_OPTIONS.find((o) => o.label === s.label)?.value as ReferralStatus ?? ''); setPage(1); }}
          >
            <div className={styles.statValue} style={{ fontSize: 26, color: s.style.color }}>{s.count}</div>
            <div className={styles.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Filter ── */}
      <div className={styles.card}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '0 1 200px' }}>
            <SelectField label="Status" value={status}
              onChange={(e) => setStatus(e.target.value as ReferralStatus | '')}
              options={STATUS_OPTIONS} />
          </div>
          <div style={{ flex: '0 1 180px' }}>
            <SelectField label="Tingkat Urgensi" value={urgency}
              onChange={(e) => setUrgency(e.target.value as UrgencyLevel | '')}
              options={URGENCY_OPTIONS} />
          </div>
          <button className={`${styles.btn} ${styles.btnOutline}`}
            onClick={() => { setStatus(''); setUrgency(''); setPage(1); }}>
            Reset
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={fetchData} style={{ marginLeft: 'auto' }}>
            ↻ Muat Ulang
          </button>
        </div>
      </div>

      {/* ── Tabel ── */}
      <div className={styles.card} style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 'var(--space-6)' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} height={36} style={{ marginBottom: 'var(--space-2)' }} />
            ))}
          </div>
        ) : error ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>⚠️</div>
            <div className={styles.emptyTitle}>Gagal memuat data</div>
            <div className={styles.emptyDesc}>{error}</div>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={fetchData}>Coba Lagi</button>
          </div>
        ) : rows.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📋</div>
            <div className={styles.emptyTitle}>Tidak ada rujukan</div>
            <div className={styles.emptyDesc}>Belum ada data rujukan yang sesuai filter.</div>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={`${styles.table} ${styles.tableHover} ${styles.tableClickable}`}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Urgensi</th>
                  <th>Status</th>
                  <th>RS Asal</th>
                  <th>RS Tujuan</th>
                  <th>Spesialisasi</th>
                  <th>Diagnosis</th>
                  <th>Dibuat</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} onClick={() => setSelected(row)}>
                    <td style={{ fontFamily: 'monospace', fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
                      {row.id.slice(0, 8)}…
                    </td>
                    <td>
                      <span className={styles.badge} style={URGENCY_STYLE[row.urgency_level]}>
                        {row.urgency_level}
                      </span>
                    </td>
                    <td>
                      <span className={styles.badge} style={STATUS_STYLE[row.status]}>
                        {STATUS_LABEL[row.status]}
                      </span>
                    </td>
                    <td style={{ fontSize: 'var(--text-sm)' }}>
                      <code style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
                        {row.from_hospital_id.slice(0, 8)}…
                      </code>
                    </td>
                    <td style={{ fontSize: 'var(--text-sm)' }}>
                      <code style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
                        {row.to_hospital_id.slice(0, 8)}…
                      </code>
                    </td>
                    <td style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>
                      {row.required_specialization ?? '—'}
                    </td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--text-sm)' }}>
                      {row.diagnosis ?? row.reason.slice(0, 60)}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>
                      {formatDateTime(row.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginasi */}
        {meta && meta.totalPages > 1 && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: 'var(--space-3) var(--space-4)',
            borderTop: '1px solid var(--color-border)',
            fontSize: 'var(--text-sm)', color: 'var(--color-muted)',
          }}>
            <span>Total: {meta.total} rujukan</span>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Sebelumnya</button>
              <span style={{ lineHeight: '28px' }}>Hal. {page} / {meta.totalPages}</span>
              <button className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>Berikutnya →</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal Detail + Aksi ── */}
      {selected && (
        <Modal open onClose={() => setSelected(null)} title={`Detail Rujukan — ${selected.id.slice(0, 8)}…`} width={640}>
          <div style={{ fontSize: 'var(--text-sm)' }}>
            {/* Info utama */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
              <tbody>
                {[
                  { label: 'ID', value: <code style={{ fontSize: 11 }}>{selected.id}</code> },
                  { label: 'ID Pasien', value: selected.patient_id },
                  { label: 'RS Asal', value: selected.from_hospital_id },
                  { label: 'RS Tujuan', value: selected.to_hospital_id },
                  { label: 'Dokter Perujuk', value: selected.referring_doctor_id },
                  { label: 'Status', value: (
                    <span className={styles.badge} style={STATUS_STYLE[selected.status]}>
                      {STATUS_LABEL[selected.status]}
                    </span>
                  )},
                  { label: 'Urgensi', value: (
                    <span className={styles.badge} style={URGENCY_STYLE[selected.urgency_level]}>
                      {selected.urgency_level}
                    </span>
                  )},
                  { label: 'Spesialisasi', value: selected.required_specialization ?? '—' },
                  { label: 'Alasan', value: selected.reason },
                  { label: 'Diagnosis', value: selected.diagnosis ?? '—' },
                  { label: 'Terkirim', value: formatDateTime(selected.sent_at) },
                  { label: 'Diterima', value: formatDateTime(selected.accepted_at) },
                  { label: 'Tiba', value: formatDateTime(selected.arrived_at ?? null) },
                  { label: 'Dibuat', value: formatDateTime(selected.created_at) },
                ].map(({ label, value }) => (
                  <tr key={label} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '6px 8px', color: 'var(--color-muted)', fontWeight: 600, width: '35%' }}>{label}</td>
                    <td style={{ padding: '6px 8px' }}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Tombol Aksi Transisi (ADMIN) */}
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 10, color: 'var(--color-muted)', fontSize: 11, textTransform: 'uppercase' }}>
                Aksi Transisi Status
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {selected.status === 'SENT' && (
                  <>
                    <button
                      className={`${styles.btn} ${styles.btnSm} ${styles.btnPrimary}`}
                      onClick={() => setActionTarget({ id: selected.id, action: 'accept', label: 'Terima Rujukan' })}
                    >
                      ✓ Terima
                    </button>
                    <button
                      className={`${styles.btn} ${styles.btnSm} ${styles.btnDangerOutline}`}
                      onClick={() => setActionTarget({ id: selected.id, action: 'reject', label: 'Tolak Rujukan' })}
                    >
                      ✗ Tolak
                    </button>
                  </>
                )}
                {selected.status === 'ACCEPTED' && (
                  <button
                    className={`${styles.btn} ${styles.btnSm} ${styles.btnOutline}`}
                    onClick={() => setActionTarget({ id: selected.id, action: 'transit', label: 'Mulai Transfer' })}
                  >
                    🚑 Mulai Transfer
                  </button>
                )}
                {selected.status === 'IN_TRANSIT' && (
                  <button
                    className={`${styles.btn} ${styles.btnSm} ${styles.btnPrimary}`}
                    onClick={() => setActionTarget({ id: selected.id, action: 'arrive', label: 'Konfirmasi Tiba' })}
                  >
                    📍 Konfirmasi Tiba
                  </button>
                )}
                {(selected.status === 'DRAFT' || selected.status === 'SENT' || selected.status === 'ACCEPTED' || selected.status === 'IN_TRANSIT') && (
                  <button
                    className={`${styles.btn} ${styles.btnSm} ${styles.btnDangerOutline}`}
                    onClick={() => setActionTarget({ id: selected.id, action: 'cancel', label: 'Batalkan Rujukan' })}
                  >
                    Batalkan
                  </button>
                )}
                {(selected.status === 'ARRIVED' || selected.status === 'REJECTED' || selected.status === 'CANCELLED') && (
                  <span style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>
                    Tidak ada aksi tersedia untuk status ini
                  </span>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal Konfirmasi Aksi ── */}
      {actionTarget && (
        <Modal open onClose={() => { setActionTarget(null); setActionNote(''); }} title={actionTarget.label} width={460}>
          <div style={{ fontSize: 'var(--text-sm)' }}>
            <p style={{ marginBottom: 16, color: 'var(--color-muted)' }}>
              Konfirmasi aksi <strong>{actionTarget.label}</strong> untuk rujukan{' '}
              <code>{actionTarget.id.slice(0, 8)}…</code>
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 12 }}>
                Catatan {actionTarget.action === 'reject' ? '(wajib untuk penolakan)' : '(opsional)'}
              </label>
              <textarea
                rows={3}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                  padding: '8px 12px', fontSize: 'var(--text-sm)',
                  fontFamily: 'inherit', resize: 'vertical',
                  background: 'var(--color-bg)', color: 'var(--color-text)',
                }}
                placeholder={actionTarget.action === 'reject' ? 'Alasan penolakan (min. 10 karakter)' : 'Catatan tambahan...'}
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className={`${styles.btn} ${styles.btnOutline}`}
                onClick={() => { setActionTarget(null); setActionNote(''); }}>
                Batal
              </button>
              <button
                className={`${styles.btn} ${actionTarget.action === 'reject' || actionTarget.action === 'cancel' ? styles.btnDanger : styles.btnPrimary}`}
                disabled={actionBusy}
                onClick={() => void doAction()}
              >
                {actionBusy ? 'Memproses…' : 'Konfirmasi'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
