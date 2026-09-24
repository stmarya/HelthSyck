import { useState, useEffect, useCallback } from 'react';
import { hospitalClient } from '../api/client';

// ─── Tipe data sesuai schema hospital-service ─────────────────────────────

export interface Hospital {
  id: string;
  name: string;
  type: string;
  address: string | null;
  city: string;
  province: string;
  phone: string | null;
  igd_phone: string | null;
  total_beds: number | null;
  available_beds: number | null;
  icu_total: number | null;
  icu_available: number | null;
  specializations: string[] | null;
  is_emt_partner: boolean;
  latitude: number | null;
  longitude: number | null;
}

export interface HospitalsMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  timestamp: string;
}

export function useHospitals(pollIntervalMs = 30000) {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [meta, setMeta] = useState<HospitalsMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const LIMIT = 20;

  const fetchHospitals = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (search) params.set('search', search);
      const res = await hospitalClient.get(`/v1/hospitals?${params.toString()}`);
      // Response: { data: [...], meta: {...} }
      const body = res.data as { data: Hospital[]; meta: HospitalsMeta };
      setHospitals(body.data ?? []);
      setMeta(body.meta ?? null);
      setError(null);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setError(axiosErr.response?.data?.detail ?? 'Gagal memuat data rumah sakit');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    void fetchHospitals();
    const interval = setInterval(() => void fetchHospitals(), pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchHospitals, pollIntervalMs]);

  const criticalCapacity = hospitals.filter((h) => {
    if (!h.available_beds || !h.total_beds) return false;
    return h.available_beds / h.total_beds < 0.2;
  }).length;

  return {
    hospitals,
    meta,
    loading,
    error,
    page,
    setPage,
    search,
    setSearch,
    criticalCapacity,
    refetch: fetchHospitals,
  };
}
