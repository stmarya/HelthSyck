import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

// ─────────────────────────────────────────────────────────────────────────────
// Token-refresh state (shared across all clients)
// ─────────────────────────────────────────────────────────────────────────────

let isRefreshing = false;
type RefreshSubscriber = {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
};
let refreshSubscribers: RefreshSubscriber[] = [];

function subscribeTokenRefresh(resolve: (token: string) => void, reject: (error: unknown) => void) {
  refreshSubscribers.push({ resolve, reject });
}

function onRefreshed(token: string) {
  refreshSubscribers.forEach(({ resolve }) => resolve(token));
  refreshSubscribers = [];
}

function onRefreshFailed(error: unknown) {
  refreshSubscribers.forEach(({ reject }) => reject(error));
  refreshSubscribers = [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-service axios instances
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Semua client menggunakan baseURL '' (string kosong) agar setiap request
// dikirim ke origin yang sama (localhost:5173), lalu Vite proxy meneruskan
// ke service yang tepat berdasarkan prefix path /v1/<resource>.
// Ini menghilangkan kebutuhan CORS header di setiap service.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = '';

// Refresh memakai client mentah agar request refresh tidak masuk interceptor
// 401 yang sama dan membuat deadlock.
const refreshClient = axios.create({
  baseURL: BASE,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

export const authClient = axios.create({
  baseURL: BASE,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

export const patientClient = axios.create({
  baseURL: BASE,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

export const consultationClient = axios.create({
  baseURL: BASE,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

export const alertClient = axios.create({
  baseURL: BASE,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

export const ambulanceClient = axios.create({
  baseURL: BASE,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

export const hospitalClient = axios.create({
  baseURL: BASE,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

export const referralClient = axios.create({
  baseURL: BASE,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

export const prescriptionClient = axios.create({
  baseURL: BASE,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

export const pharmacyClient = axios.create({
  baseURL: BASE,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// ─────────────────────────────────────────────────────────────────────────────
// Attach JWT + 401-refresh interceptors to every client
// ─────────────────────────────────────────────────────────────────────────────

function attachInterceptors(client: AxiosInstance) {
  client.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      const token = localStorage.getItem('hs_access_token');
      if (token) config.headers['Authorization'] = `Bearer ${token}`;
      return config;
    },
    (error) => Promise.reject(error),
  );

  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      if (!error.config) return Promise.reject(error);
      const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
      const isRefreshRequest = originalRequest.url?.includes('/v1/auth/refresh') === true;

      if (error.response?.status === 401 && !originalRequest._retry && !isRefreshRequest) {
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            subscribeTokenRefresh((token: string) => {
              originalRequest.headers['Authorization'] = `Bearer ${token}`;
              resolve(client(originalRequest));
            }, reject);
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const refreshToken = localStorage.getItem('hs_refresh_token');
          const { data } = await refreshClient.post('/v1/auth/refresh', { refreshToken });
          const newToken: string = data.data.accessToken;
          localStorage.setItem('hs_access_token', newToken);
          localStorage.setItem('hs_refresh_token', data.data.refreshToken);
          onRefreshed(newToken);
          originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
          return client(originalRequest);
        } catch (refreshError) {
          onRefreshFailed(refreshError);
          localStorage.removeItem('hs_access_token');
          localStorage.removeItem('hs_refresh_token');
          localStorage.removeItem('hs_user');
          window.location.assign('/login');
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }

      return Promise.reject(error);
    },
  );
}

[authClient, patientClient, consultationClient, alertClient, ambulanceClient, hospitalClient, referralClient, prescriptionClient, pharmacyClient]
  .forEach(attachInterceptors);

// ─────────────────────────────────────────────────────────────────────────────
// Default export kept for backward-compatibility with existing pages
// ─────────────────────────────────────────────────────────────────────────────

export default patientClient;
