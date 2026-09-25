import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import type { Courier, InventoryItem, Pharmacy, Prescription, PrescriptionStatus } from './types';

const client: AxiosInstance = axios.create({
  baseURL: '',
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

let refreshing = false;
let waiting: Array<(token: string) => void> = [];

export const tokenStore = {
  get access() { return sessionStorage.getItem('hs_pharmacy_access_token'); },
  get refresh() { return sessionStorage.getItem('hs_pharmacy_refresh_token'); },
  set(access: string, refresh: string) {
    sessionStorage.setItem('hs_pharmacy_access_token', access);
    sessionStorage.setItem('hs_pharmacy_refresh_token', refresh);
  },
  clear() {
    sessionStorage.removeItem('hs_pharmacy_access_token');
    sessionStorage.removeItem('hs_pharmacy_refresh_token');
    sessionStorage.removeItem('hs_pharmacy_user');
    sessionStorage.removeItem('hs_pharmacy_context');
  },
};

const rawAuth = axios.create({ baseURL: '', timeout: 15_000 });

client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (tokenStore.access) config.headers.Authorization = `Bearer ${tokenStore.access}`;
  return config;
});

client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const request = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (!request || error.response?.status !== 401 || request._retry) return Promise.reject(error);

    if (refreshing) {
      return new Promise((resolve) => {
        waiting.push((token) => {
          request.headers.Authorization = `Bearer ${token}`;
          resolve(client(request));
        });
      });
    }

    request._retry = true;
    refreshing = true;
    try {
      const response = await rawAuth.post('/v1/auth/refresh', { refreshToken: tokenStore.refresh });
      const data = response.data.data as { accessToken: string; refreshToken: string };
      tokenStore.set(data.accessToken, data.refreshToken);
      waiting.forEach((resolve) => resolve(data.accessToken));
      waiting = [];
      request.headers.Authorization = `Bearer ${data.accessToken}`;
      return client(request);
    } catch (refreshError) {
      tokenStore.clear();
      window.location.reload();
      return Promise.reject(refreshError);
    } finally {
      refreshing = false;
    }
  },
);

function data<T>(response: { data: { data: T } }): T {
  return response.data.data;
}

export async function login(email: string, password: string) {
  const response = await rawAuth.post('/v1/auth/login', { email, password });
  const payload = response.data.data as { userId: string; email: string; role: string; accessToken: string; refreshToken: string };
  if (payload.role !== 'PHARMACIST') {
    throw new Error('Akun ini bukan akun PHARMACIST.');
  }
  tokenStore.set(payload.accessToken, payload.refreshToken);
  sessionStorage.setItem('hs_pharmacy_user', JSON.stringify(payload));
  return payload;
}

export function logout() {
  tokenStore.clear();
}

export async function getMyPharmacy(): Promise<Pharmacy> {
  return data(await client.get('/v1/pharmacies/me'));
}

export async function getInventory(pharmacyId: string): Promise<InventoryItem[]> {
  return data(await client.get(`/v1/pharmacies/${pharmacyId}/inventory`));
}

export async function adjustStock(pharmacyId: string, drugId: string, delta: number, reason: string) {
  return data(await client.post(`/v1/pharmacies/${pharmacyId}/inventory/adjust`, { drugId, delta, reason }));
}

export async function getPrescriptions(params: {
  pharmacyId?: string;
  status?: PrescriptionStatus;
  page?: number;
  limit?: number;
} = {}): Promise<Prescription[]> {
  const response = await client.get('/v1/prescriptions', {
    params: { page: 1, limit: 100, ...params },
  });
  return (response.data.data ?? []) as Prescription[];
}

export async function getPrescription(id: string): Promise<Prescription> {
  return data(await client.get(`/v1/prescriptions/${id}`));
}

export async function transitionPrescription(id: string, action: 'confirm' | 'prepare' | 'ready') {
  return data(await client.put(`/v1/prescriptions/${id}/${action}`));
}

export async function getCouriers(): Promise<Courier[]> {
  return data(await client.get('/v1/delivery/couriers'));
}

export async function handoffDelivery(
  prescriptionId: string,
  courierId: string,
  trackingCode: string,
  estimatedDelivery: string,
) {
  return data(await client.put(`/v1/prescriptions/${prescriptionId}/deliver`, {
    courierId,
    trackingCode,
    estimatedDelivery,
  }));
}

export async function checkHealth() {
  const [auth, pharmacy, prescription] = await Promise.allSettled([
    fetch('/health/auth').then((r) => r.ok),
    fetch('/health/pharmacy').then((r) => r.ok),
    fetch('/health/prescription').then((r) => r.ok),
  ]);
  return [auth, pharmacy, prescription].every((item) => item.status === 'fulfilled' && item.value);
}

export function apiError(error: unknown): string {
  const axiosError = error as AxiosError<{ detail?: string; title?: string }>;
  return axiosError.response?.data?.detail
    ?? axiosError.response?.data?.title
    ?? (error instanceof Error ? error.message : 'Terjadi kesalahan pada server');
}