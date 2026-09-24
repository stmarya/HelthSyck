import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

// ─────────────────────────────────────────────────────────────────────────────
// Token helpers — sessionStorage keeps tokens out of persistent XSS reach;
// for production, prefer httpOnly cookies managed by the backend.
// ─────────────────────────────────────────────────────────────────────────────

export const tokenStore = {
  getAccess:   () => sessionStorage.getItem('hs_admin_access_token'),
  getRefresh:  () => sessionStorage.getItem('hs_admin_refresh_token'),
  setTokens:   (access: string, refresh: string) => {
    sessionStorage.setItem('hs_admin_access_token', access);
    sessionStorage.setItem('hs_admin_refresh_token', refresh);
  },
  clear: () => {
    sessionStorage.removeItem('hs_admin_access_token');
    sessionStorage.removeItem('hs_admin_refresh_token');
    sessionStorage.removeItem('hs_admin_user');
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Token-refresh state (shared across all clients)
// ─────────────────────────────────────────────────────────────────────────────

let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

function onRefreshFailed() {
  // Drain the queue so no request hangs forever
  refreshSubscribers = [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-service axios instances
// Ports are sourced from README.md / docker-compose.dev.yml (authoritative):
//   auth:3001  patient:3002  consultation:3003  prescription:3004
//   ambulance:3005  referral:3006  hospital:3007  pharmacy:3008
//   notification:3009  integration:3010  iot-ingestion:4001  alert:4002
// ─────────────────────────────────────────────────────────────────────────────

// All axios clients use an EMPTY baseURL so every request is sent as a
// relative path (e.g. /v1/auth/login).  In the browser this resolves against
// the current origin — which is the Vite dev-server — and Vite's proxy rules
// forward /v1/* to the correct backend service.
// Never use absolute http://localhost:PORT here; that would bypass the proxy
// and cause CORS errors when running inside Docker.
function makeClient(): AxiosInstance {
  return axios.create({
    baseURL: '',
    timeout: 15_000,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Raw auth client — NO interceptors attached.
// Used exclusively inside the refresh interceptor to avoid an infinite 401 loop:
// if the refresh endpoint itself returns 401, we must NOT re-enter the interceptor.
const rawAuthClient = makeClient();

export const authClient         = makeClient();
export const patientClient      = makeClient();
export const consultationClient = makeClient();
export const prescriptionClient = makeClient();
export const ambulanceClient    = makeClient();
export const referralClient     = makeClient();
export const hospitalClient     = makeClient();
export const pharmacyClient     = makeClient();
export const notificationClient = makeClient();
export const integrationClient  = makeClient();
export const alertClient        = makeClient();

// ─────────────────────────────────────────────────────────────────────────────
// Attach JWT + 401-refresh interceptors to every client
// ─────────────────────────────────────────────────────────────────────────────

function attachInterceptors(client: AxiosInstance) {
  client.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      const token = tokenStore.getAccess();
      if (token) config.headers['Authorization'] = `Bearer ${token}`;
      return config;
    },
    (error) => Promise.reject(error),
  );

  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

      if (error.response?.status === 401 && !originalRequest._retry) {
        if (isRefreshing) {
          return new Promise((resolve) => {
            subscribeTokenRefresh((token: string) => {
              originalRequest.headers['Authorization'] = `Bearer ${token}`;
              resolve(client(originalRequest));
            });
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const refreshToken = tokenStore.getRefresh();
          // Use rawAuthClient (no interceptors) to avoid an infinite 401 loop
          // if the refresh endpoint itself returns 401.
          const { data } = await rawAuthClient.post('/v1/auth/refresh', { refreshToken });
          const newToken: string = data.data.accessToken;
          tokenStore.setTokens(newToken, data.data.refreshToken);
          onRefreshed(newToken);
          originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
          return client(originalRequest);
        } catch {
          onRefreshFailed();
          tokenStore.clear();
          window.location.href = '/login';
          return Promise.reject(error);
        } finally {
          isRefreshing = false;
        }
      }

      return Promise.reject(error);
    },
  );
}

[
  authClient, patientClient, consultationClient, prescriptionClient,
  ambulanceClient, referralClient, hospitalClient, pharmacyClient,
  notificationClient, integrationClient, alertClient,
].forEach(attachInterceptors);

// Default export — auth client for login/register calls
export default authClient;
