import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

// Token helpers — sessionStorage limits persistence. Production should prefer
// httpOnly, same-site cookies managed by the backend.
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

// A shared promise prevents a refresh stampede. Every request that receives a
// 401 awaits the same refresh operation and can therefore be retried or
// rejected deterministically; no subscriber is left hanging when refresh fails.
let refreshPromise: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = tokenStore.getRefresh();
    if (!refreshToken) throw new Error('No refresh token available');

    const { data } = await rawAuthClient.post('/v1/auth/refresh', { refreshToken });
    const nextAccess = data?.data?.accessToken;
    const nextRefresh = data?.data?.refreshToken;
    if (typeof nextAccess !== 'string' || typeof nextRefresh !== 'string') {
      throw new Error('Refresh response did not contain valid tokens');
    }

    tokenStore.setTokens(nextAccess, nextRefresh);
    return nextAccess;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

// All clients use relative URLs so Vite's proxy remains the single routing
// layer in local development and Docker.
function makeClient(): AxiosInstance {
  return axios.create({
    baseURL: '',
    timeout: 15_000,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Raw auth client intentionally has no interceptors. A failed refresh must not
// recursively trigger another refresh attempt.
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
      const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
      const requestUrl = originalRequest?.url ?? '';
      const isRefreshRequest = requestUrl.includes('/v1/auth/refresh');

      if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isRefreshRequest) {
        originalRequest._retry = true;
        try {
          const newToken = await refreshAccessToken();
          originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
          return client(originalRequest);
        } catch {
          tokenStore.clear();
          if (window.location.pathname !== '/login') {
            window.location.replace('/login');
          }
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

export default authClient;
