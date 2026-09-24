import { useState, useEffect, useCallback } from 'react';
import { patientClient } from '../api/client';

// ─── Tipe data sesuai schema patient-service ───────────────────────────────

export interface Patient {
  id: string;
  user_id: string;
  name: string;
  date_of_birth: string;
  blood_type: string;
  gender: string;
  phone?: string;
  created_at: string;
}

export interface PatientVital {
  id: string;
  patient_id: string;
  heart_rate: number | null;
  spo2: string | null;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  temperature: number | null;
  recorded_at: string;
  source: string;
}

export interface PatientsMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function usePatients(pollIntervalMs = 15000) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [meta, setMeta] = useState<PatientsMeta>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const LIMIT = 20;

  const fetchPatients = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (search) params.set('search', search);
      const res = await patientClient.get(`/v1/patients?${params.toString()}`);
      // Response: { data: { patients: [...], meta: {...} } }
      const body = res.data as { data: { patients: Patient[]; meta: PatientsMeta } };
      setPatients(body.data?.patients ?? []);
      setMeta(body.data?.meta ?? { page: 1, limit: LIMIT, total: 0, totalPages: 0 });
      setError(null);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setError(axiosErr.response?.data?.detail ?? 'Gagal memuat data pasien');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    void fetchPatients();
    const interval = setInterval(() => void fetchPatients(), pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchPatients, pollIntervalMs]);

  return { patients, meta, loading, error, page, setPage, search, setSearch, refetch: fetchPatients };
}

// ─── Hook untuk mengambil vital terbaru SATU pasien (tetap tersedia utk kompatibilitas) ──

export function usePatientLatestVital(patientId: string | null) {
  const [vital, setVital] = useState<PatientVital | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!patientId) return;
    setLoading(true);
    patientClient.get(`/v1/patients/${patientId}/vitals/latest`)
      .then((res) => {
        const body = res.data as { data: PatientVital };
        setVital(body.data ?? null);
      })
      .catch(() => setVital(null))
      .finally(() => setLoading(false));
  }, [patientId]);

  return { vital, loading };
}

// ─── Hook batch: ambil vital semua pasien sekaligus (anti N+1) ──────────
// Menggantikan pemanggilan usePatientLatestVital per-baris di tabel

export function usePatientVitalsBatch(patientIds: string[]) {
  // Map<patientId, PatientVital | null>
  const [vitalMap, setVitalMap] = useState<Map<string, PatientVital | null>>(new Map());
  const [loading, setLoading] = useState(false);

  // Buat key stabil dari array IDs agar effect tidak re-run terus
  const idsKey = patientIds.join(',');

  useEffect(() => {
    if (patientIds.length === 0) {
      setVitalMap(new Map());
      return;
    }
    setLoading(true);
    // Kirim semua request secara paralel dengan Promise.allSettled (tidak abort jika satu gagal)
    Promise.allSettled(
      patientIds.map((id) =>
        patientClient
          .get(`/v1/patients/${id}/vitals/latest`)
          .then((res) => ({ id, vital: (res.data as { data: PatientVital }).data ?? null }))
          .catch(() => ({ id, vital: null }))
      )
    ).then((results) => {
      const map = new Map<string, PatientVital | null>();
      for (const r of results) {
        if (r.status === 'fulfilled') {
          map.set(r.value.id, r.value.vital);
        }
      }
      setVitalMap(map);
    }).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return { vitalMap, loading };
}
