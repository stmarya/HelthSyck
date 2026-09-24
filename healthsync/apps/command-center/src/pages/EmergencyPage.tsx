import { useState, useEffect, useCallback } from 'react';
import styles from './Page.module.css';
import { appendLog } from '../hooks/useActivityLog';

// ─────────────────────────────────────────────────────────────────────────────
// Tipe & Konfigurasi Kode Darurat
// ─────────────────────────────────────────────────────────────────────────────

interface KodeDarurat {
  kode: string;
  nama: string;
  warna: string;
  bgWarna: string;
  deskripsi: string;
  icon: string;
  protokol: string[];
}

const KODE_DARURAT: KodeDarurat[] = [
  {
    kode: 'BIRU',
    nama: 'Kode Biru',
    warna: '#1d4ed8',
    bgWarna: '#eff6ff',
    deskripsi: 'Henti Jantung / Henti Napas — Butuh Resusitasi Segera',
    icon: '💙',
    protokol: [
      'Panggil tim resusitasi segera (tekan tombol aktivasi)',
      'Mulai CPR — 30 kompresi : 2 napas',
      'Siapkan defibrillator AED',
      'Pasang akses IV dan berikan epinefrin 1mg setiap 3-5 menit',
      'Pastikan rekam EKG dan catat waktu kejadian',
      'Hubungi dokter penanggung jawab dan ICU',
    ],
  },
  {
    kode: 'MERAH',
    nama: 'Kode Merah',
    warna: '#dc2626',
    bgWarna: '#fef2f2',
    deskripsi: 'Kebakaran / Bahaya Api — Evakuasi Segera',
    icon: '🔴',
    protokol: [
      'Aktivasi alarm kebakaran dan hubungi Damkar (119)',
      'Evakuasi pasien dimulai dari yang terdekat dengan bahaya',
      'Tutup semua pintu api untuk mencegah penyebaran',
      'Kumpulkan semua staf di titik evakuasi yang telah ditentukan',
      'Jangan gunakan lift — gunakan tangga darurat',
      'Laporkan hitungan kepala (headcount) ke komandan insiden',
    ],
  },
  {
    kode: 'KUNING',
    nama: 'Kode Kuning',
    warna: '#d97706',
    bgWarna: '#fffbeb',
    deskripsi: 'Bencana Massal / Mass Casualty Incident (MCI)',
    icon: '⚠️',
    protokol: [
      'Aktifkan rencana tanggap bencana rumah sakit',
      'Panggil semua staf medis yang sedang off-duty',
      'Siapkan area triase di IGD dan halaman depan',
      'Implementasikan sistem triase START (Simple Triage and Rapid Treatment)',
      'Koordinasi dengan BPBD, BNPB, dan RS rujukan lain',
      'Batasi pengunjung dan amankan pintu masuk RS',
    ],
  },
  {
    kode: 'HITAM',
    nama: 'Kode Hitam',
    warna: '#1f2328',
    bgWarna: '#f3f4f6',
    deskripsi: 'Ancaman Bom / Ancaman Keamanan Ekstrem',
    icon: '⚫',
    protokol: [
      'Hubungi Polisi (110) dan Bom Squad segera',
      'JANGAN sentuh benda mencurigakan',
      'Evakuasi area dalam radius 100 meter dari benda mencurigakan',
      'Larang penggunaan radio/HP di area evakuasi',
      'Kunci semua akses masuk RS',
      'Tunggu instruksi dari aparat berwenang',
    ],
  },
  {
    kode: 'PINK',
    nama: 'Kode Pink',
    warna: '#be185d',
    bgWarna: '#fdf2f8',
    deskripsi: 'Penculikan Bayi / Anak — Lockdown Segera',
    icon: '🩷',
    protokol: [
      'Aktifkan lockdown seluruh rumah sakit SEGERA',
      'Kunci semua pintu keluar dan lift',
      'Rekam CCTV — jangan hapus footage',
      'Hubungi Polisi (110) dan laporkan deskripsi tersangka',
      'Cari seluruh area RS termasuk toilet dan gudang',
      'Jangan biarkan siapapun keluar sebelum mendapat izin petugas',
    ],
  },
  {
    kode: 'UNGU',
    nama: 'Kode Ungu',
    warna: '#7c3aed',
    bgWarna: '#f5f3ff',
    deskripsi: 'Penyanderaan / Ancaman Senjata',
    icon: '💜',
    protokol: [
      'Hubungi Polisi (110) — JANGAN konfrontasi pelaku',
      'Sembunyikan dan amankan staf dan pasien',
      'Jangan buka pintu yang sudah terkunci',
      'Gunakan jalur komunikasi darurat internal',
      'Ikuti instruksi aparat berwenang',
      'Catat semua informasi pelaku untuk petugas',
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Interface State Kode Aktif
// ─────────────────────────────────────────────────────────────────────────────

interface KodeAktif {
  kode: KodeDarurat;
  waktuAktivasi: Date;
  diaktivasiOleh: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Komponen Timer
// ─────────────────────────────────────────────────────────────────────────────

function Timer({ waktuMulai }: { waktuMulai: Date }) {
  const [detik, setDetik] = useState(0);

  useEffect(() => {
    const hitung = () => setDetik(Math.floor((Date.now() - waktuMulai.getTime()) / 1000));
    hitung();
    const interval = setInterval(hitung, 1000);
    // BUG FIX: clearInterval saat komponen unmount agar tidak ada timer leak
    return () => {
      clearInterval(interval);
    };
  }, [waktuMulai]);

  const jam = Math.floor(detik / 3600);
  const menit = Math.floor((detik % 3600) / 60);
  const dtk = detik % 60;

  return (
    <span style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700 }}>
      {String(jam).padStart(2, '0')}:{String(menit).padStart(2, '0')}:{String(dtk).padStart(2, '0')}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Komponen Modal Konfirmasi Aktivasi
// ─────────────────────────────────────────────────────────────────────────────

function ModalKonfirmasi({
  kode,
  onKonfirmasi,
  onBatal,
}: {
  kode: KodeDarurat;
  onKonfirmasi: () => void;
  onBatal: () => void;
}) {
  const [terkonfirmasi, setTerkonfirmasi] = useState(false);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.6)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      animation: 'fadeInUp 0.2s ease both',
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: 32,
        width: 460, boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
        border: `2px solid ${kode.warna}`,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>{kode.icon}</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: kode.warna, margin: 0 }}>
            AKTIVASI {kode.nama.toUpperCase()}
          </h2>
          <p style={{ fontSize: 14, color: '#57606a', marginTop: 8 }}>{kode.deskripsi}</p>
        </div>

        <div style={{
          background: '#fef2f2', border: '1px solid #fca5a5',
          borderRadius: 8, padding: '12px 16px', marginBottom: 20,
        }}>
          <p style={{ fontSize: 13, color: '#991b1b', margin: 0, fontWeight: 600 }}>
            ⚠️ Tindakan ini akan mengirim notifikasi darurat ke seluruh staf. Pastikan ini bukan pengujian sistem.
          </p>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={terkonfirmasi}
            onChange={(e) => setTerkonfirmasi(e.target.checked)}
            style={{ width: 18, height: 18, cursor: 'pointer' }}
          />
          <span style={{ fontSize: 13, color: '#1f2328', fontWeight: 500 }}>
            Saya konfirmasi ini adalah situasi darurat nyata yang membutuhkan tindakan segera
          </span>
        </label>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onBatal}
            style={{
              flex: 1, padding: '10px 16px',
              background: '#f7f8fa', border: '1px solid #e5e7eb',
              borderRadius: 6, fontSize: 14, cursor: 'pointer', fontWeight: 500,
            }}
          >
            Batal
          </button>
          <button
            onClick={onKonfirmasi}
            disabled={!terkonfirmasi}
            style={{
              flex: 1, padding: '10px 16px',
              background: terkonfirmasi ? kode.warna : '#9ca3af',
              color: '#fff', border: 'none',
              borderRadius: 6, fontSize: 14, cursor: terkonfirmasi ? 'pointer' : 'not-allowed',
              fontWeight: 700, transition: 'background 0.2s',
            }}
          >
            🚨 AKTIFKAN {kode.nama.toUpperCase()}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EmergencyPage Utama
// ─────────────────────────────────────────────────────────────────────────────

export default function EmergencyPage() {
  const [kodeAktif, setKodeAktif] = useState<KodeAktif[]>([]);
  const [kodeDikonfirmasi, setKodeDikonfirmasi] = useState<KodeDarurat | null>(null);
  const [riwayat, setRiwayat] = useState<Array<{ kode: KodeDarurat; waktu: Date; status: 'DIAKHIRI' }>>([]);

  // ── Persist timer ke sessionStorage ──
  // BUG FIX: Gunakan key unik per tab via sessionStorage + tab ID
  // agar dua tab yang terbuka tidak saling menimpa state emergency
  const [tabId] = useState<string>(() => {
    // ID tab unik — dibuat sekali saat komponen mount, disimpan di memori sesi
    const existing = sessionStorage.getItem('cc_tab_id');
    if (existing) return existing;
    const id = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    sessionStorage.setItem('cc_tab_id', id);
    return id;
  });

  const TIMER_KEY = `cc_emergency_timer_${tabId}`;

  const [timerStart, setTimerStart] = useState<Date | null>(() => {
    const stored = sessionStorage.getItem(`cc_emergency_timer_${sessionStorage.getItem('cc_tab_id') ?? ''}`);
    return stored ? new Date(stored) : null;
  });

  // Sinkronkan timerStart ke sessionStorage saat berubah
  useEffect(() => {
    if (timerStart) {
      sessionStorage.setItem(TIMER_KEY, timerStart.toISOString());
    } else {
      sessionStorage.removeItem(TIMER_KEY);
    }
  }, [timerStart, TIMER_KEY]);

  const userEmail = (() => {
    try { return (JSON.parse(localStorage.getItem('hs_user') ?? '{}') as { email?: string }).email ?? 'Operator'; }
    catch { return 'Operator'; }
  })();

  const aktifkanKode = useCallback((kode: KodeDarurat) => {
    setKodeDikonfirmasi(kode);
  }, []);

  const konfirmasiAktifkan = useCallback(() => {
    if (!kodeDikonfirmasi) return;
    const waktuAktivasi = new Date();
    setKodeAktif((prev) => [
      ...prev,
      { kode: kodeDikonfirmasi, waktuAktivasi, diaktivasiOleh: userEmail },
    ]);
    // Simpan timer dari kode pertama yang diaktifkan
    setTimerStart((prev) => prev ?? waktuAktivasi);
    appendLog({
      level: 'danger',
      actor: (() => {
        try { return (JSON.parse(localStorage.getItem('hs_user') ?? '{}') as { email?: string }).email ?? 'Operator'; }
        catch { return 'Operator'; }
      })(),
      action: `Aktivasi Kode ${kodeDikonfirmasi.kode}`,
      detail: `Kode Darurat ${kodeDikonfirmasi.nama} diaktifkan: ${kodeDikonfirmasi.deskripsi}`,
      page: 'EmergencyPage',
    });
    setKodeDikonfirmasi(null);
  }, [kodeDikonfirmasi, userEmail]);

  const akhiriKode = useCallback((kodeStr: string) => {
    setKodeAktif((prev) => {
      const item = prev.find((k) => k.kode.kode === kodeStr);
      if (item) {
        setRiwayat((r) => [{ kode: item.kode, waktu: new Date(), status: 'DIAKHIRI' }, ...r.slice(0, 9)]);
      }
      const remaining = prev.filter((k) => k.kode.kode !== kodeStr);
      // Hapus timer jika tidak ada kode aktif lagi
      if (remaining.length === 0) {
        setTimerStart(null);
      }
      return remaining;
    });
  }, []);

  const protokolAktif = kodeAktif.length > 0
    ? kodeAktif[0].kode.protokol
    : null;

  return (
    <div className={styles.page}>
      {/* Animasi pulse-border & fadeInUp sudah didefinisikan di index.css global */}

      {/* ── Modal Konfirmasi ── */}
      {kodeDikonfirmasi && (
        <ModalKonfirmasi
          kode={kodeDikonfirmasi}
          onKonfirmasi={konfirmasiAktifkan}
          onBatal={() => setKodeDikonfirmasi(null)}
        />
      )}

      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <h1 className={styles.title} style={{ marginBottom: 4 }}>Pusat Kode Darurat</h1>
        <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>
          Aktivasi kode darurat memerlukan konfirmasi dua langkah. Semua aktivasi dicatat dan dilaporkan.
        </p>
      </div>

      {/* ── Banner Kode Aktif ── */}
      {kodeAktif.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          {kodeAktif.map((ka) => (
            <div
              key={ka.kode.kode}
              style={{
                background: ka.kode.bgWarna,
                border: `2px solid ${ka.kode.warna}`,
                borderRadius: 10, padding: '16px 20px', marginBottom: 12,
                animation: 'pulse-border 2s ease-in-out infinite',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 28 }}>{ka.kode.icon}</span>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: ka.kode.warna }}>
                      🚨 {ka.kode.nama.toUpperCase()} — AKTIF
                    </div>
                    <div style={{ fontSize: 12, color: '#57606a', marginTop: 2 }}>
                      Diaktifkan oleh {ka.diaktivasiOleh} pada {ka.waktuAktivasi.toLocaleTimeString('id-ID')}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#57606a', marginBottom: 2 }}>DURASI</div>
                    <Timer waktuMulai={ka.waktuAktivasi} />
                  </div>
                  <button
                    onClick={() => akhiriKode(ka.kode.kode)}
                    style={{
                      padding: '8px 16px', background: ka.kode.warna,
                      color: '#fff', border: 'none', borderRadius: 6,
                      fontSize: 13, cursor: 'pointer', fontWeight: 700,
                    }}
                  >
                    ✓ Akhiri Kode
                  </button>
                </div>
              </div>

              {/* Protokol SOP inline */}
              <div style={{
                marginTop: 14, paddingTop: 14,
                borderTop: `1px solid ${ka.kode.warna}40`,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: ka.kode.warna, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Protokol Respons
                </div>
                <ol style={{ paddingLeft: 20, margin: 0 }}>
                  {ka.kode.protokol.map((langkah, i) => (
                    <li key={i} style={{ fontSize: 13, color: '#1f2328', marginBottom: 4 }}>
                      {langkah}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Grid Tombol Kode Darurat ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 16, marginBottom: 28,
      }}>
        {KODE_DARURAT.map((kode) => {
          const isAktif = kodeAktif.some((k) => k.kode.kode === kode.kode);
          return (
            <div
              key={kode.kode}
              style={{
                background: isAktif ? kode.bgWarna : '#fff',
                border: `2px solid ${isAktif ? kode.warna : '#e5e7eb'}`,
                borderRadius: 10, padding: '20px',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                <span style={{ fontSize: 32 }}>{kode.icon}</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: kode.warna }}>{kode.nama}</div>
                  <div style={{ fontSize: 12, color: '#57606a', marginTop: 3 }}>{kode.deskripsi}</div>
                </div>
              </div>
              <button
                onClick={() => aktifkanKode(kode)}
                disabled={isAktif}
                style={{
                  width: '100%', padding: '10px',
                  background: isAktif ? '#e5e7eb' : kode.warna,
                  color: isAktif ? '#9ca3af' : '#fff',
                  border: 'none', borderRadius: 6, fontSize: 13,
                  cursor: isAktif ? 'not-allowed' : 'pointer',
                  fontWeight: 700, transition: 'all 0.2s',
                }}
              >
                {isAktif ? '✓ SEDANG AKTIF' : `🚨 Aktifkan ${kode.nama}`}
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Protokol untuk Kode Aktif (jika ada 1 kode aktif) ── */}
      {protokolAktif && kodeAktif.length === 1 && (
        <div className={styles.card} style={{ marginBottom: 20 }}>
          <h2 className={styles.cardTitle}>Protokol SOP — {kodeAktif[0].kode.nama}</h2>
          <ol style={{ paddingLeft: 20, margin: 0 }}>
            {protokolAktif.map((langkah, i) => (
              <li key={i} style={{ fontSize: 14, color: 'var(--color-text)', marginBottom: 8, lineHeight: 1.6 }}>
                {langkah}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ── Riwayat Kode ── */}
      {riwayat.length > 0 && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Riwayat Kode Darurat (Sesi Ini)</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Kode</th>
                <th>Deskripsi</th>
                <th>Waktu Diakhiri</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {riwayat.map((r, i) => (
                <tr key={i}>
                  <td>
                    <span style={{ fontSize: 20, marginRight: 8 }}>{r.kode.icon}</span>
                    <strong style={{ color: r.kode.warna }}>{r.kode.nama}</strong>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--color-muted)' }}>{r.kode.deskripsi}</td>
                  <td style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                    {r.waktu.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </td>
                  <td>
                    <span className={`${styles.badge} ${styles.badgeOk}`}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
