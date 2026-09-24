import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import DashboardPage       from './pages/DashboardPage';
import UsersPage           from './pages/UsersPage';
import HospitalsPage       from './pages/HospitalsPage';
import AnalyticsPage       from './pages/AnalyticsPage';
import LoginPage           from './pages/LoginPage';
import HealthCheckPage     from './pages/HealthCheckPage';
import ActivityLogPage     from './pages/ActivityLogPage';
import MasterDataPage      from './pages/MasterDataPage';
import ConsultationsPage   from './pages/ConsultationsPage';
import PatientsPage        from './pages/PatientsPage';
import DoctorsPage         from './pages/DoctorsPage';
import PrescriptionsPage   from './pages/PrescriptionsPage';
import AmbulancesPage      from './pages/AmbulancesPage';
import ReferralsPage       from './pages/ReferralsPage';
import PharmacyPage                  from './pages/PharmacyPage';
import DrugCatalogPage               from './pages/DrugCatalogPage';
import PharmacyPrescriptionsPage     from './pages/PharmacyPrescriptionsPage';
import PharmacyReportsPage           from './pages/PharmacyReportsPage';
import BedManagementPage   from './pages/BedManagementPage';
import HospitalDoctorsPage from './pages/HospitalDoctorsPage';
import HospitalSearchPage  from './pages/HospitalSearchPage';
import AlertsPage          from './pages/AlertsPage';
import Sidebar             from './components/Sidebar';
import TopBar              from './components/TopBar';
import { ToastProvider }   from './components/Toast';
import { tokenStore, authClient } from './api/client';
import type { AdminUser, UserRole } from './types/admin';
import styles from './App.module.css';

// Re-export untuk import legacy (LoginPage.tsx menggunakan './App' untuk type UserRole)
export type { UserRole, AdminUser };

// ─────────────────────────────────────────────────────────────────────────────
// parseAdminUser — validasi & normalisasi objek raw menjadi AdminUser.
//
// Menangani DUA bentuk:
//  1. Raw API response dari POST /v1/auth/login → punya `userId` (bukan `id`)
//  2. AdminUser tersimpan dari sessionStorage   → punya `id` (bukan `userId`)
//
// Keduanya harus punya role === 'ADMIN'.
// ─────────────────────────────────────────────────────────────────────────────

