import { useCallback, useEffect, useState } from 'react';
import { authClient, pharmacyClient } from '../api/client';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import { SelectField } from '../components/FormField';
import styles from './Page.module.css';

interface Pharmacy {
  id: string;
  name: string;
  address: string;
}

interface Pharmacist {
  id: string;
  email: string;
  phone?: string | null;
}

interface StaffAssignment {
  id: string;
  userId: string;
  email: string;
  phone?: string | null;
  staffRole: string;
  isActive: boolean;
  createdAt: string;
}

function errorMessage(error: unknown, fallback: string): string {
  return (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    ?? (error instanceof Error ? error.message : fallback);
}

export default function PharmacyStaffPage() {
  const { showToast } = useToast();
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [pharmacists, setPharmacists] = useState<Pharmacist[]>([]);
  const [assignments, setAssignments] = useState<StaffAssignment[]>([]);
  const [selectedPharmacyId, setSelectedPharmacyId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadBaseData = useCallback(async () => {
    setLoading(true);
    try {
      const [pharmacyResponse, pharmacistResponse] = await Promise.all([
        pharmacyClient.get<{ data: Pharmacy[] }>('/v1/pharmacies?page=1&limit=100'),
        authClient.get<{ data: Pharmacist[] }>(
          '/v1/auth/admin/users?page=1&limit=100&role=PHARMACIST&status=ACTIVE',
        ),
      ]);
      const nextPharmacies = pharmacyResponse.data.data ?? [];
      setPharmacies(nextPharmacies);
      setPharmacists(pharmacistResponse.data.data ?? []);
      setSelectedPharmacyId((current) => current || nextPharmacies[0]?.id || '');
    } catch (error) {
      showToast(errorMessage(error, 'Gagal memuat data assignment apoteker'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadAssignments = useCallback(async () => {
    if (!selectedPharmacyId) {
      setAssignments([]);
      return;
    }
    setLoadingStaff(true);
    try {
      const response = await pharmacyClient.get<{ data: StaffAssignment[] }>(
        `/v1/pharmacies/${selectedPharmacyId}/staff`,
      );
      setAssignments(response.data.data ?? []);
    } catch (error) {
      showToast(errorMessage(error, 'Gagal memuat assignment apoteker'), 'error');
      setAssignments([]);
    } finally {
      setLoadingStaff(false);
    }
  }, [selectedPharmacyId, showToast]);

  useEffect(() => { void loadBaseData(); }, [loadBaseData]);
  useEffect(() => { void loadAssignments(); }, [loadAssignments]);

  const assignPharmacist = async () => {
    if (!selectedPharmacyId || !selectedUserId) {
      showToast('Pilih apotek dan akun apoteker terlebih dahulu', 'warning');
      return;
    }
    setSaving(true);
    try {
      await pharmacyClient.put(`/v1/pharmacies/${selectedPharmacyId}/staff`, {
        userId: selectedUserId,
        isActive: true,
      });
      setSelectedUserId('');
      showToast('Apoteker berhasil ditugaskan', 'success');
      await loadAssignments();
    } catch (error) {
      showToast(errorMessage(error, 'Gagal menugaskan apoteker'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const deactivateAssignment = async (assignment: StaffAssignment) => {
    if (!window.confirm(`Nonaktifkan assignment ${assignment.email}?`)) return;
    try {
      await pharmacyClient.delete(
        `/v1/pharmacies/${selectedPharmacyId}/staff/${assignment.userId}`,
      );
      showToast('Assignment dinonaktifkan', 'success');
      await loadAssignments();
    } catch (error) {
      showToast(errorMessage(error, 'Gagal menonaktifkan assignment'), 'error');
    }
  };

  const assignedUserIds = new Set(assignments.filter((item) => item.isActive).map((item) => item.userId));
  const availablePharmacists = pharmacists.filter((item) => !assignedUserIds.has(item.id));

  return (
    <div className={styles.page}>
      <PageHeader
        title="Assignment Apoteker"
        subtitle="Hubungkan akun apoteker aktif dengan apotek yang dikelolanya"
        breadcrumbs={[
          { label: 'Dashboard', to: '/' },
          { label: 'Farmasi', to: '/pharmacy' },
          { label: 'Assignment Apoteker' },
        ]}
      />

      <div className={styles.card}>
        <div className={styles.cardTitle}>Pilih apotek</div>
        <SelectField
          label="Apotek"
          value={selectedPharmacyId}
          onChange={(event) => setSelectedPharmacyId(event.target.value)}
          disabled={loading || pharmacies.length === 0}
          options={pharmacies.map((pharmacy) => ({
            value: pharmacy.id,
            label: `${pharmacy.name} — ${pharmacy.address}`,
          }))}
          placeholder={loading ? 'Memuat apotek…' : 'Pilih apotek'}
        />
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitle}>Tambah apoteker</div>
          <span>{assignments.filter((item) => item.isActive).length} aktif</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 280, flex: '1 1 320px' }}>
            <SelectField
              label="Akun apoteker aktif"
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              disabled={!selectedPharmacyId || availablePharmacists.length === 0}
              options={availablePharmacists.map((pharmacist) => ({
                value: pharmacist.id,
                label: pharmacist.phone ? `${pharmacist.email} — ${pharmacist.phone}` : pharmacist.email,
              }))}
              placeholder={availablePharmacists.length ? 'Pilih akun' : 'Semua apoteker sudah ditugaskan'}
            />
          </div>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => void assignPharmacist()} disabled={saving}>
            {saving ? 'Menyimpan…' : '＋ Tugaskan'}
          </button>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Assignment saat ini</div>
        {loadingStaff ? (
          <div className={styles.emptyState}>Memuat assignment…</div>
        ) : assignments.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateIcon}>👤</div>
            <div className={styles.emptyStateTitle}>Belum ada assignment</div>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={`${styles.table} ${styles.tableHover}`}>
              <thead>
                <tr><th>Email</th><th>Telepon</th><th>Status</th><th>Aksi</th></tr>
              </thead>
              <tbody>
                {assignments.map((assignment) => (
                  <tr key={assignment.id}>
                    <td>{assignment.email}</td>
                    <td>{assignment.phone ?? '—'}</td>
                    <td>{assignment.isActive ? 'Aktif' : 'Nonaktif'}</td>
                    <td>
                      {assignment.isActive && (
                        <button
                          className={`${styles.btn} ${styles.btnDangerOutline}`}
                          onClick={() => void deactivateAssignment(assignment)}
                        >
                          Nonaktifkan
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}