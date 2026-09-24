import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styles from './PageHeader.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Tipe Data
// ─────────────────────────────────────────────────────────────────────────────

/** Satu segmen breadcrumb */
export interface BreadcrumbItem {
  /** Teks yang ditampilkan */
  label: string;
  /** Path tujuan — jika tidak ada, item ini akan ditampilkan sebagai teks biasa */
  to?: string;
}

/** Props komponen PageHeader */
export interface PageHeaderProps {
  /** Judul utama halaman */
  title: string;
  /** Subjudul / deskripsi singkat */
  subtitle?: string;
  /** Icon di sebelah judul (emoji atau elemen React) */
  icon?: React.ReactNode;
  /** Daftar breadcrumb di atas judul */
  breadcrumbs?: BreadcrumbItem[];
  /** Tombol aksi di sisi kanan (primary action, secondary, dll.) */
  actions?: React.ReactNode;
  /** Tampilkan tombol "Kembali"? Default: false */
  showBack?: boolean;
  /** Override URL tombol kembali — jika tidak ada, gunakan browser history */
  backTo?: string;
  /** Tampilkan divider di bawah header? Default: false */
  divider?: boolean;
  /** Gunakan ukuran compact? Default: false */
  compact?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// PageHeader Component
// ─────────────────────────────────────────────────────────────────────────────

export default function PageHeader({
  title,
  subtitle,
  icon,
  breadcrumbs,
  actions,
  showBack = false,
  backTo,
  divider = false,
  compact = false,
}: PageHeaderProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (backTo) {
      navigate(backTo);
    } else {
      navigate(-1);
    }
  };

  const hasTopRow = showBack || (breadcrumbs && breadcrumbs.length > 0);

  return (
    <>
      <div className={`${styles.header} ${compact ? styles.compact : ''}`}>
        {/* ── Sisi kiri ── */}
        <div className={styles.left}>
          {/* Tombol kembali + breadcrumb */}
          {hasTopRow && (
            <div className={styles.topRow}>
              {showBack && (
                <button
                  className={styles.backBtn}
                  onClick={handleBack}
                  title="Kembali"
                  aria-label="Kembali ke halaman sebelumnya"
                >
                  ‹
                </button>
              )}

              {breadcrumbs && breadcrumbs.length > 0 && (
                <nav className={styles.breadcrumb} aria-label="Breadcrumb">
                  {breadcrumbs.map((crumb, idx) => {
                    const isLast = idx === breadcrumbs.length - 1;
                    return (
                      <React.Fragment key={`${crumb.label}-${idx}`}>
                        {idx > 0 && (
                          <span className={styles.breadcrumbSep} aria-hidden="true">›</span>
                        )}
                        {isLast || !crumb.to ? (
                          <span
                            className={styles.breadcrumbCurrent}
                            aria-current={isLast ? 'page' : undefined}
                          >
                            {crumb.label}
                          </span>
                        ) : (
                          <Link to={crumb.to} className={styles.breadcrumbItem}>
                            {crumb.label}
                          </Link>
                        )}
                      </React.Fragment>
                    );
                  })}
                </nav>
              )}
            </div>
          )}

          {/* Judul + subtitle */}
          <div className={styles.titleRow}>
            {icon && (
              <span className={styles.icon} aria-hidden="true">
                {icon}
              </span>
            )}
            <div className={styles.titleGroup}>
              <h1 className={styles.title}>{title}</h1>
              {subtitle && (
                <p className={styles.subtitle}>{subtitle}</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Sisi kanan: tombol aksi ── */}
        {actions && (
          <div className={styles.actions}>
            {actions}
          </div>
        )}
      </div>

      {/* Divider opsional */}
      {divider && <hr className={styles.divider} />}
    </>
  );
}
