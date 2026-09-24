import { useState, useEffect, useCallback } from 'react';
import { alertClient } from '../api/client';

export interface Alert {
  id: string;
  patient_id: string;
  patient_name?: string;
  level: 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'FALSE_POSITIVE';
  trigger_metric: string;
  trigger_value: number;
  trigger_threshold: number;
  message: string;
  created_at: string;
  // alias lama untuk kompatibilitas (tidak ada di API, gunakan properti snake_case)
}

export function useAlerts(pollIntervalMs = 10000) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await alertClient.get('/v1/alerts/active');
      setAlerts((res.data.data as Alert[]) ?? []);
      setError(null);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setError(axiosErr.response?.data?.detail ?? 'Gagal memuat alerts');
    } finally {
      setLoading(false);
    }
  }, []);

  const acknowledgeAlert = useCallback(async (alertId: string) => {
    await alertClient.post(`/v1/alerts/${alertId}/acknowledge`);
    setAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, status: 'ACKNOWLEDGED' as const } : a)),
    );
  }, []);

  const resolveAlert = useCallback(async (alertId: string) => {
    await alertClient.post(`/v1/alerts/${alertId}/resolve`);
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  }, []);

  useEffect(() => {
    void fetchAlerts();
    const interval = setInterval(() => void fetchAlerts(), pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchAlerts, pollIntervalMs]);

  const criticalCount = alerts.filter((a) => a.level === 'LEVEL_3' && a.status === 'ACTIVE').length;
  const urgentCount = alerts.filter((a) => a.level === 'LEVEL_2' && a.status === 'ACTIVE').length;

  return {
    alerts,
    loading,
    error,
    criticalCount,
    urgentCount,
    acknowledgeAlert,
    resolveAlert,
    refetch: fetchAlerts,
  };
}
