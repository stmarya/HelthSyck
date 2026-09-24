import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

// Daftar fitur yang ditampilkan di panel branding sebelah kiri
const daftarFitur = [
  { ikon: '🚑', teks: 'Monitoring Ambulans Real-time' },
  { ikon: '🏥', teks: 'Manajemen Rumah Sakit' },
  { ikon: '🔔', teks: 'Alert & Notifikasi Kritis' },
  { ikon: '📊', teks: 'Laporan & Analitik' },
];

export default function LoginPage() {
  const { login, loading, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailFokus, setEmailFokus] = useState(false);
  const [passwordFokus, setPasswordFokus] = useState(false);
  const [hoverTombol, setHoverTombol] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await login(email, password);
      navigate('/');
    } catch {
      // error ditampilkan dari state hook
    }
  }

  return (
    <>
      {/* Keyframes animasi fadeIn dan style responsif via tag <style> */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .hs-panel-kanan {
          animation: fadeIn 0.4s ease both;
        }

        /* Sembunyikan panel kiri di layar kecil */
        @media (max-width: 767px) {
          .hs-panel-kiri {
            display: none !important;
          }
          .hs-panel-kanan {
            width: 100% !important;
            padding: 24px !important;
          }
        }
      `}</style>

      {/* Wrapper utama — full viewport */}
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          fontFamily: '-apple-system, "Segoe UI", system-ui, sans-serif',
        }}
      >
        {/* ============================================================
            PANEL KIRI — Branding HealthSync
        ============================================================ */}
        <div
          className="hs-panel-kiri"
          style={{
            width: '40%',
            background: 'linear-gradient(135deg, #0f1117 0%, #1a1d2e 100%)',
            padding: '48px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            color: '#ffffff',
          }}
        >
          {/* Konten utama branding */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {/* Badge produk */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(37, 99, 235, 0.15)',
                border: '1px solid rgba(37, 99, 235, 0.4)',
                borderRadius: '999px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#93c5fd',
                alignSelf: 'flex-start',
              }}
            >
              🏥 HealthSync Command Center
            </div>

            {/* Judul dan subtitle */}
            <div>
              <h1
                style={{
                  fontSize: '34px',
                  fontWeight: 800,
                  lineHeight: 1.25,
                  margin: '0 0 14px 0',
                  color: '#ffffff',
                  letterSpacing: '-0.02em',
                }}
              >
                Pantau & Kelola<br />
                Kesehatan Indonesia
              </h1>
              <p
                style={{
                  fontSize: '15px',
                  color: 'rgba(255,255,255,0.55)',
                  margin: 0,
                  lineHeight: 1.6,
                }}
              >
                Platform monitoring terpadu untuk seluruh ekosistem layanan kesehatan
              </p>
            </div>

            {/* Daftar fitur */}
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {daftarFitur.map((fitur) => (
                <li
                  key={fitur.teks}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    fontSize: '14px',
                    color: 'rgba(255,255,255,0.80)',
                  }}
                >
                  {/* Lingkaran ikon kecil */}
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'rgba(255,255,255,0.07)',
                      flexShrink: 0,
                      fontSize: '16px',
                    }}
                  >
                    {fitur.ikon}
                  </span>
                  {fitur.teks}
                </li>
              ))}
            </ul>
          </div>

          {/* Footer branding */}
          <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
            © 2026 HealthSync Indonesia
          </p>
        </div>

        {/* ============================================================
            PANEL KANAN — Form Login
        ============================================================ */}
        <div
          className="hs-panel-kanan"
          style={{
            width: '60%',
            background: 'var(--color-bg, #ffffff)',
            padding: '48px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Kartu form — max-width 360px */}
          <div style={{ width: '100%', maxWidth: '360px' }}>
            {/* Header form */}
            <div style={{ marginBottom: '32px', textAlign: 'center' }}>
              {/* Logo bulat */}
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: '#2563EB',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '22px',
                  margin: '0 auto 14px auto',
                  boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
                }}
              >
                🏥
              </div>
              <h2
                style={{
                  fontSize: '24px',
                  fontWeight: 700,
                  color: 'var(--color-text, #1f2328)',
                  margin: '0 0 6px 0',
                }}
              >
                Selamat Datang
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--color-muted, #57606a)', margin: 0 }}>
                Masuk ke Command Center
              </p>
            </div>

            {/* Pesan error */}
            {error && (
              <div
                style={{
                  background: 'var(--color-danger-bg, #fef2f2)',
                  border: '1px solid var(--color-danger-border, #fca5a5)',
                  borderRadius: '6px',
                  padding: '10px 14px',
                  marginBottom: '20px',
                  fontSize: '13px',
                  color: 'var(--color-danger, #991b1b)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                }}
              >
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={(e) => { void handleSubmit(e); }}>
              {/* Field Email */}
              <div style={{ marginBottom: '18px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--color-text-secondary, #374151)',
                    marginBottom: '6px',
                  }}
                >
                  ✉ Alamat Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setEmailFokus(true)}
                  onBlur={() => setEmailFokus(false)}
                  required
                  placeholder="dokter@healthsync.id"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: `1px solid ${emailFokus ? '#2563EB' : 'var(--color-border, #e5e7eb)'}`,
                    borderRadius: '6px',
                    fontSize: '14px',
                    background: 'var(--color-surface-2, #f7f8fa)',
                    color: 'var(--color-text, #1f2328)',
                    boxSizing: 'border-box',
                    outline: 'none',
                    boxShadow: emailFokus ? '0 0 0 3px rgba(37,99,235,0.1)' : 'none',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                />
              </div>

              {/* Field Password */}
              <div style={{ marginBottom: '24px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--color-text-secondary, #374151)',
                    marginBottom: '6px',
                  }}
                >
                  🔑 Kata Sandi
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setPasswordFokus(true)}
                  onBlur={() => setPasswordFokus(false)}
                  required
                  placeholder="••••••••"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: `1px solid ${passwordFokus ? '#2563EB' : 'var(--color-border, #e5e7eb)'}`,
                    borderRadius: '6px',
                    fontSize: '14px',
                    background: 'var(--color-surface-2, #f7f8fa)',
                    color: 'var(--color-text, #1f2328)',
                    boxSizing: 'border-box',
                    outline: 'none',
                    boxShadow: passwordFokus ? '0 0 0 3px rgba(37,99,235,0.1)' : 'none',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                />
              </div>

              {/* Tombol submit */}
              <button
                type="submit"
                disabled={loading}
                onMouseEnter={() => setHoverTombol(true)}
                onMouseLeave={() => setHoverTombol(false)}
                style={{
                  width: '100%',
                  padding: '11px',
                  background: 'var(--color-primary, #2563EB)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                  transition: 'background 0.15s, transform 0.15s',
                  transform: !loading && hoverTombol ? 'translateY(-1px)' : 'translateY(0)',
                }}
              >
                {loading ? 'Memuat...' : 'Masuk ke Sistem'}
              </button>
            </form>

            {/* Kotak kredensial dev */}
            <div
              style={{
                marginTop: '24px',
                background: 'var(--color-surface-2, #f7f8fa)',
                border: '1px solid var(--color-border, #e5e7eb)',
                borderRadius: '6px',
                padding: '10px 14px',
                fontSize: '11px',
                color: 'var(--color-muted, #57606a)',
                lineHeight: 1.7,
              }}
            >
              <span style={{ fontWeight: 700 }}>Kredensial Dev:</span><br />
              Email: cc.indah.permata@healthsync.id<br />
              Password: Password@123
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
