import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { ToastProvider, useToast } from './context/ToastContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import LoginPage from './pages/LoginPage';
import OverviewPage from './pages/OverviewPage';
import AlertsPage from './pages/AlertsPage';
import AmbulancePage from './pages/AmbulancePage';
import ReferralsPage from './pages/ReferralsPage';
import PatientsPage from './pages/PatientsPage';
import ConsultationsPage from './pages/ConsultationsPage';
import HospitalsPage from './pages/HospitalsPage';
import EmergencyPage from './pages/EmergencyPage';
import PharmacyPage from './pages/PharmacyPage';
import ReportsPage from './pages/ReportsPage';
import CommandCenterPage from './pages/CommandCenterPage';
import LiveMapPage from './pages/LiveMapPage';
import HospitalAvailabilityPage from './pages/HospitalAvailabilityPage';
import IntegrationHealthPage from './pages/IntegrationHealthPage';
import { useAuth } from './hooks/useAuth';
import { useAlerts } from './hooks/useAlerts';
import { useSessionExpiry } from './hooks/useSessionExpiry';
import styles from './App.module.css';

// ── Lazy-load komponen besar ──────────────────────────────────────────────
const GlobalSearch  = lazy(() => import('./components/GlobalSearch'));
const AuditLogPanel = lazy(() => import('./components/AuditLogPanel'));

// ─────────────────────────────────────────────────────────────────────────────
// Hook: cek koneksi ke backend
// ─────────────────────────────────────────────────────────────────────────────

function useBackendStatus() {
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => {
    const check = async () => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 3000);
      try {
        const r = await fetch('/health/auth', { signal: controller.signal });
        const body = (await r.clone().json().catch(() => null)) as
          | { status?: string; db?: boolean; redis?: boolean; kafka?: boolean; mqtt?: boolean }
          | null;
        const dependencyFlags = [body?.db, body?.redis, body?.kafka, body?.mqtt];
        const dependenciesHealthy = dependencyFlags.every((value) => value === undefined || value === true);
        setOnline(r.ok && body?.status !== 'error' && dependenciesHealthy);
      } catch { setOnline(false); }
      finally { window.clearTimeout(timeoutId); }
    };
    void check();
    const iv = setInterval(() => void check(), 30000);
    return () => clearInterval(iv);
  }, []);
  return online;
}

// ─────────────────────────────────────────────────────────────────────────────
// Definisi navigasi
// ─────────────────────────────────────────────────────────────────────────────

const NAV_BARIS_1 = [
  { to: '/',                         label: '🏠 Overview',    end: true },
  { to: '/patients',                 label: '🧑‍⚕️ Pasien',      end: false },
  { to: '/consultations',            label: '🩺 Konsultasi',   end: false },
  { to: '/hospitals',                label: '🏥 RS',           end: false },
  { to: '/ambulance',                label: '🚑 Ambulans',     end: false },
  { to: '/referrals',                label: '📋 Rujukan',      end: false },
];

const NAV_BARIS_2 = [
  { to: '/alerts',                   label: '⚠️ Alerts',      end: false, isAlert: true },
  { to: '/emergency',                label: '🚨 Darurat',     end: false, isEmergency: true },
  { to: '/pharmacy',                 label: '💊 Farmasi',     end: false },
  { to: '/reports',                  label: '📊 Laporan',     end: false },
  { to: '/command-center',           label: '🖥️ War Room',    end: false },
  { to: '/command-center/live-map',  label: '🗺️ Live Map',   end: false },
  { to: '/command-center/hospitals', label: '🏥 RS Live',     end: false },
  { to: '/command-center/integrations', label: '🔌 Integrasi', end: false },
];

// ─────────────────────────────────────────────────────────────────────────────
// NavBar
// ─────────────────────────────────────────────────────────────────────────────

