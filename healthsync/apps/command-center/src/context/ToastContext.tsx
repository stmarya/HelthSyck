import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// ─── Tipe Toast ────────────────────────────────────────────────────────────

export type ToastLevel = 'success' | 'danger' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  level: ToastLevel;
  title?: string;
  duration?: number; // ms, 0 = permanent
}

interface ToastContextValue {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'>) => string;
  dismiss: (id: string) => void;
  // Shorthand helpers
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// ─── Warna per level ───────────────────────────────────────────────────────

const LEVEL_STYLE: Record<ToastLevel, { bg: string; border: string; text: string; icon: string }> = {
  success: { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d', icon: '✅' },
  danger:  { bg: '#fef2f2', border: '#fecaca', text: '#dc2626', icon: '🚨' },
  warning: { bg: '#fffbeb', border: '#fde68a', text: '#d97706', icon: '⚠️' },
  info:    { bg: '#f0f9ff', border: '#bae6fd', text: '#0284c7', icon: 'ℹ️' },
};

// ─── Komponen satu toast ───────────────────────────────────────────────────

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const style = LEVEL_STYLE[toast.level];
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animasi masuk
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: 10,
        padding: '12px 14px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
        minWidth: 280, maxWidth: 380,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateX(0)' : 'translateX(40px)',
        transition: 'opacity 0.25s ease, transform 0.25s ease',
        position: 'relative',
      }}
      role="alert"
    >
      <span style={{ fontSize: 16, lineHeight: 1.4, flexShrink: 0 }}>{style.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {toast.title && (
          <div style={{ fontSize: 13, fontWeight: 700, color: style.text, marginBottom: 2 }}>
            {toast.title}
          </div>
        )}
        <div style={{ fontSize: 12, color: style.text, lineHeight: 1.5 }}>{toast.message}</div>
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        style={{
          background: 'none', border: 'none', padding: '0 0 0 4px',
          fontSize: 14, cursor: 'pointer', color: style.text,
          opacity: 0.6, lineHeight: 1, flexShrink: 0,
        }}
        aria-label="Tutup notifikasi"
      >
        ×
      </button>
    </div>
  );
}

// ─── Toast Container ───────────────────────────────────────────────────────

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div style={{
      position: 'fixed', top: 76, right: 16,
      zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 8,
      pointerEvents: 'none',
    }}>
      {toasts.map((t) => (
        <div key={t.id} style={{ pointerEvents: 'auto' }}>
          <ToastItem toast={t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────

let _idCounter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
  }, []);

  const push = useCallback((toast: Omit<Toast, 'id'>): string => {
    const id = `toast-${++_idCounter}`;
    const duration = toast.duration ?? (toast.level === 'danger' ? 8000 : 5000);
    setToasts((prev) => [...prev.slice(-4), { ...toast, id }]); // max 5 toast
    if (duration > 0) {
      const t = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, t);
    }
    return id;
  }, [dismiss]);

  const success = useCallback((message: string, title?: string) => { push({ level: 'success', message, title }); }, [push]);
  const error   = useCallback((message: string, title?: string) => { push({ level: 'danger',  message, title, duration: 8000 }); }, [push]);
  const warning = useCallback((message: string, title?: string) => { push({ level: 'warning', message, title }); }, [push]);
  const info    = useCallback((message: string, title?: string) => { push({ level: 'info',    message, title }); }, [push]);

  // Bersihkan semua timer saat unmount
  useEffect(() => {
    const t = timers.current;
    return () => { t.forEach((v) => clearTimeout(v)); };
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, push, dismiss, success, error, warning, info }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast harus digunakan di dalam ToastProvider');
  return ctx;
}
