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
  userGrowthMock: { label: string; total: number; patients: number; doctors: number }[];
  consultationStatusMock: { name: string; value: number }[];
  topDoctorsMock: { name: string; consultations: number }[];
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

      const [consultResult, usersResult, kpiResult] = await Promise.allSettled([
        consultationClient.get<{ data: DayCount[] }>('/v1/consultations/stats/weekly'),
        authClient.get<{ data: RoleCount[] }>('/v1/auth/users/stats/by-role'),
        authClient.get<{ data: KpiRow[] }>('/v1/admin/kpis'),
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
          // These charts stay empty until their backend aggregations exist.
          // Never synthesize operational data for an admin dashboard.
          userGrowthMock: [],
          consultationStatusMock: [],
          topDoctorsMock: [],
        });
        setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, []);

  return { data, loading, error };
}
