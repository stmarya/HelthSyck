# Plan: Audit Menyeluruh & Implementasi Admin Panel HealthSync

## Ringkasan

Audit komprehensif seluruh 14 halaman Admin Panel (`healthsync/apps/admin/src/`) mencakup:
- Bug hunting & perbaikan
- Peningkatan kelengkapan data (field coverage)
- Integrasi antar layanan
- Penambahan fitur baru berstandar industri health-tech
- Semua respons, komentar kode, dan label UI dalam Bahasa Indonesia

**Prinsip implementasi:**
- TypeScript strict — zero error `npx tsc --noEmit`
- Gunakan komponen reusable: `Modal` (prop `open`, `width`), `{ Skeleton }`, `showToast(message, type)`, `ConfirmDialog` dari `Modal.tsx`
- CSS Modules + design tokens (`var(--color-*)`, `var(--space-*)`)
- `PageHeader` dengan prop `actions` (bukan `action`)
- Setiap aksi destruktif wajib `ConfirmDialog`

---

## Sub-Task 1 — DashboardPage

**Status:** [ ] pending

### Intent
Perbaiki Dashboard agar menampilkan data real-time yang lebih lengkap, KPI yang actionable, dan quick actions untuk operasional harian.

### Bug Ditemukan
- `RecentUsersTable` menggunakan `void async` tanpa error handling — crash silent
- KPI `totalUsers` mengambil `New Users` (bukan total), nilai tidak akurat
- `DAY_LABELS[d.day]` bisa undefined jika `d.day > 6`
- Semua layout menggunakan inline styles (tidak pakai `var(--space-*)`)
- Link `href="/users"` dan `href="/health"` harus pakai `<Link to=...>` dari react-router

### Enhancement
1. Tambah 2 KPI baru: Total Ambulans Aktif (dari `/v1/ambulances`) + Total Referral Aktif (dari `/v1/referrals?status=SENT,ACCEPTED`)
2. Tambah "Aktivitas Terkini" section (5 referral + 5 resep terbaru)
3. Perbaiki label KPI: "Total Pengguna" ambil dari `usersByRole` sum semua role
4. Tambah quick nav buttons ke halaman operasional kritis
5. Perbaiki error handling di `RecentUsersTable`

### Expected Outcomes
- Dashboard menampilkan 8 KPI cards (6 sekarang + 2 baru)
- Semua data real-time, tidak ada silent failure
- `npx tsc --noEmit` zero error

### Relevant Files
- `healthsync/apps/admin/src/pages/DashboardPage.tsx`
- `healthsync/apps/admin/src/hooks/useAnalytics.ts`
- `healthsync/apps/admin/src/api/client.ts` (ambulanceClient, referralClient)

---

## Sub-Task 2 — UsersPage

**Status:** [ ] pending

### Intent
Perbaiki bug error handling, tambahkan fitur edit status pengguna, dan tampilkan lebih banyak informasi.

### Bug Ditemukan
- Error casting `(err as { response?: { data?: { detail?: string } } })` — fragile, sebaiknya pakai AxiosError
- `fetchUsers` dipanggil langsung tanpa `useCallback` dependency yang benar
- Bulk actions: konfirmasi dialog ada tapi action tidak di-implementasikan (hanya toast)
- `debounceRef` ada tapi debounce logic tidak complete — `searchQuery` tidak di-update dari `searchInput`

### Enhancement
1. Perbaiki debounce: input delay 400ms sebelum set `searchQuery`
2. Tambah tombol "Edit Status" di modal detail → PATCH `/v1/auth/admin/users/:id` dengan status baru
3. Tambah kolom "Email Verified" di tabel
4. Perbaiki error extraction menggunakan helper function

### Expected Outcomes
- Debounce berjalan, search tidak spam request setiap keystroke
- Admin bisa mengubah status user dari ACTIVE/INACTIVE/SUSPENDED
- `npx tsc --noEmit` zero error

### Relevant Files
- `healthsync/apps/admin/src/pages/UsersPage.tsx`
- `healthsync/services/auth-service/src/index.ts` (cek PATCH endpoint)

---

## Sub-Task 3 — DoctorsPage

**Status:** [ ] pending

### Intent
Dokter sekarang menampilkan data lengkap dari `/v1/doctors`. Tambahkan filter spesialisasi, sort by rating, dan tampilkan availability toggle.

### Bug Ditemukan
- `search` field tidak ter-debounce — request dikirim setiap karakter
- `STATUS_STYLE` tipe `Record<string, React.CSSProperties>` tapi di badge masih ada casting lama

