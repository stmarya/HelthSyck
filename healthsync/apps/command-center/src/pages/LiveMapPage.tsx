// LiveMapPage.tsx — Peta Live Tracking entitas HealthSync (SVG murni, tanpa react-leaflet)
// Semua teks Bahasa Indonesia. TypeScript strict: tidak ada `any`.

import { useState, useEffect, useRef, useCallback, type ReactNode, type ReactElement } from 'react';
import { simulationEngine } from '../simulation/SimulationEngine';
import type { SimEvent } from '../simulation/SimulationEngine';
import type { Pasien, Ambulans, DriverApotek, RumahSakit, Apotek } from '../simulation/SimulationData';
import { SEED_APOTEK } from '../simulation/SimulationData';
import { useToast } from '../context/ToastContext';
import { RealtimeClient } from '../realtime/client';
import { getMapRuntimeConfig } from '../realtime/mapProvider';

// ─── Konstanta Peta Jakarta ────────────────────────────────────────────────────

const MAP_W = 800;
const MAP_H = 520;
const JAKARTA_LAT_MIN = -6.35;
const JAKARTA_LAT_MAX = -6.10;
const JAKARTA_LNG_MIN = 106.70;
const JAKARTA_LNG_MAX = 106.95;

function latLngToXY(lat: number, lng: number): { x: number; y: number } {
  const x = ((lng - JAKARTA_LNG_MIN) / (JAKARTA_LNG_MAX - JAKARTA_LNG_MIN)) * MAP_W;
  // Lat semakin kecil = semakin selatan = y semakin besar
  const y = ((lat - JAKARTA_LAT_MAX) / (JAKARTA_LAT_MIN - JAKARTA_LAT_MAX)) * MAP_H;
  return {
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
  };
}

// ─── Tipe State Entitas (gabungan data statis + posisi dinamis) ───────────────

interface PasienState extends Pasien { koordinat: { lat: number; lng: number } }
interface AmbulansState extends Ambulans { koordinat: { lat: number; lng: number } }
interface DriverState extends DriverApotek { koordinat: { lat: number; lng: number } }

interface EntityState {
  pasien: PasienState[];
  ambulans: AmbulansState[];
  driver: DriverState[];
  rumahSakit: RumahSakit[];
  apotek: Apotek[];
}

// Tipe kategori untuk filter
type Kategori = 'pasien' | 'ambulans' | 'driver' | 'rumahSakit' | 'apotek';

// Popup info saat klik marker
interface PopupInfo {
  id: string;
  label: string;
  baris: { kunci: string; nilai: string }[];
  x: number; // posisi SVG
  y: number;
}

// ─── Warna / konstanta desain ─────────────────────────────────────────────────

const C = {
  mapBg:      '#0e1420',
  mapGrid:    'rgba(255,255,255,0.06)',
  pasien:     '#2563EB',
  ambulans:   '#DC2626',
  driver:     '#16A34A',
  rumahSakit: '#7C3AED',
  apotek:     '#D97706',
  focused:    '#F59E0B',
  labelText:  'rgba(255,255,255,0.85)',
  popupBg:    '#1c2333',
  popupBorder:'rgba(255,255,255,0.12)',
} as const;

// ─── Utilitas label pendek ────────────────────────────────────────────────────

function namaLabel(nama: string): string {
  const parts = nama.trim().split(' ');
  return parts.length > 1 ? `${parts[0]} ${parts[1]!.charAt(0)}.` : (parts[0] ?? nama);
}

// ─── Komponen: Grid SVG Jakarta ────────────────────────────────────────────────

