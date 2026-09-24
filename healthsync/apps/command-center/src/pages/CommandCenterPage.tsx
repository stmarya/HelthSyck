// CommandCenterPage.tsx — War-room dashboard utama HealthSync
// Semua teks Bahasa Indonesia, tidak ada tipe any

import { useEffect, useState, useRef, useCallback } from 'react';
import { simulationEngine } from '../simulation/SimulationEngine';
import type { SimEvent } from '../simulation/SimulationEngine';
import type { Dokter, Ambulans, RumahSakit } from '../simulation/SimulationData';
import { useToast } from '../context/ToastContext';
import { appendLog } from '../hooks/useActivityLog';
import styles from './Page.module.css';

// ─── Tipe ─────────────────────────────────────────────────────────────────────

interface FeedItem {
  id: string;
  text: string;
  level: 'info' | 'warning' | 'danger' | 'success';
  timestamp: Date;
  icon: string;
}

type EmergencyEvent = Extract<SimEvent, { type: 'PATIENT_EMERGENCY' }>;

// ─── Konstanta ────────────────────────────────────────────────────────────────

const FEED_ICON: Record<SimEvent['type'], string> = {
  DOCTOR_STATUS: '👨‍⚕️',
  CONSULTATION_START: '💬',
  MEDICINE_ORDER: '💊',
  PATIENT_EMERGENCY: '🚨',
  AMBULANCE_REQUEST: '🚑',
  BLOOD_REQUEST: '🩸',
  REFERRAL_REQUEST: '🏥',
  HOSPITAL_CAPACITY_UPDATE: '📊',
  LOCATION_UPDATE: '📍',
};

const LEVEL_DOT_COLOR: Record<FeedItem['level'], string> = {
  info: '#0284c7',
  warning: '#d97706',
  danger: '#dc2626',
  success: '#16a34a',
};

let _feedCounter = 0;

// ─── Helper: relatif waktu ────────────────────────────────────────────────────

function formatRelativeTime(d: Date): string {
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 5) return 'baru saja';
  if (diff < 60) return `${diff} dtk lalu`;
  if (diff < 3600) return `${Math.floor(diff / 60)} mnt lalu`;
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

// ─── Helper: avatar warna dari indeks ────────────────────────────────────────

function avatarColor(idx: number): string {
  const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16', '#f97316'];
  return colors[idx % colors.length];
}

// ─── SVG Peta Mini ────────────────────────────────────────────────────────────

