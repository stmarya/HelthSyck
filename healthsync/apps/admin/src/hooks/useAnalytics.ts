import { useState, useEffect } from 'react';
import { authClient, consultationClient } from '../api/client';
import type { RoleCount, KpiRow, DayCount } from '../types/admin';

// ─────────────────────────────────────────────────────────────────────────────
// useAnalytics — aggregates data from multiple endpoints
// ─────────────────────────────────────────────────────────────────────────────

export interface AnalyticsData {
  kpis: KpiRow[];
  consultationsByDay: { day: string; count: number }[];
  usersByRole: { name: string; value: number }[];
  userGrowth: { label: string; total: number; patients: number; doctors: number }[];
  userGrowthUnavailableReason?: string;
  consultationStatus: { name: string; value: number }[];
  consultationStatusUnavailableReason?: string;
  topDoctors: { name: string; consultations: number }[];
  topDoctorsUnavailableReason?: string;
}

const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export function useAnalytics() {
  const [data,    setData]    = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      const [consultResult, usersResult, kpiResult, pendingResult, inProgressResult, completedResult, cancelledResult] = await Promise.allSettled([
        consultationClient.get<{ data: DayCount[] }>('/v1/consultations/stats/weekly'),
        authClient.get<{ data: RoleCount[] }>('/v1/auth/users/stats/by-role'),
        authClient.get<{ data: KpiRow[] }>('/v1/admin/kpis'),
        consultationClient.get<{ meta?: { total?: number } }>('/v1/consultations?page=1&limit=1&status=PENDING'),
        consultationClient.get<{ meta?: { total?: number } }>('/v1/consultations?page=1&limit=1&status=IN_PROGRESS'),
        consultationClient.get<{ meta?: { total?: number } }>('/v1/consultations?page=1&limit=1&status=COMPLETED'),
        consultationClient.get<{ meta?: { total?: number } }>('/v1/consultations?page=1&limit=1&status=CANCELLED'),
      ]);

      if (cancelled) return;

      const consultsByDay =
        consultResult.status === 'fulfilled'
          ? (consultResult.value.data.data ?? []).map((d) => ({
              day: DAY_LABELS[d.day] ?? String(d.day),
              count: d.count,
            }))
          : [];

      const byRole =
        usersResult.status === 'fulfilled'
          ? (usersResult.value.data.data ?? []).map((r) => ({
              name: r.role.charAt(0) + r.role.slice(1).toLowerCase().replace(/_/g, ' '),
              value: r.count,
            }))
          : [];

      const kpis =
        kpiResult.status === 'fulfilled'
          ? (kpiResult.value.data.data ?? [])
          : [];

      const consultStatusResults = [pendingResult, inProgressResult, completedResult, cancelledResult];
      const hasConsultationStatus = consultStatusResults.every((result) => result.status === 'fulfilled');
      const getStatusTotal = (
        result: PromiseSettledResult<{ data: { meta?: { total?: number } } }>,
      ) => (result.status === 'fulfilled' ? result.value.data.meta?.total ?? 0 : 0);
      const consultationStatus = hasConsultationStatus
        ? [
            { name: 'Menunggu', value: getStatusTotal(pendingResult) },
            { name: 'Sedang Berjalan', value: getStatusTotal(inProgressResult) },
            { name: 'Selesai', value: getStatusTotal(completedResult) },
            { name: 'Dibatalkan', value: getStatusTotal(cancelledResult) },
          ]
        : [];

      const allFailed =
        consultResult.status === 'rejected' &&
        usersResult.status === 'rejected' &&
        kpiResult.status === 'rejected';

      if (!cancelled) {
        if (allFailed) {
          setError('Gagal memuat data analitik. Coba muat ulang halaman.');
        }
        setData({
          kpis,
          consultationsByDay: consultsByDay,
          usersByRole: byRole,
          userGrowth: [],
          userGrowthUnavailableReason: 'Data historis pertumbuhan pengguna belum tersedia dari backend.',
          consultationStatus,
          consultationStatusUnavailableReason: hasConsultationStatus
            ? undefined
            : 'Ringkasan status konsultasi belum tersedia dari backend.',
          topDoctors: [],
          topDoctorsUnavailableReason: 'Peringkat dokter berdasarkan jumlah konsultasi belum tersedia dari backend.',
        });
        setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, []);

  return { data, loading, error };
}
