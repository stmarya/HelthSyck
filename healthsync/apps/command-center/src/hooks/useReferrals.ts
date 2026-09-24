import { useState, useEffect, useCallback } from 'react';
import { referralClient } from '../api/client';

// ─── Tipe data sesuai schema referral-service ─────────────────────────────

export interface Referral {
  id: string;
  patient_id: string;
  from_hospital_id: string | null;
  to_hospital_id: string | null;
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'IN_TRANSIT' | 'ARRIVED' | 'CANCELLED';
  urgency_level: 'NORMAL' | 'URGENT' | 'CRITICAL';
  reason: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  created_at: string;
}

export interface ReferralsMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  timestamp: string;
}

export function useReferrals(pollIntervalMs = 15000) {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [meta, setMeta] = useState<ReferralsMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState('');
  const LIMIT = 20;

  const fetchReferrals = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (statusFilter)  params.set('status', statusFilter);
      if (urgencyFilter) params.set('urgencyLevel', urgencyFilter);
      const res = await referralClient.get(`/v1/referrals?${params.toString()}`);
      // Response: { data: [...], meta: { page, limit, total, ... } }
      const body = res.data as { data: Referral[]; meta: ReferralsMeta };
      setReferrals(body.data ?? []);
      setMeta(body.meta ?? null);
      setError(null);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setError(axiosErr.response?.data?.detail ?? 'Gagal memuat data rujukan');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, urgencyFilter]);

  useEffect(() => {
    void fetchReferrals();
    const interval = setInterval(() => void fetchReferrals(), pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchReferrals, pollIntervalMs]);

  const emergencyCount = referrals.filter((r) => r.urgency_level === 'CRITICAL').length;
  const inTransitCount = referrals.filter((r) => r.status === 'IN_TRANSIT').length;

  return {
    referrals,
    meta,
    loading,
    error,
    page,
    setPage,
    statusFilter,
    setStatusFilter,
    urgencyFilter,
    setUrgencyFilter,
    emergencyCount,
    inTransitCount,
    refetch: fetchReferrals,
  };
}
