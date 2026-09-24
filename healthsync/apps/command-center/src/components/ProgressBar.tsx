interface ProgressBarProps {
  value: number;
  color?: string;
  label?: string;
  showPercent?: boolean;
}

export default function ProgressBar({ value, color = 'var(--color-primary)', label, showPercent = false }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div style={{ width: '100%' }}>
      {(label !== undefined || showPercent) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          {label && <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{label}</span>}
          {showPercent && <span style={{ fontSize: 12, color: 'var(--color-muted)', fontWeight: 600 }}>{clamped.toFixed(0)}%</span>}
        </div>
      )}
      <div style={{
        width: '100%', height: 6, background: 'var(--color-border)',
        borderRadius: 999, overflow: 'hidden',
      }}>
        <div
          style={{
            width: `${clamped}%`, height: '100%',
            background: color, borderRadius: 999,
            transition: 'width 0.6s ease',
          }}
        />
      </div>
    </div>
  );
}