function NavBar({
  onSearchOpen,
  onAuditOpen,
}: {
  onSearchOpen: () => void;
  onAuditOpen: () => void;
}) {
  const { user, logout } = useAuth();
  const { criticalCount } = useAlerts(15000);
  const backendOnline = useBackendStatus();
  const { isDark, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();

  // Session expiry — logout otomatis jika token sudah habis
  useSessionExpiry(useCallback(() => {
    logout();
    navigate('/login');
  }, [logout, navigate]));

  const navLinkStyle = (isActive: boolean, isAlert?: boolean, isEmergency?: boolean) => ({
    color: isActive ? '#fff' : (isAlert && criticalCount > 0) ? '#fca5a5' : isEmergency ? '#fca5a5' : '#9ca3af',
    fontSize: '12px',
    textDecoration: 'none',
    padding: '3px 8px',
    borderRadius: '4px',
    background: isActive ? '#374151' : 'transparent',
    fontWeight: ((isAlert && criticalCount > 0) || isEmergency) ? 700 : (isActive ? 600 : undefined),
    whiteSpace: 'nowrap' as const,
  });

  return (
    <nav className={`${styles.navbar} cc-nav`} style={{
      background: '#1f2328', color: '#fff',
      padding: '0 16px',
      position: 'sticky', top: 0, zIndex: 200,
      boxShadow: '0 1px 0 rgba(255,255,255,0.05)',
    }}>
      {/* ── Baris atas: Logo + kontrol ── */}
      <div className={`${styles.navbarTop} cc-nav-top`} style={{
        height: '44px', display: 'flex',
        alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        gap: 8,
      }}>
        {/* Logo */}
        <span style={{ fontWeight: 800, fontSize: '14px', color: '#3b82d4', letterSpacing: '-0.3px', flexShrink: 0 }}>
          🏥 HealthSync CC
        </span>

        {/* Global Search Bar (trigger) */}
        <button
          onClick={onSearchOpen}
          aria-label="Buka pencarian global"
          style={{
            flex: 1, maxWidth: 320,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 12px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 8, cursor: 'pointer', color: '#9ca3af',
            fontSize: 12, transition: 'background 0.15s',
            textAlign: 'left',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.10)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; }}
        >
          <span>🔍</span>
          <span style={{ flex: 1 }}>Cari pasien, ambulans, RS... (Ctrl+K)</span>
          <kbd style={{ padding: '1px 5px', fontSize: 9, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 3, color: '#6b7280' }}>⌘K</kbd>
        </button>

        {/* Kanan: Status + kontrol */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          {/* Indikator koneksi */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 10, fontWeight: 600,
            color: backendOnline === null ? '#9ca3af' : backendOnline ? '#4ade80' : '#f87171',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
              background: backendOnline === null ? '#9ca3af' : backendOnline ? '#4ade80' : '#f87171',
              animation: backendOnline === true ? 'pulseDot 2s ease-in-out infinite' : 'none',
            }} />
            {backendOnline === null ? 'Sambung...' : backendOnline ? 'Online' : 'Offline'}
          </div>

          {/* Badge alert kritis */}
          {criticalCount > 0 && (
            <div style={{
              background: '#dc2626', color: '#fff',
              borderRadius: '999px', padding: '1px 7px',
              fontSize: 10, fontWeight: 800, lineHeight: 1.6,
              animation: 'pulseBadge 1.5s ease-in-out infinite',
              cursor: 'pointer',
            }}
              onClick={() => navigate('/alerts')}
              title="Lihat semua alert kritis"
            >
              {criticalCount} KRITIS
            </div>
          )}

          {/* Audit log button */}
          <button
            onClick={onAuditOpen}
            aria-label="Buka audit trail"
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 6, color: '#9ca3af', fontSize: 11,
              padding: '3px 8px', cursor: 'pointer',
            }}
            title="Audit Trail aktivitas"
          >
            📋
          </button>

          {/* Dark mode toggle */}
          <button
            onClick={toggleTheme}
            aria-label={isDark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 6, color: '#9ca3af', fontSize: 13,
              padding: '3px 8px', cursor: 'pointer',
            }}
            title={isDark ? 'Mode Terang' : 'Mode Gelap'}
          >
            {isDark ? '☀️' : '🌙'}
          </button>

          <span style={{ fontSize: '11px', color: '#9ca3af' }}>{user?.email}</span>
          <span style={{ fontSize: '10px', color: '#6b7280', background: '#374151', padding: '2px 6px', borderRadius: '4px' }}>
            {user?.role}
          </span>
          <button
            onClick={logout}
            aria-label="Keluar dari Command Center"
            style={{
              padding: '3px 9px', background: 'transparent',
              border: '1px solid #374151', borderRadius: '5px',
              color: '#d1d5db', fontSize: '11px', cursor: 'pointer',
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* ── Baris bawah: Navigasi ── */}
      <div className={`${styles.navbarBottom} cc-nav-bottom`} style={{
        height: '36px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          {NAV_BARIS_1.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end}
              style={({ isActive }) => navLinkStyle(isActive)}
            >
              {link.label}
            </NavLink>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          {NAV_BARIS_2.map((link) => {
            const alertLabel = link.isAlert && criticalCount > 0
              ? `⚠️ Alert (${criticalCount})`
              : link.label;
            return (
              <NavLink key={link.to} to={link.to} end={link.end}
                style={({ isActive }) => navLinkStyle(isActive, link.isAlert, link.isEmergency)}
              >
                {alertLabel}
              </NavLink>
            );
          })}
        </div>
      </div>

      <style>{`
        @keyframes pulseDot  { 0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.4);opacity:0.6} }
        @keyframes pulseBadge{ 0%,100%{opacity:1}50%{opacity:0.6} }
      `}</style>
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ProtectedRoute
// ─────────────────────────────────────────────────────────────────────────────

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const canAccess = user?.role === 'COMMAND_CENTER' || user?.role === 'ADMIN';
  return isAuthenticated && canAccess ? <>{children}</> : <Navigate to="/login" replace />;
}

// ─────────────────────────────────────────────────────────────────────────────
// AppShell — layout utama dengan state panel global
// ─────────────────────────────────────────────────────────────────────────────

function AppShell() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [auditOpen,  setAuditOpen]  = useState(false);
  const { error: toastError } = useToast();

  // Keyboard shortcut Ctrl+K / Cmd+K untuk search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Notify toast jika ada browser notification permission yang perlu di-request
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      setTimeout(() => {
        toastError(
          'Izinkan notifikasi browser agar tidak melewatkan alert kritis saat aplikasi diminimize.',
          'Aktifkan Notifikasi',
        );
      }, 3000);
    }
  }, [toastError]);

  return (
    <>
      {/* Panel global (lazy loaded, tidak crash halaman utama) */}
      {searchOpen && (
        <Suspense fallback={null}>
          <GlobalSearch onClose={() => setSearchOpen(false)} />
        </Suspense>
      )}
      {auditOpen && (
        <Suspense fallback={null}>
          <AuditLogPanel onClose={() => setAuditOpen(false)} />
        </Suspense>
      )}

      <div className={`${styles.layout} ${styles.appShell} cc-shell`} style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <NavBar
          onSearchOpen={() => setSearchOpen(true)}
          onAuditOpen={() => setAuditOpen(true)}
        />
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <main className={styles.main} style={{ flex: 1, overflow: 'auto' }}>
            <Routes>
              <Route path="/"                         element={<ErrorBoundary label="Overview"><OverviewPage /></ErrorBoundary>} />
              <Route path="/patients"                 element={<ErrorBoundary label="Pasien"><PatientsPage /></ErrorBoundary>} />
              <Route path="/consultations"            element={<ErrorBoundary label="Konsultasi"><ConsultationsPage /></ErrorBoundary>} />
              <Route path="/hospitals"                element={<ErrorBoundary label="Rumah Sakit"><HospitalsPage /></ErrorBoundary>} />
              <Route path="/alerts"                   element={<ErrorBoundary label="Alerts"><AlertsPage /></ErrorBoundary>} />
              <Route path="/ambulance"                element={<ErrorBoundary label="Ambulans"><AmbulancePage /></ErrorBoundary>} />
              <Route path="/referrals"                element={<ErrorBoundary label="Rujukan"><ReferralsPage /></ErrorBoundary>} />
              <Route path="/emergency"                element={<ErrorBoundary label="Darurat"><EmergencyPage /></ErrorBoundary>} />
              <Route path="/pharmacy"                 element={<ErrorBoundary label="Farmasi"><PharmacyPage /></ErrorBoundary>} />
              <Route path="/reports"                  element={<ErrorBoundary label="Laporan"><ReportsPage /></ErrorBoundary>} />
              {/* ── Command Center — fitur baru ── */}
              <Route path="/command-center"           element={<ErrorBoundary label="Command Center"><CommandCenterPage /></ErrorBoundary>} />
              <Route path="/command-center/live-map"  element={<ErrorBoundary label="Live Map"><LiveMapPage /></ErrorBoundary>} />
              <Route path="/command-center/hospitals" element={<ErrorBoundary label="Ketersediaan RS"><HospitalAvailabilityPage /></ErrorBoundary>} />
              <Route path="/command-center/integrations" element={<ErrorBoundary label="Integration Health"><IntegrationHealthPage /></ErrorBoundary>} />
            </Routes>
          </main>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// App Root
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ThemeProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            />
          </Routes>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
