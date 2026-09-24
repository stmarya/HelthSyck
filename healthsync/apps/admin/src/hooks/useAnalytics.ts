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
  // TODO: Replace with real endpoints when available
  userGrowthMock: { label: string; total: number; patients: number; doctors: number }[];
  consultationStatusMock: { name: string; value: number }[];
  topDoctorsMock: { name: string; consultations: number }[];
}

const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

// Mock data helpers — realistic approximations until dedicated endpoints exist
// TODO: Replace with real endpoint when available
function makeMockGrowth(): AnalyticsData['userGrowthMock'] {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep'];
  let total = 8; let patients = 5; let doctors = 2;
  return months.map((label) => {
    const addP = Math.floor(Math.random() * 3);
    const addD = Math.random() > 0.6 ? 1 : 0;
    patients += addP;
    doctors  += addD;
    total    += addP + addD + Math.floor(Math.random() * 2);
    return { label, total, patients, doctors };
  });
}

// TODO: Replace with real endpoint when available
function makeMockConsultStatus(total: number): AnalyticsData['consultationStatusMock'] {
  const completed  = Math.round(total * 0.6);
  const cancelled  = Math.round(total * 0.12);
  const inProgress = Math.round(total * 0.2);
  const pending    = total - completed - cancelled - inProgress;
  return [
    { name: 'Selesai',       value: completed },
    { name: 'Dibatalkan',    value: cancelled },
    { name: 'Sedang Berjalan', value: inProgress },
    { name: 'Menunggu',      value: Math.max(0, pending) },
  ];
}

// TODO: Replace with real endpoint when available
const TOP_DOCTORS_MOCK: AnalyticsData['topDoctorsMock'] = [
  { name: 'Dr Budi Santoso',  consultations: 45 },
  { name: 'Dr Siti Rahayu',   consultations: 38 },
  { name: 'Dr Ahmad Fauzi',   consultations: 32 },
  { name: 'Dr Dewi Kusuma',   consultations: 28 },
  { name: 'Dr Rizal Hakim',   consultations: 21 },
];

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

      const totalConsult = kpis.find((k) => k.metric === 'Consultations')?.current ?? 8;

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
          userGrowthMock: makeMockGrowth(),
          consultationStatusMock: makeMockConsultStatus(totalConsult),
          topDoctorsMock: TOP_DOCTORS_MOCK,
        });
        setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, []);

  return { data, loading, error };
}
