import { useState } from 'react';
import { useActivityLog } from '../hooks/useActivityLog';

// ─── AuditLogPanel ────────────────────────────────────────────────────────

interface AuditLogPanelProps {
  onClose: () => void;
}

export default function AuditLogPanel({ onClose }: AuditLogPanelProps) {
  const { logs, clear, levelStyle } = useActivityLog();
  const [filter, setFilter] = useState<string>('');

  const filtered = filter
    ? logs.filter((l) => l.level === filter || l.page === filter)
    : logs;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 997,
          background: 'rgba(0,0,0,0.35)',
          animation: 'fadeInDark 0.15s ease both',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0,
        width: 480, background: '#fff',
        zIndex: 998, boxShadow: '-8px 0 32px rgba(0,0,0,0.15)',
        display: 'flex', flexDirection: 'column',
        animation: 'slideInRight 0.25s ease both',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid #e5e7eb',
          background: '#f9fafb',
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0, color: '#111827' }}>
              📋 Audit Trail
            </h2>
            <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
              Log aktivitas sesi ini ({logs.length} entri)
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={clear}
              style={{
                padding: '5px 12px', fontSize: 11, background: '#fef2f2',
                border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer',
                color: '#dc2626', fontWeight: 600,
              }}
            >
              Hapus Log
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '5px 12px', fontSize: 12, background: '#f3f4f6',
                border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer',
                color: '#374151',
              }}
            >
              × Tutup
            </button>
          </div>
        </div>

        {/* Filter */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['', 'info', 'success', 'warning', 'danger'].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFilter(lvl)}
                style={{
                  padding: '3px 10px', fontSize: 11, borderRadius: 999,
                  cursor: 'pointer', fontWeight: filter === lvl ? 700 : 400,
                  background: filter === lvl ? '#1f2328' : '#f3f4f6',
                  color:  filter === lvl ? '#fff' : '#374151',
                  border: 'none',
                }}
              >
                {lvl === '' ? 'Semua' : lvl.charAt(0).toUpperCase() + lvl.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Log list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: '#9ca3af', fontSize: 13 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
              Belum ada aktivitas dicatat dalam sesi ini
            </div>
          ) : (
            filtered.map((log) => {
              const style = levelStyle[log.level];
              return (
                <div key={log.id} style={{
                  display: 'flex', gap: 12, padding: '10px 20px',
                  borderBottom: '1px solid #f9fafb',
                }}>
                  {/* Icon */}
                  <div style={{
                    width: 28, height: 28, borderRadius: 8,
                    background: style.bg, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, marginTop: 2,
                  }}>
                    {style.icon}
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{log.action}</span>
                      <span style={{
                        fontSize: 10, padding: '1px 6px', borderRadius: 999,
                        background: style.bg, color: style.color, fontWeight: 600,
                      }}>
                        {log.page}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>{log.detail}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>
                      {log.actor} · {log.timestamp.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Animasi fadeInDark & slideInRight sudah didefinisikan di index.css global */}
    </>
  );
}
