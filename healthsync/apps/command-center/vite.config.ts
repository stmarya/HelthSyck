import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ─────────────────────────────────────────────────────────────────────────────
// Vite Proxy — berjalan di sisi server Vite, bukan di browser.
// Sehingga target URL harus bisa dicapai oleh proses Vite itu sendiri:
//   • Di dalam Docker : gunakan nama service Docker (env VITE_*_TARGET)
//   • Di luar Docker  : fallback ke http://localhost:PORT
//
// Pola yang digunakan:
//   /v1/<resource>   → API call dari axios clients
//   /health/<slug>   → Health-check fetch() dari OverviewPage
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_TARGET         = process.env['VITE_AUTH_TARGET']         ?? 'http://localhost:3001';
const PATIENT_TARGET      = process.env['VITE_PATIENT_TARGET']      ?? 'http://localhost:3002';
const CONSULTATION_TARGET = process.env['VITE_CONSULTATION_TARGET'] ?? 'http://localhost:3003';
const PRESCRIPTION_TARGET = process.env['VITE_PRESCRIPTION_TARGET'] ?? 'http://localhost:3004';
const AMBULANCE_TARGET    = process.env['VITE_AMBULANCE_TARGET']    ?? 'http://localhost:3005';
const REFERRAL_TARGET     = process.env['VITE_REFERRAL_TARGET']     ?? 'http://localhost:3006';
const HOSPITAL_TARGET     = process.env['VITE_HOSPITAL_TARGET']     ?? 'http://localhost:3007';
const PHARMACY_TARGET     = process.env['VITE_PHARMACY_TARGET']     ?? 'http://localhost:3008';
const NOTIFICATION_TARGET = process.env['VITE_NOTIFICATION_TARGET'] ?? 'http://localhost:3009';
const IOT_TARGET          = process.env['VITE_IOT_TARGET']          ?? 'http://localhost:4001';
const ALERT_TARGET        = process.env['VITE_ALERT_TARGET']        ?? 'http://localhost:4002';
const REALTIME_TARGET     = process.env['VITE_REALTIME_TARGET']     ?? 'http://localhost:3011';

type ProxyEntry = { target: string; changeOrigin: boolean; rewrite?: (path: string) => string; ws?: boolean };

const proxy: Record<string, ProxyEntry> = {
  '/v1/auth':          { target: AUTH_TARGET,         changeOrigin: true },
  '/v1/patients':      { target: PATIENT_TARGET,      changeOrigin: true },
  '/v1/consultations': { target: CONSULTATION_TARGET, changeOrigin: true },
  '/v1/prescriptions': { target: PRESCRIPTION_TARGET, changeOrigin: true },
  '/v1/ambulances':    { target: AMBULANCE_TARGET,    changeOrigin: true },
  '/v1/referrals':     { target: REFERRAL_TARGET,     changeOrigin: true },
  '/v1/hospitals':     { target: HOSPITAL_TARGET,     changeOrigin: true },
  '/v1/doctors':       { target: HOSPITAL_TARGET,     changeOrigin: true },
  '/v1/pharmacies':    { target: PHARMACY_TARGET,     changeOrigin: true },
  '/v1/drugs':         { target: PHARMACY_TARGET,     changeOrigin: true },
  '/v1/notifications': { target: NOTIFICATION_TARGET, changeOrigin: true },
  '/v1/alerts':        { target: ALERT_TARGET,        changeOrigin: true },
  '/ws':               { target: REALTIME_TARGET,     changeOrigin: true, ws: true },
  '/health/auth':         { target: AUTH_TARGET,         changeOrigin: true, rewrite: () => '/health' },
  '/health/patient':      { target: PATIENT_TARGET,      changeOrigin: true, rewrite: () => '/health' },
  '/health/consultation': { target: CONSULTATION_TARGET, changeOrigin: true, rewrite: () => '/health' },
  '/health/prescription': { target: PRESCRIPTION_TARGET, changeOrigin: true, rewrite: () => '/health' },
  '/health/ambulance':    { target: AMBULANCE_TARGET,    changeOrigin: true, rewrite: () => '/health' },
  '/health/referral':     { target: REFERRAL_TARGET,     changeOrigin: true, rewrite: () => '/health' },
  '/health/hospital':     { target: HOSPITAL_TARGET,     changeOrigin: true, rewrite: () => '/health' },
  '/health/pharmacy':     { target: PHARMACY_TARGET,     changeOrigin: true, rewrite: () => '/health' },
  '/health/realtime':     { target: REALTIME_TARGET,     changeOrigin: true, rewrite: () => '/health' },
  '/health/notification': { target: NOTIFICATION_TARGET, changeOrigin: true, rewrite: () => '/health' },
  '/health/iot':          { target: IOT_TARGET,          changeOrigin: true, rewrite: () => '/health' },
  '/health/alert':        { target: ALERT_TARGET,        changeOrigin: true, rewrite: () => '/health' },
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: '0.0.0.0', proxy },
  build: { outDir: 'dist', sourcemap: true },
});
