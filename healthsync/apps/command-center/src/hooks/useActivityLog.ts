import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Tipe log ─────────────────────────────────────────────────────────────

export type LogLevel = 'info' | 'success' | 'warning' | 'danger';

export interface ActivityLog {
  id: string;
  timestamp: Date;
  level: LogLevel;
  actor: string;      // email user
  action: string;     // nama aksi
  detail: string;     // deskripsi lengkap
  page: string;       // halaman tempat aksi terjadi
}

// ─── Singleton log store (agar bisa diakses dari mana saja) ───────────────

const MAX_LOGS = 200;
let _logs: ActivityLog[] = [];
let _listeners: Array<(logs: ActivityLog[]) => void> = [];
let _logCounter = 0;

function notifyListeners() {
  const snapshot = [..._logs];
  _listeners.forEach((fn) => fn(snapshot));
}

export function appendLog(entry: Omit<ActivityLog, 'id' | 'timestamp'>) {
  const log: ActivityLog = {
    ...entry,
    id: `log-${++_logCounter}`,
    timestamp: new Date(),
  };
  _logs = [log, ..._logs].slice(0, MAX_LOGS);
  notifyListeners();
}

// ─── Hook: subscribe ke log store ────────────────────────────────────────

export function useActivityLog() {
  const [logs, setLogs] = useState<ActivityLog[]>([..._logs]);
  const listenerRef = useRef<(logs: ActivityLog[]) => void>(() => undefined);

  listenerRef.current = setLogs;

  useEffect(() => {
    const fn = (newLogs: ActivityLog[]) => listenerRef.current(newLogs);
    _listeners.push(fn);
    return () => { _listeners = _listeners.filter((l) => l !== fn); };
  }, []);

  const clear = useCallback(() => {
    _logs = [];
    notifyListeners();
  }, []);

  const levelStyle: Record<LogLevel, { color: string; bg: string; icon: string }> = {
    info:    { color: '#0284c7', bg: '#f0f9ff', icon: 'ℹ️' },
    success: { color: '#15803d', bg: '#f0fdf4', icon: '✅' },
    warning: { color: '#d97706', bg: '#fffbeb', icon: '⚠️' },
    danger:  { color: '#dc2626', bg: '#fef2f2', icon: '🚨' },
  };

  return { logs, clear, levelStyle };
}