function LiveMapEmbed() {
  return (
    <div
      style={{
        height: '100%',
        background: '#0f172a',
        borderRadius: 10,
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header peta */}
      <div
        style={{
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>🗺 PETA REAL-TIME JAKARTA</span>
        <span
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            background: 'rgba(220,38,38,0.2)',
            border: '1px solid rgba(220,38,38,0.4)',
            color: '#f87171',
            borderRadius: 999,
            padding: '2px 8px',
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#f87171',
              animation: 'pulsingDot 1.4s ease infinite',
            }}
          />
          LIVE
        </span>
      </div>

      {/* SVG peta */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <svg
          viewBox="0 0 600 360"
          style={{ width: '100%', height: '100%' }}
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Latar belakang peta */}
          <rect width="600" height="360" fill="#0f172a" />

          {/* Grid garis jalan utama */}
          <g stroke="rgba(255,255,255,0.06)" strokeWidth="1">
            <line x1="0" y1="60" x2="600" y2="60" />
            <line x1="0" y1="120" x2="600" y2="120" />
            <line x1="0" y1="180" x2="600" y2="180" />
            <line x1="0" y1="240" x2="600" y2="240" />
            <line x1="0" y1="300" x2="600" y2="300" />
            <line x1="100" y1="0" x2="100" y2="360" />
            <line x1="200" y1="0" x2="200" y2="360" />
            <line x1="300" y1="0" x2="300" y2="360" />
            <line x1="400" y1="0" x2="400" y2="360" />
            <line x1="500" y1="0" x2="500" y2="360" />
          </g>

          {/* Jalan utama / arteri */}
          <g stroke="rgba(148,163,184,0.15)" strokeWidth="3" fill="none">
            <path d="M 0 180 Q 150 160 300 180 Q 450 200 600 180" />
            <path d="M 300 0 Q 280 90 300 180 Q 320 270 300 360" />
            <path d="M 0 90 Q 200 70 400 100 Q 500 110 600 90" />
            <path d="M 0 270 Q 150 250 300 270 Q 450 290 600 270" />
          </g>

          {/* Blok bangunan */}
          <g fill="rgba(30,41,59,0.8)" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5">
            <rect x="20" y="20" width="60" height="30" rx="3" />
            <rect x="120" y="15" width="50" height="35" rx="3" />
            <rect x="220" y="25" width="45" height="25" rx="3" />
            <rect x="320" y="10" width="55" height="40" rx="3" />
            <rect x="430" y="20" width="50" height="28" rx="3" />
            <rect x="530" y="15" width="55" height="35" rx="3" />
            <rect x="15" y="140" width="65" height="25" rx="3" />
            <rect x="130" y="135" width="45" height="30" rx="3" />
            <rect x="230" y="140" width="50" height="25" rx="3" />
            <rect x="330" y="130" width="55" height="35" rx="3" />
            <rect x="440" y="138" width="48" height="28" rx="3" />
            <rect x="535" y="133" width="52" height="32" rx="3" />
            <rect x="20" y="215" width="60" height="28" rx="3" />
            <rect x="125" y="210" width="48" height="32" rx="3" />
            <rect x="230" y="218" width="52" height="26" rx="3" />
            <rect x="332" y="208" width="50" height="35" rx="3" />
            <rect x="438" y="214" width="55" height="28" rx="3" />
            <rect x="535" y="210" width="50" height="30" rx="3" />
            <rect x="22" y="305" width="58" height="30" rx="3" />
            <rect x="128" y="300" width="45" height="35" rx="3" />
            <rect x="232" y="308" width="50" height="28" rx="3" />
            <rect x="335" y="298" width="53" height="36" rx="3" />
            <rect x="440" y="304" width="50" height="32" rx="3" />
            <rect x="536" y="300" width="52" height="35" rx="3" />
          </g>

          {/* Ikon RS (Rumah Sakit) */}
          {[
            { x: 80, y: 85, nama: 'RSCM' },
            { x: 220, y: 165, nama: 'RS Medistra' },
            { x: 370, y: 100, nama: 'RS Premier' },
            { x: 490, y: 200, nama: 'RS MMC' },
            { x: 150, y: 290, nama: 'RSPAD' },
            { x: 340, y: 280, nama: 'RS Pondok Indah' },
          ].map((rs) => (
            <g key={rs.nama} transform={`translate(${rs.x},${rs.y})`}>
              <circle r="10" fill="#1d4ed8" stroke="#3b82f6" strokeWidth="1.5" opacity="0.9" />
              <text x="0" y="4" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">+</text>
              <text x="0" y="22" textAnchor="middle" fill="#93c5fd" fontSize="7">{rs.nama}</text>
            </g>
          ))}

          {/* Ikon Ambulans bergerak */}
          {[
            { x: 155, y: 140 },
            { x: 290, y: 220 },
            { x: 420, y: 150 },
          ].map((pos, i) => (
            <g key={i} transform={`translate(${pos.x},${pos.y})`}>
              <circle r="7" fill="#dc2626" stroke="#fca5a5" strokeWidth="1" opacity="0.85">
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  values="0,0; 8,4; -4,8; 0,0"
                  dur={`${3 + i * 0.7}s`}
                  repeatCount="indefinite"
                />
              </circle>
              <text x="0" y="3" textAnchor="middle" fill="white" fontSize="8">🚑</text>
            </g>
          ))}

          {/* Ikon Pasien/kejadian */}
          {[
            { x: 100, y: 200 },
            { x: 400, y: 260 },
            { x: 260, y: 80 },
          ].map((pos, i) => (
            <g key={i} transform={`translate(${pos.x},${pos.y})`}>
              <circle r="5" fill="#f59e0b" stroke="#fde68a" strokeWidth="1" opacity="0.8">
                <animate attributeName="r" values="5;7;5" dur="2s" repeatCount="indefinite" />
              </circle>
            </g>
          ))}

          {/* Label kota */}
          <text x="300" y="354" textAnchor="middle" fill="rgba(148,163,184,0.4)" fontSize="9">
            Jakarta, Indonesia
          </text>
          <text x="8" y="12" fill="rgba(148,163,184,0.3)" fontSize="8">-6.10° S</text>
          <text x="8" y="352" fill="rgba(148,163,184,0.3)" fontSize="8">-6.35° S</text>
        </svg>

        {/* Legenda */}
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            right: 10,
            background: 'rgba(15,23,42,0.85)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
            padding: '6px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
          }}
        >
          {[
            { color: '#3b82f6', label: 'Rumah Sakit' },
            { color: '#dc2626', label: 'Ambulans' },
            { color: '#f59e0b', label: 'Kejadian' },
          ].map((item) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: item.color,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 9, color: '#94a3b8' }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Panel Dokter ─────────────────────────────────────────────────────────────

function DoctorStatusPanel({ doctors }: { doctors: Dokter[] }) {
  const statusStyle: Record<Dokter['status'], { bg: string; color: string; border: string }> = {
    Tersedia: { bg: 'var(--color-success-bg)', color: 'var(--color-success)', border: 'var(--color-success-border)' },
    Konsultasi: { bg: 'var(--color-warning-bg)', color: 'var(--color-warning)', border: 'var(--color-warning-border)' },
    'Tidak Tersedia': { bg: 'var(--color-danger-bg)', color: 'var(--color-danger)', border: 'var(--color-danger-border)' },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div
        style={{
          padding: '10px 12px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>👨‍⚕️ Status Dokter</span>
        <span
          style={{
            marginLeft: 'auto',
            background: 'var(--color-success-bg)',
            color: 'var(--color-success)',
            border: '1px solid var(--color-success-border)',
            borderRadius: 999,
            padding: '1px 7px',
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {doctors.filter((d) => d.status === 'Tersedia').length} tersedia
        </span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {doctors.map((doc, idx) => {
          const st = statusStyle[doc.status];
          const initials = doc.nama
            .split(' ')
            .map((n) => n[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();
          return (
            <div
              key={doc.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '7px 12px',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: avatarColor(idx),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {initials}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {doc.nama}
                </div>
                <div style={{ fontSize: 10, color: 'var(--color-muted)' }}>{doc.spesialisasi}</div>
                {doc.status === 'Konsultasi' && doc.topik && (
                  <div style={{ fontSize: 10, color: 'var(--color-warning)', marginTop: 1 }}>
                    💬 {doc.topik}
                  </div>
                )}
              </div>
              <span
                style={{
                  background: st.bg,
                  color: st.color,
                  border: `1px solid ${st.border}`,
                  borderRadius: 999,
                  padding: '2px 7px',
                  fontSize: 10,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {doc.status}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Panel Ambulans ───────────────────────────────────────────────────────────

function AmbulanceTrackerPanel({
  ambulances,
  onDispatch,
}: {
  ambulances: Ambulans[];
  onDispatch: (unit: string) => void;
}) {
  const statusStyle: Record<Ambulans['status'], { bg: string; color: string; border: string }> = {
    Tersedia: { bg: 'var(--color-success-bg)', color: 'var(--color-success)', border: 'var(--color-success-border)' },
    'Dalam Perjalanan': { bg: 'var(--color-warning-bg)', color: 'var(--color-warning)', border: 'var(--color-warning-border)' },
    Tiba: { bg: 'var(--color-info-bg)', color: 'var(--color-info)', border: 'var(--color-info-border)' },
    Kembali: { bg: 'var(--color-surface-2)', color: 'var(--color-muted)', border: 'var(--color-border)' },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div
        style={{
          padding: '10px 12px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>🚑 Tracker Ambulans</span>
        <span
          style={{
            marginLeft: 'auto',
            background: 'var(--color-info-bg)',
            color: 'var(--color-info)',
            border: '1px solid var(--color-info-border)',
            borderRadius: 999,
            padding: '1px 7px',
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {ambulances.length} unit
        </span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {ambulances.map((amb) => {
          const st = statusStyle[amb.status];
          return (
            <div
              key={amb.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 12px',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>🚑</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)' }}>
                  {amb.nomorUnit}
                </div>
                <div style={{ fontSize: 10, color: 'var(--color-muted)' }}>
                  {amb.pengemudi}
                  {amb.eta !== undefined && (
                    <span style={{ color: 'var(--color-warning)', marginLeft: 6 }}>
                      ETA {amb.eta} mnt
                    </span>
                  )}
                </div>
              </div>
              <span
                style={{
                  background: st.bg,
                  color: st.color,
                  border: `1px solid ${st.border}`,
                  borderRadius: 999,
                  padding: '2px 6px',
                  fontSize: 10,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {amb.status}
              </span>
              <button
                onClick={() => onDispatch(amb.nomorUnit)}
                style={{
                  background: 'var(--color-primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '4px 8px',
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                Dispatch
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Panel Rumah Sakit (mini) ─────────────────────────────────────────────────

function HospitalStatusPanel({
  hospitals,
  onRujuk,
}: {
  hospitals: RumahSakit[];
  onRujuk: (nama: string) => void;
}) {
  function getKapasitasPct(tersedia: number, total: number): number {
    return total > 0 ? Math.min((tersedia / total) * 100, 100) : 0;
  }

  function getBarColor(tersedia: number, total: number): string {
    if (total === 0) return '#6b7280';
    const pct = tersedia / total;
    if (pct > 0.5) return '#16a34a';
    if (pct >= 0.2) return '#d97706';
    return '#dc2626';
  }

  const top3 = hospitals.slice(0, 3);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div
        style={{
          padding: '10px 12px',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>🏥 Status Rumah Sakit</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {top3.map((rs) => (
          <div
            key={rs.id}
            style={{
              background: 'var(--color-surface-2)',
              borderRadius: 8,
              padding: '10px 12px',
              border: '1px solid var(--color-border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)' }}>{rs.nama}</span>
              <span style={{ fontSize: 11, color: 'var(--color-success)', fontWeight: 600 }}>
                {rs.dokterTersedia} dokter
              </span>
            </div>
            {(['IGD', 'ICU', 'Inap'] as const).map((ruang) => {
              const kap = rs.kapasitas[ruang];
              const color = getBarColor(kap.tersedia, kap.total);
              return (
                <div key={ruang} style={{ marginBottom: 5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
                    <span style={{ color: 'var(--color-muted)', fontWeight: 500 }}>{ruang}</span>
                    <span style={{ fontWeight: 700, color }}>
                      {kap.tersedia}/{kap.total}
                    </span>
                  </div>
                  <div style={{ height: 4, borderRadius: 99, background: 'var(--color-border)', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${getKapasitasPct(kap.tersedia, kap.total)}%`,
                        background: color,
                        borderRadius: 99,
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                </div>
              );
            })}
            <button
              onClick={() => onRujuk(rs.nama)}
              style={{
                marginTop: 8,
                width: '100%',
                background: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '5px 0',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Rujuk ke Sini
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Halaman Utama ─────────────────────────────────────────────────────────────

export default function CommandCenterPage() {
  const toast = useToast();

  // ─── State Waktu ────────────────────────────────────────────────────────────
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ─── State Simulasi Toggle ──────────────────────────────────────────────────
  const [isRunning, setIsRunning] = useState<boolean>(simulationEngine.isRunning());

  const toggleSimulasi = useCallback(() => {
    if (simulationEngine.isRunning()) {
      simulationEngine.stop();
      setIsRunning(false);
    } else {
      simulationEngine.start();
      setIsRunning(true);
    }
  }, []);

  // ─── State Dokter ────────────────────────────────────────────────────────────
  const [doctors, setDoctors] = useState<Dokter[]>(() =>
    simulationEngine.getState().dokter.map((d) => ({ ...d })),
  );

  useEffect(() => {
    const unsub = simulationEngine.on('DOCTOR_STATUS', (event: SimEvent) => {
      if (event.type !== 'DOCTOR_STATUS') return;
      setDoctors((prev) =>
        prev.map((d) =>
          d.id === event.doctorId
            ? { ...d, status: event.status, topik: event.topic }
            : d,
        ),
      );
    });
    return unsub;
  }, []);

  // ─── State Ambulans ──────────────────────────────────────────────────────────
  const [ambulances, setAmbulances] = useState<Ambulans[]>(() =>
    simulationEngine.getState().ambulans.map((a) => ({ ...a })),
  );

  useEffect(() => {
    const unsubReq = simulationEngine.on('AMBULANCE_REQUEST', (event: SimEvent) => {
      if (event.type !== 'AMBULANCE_REQUEST') return;
      setAmbulances((prev) =>
        prev.map((a) =>
          a.id === event.ambulanceId
            ? { ...a, status: 'Dalam Perjalanan', eta: event.eta }
            : a,
        ),
      );
    });
    const unsubLoc = simulationEngine.on('LOCATION_UPDATE', (event: SimEvent) => {
      if (event.type !== 'LOCATION_UPDATE') return;
      if (event.entityType !== 'ambulans') return;
      setAmbulances((prev) =>
        prev.map((a) =>
          a.id === event.entityId
            ? { ...a, koordinat: { ...event.koordinat } }
            : a,
        ),
      );
    });
    return () => {
      unsubReq();
      unsubLoc();
    };
  }, []);

  // ─── State Rumah Sakit ───────────────────────────────────────────────────────
  const [hospitals, setHospitals] = useState<RumahSakit[]>(() =>
    simulationEngine.getState().rumahSakit.map((rs) => ({
      ...rs,
      kapasitas: {
        IGD: { ...rs.kapasitas.IGD },
        ICU: { ...rs.kapasitas.ICU },
        Inap: { ...rs.kapasitas.Inap },
        Operasi: { ...rs.kapasitas.Operasi },
      },
      stokDarah: { ...rs.stokDarah },
      dokterJaga: rs.dokterJaga.map((dj) => ({ ...dj })),
    })),
  );

  useEffect(() => {
    const unsub = simulationEngine.on('HOSPITAL_CAPACITY_UPDATE', (event: SimEvent) => {
      if (event.type !== 'HOSPITAL_CAPACITY_UPDATE') return;
      setHospitals((prev) =>
        prev.map((rs) => {
          if (rs.id !== event.hospitalId) return rs;
          return {
            ...rs,
            kapasitas: {
              IGD: { ...rs.kapasitas.IGD, tersedia: event.IGD },
              ICU: { ...rs.kapasitas.ICU, tersedia: event.ICU },
              Inap: { ...rs.kapasitas.Inap, tersedia: event.Inap },
              Operasi: { ...rs.kapasitas.Operasi, tersedia: event.Operasi },
            },
            dokterTersedia: event.doctorsAvailable,
            stokDarah: { ...event.bloodStock },
          };
        }),
      );
    });
    return unsub;
  }, []);

  // ─── Activity Feed ───────────────────────────────────────────────────────────
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [newEventCount, setNewEventCount] = useState<number>(0);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const userScrolledRef = useRef<boolean>(false);

  const handleFeedScroll = useCallback(() => {
    const el = feedRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    if (atBottom) {
      userScrolledRef.current = false;
      setNewEventCount(0);
    } else {
      userScrolledRef.current = true;
    }
  }, []);

  useEffect(() => {
    const unsub = simulationEngine.on('*', (event: SimEvent) => {
      // Skip LOCATION_UPDATE untuk mengurangi noise di feed
      if (event.type === 'LOCATION_UPDATE') return;

      const level = simulationEngine.getEventLevel(event);
      const text = simulationEngine.getEventDisplayText(event);
      const icon = FEED_ICON[event.type];

      const item: FeedItem = {
        id: `feed-${++_feedCounter}`,
        text,
        level,
        timestamp: new Date(),
        icon,
      };

      setFeedItems((prev) => {
        const next = [...prev, item];
        return next.length > 100 ? next.slice(next.length - 100) : next;
      });

      if (userScrolledRef.current) {
        setNewEventCount((c) => c + 1);
      }

      // Append ke activity log
      appendLog({
        level,
        actor: 'system',
        action: event.type,
        detail: text,
        page: 'CommandCenter',
      });
    });
    return unsub;
  }, []);

  // Auto-scroll ke bawah saat item baru masuk (jika belum di-scroll manual)
  useEffect(() => {
    if (!userScrolledRef.current && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [feedItems]);

  // ─── Emergency Modal ─────────────────────────────────────────────────────────
  const [emergencyEvent, setEmergencyEvent] = useState<EmergencyEvent | null>(null);

  useEffect(() => {
    const unsub = simulationEngine.on('PATIENT_EMERGENCY', (event: SimEvent) => {
      if (event.type !== 'PATIENT_EMERGENCY') return;
      setEmergencyEvent(event);
    });
    return unsub;
  }, []);

  const handleRequestAmbulanceEmergency = useCallback(() => {
    if (!emergencyEvent) return;
    toast.warning(
      `Ambulans sedang dikirim ke lokasi ${emergencyEvent.patientName} (${emergencyEvent.location.lat.toFixed(4)}, ${emergencyEvent.location.lng.toFixed(4)})`,
      'Permintaan Ambulans Darurat',
    );
    setEmergencyEvent(null);
  }, [emergencyEvent, toast]);

  // ─── Handlers Panel ──────────────────────────────────────────────────────────

  const handleDispatch = useCallback(
    (unit: string) => {
      toast.info(`Ambulans ${unit} sedang dikirim...`, 'Dispatch Ambulans');
    },
    [toast],
  );

  const handleRujuk = useCallback(
    (nama: string) => {
      toast.info(`Permintaan rujukan ke ${nama} sedang diproses`, 'Rujukan Dikirim');
    },
    [toast],
  );

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page} style={{ padding: 16 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.3px' }}>
          Command Center
        </h1>
        {/* Badge LIVE */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            background: 'rgba(220,38,38,0.12)',
            border: '1px solid rgba(220,38,38,0.3)',
            color: '#dc2626',
            borderRadius: 999,
            padding: '3px 10px',
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.5px',
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#dc2626',
              animation: 'pulsingDot 1.4s ease infinite',
            }}
          />
          LIVE
        </span>
        {/* Waktu saat ini */}
        <span style={{ fontSize: 13, color: 'var(--color-muted)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
          {currentTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
        {/* Tombol toggle simulasi */}
        <button
          className={`${styles.btn} ${isRunning ? styles.btnSecondary : styles.btnPrimary}`}
          style={{ marginLeft: 'auto', height: 32, fontSize: 12 }}
          onClick={toggleSimulasi}
        >
          {isRunning ? '⏸ Pause Simulasi' : '▶ Resume Simulasi'}
        </button>
      </div>

      {/* Grid Utama */}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: '460px 340px',
          gridTemplateColumns: '60% 40%',
          gap: 12,
        }}
      >
        {/* Baris 1, Kolom A: LiveMapEmbed (60%) */}
        <div
          style={{
            background: '#0f172a',
            borderRadius: 10,
            border: '1px solid var(--color-border)',
            overflow: 'hidden',
            gridColumn: 1,
            gridRow: 1,
          }}
        >
          <LiveMapEmbed />
        </div>

        {/* Baris 1, Kolom B: Activity Feed (40%) */}
        <div
          style={{
            background: 'var(--color-surface)',
            borderRadius: 10,
            border: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            gridColumn: 2,
            gridRow: 1,
          }}
        >
          {/* Feed Header */}
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>📡 Activity Feed</span>
            {newEventCount > 0 && (
              <span
                style={{
                  background: 'var(--color-danger-bg)',
                  color: 'var(--color-danger)',
                  border: '1px solid var(--color-danger-border)',
                  borderRadius: 999,
                  padding: '1px 8px',
                  fontSize: 10,
                  fontWeight: 700,
                  animation: 'pulsingDot 1.4s ease infinite',
                }}
              >
                {newEventCount} event baru
              </span>
            )}
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 11,
                color: 'var(--color-muted)',
              }}
            >
              {feedItems.length}/100
            </span>
          </div>
          {/* Feed Body */}
          <div
            ref={feedRef}
            onScroll={handleFeedScroll}
            style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}
          >
            {feedItems.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  color: 'var(--color-muted)',
                  padding: '24px 16px',
                  fontSize: 12,
                }}
              >
                Menunggu event simulasi...
              </div>
            )}
            {feedItems.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '6px 14px',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{item.icon}</span>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: LEVEL_DOT_COLOR[item.level],
                    flexShrink: 0,
                    marginTop: 5,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text)', lineHeight: 1.4 }}>
                    {item.text}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 1 }}>
                    {formatRelativeTime(item.timestamp)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Baris 2: Grid 3 Panel (span 2 kolom) */}
        <div
          style={{
            gridColumn: '1 / -1',
            gridRow: 2,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 12,
          }}
        >
          {/* Panel Dokter */}
          <div
            style={{
              background: 'var(--color-surface)',
              borderRadius: 10,
              border: '1px solid var(--color-border)',
              overflow: 'hidden',
            }}
          >
            <DoctorStatusPanel doctors={doctors} />
          </div>

          {/* Panel Ambulans */}
          <div
            style={{
              background: 'var(--color-surface)',
              borderRadius: 10,
              border: '1px solid var(--color-border)',
              overflow: 'hidden',
            }}
          >
            <AmbulanceTrackerPanel ambulances={ambulances} onDispatch={handleDispatch} />
          </div>

          {/* Panel Rumah Sakit */}
          <div
            style={{
              background: 'var(--color-surface)',
              borderRadius: 10,
              border: '1px solid var(--color-border)',
              overflow: 'hidden',
            }}
          >
            <HospitalStatusPanel hospitals={hospitals} onRujuk={handleRujuk} />
          </div>
        </div>
      </div>

      {/* Emergency Modal */}
      {emergencyEvent !== null && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'emergencyAlert 0.3s ease',
          }}
        >
          <div
            style={{
              background: 'var(--color-surface)',
              borderRadius: 14,
              padding: 28,
              width: 420,
              boxShadow: '0 8px 40px rgba(220,38,38,0.3)',
              border: '2px solid var(--color-danger)',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 16,
              }}
            >
              <span style={{ fontSize: 24 }}>🚨</span>
              <div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    color: 'var(--color-danger)',
                    letterSpacing: '-0.3px',
                  }}
                >
                  DARURAT PASIEN
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                  Memerlukan tindakan segera
                </div>
              </div>
            </div>

            {/* Detail Pasien */}
            <div
              style={{
                background: 'var(--color-danger-bg)',
                border: '1px solid var(--color-danger-border)',
                borderRadius: 8,
                padding: '12px 14px',
                marginBottom: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
              }}
            >
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--color-muted)', width: 100, flexShrink: 0 }}>Pasien</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)' }}>{emergencyEvent.patientName}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--color-muted)', width: 100, flexShrink: 0 }}>Kondisi</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-danger)' }}>{emergencyEvent.condition}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--color-muted)', width: 100, flexShrink: 0 }}>Koordinat</span>
                <span style={{ fontSize: 12, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>
                  {emergencyEvent.location.lat.toFixed(5)}, {emergencyEvent.location.lng.toFixed(5)}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--color-muted)', width: 100, flexShrink: 0 }}>Keluarga</span>
                <span style={{ fontSize: 12, color: 'var(--color-text)' }}>{emergencyEvent.contactFamily}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--color-muted)', width: 100, flexShrink: 0 }}>Telepon</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)' }}>{emergencyEvent.contactPhone}</span>
              </div>
            </div>

            {/* Tombol Aksi */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className={`${styles.btn} ${styles.btnSecondary}`}
                  style={{ flex: 1, fontSize: 12, height: 34 }}
                  onClick={() => {
                    toast.info(`Menghubungi pasien ${emergencyEvent.patientName}...`, 'Panggilan Pasien');
                  }}
                >
                  📞 Hubungi Pasien
                </button>
                <button
                  className={`${styles.btn} ${styles.btnSecondary}`}
                  style={{ flex: 1, fontSize: 12, height: 34 }}
                  onClick={() => {
                    toast.info(
                      `Menghubungi ${emergencyEvent.contactFamily} di ${emergencyEvent.contactPhone}`,
                      'Panggilan Keluarga',
                    );
                  }}
                >
                  👨‍👩‍👧 Hubungi Keluarga
                </button>
              </div>
              <button
                className={`${styles.btn} ${styles.btnDanger}`}
                style={{ width: '100%', fontSize: 12, height: 34 }}
                onClick={handleRequestAmbulanceEmergency}
              >
                🚑 Request Ambulan
              </button>
              <button
                className={`${styles.btn} ${styles.btnSecondary}`}
                style={{ width: '100%', fontSize: 12, height: 32 }}
                onClick={() => setEmergencyEvent(null)}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
