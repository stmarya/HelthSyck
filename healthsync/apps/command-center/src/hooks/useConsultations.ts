import { useState, useEffect, useCallback } from 'react';
import { consultationClient } from '../api/client';

// ─── Tipe data sesuai schema consultation-service ─────────────────────────

export interface Consultation {
  id: string;
  patient_id: string;
  doctor_id: string;
  status: 'PENDING' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  chief_complaint: string | null;
  diagnosis: string | null;
  notes: string | null;
  symptom_data: unknown | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  patient_name: string | null;
  doctor_email: string | null;
}

export interface ConsultationsMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  timestamp: string;
}

export function useConsultations(pollIntervalMs = 15000) {
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [meta, setMeta] = useState<ConsultationsMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const LIMIT = 20;

  const fetchConsultations = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (statusFilter) params.set('status', statusFilter);
      const res = await consultationClient.get(`/v1/consultations?${params.toString()}`);
      // Response: { data: [...], meta: { page, limit, total, totalPages, timestamp } }
      const body = res.data as { data: Consultation[]; meta: ConsultationsMeta };
      setConsultations(body.data ?? []);
      setMeta(body.meta ?? null);
      setError(null);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setError(axiosErr.response?.data?.detail ?? 'Gagal memuat data konsultasi');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    void fetchConsultations();
    const interval = setInterval(() => void fetchConsultations(), pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchConsultations, pollIntervalMs]);

  const activeCount = consultations.filter((c) => c.status === 'IN_PROGRESS').length;
  const pendingCount = consultations.filter((c) => c.status === 'PENDING').length;

  return {
    consultations,
    meta,
    loading,
    error,
    page,
    setPage,
    statusFilter,
    setStatusFilter,
    activeCount,
    pendingCount,
    refetch: fetchConsultations,
  };
}
