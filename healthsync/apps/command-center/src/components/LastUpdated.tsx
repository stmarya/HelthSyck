import { useState, useEffect } from 'react';

// ─── Komponen: LastUpdated ─────────────────────────────────────────────────────
// Menampilkan "Diperbarui X detik lalu" dengan auto-update setiap 10 detik.
// Jika timestamp null, tampilkan "Memuat..."

interface LastUpdatedProps {
  timestamp: Date | null;
  interval?: number; // ms, default 10000
}

export default function LastUpdated({ timestamp, interval = 10_000 }: LastUpdatedProps) {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => forceUpdate((n) => n + 1), interval);
    return () => clearInterval(iv);
  }, [interval]);

  if (!timestamp) {
    return (
      <span style={{ fontSize: 11, color: 'var(--color-muted)', fontStyle: 'italic' }}>
        Memuat...
      </span>
    );
  }

  const selisihDetik = Math.floor((Date.now() - timestamp.getTime()) / 1000);
  const teks =
    selisihDetik < 5
      ? 'Baru saja'
      : selisihDetik < 60
        ? `${selisihDetik} detik lalu`
        : `${Math.floor(selisihDetik / 60)} menit lalu`;

  return (
    <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
      ↻ Diperbarui {teks}
    </span>
  );
}
