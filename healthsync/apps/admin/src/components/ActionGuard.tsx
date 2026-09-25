import { Fragment, useId } from 'react';
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
  className,
  ...props
}: GuardedActionButtonProps) {
  const descriptionId = useId();
  const isBlocked = !allowed;
  const isDisabled = Boolean(disabled);
  const label = deniedReason ?? title ?? ACTION_LABEL[action];
  const { onClick: _onClick, onKeyDown: _onKeyDown, onKeyUp: _onKeyUp, ...restProps } = props;
  void _onClick;
  void _onKeyDown;
  void _onKeyUp;

  return (
    <Fragment>
      {isBlocked ? (
        <span
          className={className}
          role="note"
          tabIndex={0}
          aria-disabled="true"
          aria-describedby={descriptionId}
          title={label}
        >
          {children}
        </span>
      ) : (
        <button
          {...restProps}
          className={className}
          disabled={isDisabled}
          aria-disabled={isDisabled}
          title={label}
        >
          {children}
        </button>
      )}
      {isBlocked && (
        <span
          id={descriptionId}
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            border: 0,
          }}
        >
          {label}
        </span>
      )}
    </Fragment>
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
