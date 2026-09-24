import { useState, useEffect, useRef, useCallback } from 'react';
import { notificationClient } from '../api/client';
import type { NotificationRow, NotificationsApiResponse, UnreadCountResponse } from '../types/admin';
import styles from './NotificationBell.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function agoLabel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return 'Baru saja';
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

function priorityColor(priority: string): string {
  switch (priority) {
    case 'CRITICAL': return '#DC2626';
    case 'HIGH':     return '#EA580C';
    case 'NORMAL':   return '#2563EB';
    default:         return '#6B7280';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NotificationBell
// ─────────────────────────────────────────────────────────────────────────────

export default function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch unread count ──────────────────────────────────────────────────────
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await notificationClient.get<UnreadCountResponse>('/v1/notifications/unread-count');
      setUnreadCount(res.data?.data?.count ?? 0);
    } catch {
      // gagal silent — tidak kritis
    }
  }, []);

  // ── Fetch notifikasi (10 terbaru belum dibaca) ──────────────────────────────
  const fetchNotifications = useCallback(async () => {
    setLoadingItems(true);
    try {
      const res = await notificationClient.get<NotificationsApiResponse>(
        '/v1/notifications?unread=true&limit=10',
      );
      setNotifications(res.data?.data?.notifications ?? []);
    } catch {
      setNotifications([]);
    } finally {
      setLoadingItems(false);
    }
  }, []);

  // ── Auto-refresh count tiap 30 detik ───────────────────────────────────────
  useEffect(() => {
    void fetchUnreadCount();
    intervalRef.current = setInterval(() => { void fetchUnreadCount(); }, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchUnreadCount]);

  // ── Buka / tutup dropdown ──────────────────────────────────────────────────
  const toggleDropdown = () => {
    if (!open) {
      setOpen(true);
      void fetchNotifications();
    } else {
      setOpen(false);
    }
  };

  // ── Tutup saat klik luar ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // ── Tandai semua dibaca ────────────────────────────────────────────────────
  const handleMarkAllRead = async () => {
    if (markingRead || notifications.length === 0) return;
    setMarkingRead(true);
    try {
      const ids = notifications.map((n) => n.id);
      await notificationClient.put('/v1/notifications/read', { notificationIds: ids });
      setUnreadCount(0);
      setNotifications([]);
    } catch {
      // gagal silent
    } finally {
      setMarkingRead(false);
    }
  };

  const displayCount = unreadCount > 99 ? '99+' : unreadCount;

  return (
    <div className={styles.wrapper} ref={dropdownRef}>
      {/* ── Tombol bell ── */}
      <button
        className={`${styles.bellBtn} ${open ? styles.bellBtnActive : ''}`}
        onClick={toggleDropdown}
        aria-label={`Notifikasi${unreadCount > 0 ? `, ${unreadCount} belum dibaca` : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className={styles.bellIcon} aria-hidden="true">🔔</span>
        {unreadCount > 0 && (
          <span className={styles.badge} aria-hidden="true">{displayCount}</span>
        )}
      </button>

      {/* ── Dropdown notifikasi ── */}
      {open && (
        <div className={styles.dropdown} role="dialog" aria-label="Panel notifikasi">
          {/* Header */}
          <div className={styles.dropdownHeader}>
            <span className={styles.dropdownTitle}>Notifikasi</span>
            {notifications.length > 0 && (
              <button
                className={styles.markReadBtn}
                onClick={() => { void handleMarkAllRead(); }}
                disabled={markingRead}
              >
                {markingRead ? 'Menandai…' : 'Tandai semua dibaca'}
              </button>
            )}
          </div>

          {/* Daftar notifikasi */}
          <div className={styles.list}>
            {loadingItems ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={styles.skeletonItem}>
                  <div className={styles.skeletonLine} style={{ width: '60%' }} />
                  <div className={styles.skeletonLine} style={{ width: '85%', marginTop: 6 }} />
                </div>
              ))
            ) : notifications.length === 0 ? (
              <div className={styles.empty}>
                <span style={{ fontSize: 28 }}>🔕</span>
                <div>Tidak ada notifikasi baru</div>
              </div>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className={styles.item}>
                  <div className={styles.itemDot} style={{ background: priorityColor(n.priority) }} />
                  <div className={styles.itemBody}>
                    {n.title && <div className={styles.itemTitle}>{n.title}</div>}
                    <div className={styles.itemMsg}>{n.body}</div>
                    <div className={styles.itemTime}>{agoLabel(n.created_at)}</div>
                  </div>
                  <span
                    className={styles.priorityBadge}
                    style={{ color: priorityColor(n.priority) }}
                  >
                    {n.priority}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className={styles.dropdownFooter}>
            <a href="/alerts" className={styles.footerLink}>
              Lihat semua alert →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
