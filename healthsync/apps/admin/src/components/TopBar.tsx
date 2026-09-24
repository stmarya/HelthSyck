import { useLocation, Link } from 'react-router-dom';
import type { AdminUser } from '../types/admin';
import NotificationBell from './NotificationBell';
import styles from './TopBar.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Peta route → label breadcrumb dalam Bahasa Indonesia
// ─────────────────────────────────────────────────────────────────────────────

const ROUTE_LABELS: Record<string, string> = {
  '':              'Dashboard',
  'users':         'Pengguna',
  'patients':      'Pasien',
  'doctors':       'Dokter / Dokter per RS',
  'admins':        'Admin',
  'consultations': 'Konsultasi',
  'active':        'Aktif',
  'history':       'Riwayat',
  'prescriptions': 'Resep',
  'ambulances':    'Ambulans',
  'hospitals':     'Rumah Sakit',
  'beds':          'Manajemen Bed',
  'search':        'Pencarian Lanjutan',
  'analytics':     'Analitik',
  'consult':       'Laporan Konsultasi',
  'health':        'Health Check',
  'logs':          'Log Aktivitas',
  'master-data':   'Master Data',
  'referrals':     'Rujukan',
  'pharmacy':      'Apotek',
  'drugs':         'Katalog Obat',
  'reports':       'Laporan Farmasi',
  'alerts':        'Alert Vital Sign',
  'notifications': 'Notifikasi',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: parse pathname menjadi array breadcrumb
// ─────────────────────────────────────────────────────────────────────────────

interface BreadcrumbSegment {
  label: string;
  path: string;
}

function parseBreadcrumb(pathname: string): BreadcrumbSegment[] {
  const parts = pathname.split('/').filter(Boolean);
  const segments: BreadcrumbSegment[] = [
    { label: 'Dashboard', path: '/' },
  ];

  // Jangan tambah "Dashboard" lagi jika sudah di root
  if (parts.length === 0) return segments;

  let cumulativePath = '';
  for (const part of parts) {
    cumulativePath += `/${part}`;
    const label = ROUTE_LABELS[part] ?? part.charAt(0).toUpperCase() + part.slice(1);
    segments.push({ label, path: cumulativePath });
  }

  return segments;
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface TopBarProps {
  user: AdminUser;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// TopBar Component
// ─────────────────────────────────────────────────────────────────────────────

export default function TopBar({ user, darkMode, onToggleDarkMode }: TopBarProps) {
  const location = useLocation();
  const crumbs = parseBreadcrumb(location.pathname);

  const displayName = user.name !== user.email
    ? user.name
    : user.email.split('@')[0];

  return (
    <header className={styles.topbar} role="banner">
      {/* ── Breadcrumb ── */}
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        {crumbs.map((crumb, idx) => {
          const isLast = idx === crumbs.length - 1;
          return (
            <span key={crumb.path} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {idx > 0 && (
                <span className={styles.breadcrumbSep} aria-hidden="true">›</span>
              )}
              {isLast ? (
                <span className={styles.breadcrumbCurrent} aria-current="page">
                  {crumb.label}
                </span>
              ) : (
                <Link to={crumb.path} className={styles.breadcrumbItem}>
                  {crumb.label}
                </Link>
              )}
            </span>
          );
        })}
      </nav>

      {/* ── Aksi kanan ── */}
      <div className={styles.actions}>
        {/* Notifikasi Bell */}
        <NotificationBell />

        {/* Toggle Dark Mode */}
        <button
          className={`${styles.iconBtn} ${darkMode ? styles.iconBtnActive : ''}`}
          onClick={onToggleDarkMode}
          title={darkMode ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}
          aria-label={darkMode ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
          aria-pressed={darkMode}
        >
          {darkMode ? '☀️' : '🌙'}
        </button>

        <div className={styles.divider} aria-hidden="true" />

        {/* Info user */}
        <div className={styles.userChip} aria-label={`Login sebagai ${displayName}`}>
          <div className={styles.userAvatar} aria-hidden="true">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className={styles.userMeta}>
            <span className={styles.userName}>{displayName}</span>
            <span className={styles.userRole}>Admin</span>
          </div>
        </div>
      </div>
    </header>
  );
}
