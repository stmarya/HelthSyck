import { useState, useEffect } from 'react';

// ─── Komponen: DurasiAktif ────────────────────────────────────────────────────
// Menampilkan durasi waktu relatif dari isoString hingga sekarang.
// Jika melebihi threshold (menit), tampilkan dengan warna peringatan.

interface DurasiAktifProps {
  isoString: string;
  warnAfterMinutes?: number;   // tampilkan warning jika > X menit (default: 30)
  criticalAfterMinutes?: number; // tampilkan critical jika > Y menit (default: 60)
  prefix?: string;             // teks sebelum durasi (default: kosong)
}

function hitungDurasi(isoString: string): { teks: string; menitTotal: number } {
  const selisihMs = Date.now() - new Date(isoString).getTime();
  const detik = Math.floor(selisihMs / 1000);
  const menit = Math.floor(detik / 60);
  const jam   = Math.floor(menit / 60);
  const hari  = Math.floor(jam   / 24);

  let teks: string;
  if (hari > 0)        teks = `${hari} hari lalu`;
  else if (jam > 0)    teks = `${jam} jam ${menit % 60} menit`;
  else if (menit > 0)  teks = `${menit} menit lalu`;
  else                 teks = `${detik} detik lalu`;

  return { teks, menitTotal: menit };
}

export default function DurasiAktif({
  isoString,
  warnAfterMinutes = 30,
  criticalAfterMinutes = 60,
  prefix = '',
}: DurasiAktifProps) {
  const [state, setState] = useState(() => hitungDurasi(isoString));

  // Update setiap 30 detik
  useEffect(() => {
    setState(hitungDurasi(isoString));
    const iv = setInterval(() => setState(hitungDurasi(isoString)), 30_000);
    return () => clearInterval(iv);
  }, [isoString]);

  const isCritical = state.menitTotal >= criticalAfterMinutes;
  const isWarn     = !isCritical && state.menitTotal >= warnAfterMinutes;

  const warna = isCritical
    ? 'var(--color-danger)'
    : isWarn
      ? 'var(--color-warning)'
      : 'var(--color-muted)';

  return (
    <span style={{ fontSize: 11, color: warna, fontWeight: (isCritical || isWarn) ? 700 : 400 }}>
      {prefix}{state.teks}
      {isCritical && ' ⚠️'}
    </span>
  );
}
