import { NavLink } from 'react-router-dom';
import { useState } from 'react';
import type { AdminUser } from '../types/admin';
import styles from './Sidebar.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Tipe Data
// ─────────────────────────────────────────────────────────────────────────────

interface NavItem {
  to?: string;
  label: string;
  icon: string;
  children?: { to: string; label: string; badge?: number }[];
}

interface SidebarProps {
  user: AdminUser;
  onLogout: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Definisi Item Navigasi
// ─────────────────────────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    icon: '◈',
    children: [
      { to: '/', label: 'Overview' },
    ],
  },
  {
    label: 'Manajemen Pengguna',
    icon: '👥',
    children: [
      { to: '/users',          label: 'Semua Pengguna' },
      { to: '/users/patients', label: 'Pasien (Auth)' },
      { to: '/users/doctors',  label: 'Dokter (Auth)' },
      { to: '/users/admins',   label: 'Admin' },
    ],
  },
  {
    label: 'Konsultasi',
    icon: '💬',
    children: [
      { to: '/consultations',         label: 'Semua Konsultasi' },
      { to: '/consultations/active',  label: 'Aktif' },
      { to: '/consultations/history', label: 'Riwayat' },
    ],
  },
  {
    label: 'Pasien & Dokter',
    icon: '🧑‍⚕️',
    children: [
      { to: '/patients', label: 'Data Pasien' },
      { to: '/doctors',  label: 'Data Dokter' },
    ],
  },
  {
    label: 'Layanan Medis',
    icon: '💊',
    children: [
      { to: '/prescriptions', label: 'Resep' },
      { to: '/ambulances',    label: 'Ambulans' },
      { to: '/referrals',     label: 'Rujukan' },
    ],
  },
  {
    label: 'Farmasi',
    icon: '🏪',
    children: [
      { to: '/pharmacy',                label: 'Apotek & Inventori' },
      { to: '/pharmacy/drugs',          label: 'Katalog Obat' },
      { to: '/pharmacy/prescriptions',  label: 'Resep per Apotek' },
      { to: '/pharmacy/reports',        label: 'Laporan Farmasi' },
      { to: '/pharmacy/staff',          label: 'Assignment Apoteker' },
    ],
  },
  {
    label: 'Fasilitas',
    icon: '🏥',
    children: [
      { to: '/hospitals',         label: 'Rumah Sakit' },
      { to: '/hospitals/beds',    label: 'Manajemen Bed' },
      { to: '/hospitals/doctors', label: 'Dokter per RS' },
      { to: '/hospitals/search',  label: 'Pencarian Lanjutan' },
    ],
  },
  {
    label: 'Monitoring',
    icon: '🚨',
    children: [
      { to: '/alerts', label: 'Alert Vital Sign' },
    ],
  },
  {
    label: 'Analitik & Laporan',
    icon: '📊',
    children: [
      { to: '/analytics',         label: 'Laporan Pengguna' },
      { to: '/analytics/consult', label: 'Laporan Konsultasi' },
    ],
  },
  {
    label: 'Sistem',
    icon: '⚙️',
    children: [
      { to: '/health',       label: 'Health Check' },
      { to: '/logs',         label: 'Log Aktivitas' },
      { to: '/master-data',  label: 'Master Data' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar Component
// ─────────────────────────────────────────────────────────────────────────────

export default function Sidebar({ user, onLogout, collapsed, onToggleCollapse }: SidebarProps) {
  // Kelola grup yang terbuka; semua terbuka by default
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(NAV_ITEMS.map((g) => g.label)),
  );

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const displayName = user.name !== user.email
    ? user.name
    : user.email.split('@')[0];

  const sidebarClass = [
    styles.sidebar,
    collapsed ? styles.sidebarCollapsed : '',
  ].filter(Boolean).join(' ');

  return (
    <aside className={sidebarClass}>
      {/* ── Logo + tombol collapse ── */}
      <div className={styles.logo}>
        <div className={styles.logoIconWrapper}>
          <span className={styles.logoIcon}>⚕</span>
        </div>
        <div className={styles.logoText}>
          <div className={styles.logoTitle}>HealthSync</div>
          <div className={styles.logoSub}>Admin Panel</div>
        </div>
      </div>

      {/* Tombol collapse/expand */}
      <button
        className={styles.collapseBtn}
        onClick={onToggleCollapse}
        title={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
        aria-label={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
      >
        {collapsed ? '›' : '‹'}
      </button>

      {/* ── Navigasi ── */}
      <nav className={styles.nav} aria-label="Navigasi utama">
        {NAV_ITEMS.map((group) => (
          <div key={group.label} className={styles.group}>
            {/* Header grup — saat collapsed, berfungsi sebagai tooltip wrapper */}
            {collapsed ? (
              <div className={styles.tooltipWrapper}>
                <button
                  className={styles.groupHeader}
                  aria-label={group.label}
                >
                  <span className={styles.groupIcon}>{group.icon}</span>
                  <span className={styles.groupLabel}>{group.label}</span>
                </button>
                <span className={styles.tooltip}>{group.label}</span>
              </div>
            ) : (
              <button
                className={styles.groupHeader}
                onClick={() => toggleGroup(group.label)}
                aria-expanded={openGroups.has(group.label)}
              >
                <span className={styles.groupIcon}>{group.icon}</span>
                <span className={styles.groupLabel}>{group.label}</span>
                <span className={`${styles.chevron} ${openGroups.has(group.label) ? styles.chevronOpen : ''}`}>
                  ›
                </span>
              </button>
            )}

            {/* Sub-item navigasi — disembunyikan saat collapsed */}
            {!collapsed && openGroups.has(group.label) && group.children && (
              <div className={styles.groupItems}>
                {group.children.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
                    }
                  >
                    {item.label}
                    {item.badge != null && item.badge > 0 && (
                      <span className={styles.navBadge}>
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* ── Footer: info user + tombol logout ── */}
      <div className={styles.footer}>
        <div className={styles.userInfo}>
          {collapsed ? (
            <div className={styles.tooltipWrapper}>
              <div className={styles.avatar} aria-label={displayName}>
                {displayName.charAt(0).toUpperCase()}
              </div>
              <span className={styles.tooltip}>{displayName} (Admin)</span>
            </div>
          ) : (
            <>
              <div className={styles.avatar}>
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className={styles.userDetails}>
                <div className={styles.userName}>{displayName}</div>
                <div className={styles.userRole}>Administrator</div>
              </div>
            </>
          )}
        </div>

        <button className={styles.logoutBtn} onClick={onLogout} title="Keluar">
          {collapsed ? (
            '⎋'
          ) : (
            <>⎋ <span className={styles.logoutBtnText}>Keluar</span></>
          )}
        </button>
      </div>
    </aside>
  );
}