function parseAdminUser(raw: unknown): AdminUser | null {
  if (raw === null || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const role  = data['role'];
  const email = data['email'];
  if (typeof email !== 'string' || role !== 'ADMIN') return null;

  // Bentuk 1 — API login response: { userId, email, role, ... }
  if (typeof data['userId'] === 'string') {
    return { id: data['userId'] as string, email, role: role as UserRole, name: typeof data['name'] === 'string' ? data['name'] : email };
  }
  // Bentuk 2 — AdminUser tersimpan: { id, email, role, name }
  if (typeof data['id'] === 'string') {
    return { id: data['id'] as string, email, role: role as UserRole, name: typeof data['name'] === 'string' ? data['name'] : email };
  }
  return null;
}

/** Route guard — redirect pengguna non-admin ke /login */
function RequireAdmin({ user, children }: { user: AdminUser; children: React.ReactNode }) {
  if (user.role !== 'ADMIN') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Kunci storage untuk preferensi dark mode
// ─────────────────────────────────────────────────────────────────────────────
const DARK_MODE_KEY = 'hs_admin_dark';
const COLLAPSED_KEY = 'hs_admin_sidebar_collapsed';

// ─────────────────────────────────────────────────────────────────────────────
// App — komponen root
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [user,      setUser]      = useState<AdminUser | null>(null);
  const [ready,     setReady]     = useState(false);
  const [darkMode,  setDarkMode]  = useState<boolean>(() => {
    return localStorage.getItem(DARK_MODE_KEY) === 'true';
  });
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    return localStorage.getItem(COLLAPSED_KEY) === 'true';
  });

  // Terapkan dark mode ke atribut data-theme pada <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem(DARK_MODE_KEY, String(darkMode));
  }, [darkMode]);

  // Restore session dari sessionStorage saat mount
  useEffect(() => {
    const stored = sessionStorage.getItem('hs_admin_user');
    const token  = tokenStore.getAccess();
    if (stored && token) {
      try {
        const parsed = parseAdminUser(JSON.parse(stored));
        if (parsed) setUser(parsed);
        else tokenStore.clear();
      } catch {
        tokenStore.clear();
      }
    }
    setReady(true);
  }, []);

  const handleLogin = useCallback((token: string, refreshToken: string, userData: unknown): boolean => {
    const validated = parseAdminUser(userData);
    if (!validated) return false;
    tokenStore.setTokens(token, refreshToken);
    sessionStorage.setItem('hs_admin_user', JSON.stringify(validated));
    setUser(validated);
    return true;
  }, []);

  const handleLogout = useCallback(() => {
    const refreshToken = tokenStore.getRefresh();
    if (refreshToken) {
      void authClient.post('/v1/auth/logout', { refreshToken }).catch(() => {});
    }
    tokenStore.clear();
    setUser(null);
  }, []);

  const handleToggleDarkMode = useCallback(() => {
    setDarkMode((prev) => !prev);
  }, []);

  const handleToggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSED_KEY, String(next));
      return next;
    });
  }, []);

  // Tampilkan layar loading saat sesi sedang dipulihkan
  if (!ready) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg)',
      }}>
        <div style={{ fontSize: 14, color: 'var(--color-muted)' }}>Memuat…</div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        {!user ? (
          /* ── Halaman Login (belum autentikasi) ── */
          <Routes>
            <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
            <Route path="*"      element={<Navigate to="/login" replace />} />
          </Routes>
        ) : (
          /* ── Layout Utama (sudah login) ── */
          <div className={`${styles.layout} ${collapsed ? styles.layoutCollapsed : ''}`}>
            {/* Sidebar navigasi kiri */}
            <Sidebar
              user={user}
              onLogout={handleLogout}
              collapsed={collapsed}
              onToggleCollapse={handleToggleCollapse}
            />

            {/* Area konten utama */}
            <div className={styles.content}>
              {/* Topbar dengan breadcrumb + dark mode toggle */}
              <TopBar
                user={user}
                darkMode={darkMode}
                onToggleDarkMode={handleToggleDarkMode}
              />

              {/* Halaman utama */}
              <main className={styles.main}>
                <Routes>
                  {/* ── Dashboard ── */}
                  <Route path="/" element={<RequireAdmin user={user}><DashboardPage /></RequireAdmin>} />

                  {/* ── Manajemen Pengguna ── */}
                  <Route path="/users"          element={<RequireAdmin user={user}><UsersPage /></RequireAdmin>} />
                  <Route path="/users/patients" element={<RequireAdmin user={user}><UsersPage defaultRole="PATIENT" title="Manajemen Pasien" /></RequireAdmin>} />
                  <Route path="/users/doctors"  element={<RequireAdmin user={user}><UsersPage defaultRole="DOCTOR"  title="Manajemen Dokter" /></RequireAdmin>} />
                  <Route path="/users/admins"   element={<RequireAdmin user={user}><UsersPage defaultRole="ADMIN"   title="Manajemen Admin" /></RequireAdmin>} />

                  {/* ── Konsultasi ── */}
                  <Route path="/consultations"         element={<RequireAdmin user={user}><ConsultationsPage /></RequireAdmin>} />
                  <Route path="/consultations/active"  element={<RequireAdmin user={user}><ConsultationsPage defaultStatus="IN_PROGRESS" title="Konsultasi Aktif" /></RequireAdmin>} />
                  <Route path="/consultations/history" element={<RequireAdmin user={user}><ConsultationsPage defaultStatus="COMPLETED"   title="Riwayat Konsultasi" /></RequireAdmin>} />

                  {/* ── Pasien & Dokter ── */}
                  <Route path="/patients"  element={<RequireAdmin user={user}><PatientsPage /></RequireAdmin>} />
                  <Route path="/doctors"   element={<RequireAdmin user={user}><DoctorsPage /></RequireAdmin>} />

                  {/* ── Resep & Ambulans ── */}
                  <Route path="/prescriptions" element={<RequireAdmin user={user}><PrescriptionsPage /></RequireAdmin>} />
                  <Route path="/ambulances"    element={<RequireAdmin user={user}><AmbulancesPage /></RequireAdmin>} />

                  {/* ── Rujukan ── */}
                  <Route path="/referrals"          element={<RequireAdmin user={user}><ReferralsPage /></RequireAdmin>} />

                  {/* ── Farmasi ── */}
                  <Route path="/pharmacy/drugs"         element={<RequireAdmin user={user}><DrugCatalogPage /></RequireAdmin>} />
                  <Route path="/pharmacy/prescriptions" element={<RequireAdmin user={user}><PharmacyPrescriptionsPage /></RequireAdmin>} />
                  <Route path="/pharmacy/reports"       element={<RequireAdmin user={user}><PharmacyReportsPage /></RequireAdmin>} />
                  <Route path="/pharmacy"               element={<RequireAdmin user={user}><PharmacyPage /></RequireAdmin>} />

                  {/* ── Fasilitas (sub-halaman) ── */}
                  <Route path="/hospitals/beds"      element={<RequireAdmin user={user}><BedManagementPage /></RequireAdmin>} />
                  <Route path="/hospitals/doctors"   element={<RequireAdmin user={user}><HospitalDoctorsPage /></RequireAdmin>} />
                  <Route path="/hospitals/search"    element={<RequireAdmin user={user}><HospitalSearchPage /></RequireAdmin>} />

                  {/* ── Monitoring ── */}
                  <Route path="/alerts"              element={<RequireAdmin user={user}><AlertsPage /></RequireAdmin>} />

                  {/* ── Fasilitas ── */}
                  <Route path="/hospitals" element={<RequireAdmin user={user}><HospitalsPage /></RequireAdmin>} />

                  {/* ── Analitik ── */}
                  <Route path="/analytics"         element={<RequireAdmin user={user}><AnalyticsPage /></RequireAdmin>} />
                  <Route path="/analytics/consult" element={<RequireAdmin user={user}><ConsultationsPage title="Laporan Konsultasi" /></RequireAdmin>} />

                  {/* ── Sistem ── */}
                  <Route path="/health"       element={<RequireAdmin user={user}><HealthCheckPage /></RequireAdmin>} />
                  <Route path="/logs"         element={<RequireAdmin user={user}><ActivityLogPage /></RequireAdmin>} />
                  <Route path="/master-data"  element={<RequireAdmin user={user}><MasterDataPage /></RequireAdmin>} />

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
            </div>
          </div>
        )}
      </BrowserRouter>
    </ToastProvider>
  );
}
