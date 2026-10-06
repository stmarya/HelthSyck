// HospitalAvailabilityPage.tsx — Ketersediaan Rumah Sakit Real-Time
// Semua teks Bahasa Indonesia, tidak ada tipe any

import { useEffect, useState, useCallback } from 'react';
import { simulationEngine } from '../simulation/SimulationEngine';
import type { SimEvent } from '../simulation/SimulationEngine';
import type { RumahSakit } from '../simulation/SimulationData';
import { SEED_RUMAH_SAKIT } from '../simulation/SimulationData';
import { useToast } from '../context/ToastContext';
import styles from './Page.module.css';

// ─── Konstanta ────────────────────────────────────────────────────────────────

const GOLONGAN_DARAH = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
type GolonganDarah = (typeof GOLONGAN_DARAH)[number];
type TipeRuang = 'IGD' | 'ICU' | 'Inap' | 'Operasi';

// ─── Tipe Modal ───────────────────────────────────────────────────────────────

interface ModalRujukan {
  rs: RumahSakit;
  namaPasien: string;
  tipeRuang: TipeRuang;
  keterangan: string;
}

interface ModalDarah {
  rs: RumahSakit;
  golongan: GolonganDarah;
  jumlah: number;
  urgency: 'Tinggi' | 'Kritis';
}

// ─── Helper: warna progress bar kapasitas ─────────────────────────────────────

function getKapasitasColor(tersedia: number, total: number): string {
  if (total === 0) return '#6b7280';
  const pct = tersedia / total;
  if (pct > 0.5) return '#16a34a';
  if (pct >= 0.2) return '#d97706';
  return '#dc2626';
}

// ─── Komponen: Progress Bar Kapasitas ─────────────────────────────────────────

function KapasitasBar({
  label,
  tersedia,
  total,
  flashing,
}: {
  label: string;
  tersedia: number;
  total: number;
  flashing: boolean;
}) {
  const color = getKapasitasColor(tersedia, total);
  const pct = total > 0 ? Math.min((tersedia / total) * 100, 100) : 0;

  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12,
          marginBottom: 3,
        }}
      >
        <span style={{ color: 'var(--color-muted)', fontWeight: 500 }}>{label}</span>
        <span
          style={{
            fontWeight: 700,
            color,
            animation: flashing ? 'capacityFlash 0.5s ease' : undefined,
          }}
        >
          {tersedia}/{total}
        </span>
      </div>
      <div
        style={{
          height: 5,
          borderRadius: 99,
          background: 'var(--color-border)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: color,
            borderRadius: 99,
            transition: 'width 0.4s ease, background 0.3s ease',
          }}
        />
      </div>
    </div>
  );
}

// ─── Komponen: Stok Darah ─────────────────────────────────────────────────────

