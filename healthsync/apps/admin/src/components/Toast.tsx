/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Toast, ToastType } from '../types/admin';

// ─────────────────────────────────────────────────────────────────────────────
// Toast Context & Provider
// ─────────────────────────────────────────────────────────────────────────────

interface ToastContextValue {
  toasts: Toast[];
  showToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, message }]);
    // Auto-dismiss after 4 s
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be inside ToastProvider');
  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
// ToastContainer — fixed bottom-right stack
// ─────────────────────────────────────────────────────────────────────────────

const TOAST_COLORS: Record<ToastType, { bg: string; border: string; text: string; icon: string }> = {
  success: { bg: '#f0fdf4', border: '#86efac', text: '#166534', icon: '✓' },
  error:   { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', icon: '✕' },
  warning: { bg: '#fffbeb', border: '#fcd34d', text: '#92400e', icon: '!' },
  info:    { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af', icon: 'i' },
};

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24,
      display: 'flex', flexDirection: 'column', gap: 8,
      zIndex: 9999, pointerEvents: 'none',
    }}>
      {toasts.map((t) => {
        const c = TOAST_COLORS[t.type];
        return (
          <div
            key={t.id}
            style={{
              pointerEvents: 'auto',
              display: 'flex', alignItems: 'flex-start', gap: 10,
              background: c.bg, border: `1px solid ${c.border}`,
              borderRadius: 8, padding: '12px 14px',
              fontSize: 13, color: c.text,
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              maxWidth: 340, minWidth: 240,
              animation: 'slideIn 0.2s ease',
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 14, flexShrink: 0, marginTop: 1 }}>
              {c.icon}
            </span>
            <span style={{ flex: 1, lineHeight: 1.5 }}>{t.message}</span>
            <button
              onClick={() => onRemove(t.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: c.text, opacity: 0.6, fontSize: 16, padding: 0,
                lineHeight: 1, flexShrink: 0, marginTop: -1,
              }}
            >×</button>
          </div>
        );
      })}
    </div>
  );
}
