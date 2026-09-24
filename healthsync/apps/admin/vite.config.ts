import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ─────────────────────────────────────────────────────────────────────────────
// Vite proxy — runs server-side, so target URLs must be reachable from the
// Vite process itself:
//   • In Docker: use Docker service names (e.g. http://auth-service:3001)
//   • Outside Docker (local dev): falls back to http://localhost:PORT
//
// VITE_*_TARGET env vars are injected by docker-compose.dev.yml.
// For each service we register TWO proxy prefixes:
//   /v1/<resource>  → API calls from axios clients (relative baseURL '')
//   /health/<slug>  → Health-check fetch() calls from DashboardPage
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
const INTEGRATION_TARGET  = process.env['VITE_INTEGRATION_TARGET']  ?? 'http://localhost:3010';
const IOT_TARGET          = process.env['VITE_IOT_TARGET']          ?? 'http://localhost:4001';
const ALERT_TARGET        = process.env['VITE_ALERT_TARGET']        ?? 'http://localhost:4002';

type ProxyOptions = { target: string; changeOrigin: boolean; rewrite?: (path: string) => string };

const proxy: Record<string, ProxyOptions> = {
  // ── API routes (axios, relative baseURL '') ──────────────────────────────
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
  '/v1/integrations':  { target: INTEGRATION_TARGET,  changeOrigin: true },
  '/v1/iot':           { target: IOT_TARGET,           changeOrigin: true },
  '/v1/alerts':        { target: ALERT_TARGET,         changeOrigin: true },
  '/v1/admin':         { target: AUTH_TARGET,          changeOrigin: true },

  // ── Health-check routes (DashboardPage fetch) ────────────────────────────
  // /health/<slug> → http://<service>:PORT/health  (rewrite strips the slug)
  '/health/auth':         { target: AUTH_TARGET,         changeOrigin: true, rewrite: () => '/health' },
  '/health/patient':      { target: PATIENT_TARGET,      changeOrigin: true, rewrite: () => '/health' },
  '/health/consultation': { target: CONSULTATION_TARGET, changeOrigin: true, rewrite: () => '/health' },
  '/health/prescription': { target: PRESCRIPTION_TARGET, changeOrigin: true, rewrite: () => '/health' },
  '/health/ambulance':    { target: AMBULANCE_TARGET,    changeOrigin: true, rewrite: () => '/health' },
  '/health/referral':     { target: REFERRAL_TARGET,     changeOrigin: true, rewrite: () => '/health' },
  '/health/hospital':     { target: HOSPITAL_TARGET,     changeOrigin: true, rewrite: () => '/health' },
  '/health/pharmacy':     { target: PHARMACY_TARGET,     changeOrigin: true, rewrite: () => '/health' },
  '/health/notification': { target: NOTIFICATION_TARGET, changeOrigin: true, rewrite: () => '/health' },
  '/health/integration':  { target: INTEGRATION_TARGET,  changeOrigin: true, rewrite: () => '/health' },
  '/health/iot':          { target: IOT_TARGET,           changeOrigin: true, rewrite: () => '/health' },
  '/health/alert':        { target: ALERT_TARGET,         changeOrigin: true, rewrite: () => '/health' },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: '0.0.0.0',
    proxy,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