function MapGrid() {
  const lines: ReactElement[] = [];
  const step = 0.05;

  // Garis horizontal (lat)
  for (let lat = JAKARTA_LAT_MIN; lat <= JAKARTA_LAT_MAX; lat += step) {
    const { y } = latLngToXY(lat, JAKARTA_LNG_MIN);
    lines.push(<line key={`hlat${lat}`} x1={0} y1={y} x2={MAP_W} y2={y} stroke={C.mapGrid} strokeWidth={0.5} />);
  }
  // Garis vertikal (lng)
  for (let lng = JAKARTA_LNG_MIN; lng <= JAKARTA_LNG_MAX; lng += step) {
    const { x } = latLngToXY(JAKARTA_LAT_MIN, lng);
    lines.push(<line key={`vlng${lng}`} x1={x} y1={0} x2={x} y2={MAP_H} stroke={C.mapGrid} strokeWidth={0.5} />);
  }

  return <g aria-hidden="true">{lines}</g>;
}

// ─── Komponen: Marker individual ──────────────────────────────────────────────

interface MarkerProps {
  id: string;
  x: number;
  y: number;
  label: string;
  isFocused: boolean;
  isUrgent: boolean;
  onClick: (id: string) => void;
  children: ReactNode; // bentuk SVG marker
}

function Marker({ id, x, y, label, isFocused, isUrgent, onClick, children }: MarkerProps) {
  return (
    <g
      transform={`translate(${x},${y})`}
      onClick={() => onClick(id)}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick(id); } }}
      style={{ cursor: 'pointer' }}
      role="button"
      tabIndex={0}
      focusable="true"
      aria-label={label}
    >
      {/* Glow darurat */}
      {isUrgent && (
        <circle
          r={16}
          fill="none"
          stroke="#DC2626"
          strokeWidth={2}
          opacity={0.7}
          style={{ animation: 'pulseDot 1.2s ease-in-out infinite' }}
        />
      )}
      {/* Highlight fokus */}
      {isFocused && (
        <circle r={18} fill="none" stroke={C.focused} strokeWidth={2} opacity={0.9} />
      )}
      {children}
      <text
        y={18}
        textAnchor="middle"
        fontSize={8}
        fill={isFocused ? C.focused : C.labelText}
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {label}
      </text>
    </g>
  );
}

// ─── Bentuk marker per kategori ───────────────────────────────────────────────

function PasienShape({ color }: { color: string }) {
  return (
    <>
      <circle r={8} fill={color} stroke="white" strokeWidth={1.5} />
    </>
  );
}

function AmbulansShape({ color }: { color: string }) {
  return <rect x={-7} y={-5} width={14} height={10} rx={2} fill={color} stroke="white" strokeWidth={1} />;
}

function DriverShape({ color }: { color: string }) {
  // belah ketupat
  return <polygon points="0,-9 9,0 0,9 -9,0" fill={color} stroke="white" strokeWidth={1} />;
}

function RumahSakitShape({ color }: { color: string }) {
  return (
    <g>
      <rect x={-7} y={-7} width={14} height={14} rx={1} fill={color} stroke="white" strokeWidth={1} />
      {/* ikon palang */}
      <line x1={0} y1={-4} x2={0} y2={4} stroke="white" strokeWidth={2} />
      <line x1={-4} y1={0} x2={4} y2={0} stroke="white" strokeWidth={2} />
    </g>
  );
}

function ApotekShape({ color }: { color: string }) {
  // segitiga ke atas
  return <polygon points="0,-9 8,6 -8,6" fill={color} stroke="white" strokeWidth={1} />;
}

// ─── Komponen: Popup Info ─────────────────────────────────────────────────────

interface PopupProps {
  popup: PopupInfo;
  onClose: () => void;
}

