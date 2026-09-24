// ─── Komponen: ChipFilter ─────────────────────────────────────────────────────
// Filter cepat berbasis chip (pill button). Single-select dengan opsi "Semua".

interface ChipOption {
  value: string;
  label: string;
  count?: number;
  color?: string;
}

interface ChipFilterProps {
  options: ChipOption[];
  value: string;
  onChange: (val: string) => void;
  allLabel?: string;
}

export default function ChipFilter({
  options,
  value,
  onChange,
  allLabel = 'Semua',
}: ChipFilterProps) {
  const semua: ChipOption = { value: '', label: allLabel };
  const semua_options = [semua, ...options];

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {semua_options.map((opt) => {
        const isActive = opt.value === value;
        const baseColor = opt.color ?? 'var(--color-primary)';
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 12px',
              fontSize: 11, fontWeight: isActive ? 700 : 500,
              borderRadius: 999,
              border: `1px solid ${isActive ? baseColor : 'var(--color-border)'}`,
              background: isActive ? `${baseColor}18` : 'var(--color-surface)',
              color: isActive ? baseColor : 'var(--color-muted)',
              cursor: 'pointer',
              transition: 'all 0.12s',
              whiteSpace: 'nowrap',
            }}
          >
            {opt.label}
            {opt.count !== undefined && (
              <span style={{
                fontSize: 10, fontWeight: 700,
                background: isActive ? baseColor : 'var(--color-surface-2)',
                color: isActive ? '#fff' : 'var(--color-muted)',
                borderRadius: 999, padding: '0 5px', lineHeight: '16px',
              }}>
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
