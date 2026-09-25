import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const AUTH_TARGET = process.env['VITE_AUTH_TARGET'] ?? 'http://localhost:3001';
const PRESCRIPTION_TARGET = process.env['VITE_PRESCRIPTION_TARGET'] ?? 'http://localhost:3004';
const PHARMACY_TARGET = process.env['VITE_PHARMACY_TARGET'] ?? 'http://localhost:3008';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    host: '0.0.0.0',
    proxy: {
      '/v1/auth': { target: AUTH_TARGET, changeOrigin: true },
      '/v1/prescriptions': { target: PRESCRIPTION_TARGET, changeOrigin: true },
      '/v1/deliveries': { target: PRESCRIPTION_TARGET, changeOrigin: true },
      '/v1/delivery': { target: PRESCRIPTION_TARGET, changeOrigin: true },
      '/v1/pharmacies': { target: PHARMACY_TARGET, changeOrigin: true },
      '/v1/drugs': { target: PHARMACY_TARGET, changeOrigin: true },
      '/health/auth': { target: AUTH_TARGET, changeOrigin: true, rewrite: () => '/health' },
      '/health/prescription': { target: PRESCRIPTION_TARGET, changeOrigin: true, rewrite: () => '/health' },
      '/health/pharmacy': { target: PHARMACY_TARGET, changeOrigin: true, rewrite: () => '/health' },
    },
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});