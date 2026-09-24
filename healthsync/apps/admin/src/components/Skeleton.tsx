// ─────────────────────────────────────────────────────────────────────────────
// Skeleton — loading placeholder components
// ─────────────────────────────────────────────────────────────────────────────

import styles from './Skeleton.module.css';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ width = '100%', height = 16, borderRadius = 4, className, style }: SkeletonProps) {
  return (
    <div
      className={`${styles.skeleton} ${className ?? ''}`}
      style={{ width, height, borderRadius, ...style }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div style={{ background: '#fff', border: '1px solid #E0E0E0', borderRadius: 8, padding: 20 }}>
      <Skeleton width="40%" height={32} borderRadius={4} />
      <Skeleton height={13} style={{ marginTop: 10 }} />
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {Array.from({ length: cols }).map((_, i) => (
            <th key={i} style={{ padding: '8px 12px', borderBottom: '2px solid #E0E0E0' }}>
              <Skeleton height={13} width="70%" />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r}>
            {Array.from({ length: cols }).map((_, c) => (
              <td key={c} style={{ padding: '10px 12px', borderBottom: '1px solid #E0E0E0' }}>
                <Skeleton height={13} width={`${50 + Math.random() * 40}%`} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SkeletonChart({ height = 240 }: { height?: number }) {
  return (
    <div style={{ height, display: 'flex', alignItems: 'flex-end', gap: 8, padding: '0 8px' }}>
      {Array.from({ length: 7 }).map((_, i) => (
        <Skeleton
          key={i}
          width={`${100 / 7}%`}
          height={`${30 + Math.random() * 60}%`}
          borderRadius={4}
        />
      ))}
    </div>
  );
}