function EntityPopup({ popup, onClose }: PopupProps) {
  // Kalkulasi posisi popup agar tidak keluar viewport SVG
  const pw = 200;
  const ph = popup.baris.length * 22 + 48;
  const rawX = popup.x + 14;
  const rawY = popup.y - 20;
  const clampX = Math.min(Math.max(rawX, 4), MAP_W - pw - 4);
  const clampY = Math.min(Math.max(rawY, 4), MAP_H - ph - 4);

  return (
    <div
      style={{
        position: 'absolute',
        left: clampX,
        top: clampY,
        width: pw,
        background: C.popupBg,
        border: `1px solid ${C.popupBorder}`,
        borderRadius: 8,
        padding: '10px 12px',
        zIndex: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 12, color: '#F1F5F9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>
          {popup.label}
        </span>
        <button
          onClick={onClose}
          aria-label="Tutup popup"
          style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: 16, lineHeight: 1, padding: 0, cursor: 'pointer' }}
        >
          ×
        </button>
      </div>
      {popup.baris.map((b) => (
        <div key={b.kunci} style={{ display: 'flex', justifyContent: 'space-between', gap: 4, marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: '#94A3B8', flexShrink: 0 }}>{b.kunci}</span>
          <span style={{ fontSize: 10, color: '#CBD5E1', textAlign: 'right', wordBreak: 'break-all' }}>{b.nilai}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Komponen: Panel daftar entitas (kanan) ───────────────────────────────────

interface PanelItem {
  id: string;
  label: string;
  sub: string;
  kategori: Kategori;
  isUrgent: boolean;
}

interface SidePanelProps {
  items: PanelItem[];
  focusedId: string | null;
  onFocus: (id: string) => void;
}

const KATEGORI_WARNA: Record<Kategori, string> = {
  pasien:     C.pasien,
  ambulans:   C.ambulans,
  driver:     C.driver,
  rumahSakit: C.rumahSakit,
  apotek:     C.apotek,
};

const KATEGORI_LABEL: Record<Kategori, string> = {
  pasien:     'Pasien',
  ambulans:   'Ambulans',
  driver:     'Driver',
  rumahSakit: 'RS',
  apotek:     'Apotek',
};

function SidePanel({ items, focusedId, onFocus }: SidePanelProps) {
  const sorted = [...items].sort((a, b) => {
    if (a.isUrgent && !b.isUrgent) return -1;
    if (!a.isUrgent && b.isUrgent) return 1;
    return 0;
  });

  return (
    <div
      style={{
        width: 260,
        flexShrink: 0,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 10,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border)' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)' }}>
          Entitas Aktif ({items.length})
        </span>
      </div>
      <div style={{ overflowY: 'auto', flex: 1, maxHeight: MAP_H - 40 }}>
        {sorted.map((item) => {
          const isFocused = item.id === focusedId;
          return (
            <div
              key={item.id}
              onClick={() => onFocus(item.id)}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onFocus(item.id); } }}
              role="button"
              tabIndex={0}
              aria-pressed={isFocused}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 14px',
                cursor: 'pointer',
                background: isFocused ? 'rgba(245,158,11,0.10)' : item.isUrgent ? 'rgba(220,38,38,0.07)' : 'transparent',
                borderLeft: isFocused ? `3px solid ${C.focused}` : item.isUrgent ? '3px solid #DC2626' : '3px solid transparent',
                borderTop: 0, borderRight: 0, borderBottom: 0, width: '100%', textAlign: 'left', color: 'inherit',
                transition: 'background 0.15s',
              }}
            >
              {/* Warna dot kategori */}
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: KATEGORI_WARNA[item.kategori],
                  flexShrink: 0,
                  ...(item.isUrgent ? { animation: 'pulseDot 1.2s ease-in-out infinite' } : {}),
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: isFocused ? C.focused : item.isUrgent ? '#DC2626' : 'var(--color-text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 1 }}>{item.sub}</div>
              </div>
              <span style={{
                fontSize: 9,
                fontWeight: 600,
                color: KATEGORI_WARNA[item.kategori],
                background: `${KATEGORI_WARNA[item.kategori]}20`,
                borderRadius: 4,
                padding: '1px 5px',
                flexShrink: 0,
              }}>
                {KATEGORI_LABEL[item.kategori]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Halaman Utama ─────────────────────────────────────────────────────────────

export default function LiveMapPage() {
  const toast = useToast();
  const mapRuntime = getMapRuntimeConfig();

  // ── State entitas ──────────────────────────────────────────────────────────

  const [entities, setEntities] = useState<EntityState>(() => {
    const s = simulationEngine.getState();
    return {
      pasien:     s.pasien.map((p) => ({ ...p, koordinat: { ...p.koordinat } })),
      ambulans:   s.ambulans.map((a) => ({ ...a, koordinat: { ...a.koordinat } })),
      driver:     s.driver.map((d) => ({ ...d, koordinat: { ...d.koordinat } })),
      rumahSakit: s.rumahSakit.map((rs) => ({ ...rs, koordinat: { ...rs.koordinat } })),
      apotek:     SEED_APOTEK.map((ap) => ({ ...ap })),
    };
  });

  const [lastSeenAt, setLastSeenAt] = useState<Record<string, number>>({});

  const [, setClock] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // ── Filter toggle ──────────────────────────────────────────────────────────

  const [filter, setFilter] = useState<Record<Kategori, boolean>>({
    pasien: true,
    ambulans: true,
    driver: true,
    rumahSakit: true,
    apotek: true,
  });

  // ── Fokus / popup ──────────────────────────────────────────────────────────

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [popup, setPopup] = useState<PopupInfo | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // ── Simulasi pause/resume ──────────────────────────────────────────────────

  const [isRunning, setIsRunning] = useState<boolean>(simulationEngine.isRunning());

  const handleToggleSim = useCallback(() => {
    if (simulationEngine.isRunning()) {
      simulationEngine.stop();
      setIsRunning(false);
    } else {
      simulationEngine.start();
      setIsRunning(true);
    }
  }, []);

  // ── Event listeners ────────────────────────────────────────────────────────

  useEffect(() => {
    const unsubLocation = simulationEngine.on('LOCATION_UPDATE', (ev: SimEvent) => {
      if (ev.type !== 'LOCATION_UPDATE') return;
      const { entityType, entityId, koordinat } = ev;

      setEntities((prev) => {
        if (entityType === 'pasien') {
          return {
            ...prev,
            pasien: prev.pasien.map((p) =>
              p.id === entityId ? { ...p, koordinat: { ...koordinat } } : p,
            ),
          };
        }
        if (entityType === 'ambulans') {
          return {
            ...prev,
            ambulans: prev.ambulans.map((a) =>
              a.id === entityId ? { ...a, koordinat: { ...koordinat } } : a,
            ),
          };
        }
        if (entityType === 'driver') {
          return {
            ...prev,
            driver: prev.driver.map((d) =>
              d.id === entityId ? { ...d, koordinat: { ...koordinat } } : d,
            ),
          };
        }
        return prev;
      });
    });

    const unsubEmergency = simulationEngine.on('PATIENT_EMERGENCY', (ev: SimEvent) => {
      if (ev.type !== 'PATIENT_EMERGENCY') return;
      toast.error(
        `${ev.patientName} — ${ev.condition}. Hubungi: ${ev.contactFamily} (${ev.contactPhone})`,
        '🚨 Darurat Pasien',
      );
    });

    const realtime = new RealtimeClient();
    const token = localStorage.getItem('hs_access_token');
    const unsubscribeRealtime = token ? realtime.on('location.updated', (event) => {
      const entityId = String(event.payload.entityId ?? '');
      const entityType = String(event.payload.entityType ?? '').toLowerCase();
      const lat = Number(event.payload.latitude);
      const lng = Number(event.payload.longitude);
      if (!entityId || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const koordinat = { lat, lng };
      setLastSeenAt((previous) => ({ ...previous, [entityId]: Date.parse(String(event.payload.recordedAt ?? '')) || Date.now() }));
      setEntities((prev) => {
        if (entityType === 'ambulance' || entityType === 'ambulans') return { ...prev, ambulans: prev.ambulans.map((item) => item.id === entityId ? { ...item, koordinat } : item) };
        if (entityType === 'driver') return { ...prev, driver: prev.driver.map((item) => item.id === entityId ? { ...item, koordinat } : item) };
        if (entityType === 'patient' || entityType === 'pasien') return { ...prev, pasien: prev.pasien.map((item) => item.id === entityId ? { ...item, koordinat } : item) };
        return prev;
      });
    }) : undefined;
    if (token) realtime.connect(token, 'command-center');

    const unsubCapacity = simulationEngine.on('HOSPITAL_CAPACITY_UPDATE', (ev: SimEvent) => {
      if (ev.type !== 'HOSPITAL_CAPACITY_UPDATE') return;
      // Perbarui data rumah sakit di state lokal
      setEntities((prev) => ({
        ...prev,
        rumahSakit: prev.rumahSakit.map((rs) => {
          if (rs.id !== ev.hospitalId) return rs;
          return {
            ...rs,
            kapasitas: {
              ...rs.kapasitas,
              IGD:     { ...rs.kapasitas.IGD,     tersedia: ev.IGD },
              ICU:     { ...rs.kapasitas.ICU,     tersedia: ev.ICU },
              Inap:    { ...rs.kapasitas.Inap,    tersedia: ev.Inap },
              Operasi: { ...rs.kapasitas.Operasi, tersedia: ev.Operasi },
            },
            dokterTersedia: ev.doctorsAvailable,
          };
        }),
      }));
    });

    return () => {
      unsubLocation();
      unsubEmergency();
      unsubCapacity();
      unsubscribeRealtime?.();
      realtime.close();
    };
  }, [toast]);

  // ── Klik di luar SVG → tutup popup ────────────────────────────────────────

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!svgRef.current) return;
      const target = e.target as Node;
      if (!svgRef.current.contains(target) && !(target as HTMLElement).closest?.('.map-popup')) {
        setPopup(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Handlers marker klik ───────────────────────────────────────────────────

  const handleMarkerClick = useCallback((id: string) => {
    setFocusedId(id);

    // Cari entitas dan buat popup
    const p = entities.pasien.find((e) => e.id === id);
    if (p) {
      const { x, y } = latLngToXY(p.koordinat.lat, p.koordinat.lng);
      setPopup({
        id, label: p.nama, x, y,
        baris: [
          { kunci: 'Status', nilai: p.status },
          { kunci: 'Kondisi', nilai: p.kondisi },
          { kunci: 'Usia', nilai: `${p.usia} tahun` },
          { kunci: 'Gol. Darah', nilai: p.golonganDarah },
          { kunci: 'Koordinat', nilai: `${p.koordinat.lat.toFixed(4)}, ${p.koordinat.lng.toFixed(4)}` },
        ],
      });
      return;
    }

    const a = entities.ambulans.find((e) => e.id === id);
    if (a) {
      const { x, y } = latLngToXY(a.koordinat.lat, a.koordinat.lng);
      setPopup({
        id, label: a.nomorUnit, x, y,
        baris: [
          { kunci: 'Status', nilai: a.status },
          { kunci: 'Pengemudi', nilai: a.pengemudi },
          ...(a.eta !== undefined ? [{ kunci: 'ETA', nilai: `${a.eta} menit` }] : []),
          ...(a.destinasi ? [{ kunci: 'Destinasi', nilai: a.destinasi }] : []),
          { kunci: 'Koordinat', nilai: `${a.koordinat.lat.toFixed(4)}, ${a.koordinat.lng.toFixed(4)}` },
        ],
      });
      return;
    }

    const d = entities.driver.find((e) => e.id === id);
    if (d) {
      const { x, y } = latLngToXY(d.koordinat.lat, d.koordinat.lng);
      setPopup({
        id, label: d.nama, x, y,
        baris: [
          { kunci: 'Status', nilai: d.status },
          { kunci: 'Koordinat', nilai: `${d.koordinat.lat.toFixed(4)}, ${d.koordinat.lng.toFixed(4)}` },
        ],
      });
      return;
    }

    const rs = entities.rumahSakit.find((e) => e.id === id);
    if (rs) {
      const { x, y } = latLngToXY(rs.koordinat.lat, rs.koordinat.lng);
      setPopup({
        id, label: rs.nama, x, y,
        baris: [
          { kunci: 'IGD Tersedia', nilai: String(rs.kapasitas.IGD.tersedia) },
          { kunci: 'ICU Tersedia', nilai: String(rs.kapasitas.ICU.tersedia) },
          { kunci: 'Inap Tersedia', nilai: String(rs.kapasitas.Inap.tersedia) },
          { kunci: 'Dokter Jaga', nilai: String(rs.dokterTersedia) },
          { kunci: 'Koneksi', nilai: rs.statusKoneksi },
          { kunci: 'Koordinat', nilai: `${rs.koordinat.lat.toFixed(4)}, ${rs.koordinat.lng.toFixed(4)}` },
        ],
      });
      return;
    }

    const ap = entities.apotek.find((e) => e.id === id);
    if (ap) {
      const { x, y } = latLngToXY(ap.koordinat.lat, ap.koordinat.lng);
      setPopup({
        id, label: ap.nama, x, y,
        baris: [
          { kunci: 'Alamat', nilai: ap.alamat },
          { kunci: 'Koordinat', nilai: `${ap.koordinat.lat.toFixed(4)}, ${ap.koordinat.lng.toFixed(4)}` },
        ],
      });
      return;
    }
  }, [entities]);

  const handleFocusFromPanel = useCallback((id: string) => {
    setFocusedId(id);
    handleMarkerClick(id);
  }, [handleMarkerClick]);

  function freshnessLabel(id: string): string {
    const seen = lastSeenAt[id];
    if (!seen) return 'Seed / menunggu GPS';
    const ageSeconds = Math.max(0, Math.floor((Date.now() - seen) / 1000));
    return ageSeconds <= 15 ? 'GPS live' : `GPS stale ${ageSeconds}s`;
  }

  // ── Hitung total entitas ───────────────────────────────────────────────────

  const totalEntitas =
    (filter.pasien ? entities.pasien.length : 0) +
    (filter.ambulans ? entities.ambulans.length : 0) +
    (filter.driver ? entities.driver.length : 0) +
    (filter.rumahSakit ? entities.rumahSakit.length : 0) +
    (filter.apotek ? entities.apotek.length : 0);

  // ── Buat item panel kanan ──────────────────────────────────────────────────

  const panelItems: PanelItem[] = [
    ...(filter.pasien ? entities.pasien.map((p): PanelItem => ({
      id: p.id, label: p.nama, sub: `${p.status} · ${p.kondisi}`,
      kategori: 'pasien', isUrgent: p.status === 'Darurat' || p.status === 'Kritis',
    })) : []),
    ...(filter.ambulans ? entities.ambulans.map((a): PanelItem => ({
      id: a.id, label: a.nomorUnit, sub: `${a.status}${a.eta !== undefined ? ` · ETA ${a.eta} mnt` : ''} · ${freshnessLabel(a.id)}`,
      kategori: 'ambulans', isUrgent: a.status === 'Dalam Perjalanan',
    })) : []),
    ...(filter.driver ? entities.driver.map((d): PanelItem => ({
      id: d.id, label: d.nama, sub: `${d.status} · ${freshnessLabel(d.id)}`,
      kategori: 'driver', isUrgent: d.status === 'Mengantarkan',
    })) : []),
    ...(filter.rumahSakit ? entities.rumahSakit.map((rs): PanelItem => ({
      id: rs.id, label: rs.nama, sub: `IGD ${rs.kapasitas.IGD.tersedia}/${rs.kapasitas.IGD.total} · ICU ${rs.kapasitas.ICU.tersedia}/${rs.kapasitas.ICU.total}`,
      kategori: 'rumahSakit', isUrgent: rs.kapasitas.IGD.tersedia <= 1 || rs.kapasitas.ICU.tersedia <= 1,
    })) : []),
    ...(filter.apotek ? entities.apotek.map((ap): PanelItem => ({
      id: ap.id, label: ap.nama, sub: ap.alamat,
      kategori: 'apotek', isUrgent: false,
    })) : []),
  ];

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '20px 24px', fontFamily: '-apple-system, "Segoe UI", system-ui, sans-serif', animation: 'fadeInUp 0.3s ease' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
            Peta Live Tracking
          </h1>
          {/* Pulsing LIVE dot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(217,119,6,0.12)', border: '1px solid rgba(217,119,6,0.30)', borderRadius: 99, padding: '3px 10px' }}>
            <span style={{
              display: 'inline-block',
              width: 7, height: 7,
              borderRadius: '50%',
              background: '#D97706',
              animation: 'pulseDot 1.4s ease-in-out infinite',
            }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: '#D97706', letterSpacing: 1 }}>SIMULATOR</span>
          </div>
          <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
            {totalEntitas} entitas ditampilkan · SVG simulator · config {mapRuntime.provider}
          </span>
        </div>

        {/* Tombol Pause/Resume */}
        <button
          onClick={handleToggleSim}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 16px',
            fontSize: 12, fontWeight: 600,
            borderRadius: 7,
            border: `1px solid ${isRunning ? 'var(--color-warning-border, #FDE68A)' : 'var(--color-success-border, #BBF7D0)'}`,
            background: isRunning ? 'var(--color-warning-bg, #FFFBEB)' : 'var(--color-success-bg, #F0FDF4)',
            color: isRunning ? 'var(--color-warning, #D97706)' : 'var(--color-success, #16A34A)',
            cursor: 'pointer',
          }}
        >
          <span>{isRunning ? '⏸' : '▶'}</span>
          <span>{isRunning ? 'Jeda Simulasi' : 'Mulai Simulasi'}</span>
        </button>
      </div>

      {/* ── Filter Toggle ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {(Object.keys(filter) as Kategori[]).map((k) => (
          <button
            key={k}
            onClick={() => setFilter((prev) => ({ ...prev, [k]: !prev[k] }))}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 12px',
              borderRadius: 99,
              fontSize: 11, fontWeight: 600,
              cursor: 'pointer',
              border: `1px solid ${filter[k] ? KATEGORI_WARNA[k] : 'var(--color-border)'}`,
              background: filter[k] ? `${KATEGORI_WARNA[k]}18` : 'var(--color-surface)',
              color: filter[k] ? KATEGORI_WARNA[k] : 'var(--color-muted)',
              transition: 'all 0.15s',
            }}
          >
            <span style={{
              display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
              background: filter[k] ? KATEGORI_WARNA[k] : 'var(--color-muted)',
            }} />
            {KATEGORI_LABEL[k]}
          </button>
        ))}
      </div>

      {/* ── Layout Utama: SVG + Panel ── */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>

        {/* ── SVG Peta ── */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            borderRadius: 10,
            overflow: 'hidden',
            border: '1px solid var(--color-border)',
            background: C.mapBg,
          }}
        >
          <svg
            ref={svgRef}
            width="100%"
            viewBox={`0 0 ${MAP_W} ${MAP_H}`}
            style={{ display: 'block', aspectRatio: `${MAP_W}/${MAP_H}` }}
            onClick={(e) => {
              // Klik background SVG → tutup popup
              if ((e.target as SVGElement).tagName === 'rect' && (e.target as SVGElement).getAttribute('fill') === C.mapBg) {
                setPopup(null);
                setFocusedId(null);
              }
            }}
          >
            {/* Background gelap */}
            <rect width={MAP_W} height={MAP_H} fill={C.mapBg} />

            {/* Grid */}
            <MapGrid />

            {/* Label kota referensi */}
            {[
              { nama: 'Jakarta Pusat',  lat: -6.186, lng: 106.834 },
              { nama: 'Jakarta Utara',  lat: -6.138, lng: 106.863 },
              { nama: 'Jakarta Selatan',lat: -6.261, lng: 106.810 },
              { nama: 'Jakarta Barat',  lat: -6.188, lng: 106.748 },
              { nama: 'Jakarta Timur', lat: -6.225, lng: 106.900 },
            ].map((k) => {
              const { x, y } = latLngToXY(k.lat, k.lng);
              return (
                <text key={k.nama} x={x} y={y} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.20)" style={{ pointerEvents: 'none', userSelect: 'none' }}>
                  {k.nama}
                </text>
              );
            })}

            {/* Pasien */}
            {filter.pasien && entities.pasien.map((p) => {
              const { x, y } = latLngToXY(p.koordinat.lat, p.koordinat.lng);
              return (
                <Marker
                  key={p.id} id={p.id} x={x} y={y}
                  label={namaLabel(p.nama)}
                  isFocused={focusedId === p.id}
                  isUrgent={p.status === 'Darurat' || p.status === 'Kritis'}
                  onClick={handleMarkerClick}
                >
                  <PasienShape color={focusedId === p.id ? C.focused : C.pasien} />
                </Marker>
              );
            })}

            {/* Ambulans */}
            {filter.ambulans && entities.ambulans.map((a) => {
              const { x, y } = latLngToXY(a.koordinat.lat, a.koordinat.lng);
              return (
                <Marker
                  key={a.id} id={a.id} x={x} y={y}
                  label={a.nomorUnit}
                  isFocused={focusedId === a.id}
                  isUrgent={a.status === 'Dalam Perjalanan'}
                  onClick={handleMarkerClick}
                >
                  <AmbulansShape color={focusedId === a.id ? C.focused : C.ambulans} />
                </Marker>
              );
            })}

            {/* Driver Apotek */}
            {filter.driver && entities.driver.map((d) => {
              const { x, y } = latLngToXY(d.koordinat.lat, d.koordinat.lng);
              return (
                <Marker
                  key={d.id} id={d.id} x={x} y={y}
                  label={namaLabel(d.nama)}
                  isFocused={focusedId === d.id}
                  isUrgent={d.status === 'Mengantarkan'}
                  onClick={handleMarkerClick}
                >
                  <DriverShape color={focusedId === d.id ? C.focused : C.driver} />
                </Marker>
              );
            })}

            {/* Rumah Sakit (statis) */}
            {filter.rumahSakit && entities.rumahSakit.map((rs) => {
              const { x, y } = latLngToXY(rs.koordinat.lat, rs.koordinat.lng);
              return (
                <Marker
                  key={rs.id} id={rs.id} x={x} y={y}
                  label={namaLabel(rs.nama)}
                  isFocused={focusedId === rs.id}
                  isUrgent={rs.kapasitas.IGD.tersedia <= 1 || rs.kapasitas.ICU.tersedia <= 1}
                  onClick={handleMarkerClick}
                >
                  <RumahSakitShape color={focusedId === rs.id ? C.focused : C.rumahSakit} />
                </Marker>
              );
            })}

            {/* Apotek (statis) */}
            {filter.apotek && entities.apotek.map((ap) => {
              const { x, y } = latLngToXY(ap.koordinat.lat, ap.koordinat.lng);
              return (
                <Marker
                  key={ap.id} id={ap.id} x={x} y={y}
                  label={namaLabel(ap.nama)}
                  isFocused={focusedId === ap.id}
                  isUrgent={false}
                  onClick={handleMarkerClick}
                >
                  <ApotekShape color={focusedId === ap.id ? C.focused : C.apotek} />
                </Marker>
              );
            })}
          </svg>

          {/* Popup overlay (di atas SVG) */}
          {popup && (
            <div className="map-popup" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              <EntityPopup popup={popup} onClose={() => setPopup(null)} />
            </div>
          )}

          {/* Legenda sudut kiri bawah */}
          <div style={{
            position: 'absolute', bottom: 10, left: 10,
            background: 'rgba(14,20,32,0.85)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 7,
            padding: '7px 12px',
            display: 'flex', gap: 12, flexWrap: 'wrap',
          }}>
            {([
              { label: 'Pasien', color: C.pasien, shape: '●' },
              { label: 'Ambulans', color: C.ambulans, shape: '■' },
              { label: 'Driver', color: C.driver, shape: '◆' },
              { label: 'RS', color: C.rumahSakit, shape: '■' },
              { label: 'Apotek', color: C.apotek, shape: '▲' },
            ] as const).map((l) => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 10, color: l.color }}>{l.shape}</span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.60)' }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Panel Kanan ── */}
        <SidePanel items={panelItems} focusedId={focusedId} onFocus={handleFocusFromPanel} />
      </div>
    </div>
  );
}
