interface MiniKpiCardProps {
  label: string;
  value: number | string;
  sub?: string;
  icon: string;
  color: string;
  trend?: 'up' | 'down' | 'neutral';
}

export default function MiniKpiCard({ label, value, sub, icon, color, trend }: MiniKpiCardProps) {
  const trendIcon =
    trend === 'up' ? '↑' :
    trend === 'down' ? '↓' :
    null;
  const trendColor =
    trend === 'up' ? 'var(--color-success)' :
    trend === 'down' ? 'var(--color-danger)' :
    'var(--color-muted)';

  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--color-border)',
      borderLeft: `3px solid ${color}`,
      borderRadius: 'var(--radius-md)',
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        background: `${color}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1, color: 'var(--color-text)', display: 'flex', alignItems: 'baseline', gap: 4 }}>
          {value}
          {trendIcon && (
            <span style={{ fontSize: 14, fontWeight: 700, color: trendColor }}>{trendIcon}</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 2 }}>{label}</div>
        {sub && (
          <div style={{ fontSize: 11, color: 'var(--color-disabled)', marginTop: 1 }}>{sub}</div>
        )}
      </div>
    </div>
  );
}