### Enhancement
1. Tambah debounce 400ms pada search
2. Tambah filter dropdown: Spesialisasi, Ketersediaan (tersedia/tidak)
3. Tambah kolom "Pengalaman" di tabel
4. Tambah sort by: rating, biaya konsultasi
5. Tampilkan "Dokter Tersedia Sekarang" count sebagai stat card

### Expected Outcomes
- Filter spesialisasi berjalan (ambil dari data yang sudah ada)
- Sort by rating bekerja
- `npx tsc --noEmit` zero error

### Relevant Files
- `healthsync/apps/admin/src/pages/DoctorsPage.tsx`

---

## Sub-Task 4 — PatientsPage

**Status:** [ ] pending

### Intent
Perbaiki client-side search, tambah filter gender/blood type, dan perkaya modal detail.

### Bug Ditemukan
- `calcAge` belum ada definisinya (akan error runtime jika dipanggil)
- Search filtering post-fetch tidak efisien — filter di server
- Nested response `res.data.data.patients` rapuh jika shape berubah

### Enhancement
1. Tambah filter: Gender, Blood Type
2. Tambah stat cards: Total Pasien, Pasien Baru Bulan Ini
3. Perkaya detail modal: tampilkan daftar kondisi (ICD10), alergi dengan severity badge, alamat lengkap, kontak darurat
4. Perbaiki calcAge dengan defensive null check

### Expected Outcomes
- Filter gender + blood type bekerja
- Detail modal lengkap dengan conditions & allergies
- `npx tsc --noEmit` zero error

### Relevant Files
- `healthsync/apps/admin/src/pages/PatientsPage.tsx`
- `healthsync/services/patient-service/src/index.ts`

---

## Sub-Task 5 — HospitalsPage

**Status:** [ ] pending

### Intent
Perbaiki search param mismatch, tambah filter tipe RS, dan tampilkan capacity gauge.

### Bug Ditemukan
- Search query dikirim sebagai `search=...` tapi backend mungkin expect `q=...` (perlu cek)
- Form totalBeds: `<input value={String(form.totalBeds)}>` tapi state type adalah `number`
- Edit form tidak pre-fill nilai lama dari `selectedHospital`

### Enhancement
1. Perbaiki search param sesuai backend
2. Tambah bed capacity progress bar di list view
3. Tambah filter tipe RS (TYPE_A, TYPE_B, dst)
4. Tampilkan "ICU Tersedia" di detail panel
5. Tambah stat cards: Total RS, Total Beds, Avg Occupancy

### Expected Outcomes
- Search + filter berjalan dengan benar
- Edit form pre-fill dari data existing
- `npx tsc --noEmit` zero error

### Relevant Files
- `healthsync/apps/admin/src/pages/HospitalsPage.tsx`
- `healthsync/services/hospital-service/src/index.ts`

---

## Sub-Task 6 — AmbulancesPage

**Status:** [ ] pending

### Intent
Perbaiki type casting bug dan tambahkan fitur dispatch dari admin.

### Bug Ditemukan
- `payload['driverId'] = form.driverId || null as unknown as string` — type unsafe
- Status filter dilakukan client-side padahal backend support server-side filter (tambahkan param `status`)
- `openEdit` dari modal detail button: `setSelected(null)` dan `openEdit(selected)` dipanggil dalam satu closure — `selected` sudah null saat openEdit dipanggil

### Enhancement
1. Perbaiki type casting untuk driverId (kirim `null` jika kosong)
2. Perbaiki filter status ke server-side
3. Perbaiki logic Edit dari modal detail
4. Tambah kolom "Tipe Ambulans" (BLS/ALS/NICU)

### Expected Outcomes
- CRUD ambulans bekerja tanpa type error
- Status filter server-side
- `npx tsc --noEmit` zero error

### Relevant Files
- `healthsync/apps/admin/src/pages/AmbulancesPage.tsx`

---

## Sub-Task 7 — ConsultationsPage

**Status:** [ ] pending

### Intent
Tambah filter tanggal dan tampilkan detail lebih lengkap di modal.

### Bug Ditemukan
- Search dilakukan client-side (filter post-fetch) — tidak efisien
- `selected.started_at` bisa null — `formatDuration` perlu null guard

### Enhancement
1. Tambah filter tanggal (dari-sampai) 
2. Tampilkan symptom_data dalam modal sebagai JSON viewer
3. Tambah stat cards: Konsultasi Hari Ini, Konsultasi Aktif
4. Tampilkan diagnosis + notes di modal

### Expected Outcomes
- Filter tanggal berjalan
- Detail modal lebih informatif
- `npx tsc --noEmit` zero error

