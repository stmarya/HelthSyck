import { useEffect, useState, useCallback } from 'react';
import { useToast } from '../context/ToastContext';

// ─────────────────────────────────────────────────────────────────────────────
// Hook: menghitung sisa waktu token JWT dan memperingatkan sebelum expired
// ─────────────────────────────────────────────────────────────────────────────

const WARN_BEFORE_MS = 5 * 60 * 1000; // 5 menit sebelum expired
const CHECK_INTERVAL_MS = 30 * 1000;   // cek setiap 30 detik

function getTokenExp(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload)) as { exp?: number };
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function useSessionExpiry(onExpired?: () => void) {
  const { warning } = useToast();
  const [warned, setWarned] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const check = useCallback(() => {
    const token = localStorage.getItem('hs_access_token');
    if (!token) return;

    const exp = getTokenExp(token);
    if (!exp) return;

    const remaining = exp - Date.now();

    if (remaining <= 0) {
      onExpired?.();
      return;
    }

    setSecondsLeft(Math.floor(remaining / 1000));

    // Tampilkan warning sekali saja ketika < 5 menit tersisa
    if (remaining < WARN_BEFORE_MS && !warned) {
      const mnt = Math.ceil(remaining / 60000);
      warning(
        `Sesi Anda akan berakhir dalam ${mnt} menit. Simpan pekerjaan Anda atau login ulang.`,
        'Sesi Akan Berakhir',
      );
      setWarned(true);
    }

    // Reset flag warning jika token diperbaharui (remaining naik kembali)
    if (remaining > WARN_BEFORE_MS && warned) {
      setWarned(false);
    }
  }, [onExpired, warning, warned]);

  useEffect(() => {
    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [check]);

  return { secondsLeft };
}
