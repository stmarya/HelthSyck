import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from '../pages/Page.module.css';

export type AdminAction = 'view' | 'create' | 'edit' | 'delete' | 'export';

const ACTION_LABEL: Record<AdminAction, string> = {
  view: 'Lihat data',
  create: 'Tambah data',
  edit: 'Ubah data',
  delete: 'Hapus data',
  export: 'Ekspor data',
};

interface GuardedActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  action: AdminAction;
  allowed?: boolean;
  deniedReason?: string;
  children: ReactNode;
}

export function GuardedActionButton({
  action,
  allowed = true,
  deniedReason,
  children,
  title,
  disabled,
  ...props
}: GuardedActionButtonProps) {
  const isDisabled = disabled || !allowed;
  const label = deniedReason ?? title ?? ACTION_LABEL[action];

  return (
    <button
      {...props}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      title={label}
    >
      {children}
    </button>
  );
}

export function ActionGuardNotice({
  action,
  reason,
}: {
  action: AdminAction;
  reason: string;
}) {
  return (
    <div className={styles.warningBanner}>
      <span>ℹ️</span>
      <span>
        <strong>{ACTION_LABEL[action]} belum tersedia.</strong> {reason}
      </span>
    </div>
  );
}
