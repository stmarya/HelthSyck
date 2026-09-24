import { useState, useCallback, useRef } from 'react';
import { patientClient, consultationClient, ambulanceClient, hospitalClient, referralClient } from '../api/client';

// ─── Tipe hasil search ────────────────────────────────────────────────────

export type SearchCategory = 'pasien' | 'konsultasi' | 'ambulans' | 'rujukan' | 'rumah_sakit';

export interface SearchResult {
  id: string;
  category: SearchCategory;
  title: string;
  subtitle: string;
  badge?: string;
  badgeColor?: string;
  navigateTo: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function patientToResult(p: { id: string; name: string; blood_type?: string; phone?: string | null }): SearchResult {
  return {
    id: p.id, category: 'pasien',
    title: p.name,
    subtitle: `Goldar: ${p.blood_type ?? '—'} · ${p.phone ?? 'No. HP tidak ada'}`,
    badge: 'Pasien', badgeColor: '#2563eb',
    navigateTo: '/patients',
  };
}

function consultationToResult(c: {
  id: string;
  patient_name?: string | null;
  patient_id: string;
  status: string;
  chief_complaint?: string | null;
}): SearchResult {
  return {
    id: c.id, category: 'konsultasi',
    title: c.patient_name ?? `Pasien ${c.patient_id.slice(0, 8)}`,
    subtitle: `Status: ${c.status} · Keluhan: ${c.chief_complaint ?? '—'}`,
    badge: 'Konsultasi', badgeColor: '#d97706',
    navigateTo: '/consultations',
  };
}

function ambulanceToResult(a: { id: string; plate_number: string; status: string; type: string }): SearchResult {
  return {
    id: a.id, category: 'ambulans',
    title: a.plate_number,
    subtitle: `Tipe: ${a.type} · Status: ${a.status}`,
    badge: 'Ambulans', badgeColor: '#10b981',
    navigateTo: '/ambulance',
  };
}

function hospitalToResult(h: { id: string; name: string; city: string; type: string }): SearchResult {
  return {
    id: h.id, category: 'rumah_sakit',
    title: h.name,
    subtitle: `Kota: ${h.city} · Tipe: ${h.type}`,
    badge: 'RS', badgeColor: '#7c3aed',
    navigateTo: '/hospitals',
  };
}

function referralToResult(r: {
  id: string;
  patient_id: string;
  status: string;
  urgency_level: string;
  reason?: string | null;
}): SearchResult {
  return {
    id: r.id, category: 'rujukan',
    title: `Rujukan ${r.id.slice(0, 8)}`,
    subtitle: `Status: ${r.status} · Urgensi: ${r.urgency_level} · ${r.reason ?? '—'}`,
    badge: 'Rujukan', badgeColor: '#0284c7',
    navigateTo: '/referrals',
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useGlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      // Cari ke semua service secara paralel, tidak crash jika salah satu gagal
      const [ptRes, csRes, ambRes, hsRes, refRes] = await Promise.allSettled([
        patientClient.get(`/v1/patients?search=${encodeURIComponent(trimmed)}&limit=5`),
        consultationClient.get(`/v1/consultations?limit=10`),
        ambulanceClient.get(`/v1/ambulances?limit=20`),
        hospitalClient.get(`/v1/hospitals?search=${encodeURIComponent(trimmed)}&limit=5`),
        referralClient.get(`/v1/referrals?limit=10`),
      ]);

      const all: SearchResult[] = [];

      if (ptRes.status === 'fulfilled') {
        const patients = (ptRes.value.data as { data: { patients?: Array<{ id: string; name: string; blood_type?: string; phone?: string | null }> } }).data?.patients ?? [];
        patients.forEach((p) => all.push(patientToResult(p)));
      }

      if (csRes.status === 'fulfilled') {
        const consultations = (csRes.value.data as { data: Array<{ id: string; patient_name?: string | null; patient_id: string; status: string; chief_complaint?: string | null }> }).data ?? [];
        consultations
          .filter((c) => (c.patient_name ?? '').toLowerCase().includes(trimmed.toLowerCase()))
          .slice(0, 3)
          .forEach((c) => all.push(consultationToResult(c)));
      }

      if (ambRes.status === 'fulfilled') {
        const ambulances = (ambRes.value.data as { data: Array<{ id: string; plate_number: string; status: string; type: string }> }).data ?? [];
        ambulances
          .filter((a) => a.plate_number.toLowerCase().includes(trimmed.toLowerCase()))
          .slice(0, 3)
          .forEach((a) => all.push(ambulanceToResult(a)));
      }

      if (hsRes.status === 'fulfilled') {
        const hospitals = (hsRes.value.data as { data: Array<{ id: string; name: string; city: string; type: string }> }).data ?? [];
        hospitals.forEach((h) => all.push(hospitalToResult(h)));
      }

      if (refRes.status === 'fulfilled') {
        const referrals = (refRes.value.data as { data: Array<{ id: string; patient_id: string; status: string; urgency_level: string; reason?: string | null }> }).data ?? [];
        referrals
          .filter((r) => r.reason?.toLowerCase().includes(trimmed.toLowerCase()) || r.id.includes(trimmed))
          .slice(0, 3)
          .forEach((r) => all.push(referralToResult(r)));
      }

      setResults(all.slice(0, 15));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQueryChange = useCallback((q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void search(q), 350);
  }, [search]);

  const clear = useCallback(() => {
    setQuery('');
    setResults([]);
  }, []);

  return { query, results, loading, setQuery: handleQueryChange, clear };
}