### Relevant Files
- `healthsync/apps/admin/src/pages/ConsultationsPage.tsx`

---

## Sub-Task 8 — PrescriptionsPage

**Status:** [ ] pending

### Intent
Halaman sudah bagus. Tambah filter tanggal dan ekspor CSV.

### Bug Ditemukan
- `openDetail` callback tanpa cancellation — jika user klik cepat, race condition bisa terjadi
- `Skeleton` imported twice (sudah diperbaiki sebelumnya, verifikasi)

### Enhancement
1. Tambah tombol "Ekspor CSV" untuk daftar resep terfilter
2. Tambah filter tanggal (issued_at from-to)
3. Tambah stat: Resep Expired (expires_at < sekarang + status != DISPENSED)
4. Tampilkan nama pasien di list view (dari detail fetch yang cached)

### Expected Outcomes
- Export CSV berjalan
- Filter tanggal bekerja
- `npx tsc --noEmit` zero error

### Relevant Files
- `healthsync/apps/admin/src/pages/PrescriptionsPage.tsx`

---

## Sub-Task 9 — ReferralsPage

**Status:** [ ] pending

### Intent
Tambah timeline status visual dan tampilkan informasi rumah sakit yang lebih lengkap.

### Bug Ditemukan
- Action endpoint `PUT /v1/referrals/:id/transit` tapi backend mungkin pakai verb lain (perlu cek)
- `notes` field diisi dengan key ganda: `{ notes: actionNote, rejectedReason: actionNote }`
- `from_hospital_name` tidak ditampilkan di list view

### Enhancement
1. Tambah status timeline visual (DRAFT→SENT→ACCEPTED→IN_TRANSIT→ARRIVED)
2. Tampilkan nama rumah sakit (from/to) di tabel list
3. Tambah filter: rumah sakit asal
4. Perbaiki payload action endpoint
5. Tambah ekspor CSV

### Expected Outcomes
- Timeline visual status rujukan
- Nama RS tampil di list
- `npx tsc --noEmit` zero error

### Relevant Files
- `healthsync/apps/admin/src/pages/ReferralsPage.tsx`
- `healthsync/services/referral-service/src/index.ts`

---

## Sub-Task 10 — PharmacyPage

**Status:** [ ] pending

### Intent
Perbaiki client-side search dan tambah fitur pembuatan apotek baru.

### Bug Ditemukan
- Search apotek client-side — tidak efisien untuk data besar
- `meta.total` mungkin tidak selalu ada dari API
- Tidak ada error boundary saat inventory fetch gagal

### Enhancement
1. Tambah server-side search untuk apotek
2. Tambah stat: Total Apotek, Total Stok Rendah, Total SKU
3. Tampilkan alamat apotek dalam list
4. Tambah highlight pada item stok kritis (< 10 unit)

### Expected Outcomes
- Search server-side
- Stok kritis highlight merah
- `npx tsc --noEmit` zero error

### Relevant Files
- `healthsync/apps/admin/src/pages/PharmacyPage.tsx`

---

## Sub-Task 11 — AnalyticsPage

**Status:** [ ] pending

### Intent
Ganti mock data dengan real data dari endpoint consultation stats, tambah export PDF-ready view.

### Bug Ditemukan
- 3 dari 6 chart datasets adalah mock (userGrowthMock, consultationStatusMock, topDoctorsMock)
- `consultationStatusMock` dihitung dari `totalConsult * persentase` — tidak akurat
- `topDoctorsMock` hardcoded 5 nama dokter — tidak real

### Enhancement
1. Ganti `consultationStatusMock` dengan data real dari `/v1/consultations` aggregate
2. Ganti `topDoctorsMock` dengan real data dari `/v1/doctors` + join consultations count
3. Perbaiki `userGrowthMock` — jika endpoint tidak tersedia, tampilkan pesan "Data historis belum tersedia"
4. Tambah date range filter untuk konsultasi chart

### Expected Outcomes
- Minimal 4 dari 6 chart menggunakan data real
- Mock data diberi label jelas "Estimasi"
- `npx tsc --noEmit` zero error

### Relevant Files
- `healthsync/apps/admin/src/hooks/useAnalytics.ts`
- `healthsync/apps/admin/src/pages/AnalyticsPage.tsx`
- `healthsync/services/consultation-service/src/index.ts`

---

## Sub-Task 12 — ActivityLogPage

**Status:** [ ] pending

### Intent
Hubungkan ke real backend endpoint. Jika tidak tersedia, gunakan auth-service access log atau fallback yang informatif.

### Bug Ditemukan
- Seluruh data adalah mock — tidak berguna di production
- Auto-refresh dengan `setInterval` + state sudah benar tapi data yang direfresh adalah mock

