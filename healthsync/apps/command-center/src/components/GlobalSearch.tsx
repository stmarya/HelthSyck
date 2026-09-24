import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGlobalSearch, type SearchResult } from '../hooks/useGlobalSearch';

// ─── Warna kategori ───────────────────────────────────────────────────────

const CAT_COLORS: Record<string, string> = {
  pasien:      '#2563eb',
  konsultasi:  '#d97706',
  ambulans:    '#10b981',
  rumah_sakit: '#7c3aed',
  rujukan:     '#0284c7',
};

const CAT_ICONS: Record<string, string> = {
  pasien:      '🧑‍⚕️',
  konsultasi:  '🩺',
  ambulans:    '🚑',
  rumah_sakit: '🏥',
  rujukan:     '📋',
};

// ─── Komponen GlobalSearch ────────────────────────────────────────────────

interface GlobalSearchProps {
  onClose: () => void;
}

export default function GlobalSearch({ onClose }: GlobalSearchProps) {
  const { query, results, loading, setQuery, clear } = useGlobalSearch();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-fokus saat dibuka
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Tutup saat tekan Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSelect = (result: SearchResult) => {
    navigate(result.navigateTo);
    clear();
    onClose();
  };

  // Kelompokkan hasil per kategori
  const grouped: Record<string, SearchResult[]> = {};
  for (const r of results) {
    if (!grouped[r.category]) grouped[r.category] = [];
    grouped[r.category].push(r);
  }

  return (
    <>
      {/* Overlay gelap */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 998,
          background: 'rgba(0,0,0,0.45)',
          animation: 'fadeInDark 0.15s ease both',
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel search */}
      <div style={{
        position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)',
        zIndex: 999, width: '100%', maxWidth: 560,
        background: '#fff',
        borderRadius: 14,
        boxShadow: '0 25px 60px rgba(0,0,0,0.25)',
        border: '1px solid #e5e7eb',
        animation: 'slideDownSearch 0.2s ease both',
        overflow: 'hidden',
      }}>
        {/* Input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 18px',
          borderBottom: results.length > 0 ? '1px solid #e5e7eb' : 'none',
        }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari pasien, ambulans, RS, rujukan, konsultasi..."
            style={{
              flex: 1, border: 'none', outline: 'none',
              fontSize: 15, color: '#111827', background: 'transparent',
            }}
          />
          {loading && (
            <div style={{
              width: 16, height: 16, borderRadius: '50%',
              border: '2px solid #e5e7eb',
              borderTopColor: '#2563eb',
              animation: 'spin 0.7s linear infinite',
              flexShrink: 0,
            }} />
          )}
          {query && (
            <button
              onClick={() => { clear(); inputRef.current?.focus(); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9ca3af', padding: 0 }}
            >
              ×
            </button>
          )}
          <kbd style={{
            padding: '2px 6px', fontSize: 10, color: '#9ca3af',
            border: '1px solid #e5e7eb', borderRadius: 4,
            fontFamily: 'monospace', flexShrink: 0,
          }}>
            ESC
          </kbd>
        </div>

        {/* Hasil */}
        {query.length >= 2 && (
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {results.length === 0 && !loading ? (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: '#9ca3af', fontSize: 13 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🔎</div>
                Tidak ada hasil untuk <strong>"{query}"</strong>
              </div>
            ) : (
              Object.entries(grouped).map(([cat, items]) => (
                <div key={cat}>
                  {/* Header kategori */}
                  <div style={{
                    padding: '8px 18px 4px',
                    fontSize: 10, fontWeight: 700,
                    color: CAT_COLORS[cat] ?? '#9ca3af',
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                    background: '#f9fafb',
                    borderBottom: '1px solid #f3f4f6',
                  }}>
                    {CAT_ICONS[cat]} {cat.replace('_', ' ')}
                  </div>
                  {items.map((result) => (
                    <button
                      key={result.id}
                      onClick={() => handleSelect(result)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 18px', background: 'none', border: 'none',
                        cursor: 'pointer', textAlign: 'left',
                        borderBottom: '1px solid #f3f4f6',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                    >
                      <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: `${CAT_COLORS[result.category] ?? '#e5e7eb'}18`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, flexShrink: 0,
                      }}>
                        {CAT_ICONS[result.category]}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 1 }}>
                          {result.title}
                        </div>
                        <div style={{
                          fontSize: 11, color: '#9ca3af',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {result.subtitle}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        color: result.badgeColor ?? '#9ca3af',
                        background: `${result.badgeColor ?? '#9ca3af'}18`,
                        padding: '2px 8px', borderRadius: 999,
                        flexShrink: 0,
                      }}>
                        {result.badge}
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        )}

        {/* Hint saat kosong */}
        {query.length < 2 && (
          <div style={{ padding: '16px 18px', fontSize: 12, color: '#9ca3af' }}>
            Ketik minimal 2 karakter untuk mulai mencari di semua modul...
          </div>
        )}
      </div>

      {/* Animasi fadeInDark, slideDownSearch, spin sudah didefinisikan di index.css global */}
    </>
  );
}