function StokDarahGrid({ stok }: { stok: Record<string, number> }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '4px 6px',
        marginTop: 6,
      }}
    >
      {GOLONGAN_DARAH.map((gol) => {
        const qty = stok[gol] ?? 0;
        const critical = qty <= 2;
        return (
          <div
            key={gol}
            style={{
              textAlign: 'center',
              padding: '4px 2px',
              borderRadius: 6,
              background: critical ? 'var(--color-danger-bg)' : 'var(--color-surface-2)',
              border: `1px solid ${critical ? 'var(--color-danger-border)' : 'var(--color-border)'}`,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: critical ? 'var(--color-danger)' : 'var(--color-text)',
              }}
            >
              {gol}
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: critical ? 'var(--color-danger)' : 'var(--color-text)',
              }}
            >
              {qty}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Komponen: Modal Rujukan ───────────────────────────────────────────────────

function ModalRujukanForm({
  modal,
  onChange,
  onKonfirmasi,
  onBatal,
}: {
  modal: ModalRujukan;
  onChange: (patch: Partial<ModalRujukan>) => void;
  onKonfirmasi: () => void;
  onBatal: () => void;
}) {
  return (
    <div style={overlayStyle}>
      <div style={modalBoxStyle}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>
          Request Rujukan
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--color-muted)' }}>
          {modal.rs.nama}
        </p>

        <label style={labelStyle}>Nama Pasien</label>
        <input
          style={inputStyle}
          type="text"
          placeholder="Masukkan nama pasien..."
          value={modal.namaPasien}
          onChange={(e) => onChange({ namaPasien: e.target.value })}
        />

        <label style={labelStyle}>Tipe Ruangan</label>
        <select
          style={inputStyle}
          value={modal.tipeRuang}
          onChange={(e) => onChange({ tipeRuang: e.target.value as TipeRuang })}
        >
          <option value="IGD">IGD</option>
          <option value="ICU">ICU</option>
          <option value="Inap">Inap</option>
          <option value="Operasi">Operasi</option>
        </select>

        <label style={labelStyle}>Keterangan</label>
        <textarea
          style={{ ...inputStyle, height: 72, resize: 'vertical' }}
          placeholder="Keterangan kondisi pasien..."
          value={modal.keterangan}
          onChange={(e) => onChange({ keterangan: e.target.value })}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={onKonfirmasi}
            disabled={modal.namaPasien.trim() === ''}
          >
            Konfirmasi
          </button>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onBatal}>
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Komponen: Modal Darah ─────────────────────────────────────────────────────

function ModalDarahForm({
  modal,
  onChange,
  onKirim,
  onBatal,
}: {
  modal: ModalDarah;
  onChange: (patch: Partial<ModalDarah>) => void;
  onKirim: () => void;
  onBatal: () => void;
}) {
  return (
    <div style={overlayStyle}>
      <div style={modalBoxStyle}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>
          Request Darah
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--color-muted)' }}>
          {modal.rs.nama}
        </p>

        <label style={labelStyle}>Golongan Darah</label>
        <select
          style={inputStyle}
          value={modal.golongan}
          onChange={(e) => onChange({ golongan: e.target.value as GolonganDarah })}
        >
          {GOLONGAN_DARAH.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        <label style={labelStyle}>Jumlah (kantong)</label>
        <input
          style={inputStyle}
          type="number"
          min={1}
          max={99}
          value={modal.jumlah}
          onChange={(e) => onChange({ jumlah: Math.max(1, parseInt(e.target.value) || 1) })}
        />

        <label style={labelStyle}>Urgensi</label>
        <select
          style={inputStyle}
          value={modal.urgency}
          onChange={(e) => onChange({ urgency: e.target.value as 'Tinggi' | 'Kritis' })}
        >
          <option value="Tinggi">Tinggi</option>
          <option value="Kritis">Kritis</option>
        </select>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            className={`${styles.btn} ${modal.urgency === 'Kritis' ? styles.btnDanger : styles.btnPrimary}`}
            onClick={onKirim}
          >
            Kirim Request
          </button>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onBatal}>
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shared Styles ────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const modalBoxStyle: React.CSSProperties = {
  background: 'var(--color-surface)',
  borderRadius: 12,
  padding: 24,
  width: 360,
  boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
  border: '1px solid var(--color-border)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--color-muted)',
  marginBottom: 4,
  marginTop: 12,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontSize: 13,
  boxSizing: 'border-box',
};

// ─── Halaman Utama ─────────────────────────────────────────────────────────────

export default function HospitalAvailabilityPage() {
  const toast = useToast();

  // State RS: clone dari SEED agar tidak mutasi data asli
  const [rumahSakitList, setRumahSakitList] = useState<RumahSakit[]>(() =>
    (simulationEngine.getState().rumahSakit.length > 0 ? simulationEngine.getState().rumahSakit : SEED_RUMAH_SAKIT).map((rs) => ({
      ...rs,
      koordinat: { ...rs.koordinat },
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

  // Melacak ID RS yang baru diupdate untuk efek flash
  const [flashingIds, setFlashingIds] = useState<Set<string>>(new Set());

  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Modal rujukan
  const [modalRujukan, setModalRujukan] = useState<ModalRujukan | null>(null);

  // Modal darah
  const [modalDarah, setModalDarah] = useState<ModalDarah | null>(null);

  // Subscribe ke simulasi
  useEffect(() => {
    const unsub = simulationEngine.on('HOSPITAL_CAPACITY_UPDATE', (event: SimEvent) => {
      if (event.type !== 'HOSPITAL_CAPACITY_UPDATE') return;

      setRumahSakitList((prev) =>
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

      // Tandai RS untuk efek flash
      setFlashingIds((prev) => new Set([...prev, event.hospitalId]));
      setTimeout(() => {
        setFlashingIds((prev) => {
          const next = new Set(prev);
          next.delete(event.hospitalId);
          return next;
        });
      }, 600);

      setLastUpdated(new Date());
    });

    return unsub;
  }, []);

  // ─── Handler Modal Rujukan ──────────────────────────────────────────────────

  const bukaModalRujukan = useCallback((rs: RumahSakit) => {
    setModalRujukan({ rs, namaPasien: '', tipeRuang: 'IGD', keterangan: '' });
  }, []);

  const handleKonfirmasiRujukan = useCallback(() => {
    if (!modalRujukan) return;
    const patient = simulationEngine.getState().pasien.find((item) => item.nama.toLowerCase() === modalRujukan.namaPasien.trim().toLowerCase()) ?? simulationEngine.getState().pasien[0];
    const referral = patient
      ? simulationEngine.requestReferral(patient.id, modalRujukan.rs.id, modalRujukan.tipeRuang, modalRujukan.keterangan || 'Permintaan rujukan dari operator')
      : null;
    if (referral) toast.success(`Permintaan ${referral.id} ke ${modalRujukan.rs.nama} berhasil dibuat`, 'Rujukan Terkirim');
    else toast.error('Rujukan tidak dapat dibuat. Periksa pasien dan koneksi simulator.', 'Rujukan Gagal');
    setModalRujukan(null);
  }, [modalRujukan, toast]);

  // ─── Handler Modal Darah ────────────────────────────────────────────────────

  const bukaModalDarah = useCallback((rs: RumahSakit) => {
    setModalDarah({ rs, golongan: 'A+', jumlah: 1, urgency: 'Tinggi' });
  }, []);

  const handleKirimDarah = useCallback(() => {
    if (!modalDarah) return;
    const request = simulationEngine.requestBlood(modalDarah.rs.id, modalDarah.golongan, modalDarah.jumlah, modalDarah.urgency);
    if (!request) toast.error('Request darah tidak dapat dibuat.', 'Request Darah Gagal');
    else if (request.urgency === 'Kritis') toast.warning(`Request ${request.id} untuk ${request.bloodType} (${request.units} kantong) diprioritaskan`, 'Request Darah Kritis');
    else toast.success(`Request ${request.id} berhasil dikirim ke ${modalDarah.rs.nama}`, 'Request Darah Terkirim');
    setModalDarah(null);
  }, [modalDarah, toast]);

  // ─── Format waktu ────────────────────────────────────────────────────────────

  const formatWaktu = (d: Date) =>
    d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 24,
          flexWrap: 'wrap',
        }}
      >
        <h1 className={styles.title} style={{ margin: 0 }}>
          Ketersediaan Rumah Sakit
        </h1>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--color-info-bg)',
            border: '1px solid var(--color-info-border)',
            color: 'var(--color-info)',
            borderRadius: 999,
            padding: '3px 10px',
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: 'var(--color-info)',
              display: 'inline-block',
              animation: 'pulsingDot 1.4s ease infinite',
            }}
          />
          Live Update setiap 20 detik
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 12,
            color: 'var(--color-muted)',
          }}
        >
          Diperbarui: {formatWaktu(lastUpdated)}
        </span>
      </div>

      {/* Grid Kartu RS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
          gap: 20,
        }}
      >
        {rumahSakitList.map((rs) => {
          const isFlashing = flashingIds.has(rs.id);
          return (
            <div
              key={rs.id}
              className={styles.card}
              style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 0 }}
            >
              {/* Kartu Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: 12,
                  gap: 8,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 2,
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        fontSize: 14,
                        fontWeight: 700,
                        color: 'var(--color-text)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {rs.nama}
                    </h3>
                    {/* Badge Status Koneksi */}
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 7px',
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 700,
                        flexShrink: 0,
                        background:
                          rs.statusKoneksi === 'Online'
                            ? 'var(--color-success-bg)'
                            : 'var(--color-danger-bg)',
                        border: `1px solid ${rs.statusKoneksi === 'Online' ? 'var(--color-success-border)' : 'var(--color-danger-border)'}`,
                        color:
                          rs.statusKoneksi === 'Online'
                            ? 'var(--color-success)'
                            : 'var(--color-danger)',
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background:
                            rs.statusKoneksi === 'Online'
                              ? 'var(--color-success)'
                              : 'var(--color-danger)',
                          animation:
                            rs.statusKoneksi === 'Online'
                              ? 'pulsingDot 1.4s ease infinite'
                              : undefined,
                        }}
                      />
                      {rs.statusKoneksi}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>{rs.alamat}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>📞 {rs.telepon}</div>
                </div>
              </div>

              {/* Kapasitas Ruangan */}
              <div
                style={{
                  background: 'var(--color-surface-2)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--color-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    marginBottom: 8,
                  }}
                >
                  Kapasitas Ruangan
                </div>
                <KapasitasBar
                  label="IGD"
                  tersedia={rs.kapasitas.IGD.tersedia}
                  total={rs.kapasitas.IGD.total}
                  flashing={isFlashing}
                />
                <KapasitasBar
                  label="ICU"
                  tersedia={rs.kapasitas.ICU.tersedia}
                  total={rs.kapasitas.ICU.total}
                  flashing={isFlashing}
                />
                <KapasitasBar
                  label="Inap"
                  tersedia={rs.kapasitas.Inap.tersedia}
                  total={rs.kapasitas.Inap.total}
                  flashing={isFlashing}
                />
                <KapasitasBar
                  label="Operasi"
                  tersedia={rs.kapasitas.Operasi.tersedia}
                  total={rs.kapasitas.Operasi.total}
                  flashing={isFlashing}
                />
              </div>

              {/* Stok Darah */}
              <div
                style={{
                  background: 'var(--color-surface-2)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--color-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Stok Darah (kantong)
                </div>
                <StokDarahGrid stok={rs.stokDarah} />
              </div>

              {/* Dokter Tersedia */}
              <div
                style={{
                  background: 'var(--color-surface-2)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--color-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Dokter Tersedia
                  </span>
                  <span
                    style={{
                      background: 'var(--color-success-bg)',
                      color: 'var(--color-success)',
                      border: '1px solid var(--color-success-border)',
                      borderRadius: 999,
                      padding: '1px 7px',
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {rs.dokterTersedia}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {rs.dokterJaga.slice(0, 4).map((dj, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                        fontSize: 12,
                      }}
                    >
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: `hsl(${(idx * 73 + 200) % 360}, 55%, 55%)`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontSize: 10,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {dj.nama.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <span style={{ color: 'var(--color-text)', fontWeight: 500 }}>{dj.nama}</span>
                      <span style={{ color: 'var(--color-muted)', fontSize: 11, marginLeft: 'auto' }}>
                        {dj.spesialisasi}
                      </span>
                    </div>
                  ))}
                  {rs.dokterJaga.length > 4 && (
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>
                      +{rs.dokterJaga.length - 4} dokter lainnya
                    </div>
                  )}
                </div>
              </div>

              {/* Tombol Aksi */}
              <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                <button
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  style={{ flex: 1, fontSize: 12, height: 32, padding: '0 10px' }}
                  onClick={() => bukaModalRujukan(rs)}
                >
                  Request Rujukan
                </button>
                <button
                  className={`${styles.btn} ${styles.btnDanger}`}
                  style={{ flex: 1, fontSize: 12, height: 32, padding: '0 10px' }}
                  onClick={() => bukaModalDarah(rs)}
                >
                  Request Darah
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Rujukan */}
      {modalRujukan !== null && (
        <ModalRujukanForm
          modal={modalRujukan}
          onChange={(patch) => setModalRujukan((prev) => (prev ? { ...prev, ...patch } : prev))}
          onKonfirmasi={handleKonfirmasiRujukan}
          onBatal={() => setModalRujukan(null)}
        />
      )}

      {/* Modal Darah */}
      {modalDarah !== null && (
        <ModalDarahForm
          modal={modalDarah}
          onChange={(patch) => setModalDarah((prev) => (prev ? { ...prev, ...patch } : prev))}
          onKirim={handleKirimDarah}
          onBatal={() => setModalDarah(null)}
        />
      )}
    </div>
  );
}