### Enhancement
1. Coba `GET /v1/auth/admin/logs` — jika tersedia, gunakan
2. Jika tidak tersedia, gunakan `GET /v1/auth/admin/users?limit=20&sort=lastLoginAt` sebagai proxy "aktivitas terkini"
3. Tambahkan fallback state yang jelas menampilkan "Real-time log belum tersedia" dengan tombol link ke HealthCheck
4. Pertahankan CSV export logic yang sudah bagus

### Expected Outcomes
- Halaman tidak lagi fully mock
- Ada graceful degradation dengan pesan yang jelas
- `npx tsc --noEmit` zero error

### Relevant Files
- `healthsync/apps/admin/src/pages/ActivityLogPage.tsx`
- `healthsync/services/auth-service/src/index.ts`

---

## Sub-Task 13 — HealthCheckPage

**Status:** [ ] pending

### Intent
Tambah latency history chart dan perbaiki categorization.

### Bug Ditemukan
- Tidak ada pengecekan apakah `AbortSignal.timeout` didukung browser (perlu polyfill check)
- Refresh interval hardcoded tidak bisa diubah dari UI
- Status CHECKING tidak ditampilkan berbeda dari OFFLINE di summary

### Enhancement
1. Tambah grafik sparkline latency history (simpan 10 checkpoint terakhir)
2. Perbaiki summary: bedakan CHECKING vs OFFLINE
3. Tambah interval selector: 15s / 30s / 60s
4. Tampilkan uptime percentage berdasarkan check history

### Expected Outcomes
- User bisa set refresh interval
- History latency tervisualisasi
- `npx tsc --noEmit` zero error

### Relevant Files
- `healthsync/apps/admin/src/pages/HealthCheckPage.tsx`

---

## Sub-Task 14 — MasterDataPage

**Status:** [ ] pending

### Intent
Buat koneksi ke backend nyata untuk setidaknya 1-2 tab (specializations, system_config).

### Bug Ditemukan
- Seluruh data mock — CRUD operasi hanya mengubah state lokal
- Tab "Konfigurasi Sistem" memiliki data hardcoded yang bisa berbahaya (nilai config terlihat)

### Enhancement
1. Hubungkan tab "Spesialisasi" ke `/v1/doctors` untuk mendapatkan unique specializations
2. Tab "Konfigurasi" tampilkan pesan "Manajemen konfigurasi melalui environment variables"
3. Pertahankan CRUD untuk tabs yang masih mock dengan toast informatif "Disimpan (mode simulasi)"
4. Tambahkan pagination pada setiap tab

### Expected Outcomes
- Tab Spesialisasi menampilkan data real dari backend
- Konfigurasi tidak menampilkan nilai sensitif
- `npx tsc --noEmit` zero error

### Relevant Files
- `healthsync/apps/admin/src/pages/MasterDataPage.tsx`

---

## Sub-Task 15 — Final TypeScript Validation & Docker Rebuild

**Status:** [ ] pending

### Intent
Pastikan semua perubahan compile tanpa error dan container Docker diperbarui.

### Steps
1. Jalankan `npx tsc --noEmit` di `healthsync/apps/admin`
2. Perbaiki semua error TypeScript yang tersisa
3. Rebuild Docker: `docker compose build admin`
4. Restart container: `docker compose up -d --no-deps admin`
5. Verifikasi dengan login ke `http://localhost:5174`

### Relevant Files
- `healthsync/apps/admin/tsconfig.json`
- `healthsync/infra/docker/docker-compose.dev.yml`

---

## Catatan Implementasi

### Komponen yang TIDAK boleh diubah interface-nya
- `Modal` — props: `open`, `title`, `onClose`, `width?: number`
- `ConfirmDialog` — dari `Modal.tsx`, props: `open`, `title`, `message`, `confirmLabel`, `danger`, `onConfirm`, `onCancel` (TIDAK ada `loading`)
- `showToast(message, type)` — urutan ini, bukan `(type, message)`
- `PageHeader` — prop `actions` (bukan `action`)

### Pola Error Handling yang Digunakan
```typescript
// PAKAI INI:
const msg = err instanceof Error ? err.message : 'Pesan fallback';
showToast(msg, 'error');

// HINDARI INI:
(err as { response?: {...} })?.response?.data?.detail
```

### Pola Debounce yang Digunakan
```typescript
const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const handleSearch = (val: string) => {
  setSearchInput(val);
  if (debounceRef.current) clearTimeout(debounceRef.current);
  debounceRef.current = setTimeout(() => setSearchQuery(val), 400);
};
```
