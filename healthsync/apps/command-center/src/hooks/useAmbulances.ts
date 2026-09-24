import { useState, useEffect, useCallback } from 'react';
import { ambulanceClient } from '../api/client';

// ─── Tipe data sesuai schema ambulance-service (snake_case dari DB) ───────

export interface Ambulance {
  id: string;
  plate_number: string;
  type: string;
  status: 'OFFLINE' | 'AVAILABLE' | 'DISPATCHED' | 'EN_ROUTE' | 'AT_SCENE' | 'TRANSPORTING' | 'RETURNING';
  hospital_id: string | null;
  driver_id: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  heading: string | number | null;
  speed_kmh: string | number | null;
  last_location_at: string | null;
  hospital_name: string | null;
  driver_phone: string | null;
}

export function useAmbulances(pollIntervalMs = 15000) {
  const [ambulances, setAmbulances] = useState<Ambulance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAmbulances = useCallback(async () => {
    try {
      const res = await ambulanceClient.get('/v1/ambulances?limit=50');
      // Response: { data: [...], meta: {...} }
      const body = res.data as { data: Ambulance[] };
      setAmbulances(body.data ?? []);
      setError(null);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setError(axiosErr.response?.data?.detail ?? 'Gagal memuat data ambulans');
    } finally {
      setLoading(false);
    }
  }, []);

  const dispatch = useCallback(
    async (ambulanceId: string, patientId: string, destination: string) => {
      const res = await ambulanceClient.post(`/v1/ambulances/${ambulanceId}/dispatch`, {
        patientId,
        destination,
      });
      await fetchAmbulances();
      return res.data.data;
    },
    [fetchAmbulances],
  );

  useEffect(() => {
    void fetchAmbulances();
    const interval = setInterval(() => void fetchAmbulances(), pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchAmbulances, pollIntervalMs]);

  const available = ambulances.filter((a) => a.status === 'AVAILABLE');
  const dispatched = ambulances.filter((a) =>
    ['DISPATCHED', 'EN_ROUTE', 'AT_SCENE', 'TRANSPORTING'].includes(a.status),
  );
  const offline = ambulances.filter((a) => a.status === 'OFFLINE' || a.status === 'RETURNING');

  return { ambulances, available, dispatched, offline, loading, error, dispatch, refetch: fetchAmbulances };
}
