# HealthSync — Dokumentasi Database

> **Dihasilkan otomatis** | Terakhir diperbarui: 15 September 2026  
> **Database:** PostgreSQL (TimescaleDB) | **Container:** `hs-postgres` | **DB:** `healthsync`  
> **Total Tabel:** 31 | **Total Baris Seed:** ~2.100+

---

## Daftar Tabel (Ringkasan)

| # | Nama Tabel | Deskripsi Singkat | Jumlah Baris | Terhubung ke Service |
|---|---|---|---|---|
| 1 | `users` | Akun pengguna semua role | 45 | auth-service |
| 2 | `patients` | Profil medis pasien | 20 | patient-service |
| 3 | `doctors` | Profil & kredensial dokter | 10 | patient-service |
| 4 | `hospitals` | Data rumah sakit | 10 | hospital-service |
| 5 | `hospital_beds` | Manajemen tempat tidur RS | 10 | hospital-service |
| 6 | `ambulances` | Armada ambulans | 8 | ambulance-service |
| 7 | `ambulance_locations` | Riwayat lokasi GPS ambulans | 0 | ambulance-service |
| 8 | `consultations` | Sesi konsultasi dokter-pasien | 16 | consultation-service |
| 9 | `consultation_messages` | Pesan dalam konsultasi | 22 | consultation-service |
| 10 | `consultation_ratings` | Penilaian konsultasi | 7 | consultation-service |
| 11 | `prescriptions` | Resep obat dari dokter | 8 | prescription-service |
| 12 | `prescription_items` | Item obat dalam resep | 30 | prescription-service |
| 13 | `prescription_deliveries` | Pengiriman resep ke pasien | 0 | prescription-service |
| 14 | `pharmacies` | Data apotek | 3 | pharmacy-service |
| 15 | `pharmacy_inventory` | Stok obat di apotek | 50 | pharmacy-service |
| 16 | `drugs` | Katalog obat & farmasi | 25 | pharmacy-service |
| 17 | `referrals` | Rujukan antar rumah sakit | 6 | referral-service |
| 18 | `vital_signs` | Data tanda vital IoT (TimescaleDB) | 1.300 | iot-ingestion |
| 19 | `alerts` | Peringatan anomali tanda vital | 16 | alert-service |
| 20 | `notifications` | Notifikasi push/SMS/email | 27 | notification-service |
| 21 | `push_tokens` | Token push notification perangkat | 0 | notification-service |
| 22 | `refresh_tokens` | Token refresh autentikasi JWT | 0 | auth-service |
| 23 | `otp_codes` | Kode OTP verifikasi | 0 | auth-service |
| 24 | `auth_audit_logs` | Log audit login & autentikasi | 273 | auth-service |
| 25 | `medical_audit_logs` | Log audit akses rekam medis | 0 | patient-service |
| 26 | `iot_devices` | Perangkat IoT terdaftar | 3 | iot-ingestion |
| 27 | `patient_conditions` | Kondisi medis / diagnosis pasien | 37 | patient-service |
| 28 | `patient_allergies` | Alergi pasien | 17 | patient-service |
| 29 | `command_center_users` | Mapping user ke role Command Center | 0 | — |
| 30 | `consent_records` | Rekam persetujuan privasi pengguna | 0 | auth-service |
| 31 | `schema_migrations` | Riwayat migrasi database | 10 | — |

---

## Detail Tabel

---

### 1. `users`

**Deskripsi:** Tabel utama autentikasi. Menyimpan akun semua role pengguna: `PATIENT`, `DOCTOR`, `PHARMACIST`, `AMBULANCE_DRIVER`, `COMMAND_CENTER`, `ADMIN`.

**Jumlah Baris:** 45

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `email` | varchar(255) | NOT NULL | — | Email unik (case-insensitive index) |
| `phone` | varchar(20) | NULL | — | Nomor telepon (unik jika tidak NULL) |
| `password_hash` | text | NOT NULL | — | Hash bcrypt password |
| `role` | user_role | NOT NULL | `'PATIENT'` | Enum: PATIENT, DOCTOR, PHARMACIST, AMBULANCE_DRIVER, COMMAND_CENTER, ADMIN |
| `status` | user_status | NOT NULL | `'PENDING_VERIFICATION'` | Enum: PENDING_VERIFICATION, ACTIVE, SUSPENDED, DELETED |
| `email_verified` | boolean | NOT NULL | `false` | Status verifikasi email |
| `phone_verified` | boolean | NOT NULL | `false` | Status verifikasi telepon |
| `last_login_at` | timestamptz | NULL | — | Waktu login terakhir |
| `created_at` | timestamptz | NOT NULL | `now()` | Waktu pembuatan akun |
| `updated_at` | timestamptz | NOT NULL | `now()` | Waktu pembaruan terakhir |

**Relasi:** Dirujuk oleh 13 tabel lain (patients, doctors, ambulances, notifications, dll.)

**Endpoint API terkait:**
- `POST /v1/auth/login` → membuat sesi & token
- `GET /v1/users?role=...` → daftar pengguna (ADMIN)
- `GET /v1/users/:id` → detail pengguna

---

### 2. `patients`

**Deskripsi:** Profil medis lengkap pasien. Setiap baris terhubung ke satu `users` dengan role `PATIENT`.

**Jumlah Baris:** 20

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `user_id` | uuid | NOT NULL | — | FK → users.id (UNIQUE, CASCADE DELETE) |
| `nik` | varchar(16) | NOT NULL | — | Nomor Induk Kependudukan |
| `nik_token` | varchar(64) | NOT NULL | — | Hash/token NIK (UNIQUE) |
| `name` | varchar(255) | NOT NULL | — | Nama lengkap pasien |
| `date_of_birth` | date | NOT NULL | — | Tanggal lahir |
| `gender` | gender | NOT NULL | — | Enum: MALE, FEMALE |
| `blood_type` | blood_type | NOT NULL | `'UNKNOWN'` | Enum: A+, A-, B+, B-, O+, O-, AB+, AB-, UNKNOWN |
| `phone` | varchar(20) | NULL | — | Nomor telepon kontak |
| `address` | text | NULL | — | Alamat domisili |
| `emergency_contact_name` | varchar(255) | NULL | — | Nama kontak darurat |
| `emergency_contact_phone` | varchar(20) | NULL | — | Telepon kontak darurat |
| `profile_photo_url` | text | NULL | — | URL foto profil |
| `created_at` | timestamptz | NOT NULL | `now()` | Waktu pendaftaran |
| `updated_at` | timestamptz | NOT NULL | `now()` | Waktu pembaruan |

**Relasi:** Dirujuk oleh alerts, consultations, hospital_beds, iot_devices, vital_signs, patient_allergies, patient_conditions, prescriptions, referrals

**Endpoint API terkait:**
- `GET /v1/patients` → daftar pasien
- `GET /v1/patients/:id` → profil pasien lengkap
- `GET /v1/patients/:id/vitals` → tanda vital pasien
- `GET /v1/patients/:id/conditions` → kondisi medis
- `GET /v1/patients/:id/allergies` → daftar alergi

---

### 3. `doctors`

**Deskripsi:** Profil dan kredensial dokter (STR, SIP), spesialisasi, dan fee konsultasi.

**Jumlah Baris:** 10

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `user_id` | uuid | NOT NULL | — | FK → users.id (UNIQUE, CASCADE DELETE) |
| `str_number` | varchar(50) | NOT NULL | — | Nomor Surat Tanda Registrasi (UNIQUE) |
| `sip_number` | varchar(50) | NOT NULL | — | Nomor Surat Izin Praktik (UNIQUE) |
| `specialization` | varchar(100) | NOT NULL | — | Spesialisasi utama |
| `sub_specialization` | varchar(100) | NULL | — | Sub-spesialisasi |
| `hospital_id` | uuid | NULL | — | FK → hospitals.id (SET NULL) |
| `years_experience` | smallint | NULL | — | Lama pengalaman (tahun) |
| `education` | text | NULL | — | Riwayat pendidikan |
| `bio` | text | NULL | — | Biografi singkat |
| `consultation_fee` | numeric(12,2) | NOT NULL | `0` | Biaya konsultasi (Rupiah) |
| `is_available` | boolean | NOT NULL | `false` | Status ketersediaan untuk konsultasi |
| `rating_avg` | numeric(3,2) | NULL | — | Rata-rata penilaian pasien |
| `rating_count` | integer | NOT NULL | `0` | Total jumlah penilaian |
| `str_verified_at` | timestamptz | NULL | — | Waktu verifikasi STR |
| `sip_verified_at` | timestamptz | NULL | — | Waktu verifikasi SIP |
| `created_at` | timestamptz | NOT NULL | `now()` | — |
| `updated_at` | timestamptz | NOT NULL | `now()` | — |

**Endpoint API terkait:**
- `GET /v1/doctors` → daftar dokter
- `GET /v1/doctors/:id` → profil dokter

---

### 4. `hospitals`

**Deskripsi:** Data rumah sakit, kapasitas tempat tidur, ICU, dan spesialisasi yang tersedia.

**Jumlah Baris:** 10

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `name` | varchar(255) | NOT NULL | — | Nama rumah sakit |
| `type` | hospital_type | NOT NULL | `'TYPE_C'` | Enum: TYPE_A, TYPE_B, TYPE_C, TYPE_D, CLINIC, PUSKESMAS |
| `license_number` | varchar(100) | NOT NULL | — | Nomor izin RS (UNIQUE) |
| `address` | text | NOT NULL | — | Alamat lengkap |
| `city` | varchar(100) | NOT NULL | — | Kota |
| `province` | varchar(100) | NOT NULL | — | Provinsi |
| `latitude` | numeric(10,7) | NULL | — | Koordinat GPS (lintang) |
| `longitude` | numeric(10,7) | NULL | — | Koordinat GPS (bujur) |
| `phone` | varchar(20) | NULL | — | Nomor telepon umum |
| `email` | varchar(255) | NULL | — | Email RS |
| `igd_phone` | varchar(20) | NULL | — | Nomor telepon IGD |
| `total_beds` | integer | NOT NULL | `0` | Total kapasitas tempat tidur |
| `available_beds` | integer | NOT NULL | `0` | Tempat tidur tersedia saat ini |
| `icu_total` | integer | NOT NULL | `0` | Total kapasitas ICU |
| `icu_available` | integer | NOT NULL | `0` | ICU tersedia saat ini |
| `specializations` | text[] | NULL | — | Array spesialisasi yang ada |
| `is_active` | boolean | NOT NULL | `true` | Status aktif RS |
| `is_emt_partner` | boolean | NOT NULL | `false` | Mitra EMT/ambulans darurat |
| `created_at` | timestamptz | NOT NULL | `now()` | — |
| `updated_at` | timestamptz | NOT NULL | `now()` | — |

**Endpoint API terkait:**
- `GET /v1/hospitals` → daftar RS
- `GET /v1/hospitals/:id/beds` → manajemen tempat tidur
- `GET /v1/hospitals/search?city=...` → cari RS per kota

---

### 5. `hospital_beds`

**Deskripsi:** Detail setiap tempat tidur di setiap rumah sakit beserta status dan pasien yang menempati.

**Jumlah Baris:** 10

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `hospital_id` | uuid | NOT NULL | — | FK → hospitals.id (CASCADE) |
| `ward` | varchar(100) | NOT NULL | — | Nama bangsal: ICU, GENERAL, PEDIATRIC, MATERNITY, SURGICAL, VIP |
| `room_number` | varchar(20) | NOT NULL | — | Nomor kamar |
| `bed_number` | varchar(20) | NOT NULL | — | Nomor tempat tidur |
| `status` | bed_status | NOT NULL | `'AVAILABLE'` | Enum: AVAILABLE, OCCUPIED, RESERVED, MAINTENANCE |
| `patient_id` | uuid | NULL | — | FK → patients.id (SET NULL) |
| `admitted_at` | timestamptz | NULL | — | Waktu pasien masuk |

**Endpoint API terkait:**
- `GET /v1/hospitals/:id/beds` → semua tempat tidur RS
- `PATCH /v1/hospitals/:id/beds/:bedId` → perbarui status

---

### 6. `ambulances`

**Deskripsi:** Armada ambulans beserta posisi GPS real-time, status, dan pengemudi yang bertugas.

**Jumlah Baris:** 8

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `hospital_id` | uuid | NOT NULL | — | FK → hospitals.id (CASCADE) |
| `plate_number` | varchar(20) | NOT NULL | — | Nomor plat (UNIQUE) |
| `type` | varchar(50) | NOT NULL | `'BLS'` | Tipe: BLS, ALS, Neonatal, dll. |
| `status` | ambulance_status | NOT NULL | `'OFFLINE'` | Enum: AVAILABLE, OFFLINE, DISPATCHED, EN_ROUTE, AT_SCENE, TRANSPORTING, RETURNING |
| `driver_id` | uuid | NULL | — | FK → users.id (SET NULL) |
| `latitude` | numeric(10,7) | NULL | — | Posisi GPS terakhir (lintang) |
| `longitude` | numeric(10,7) | NULL | — | Posisi GPS terakhir (bujur) |
| `heading` | numeric(5,2) | NULL | — | Arah gerak (derajat) |
| `speed_kmh` | numeric(5,1) | NULL | — | Kecepatan (km/jam) |
| `last_location_at` | timestamptz | NULL | — | Waktu update lokasi terakhir |
| `is_active` | boolean | NOT NULL | `true` | Status aktif armada |
| `created_at` | timestamptz | NOT NULL | `now()` | — |
| `updated_at` | timestamptz | NOT NULL | `now()` | — |

**Endpoint API terkait:**
- `GET /v1/ambulances` → semua ambulans (ADMIN/CC)
- `GET /v1/ambulances/:id` → detail ambulans
- `PATCH /v1/ambulances/:id/status` → perbarui status

---

### 7. `ambulance_locations`

**Deskripsi:** Riwayat log posisi GPS ambulans (hypertable untuk query time-series). Data kosong saat ini.

**Jumlah Baris:** 0

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `ambulance_id` | uuid | NOT NULL | — | FK → ambulances.id (CASCADE) |
| `latitude` | numeric(10,7) | NOT NULL | — | Lintang |
| `longitude` | numeric(10,7) | NOT NULL | — | Bujur |
| `heading` | numeric(5,2) | NULL | — | Arah gerak |
| `speed_kmh` | numeric(5,1) | NULL | — | Kecepatan |
| `recorded_at` | timestamptz | NOT NULL | `now()` | Waktu pencatatan lokasi |

---

### 8. `consultations`

**Deskripsi:** Sesi konsultasi antara pasien dan dokter, termasuk keluhan, diagnosis, dan catatan medis.

**Jumlah Baris:** 16

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `patient_id` | uuid | NOT NULL | — | FK → patients.id |
| `doctor_id` | uuid | NULL | — | FK → doctors.id (SET NULL jika dokter dihapus) |
| `status` | consultation_status | NOT NULL | `'PENDING'` | Enum: PENDING, IN_PROGRESS, COMPLETED, CANCELLED |
| `chief_complaint` | text | NOT NULL | — | Keluhan utama pasien |
| `diagnosis` | text | NULL | — | Diagnosis akhir dokter |
| `notes` | text | NULL | — | Catatan medis tambahan |
| `symptom_data` | jsonb | NULL | — | Data gejala terstruktur (JSON) |
| `started_at` | timestamptz | NULL | — | Waktu mulai konsultasi |
| `ended_at` | timestamptz | NULL | — | Waktu selesai konsultasi |
| `created_at` | timestamptz | NOT NULL | `now()` | — |
| `updated_at` | timestamptz | NOT NULL | `now()` | — |

**Endpoint API terkait:**
- `GET /v1/consultations` → daftar konsultasi
- `POST /v1/consultations` → buat konsultasi baru
- `PATCH /v1/consultations/:id/status` → perbarui status

---

### 9. `consultation_messages`

**Deskripsi:** Pesan chat dalam sesi konsultasi (teks, file, gambar medis).

**Jumlah Baris:** 22

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `consultation_id` | uuid | NOT NULL | — | FK → consultations.id (CASCADE) |
| `sender_id` | uuid | NOT NULL | — | FK → users.id (pengirim) |
| `message_type` | message_type | NOT NULL | `'TEXT'` | Enum: TEXT, IMAGE, FILE, PRESCRIPTION |
| `content` | text | NULL | — | Isi pesan teks |
| `file_url` | text | NULL | — | URL file lampiran |
| `file_name` | text | NULL | — | Nama file lampiran |
| `is_read` | boolean | NOT NULL | `false` | Status sudah dibaca |
| `read_at` | timestamptz | NULL | — | Waktu pesan dibaca |
| `created_at` | timestamptz | NOT NULL | `now()` | — |

---

### 10. `consultation_ratings`

**Deskripsi:** Penilaian konsultasi yang diberikan pasien kepada dokter (skala 1–5).

**Jumlah Baris:** 7

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `consultation_id` | uuid | NOT NULL | — | FK → consultations.id (UNIQUE, CASCADE) |
| `patient_id` | uuid | NOT NULL | — | FK → patients.id (CASCADE) |
| `doctor_id` | uuid | NOT NULL | — | FK → doctors.id (CASCADE) |
| `rating` | smallint | NOT NULL | — | Nilai 1–5 (CHECK constraint) |
| `review` | text | NULL | — | Ulasan teks opsional |
| `created_at` | timestamptz | NOT NULL | `now()` | — |

---

### 11. `prescriptions`

**Deskripsi:** Resep obat yang dikeluarkan dokter setelah konsultasi, termasuk status pemenuhan dan apotek pilihan.

**Jumlah Baris:** 8

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `consultation_id` | uuid | NOT NULL | — | FK → consultations.id |
| `patient_id` | uuid | NOT NULL | — | FK → patients.id |
| `doctor_id` | uuid | NOT NULL | — | FK → doctors.id |
| `pharmacy_id` | uuid | NULL | — | FK → pharmacies.id (SET NULL) |
| `status` | prescription_status | NOT NULL | `'ISSUED'` | Enum: ISSUED, PROCESSING, READY, DISPENSED, CANCELLED |
| `fulfillment_type` | fulfillment_type | NULL | — | Enum: PICKUP, DELIVERY |
| `delivery_address` | text | NULL | — | Alamat pengiriman (jika DELIVERY) |
| `notes` | text | NULL | — | Catatan tambahan |
| `issued_at` | timestamptz | NOT NULL | `now()` | Waktu resep diterbitkan |
| `expires_at` | timestamptz | NOT NULL | `now()+30d` | Waktu kedaluwarsa resep |
| `updated_at` | timestamptz | NOT NULL | `now()` | — |

---

### 12. `prescription_items`

**Deskripsi:** Detail item obat dalam sebuah resep (obat, dosis, jumlah, instruksi).

**Jumlah Baris:** 30

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `prescription_id` | uuid | NOT NULL | — | FK → prescriptions.id (CASCADE) |
| `drug_id` | uuid | NOT NULL | — | FK → drugs.id |
| `drug_name` | varchar(255) | NOT NULL | — | Nama obat (snapshot saat penulisan) |
| `dosage` | varchar(100) | NOT NULL | — | Dosis (misal: "500mg 3x sehari") |
| `quantity` | integer | NOT NULL | — | Jumlah unit (CHECK: > 0) |
| `instructions` | text | NULL | — | Instruksi pemakaian lengkap |
| `substitution_allowed` | boolean | NOT NULL | `false` | Boleh diganti obat generik |

---

### 13. `prescription_deliveries`

**Deskripsi:** Informasi pengiriman resep/obat dari apotek ke pasien. Tabel kosong saat ini.

**Jumlah Baris:** 0

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `prescription_id` | uuid | NOT NULL | — | FK → prescriptions.id (UNIQUE, CASCADE) |
| `courier_id` | uuid | NULL | — | FK → users.id kurir (SET NULL) |
| `tracking_code` | varchar(100) | NULL | — | Kode pelacakan pengiriman |
| `status` | varchar(50) | NOT NULL | `'ASSIGNED'` | Status: ASSIGNED, PICKED_UP, IN_TRANSIT, DELIVERED |
| `pickup_at` | timestamptz | NULL | — | Waktu pengambilan dari apotek |
| `estimated_delivery` | timestamptz | NULL | — | Estimasi tiba |
| `delivered_at` | timestamptz | NULL | — | Waktu terkirim ke pasien |
| `recipient_signature` | text | NULL | — | Tanda tangan penerima (base64) |
| `created_at` | timestamptz | NOT NULL | `now()` | — |
| `updated_at` | timestamptz | NOT NULL | `now()` | — |

---

### 14. `pharmacies`

**Deskripsi:** Data apotek mitra HealthSync, termasuk lokasi GPS dan jam operasional.

**Jumlah Baris:** 3

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `name` | varchar(255) | NOT NULL | — | Nama apotek |
| `license_number` | varchar(100) | NOT NULL | — | Nomor izin apotek (UNIQUE) |
| `address` | text | NOT NULL | — | Alamat lengkap |
| `latitude` | numeric(10,7) | NULL | — | Koordinat GPS |
| `longitude` | numeric(10,7) | NULL | — | Koordinat GPS |
| `phone` | varchar(20) | NULL | — | Nomor telepon |
| `is_active` | boolean | NOT NULL | `true` | Status aktif |
| `operating_hours` | jsonb | NULL | — | Jam operasional per hari (JSON) |
| `created_at` | timestamptz | NOT NULL | `now()` | — |
| `updated_at` | timestamptz | NOT NULL | `now()` | — |

---

### 15. `pharmacy_inventory`

**Deskripsi:** Stok obat di masing-masing apotek, termasuk harga, batch, dan reorder level.

**Jumlah Baris:** 50

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `pharmacy_id` | uuid | NOT NULL | — | FK → pharmacies.id (CASCADE) |
| `drug_id` | uuid | NOT NULL | — | FK → drugs.id |
| `stock_qty` | integer | NOT NULL | `0` | Jumlah stok saat ini (CHECK: >= 0) |
| `unit_price` | numeric(12,2) | NOT NULL | — | Harga per unit (Rupiah) |
| `batch_number` | varchar(100) | NULL | — | Nomor batch produksi |
| `expires_at` | date | NULL | — | Tanggal kedaluwarsa batch |
| `reorder_level` | integer | NOT NULL | `10` | Stok minimum sebelum reorder |
| `updated_at` | timestamptz | NOT NULL | `now()` | — |

---

### 16. `drugs`

**Deskripsi:** Katalog obat dan farmasi: nama generik, merek, bentuk sediaan, kelas, dan status resep.

**Jumlah Baris:** 25

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `generic_name` | varchar(255) | NOT NULL | — | Nama generik obat |
| `brand_name` | varchar(255) | NULL | — | Nama merek dagang |
| `dosage_form` | varchar(100) | NULL | — | Bentuk sediaan: Tablet, Kapsul, Sirup, dll. |
| `strength` | varchar(50) | NULL | — | Kekuatan dosis: "500mg", "10mg/5ml" |
| `unit` | varchar(20) | NULL | — | Satuan: Tablet, Botol, Ampul |
| `drug_class` | varchar(100) | NULL | — | Kelas farmakologi |
| `requires_prescription` | boolean | NOT NULL | `true` | Wajib resep dokter |
| `created_at` | timestamptz | NOT NULL | `now()` | — |

---

### 17. `referrals`

**Deskripsi:** Proses rujukan pasien antar rumah sakit, termasuk urgensi, dokter pengirim/penerima, dan ambulans.

**Jumlah Baris:** 6

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `patient_id` | uuid | NOT NULL | — | FK → patients.id |
| `from_hospital_id` | uuid | NOT NULL | — | FK → hospitals.id (rumah sakit asal) |
| `to_hospital_id` | uuid | NOT NULL | — | FK → hospitals.id (rumah sakit tujuan) |
| `referring_doctor_id` | uuid | NOT NULL | — | FK → doctors.id (dokter pengirim) |
| `receiving_doctor_id` | uuid | NULL | — | FK → doctors.id (dokter penerima, SET NULL) |
| `ambulance_id` | uuid | NULL | — | FK → ambulances.id (SET NULL) |
| `status` | referral_status | NOT NULL | `'DRAFT'` | Enum: DRAFT, SENT, ACCEPTED, REJECTED, IN_TRANSIT, ARRIVED, CANCELLED |
| `reason` | text | NOT NULL | — | Alasan rujukan |
| `diagnosis` | text | NULL | — | Diagnosis saat rujukan |
| `urgency_level` | varchar(20) | NOT NULL | `'NORMAL'` | Level: ROUTINE, URGENT, CRITICAL, EMERGENCY |
| `required_specialization` | varchar(100) | NULL | — | Spesialisasi yang dibutuhkan |
| `notes` | text | NULL | — | Catatan tambahan |
| `rejected_reason` | text | NULL | — | Alasan penolakan (jika REJECTED) |
| `sent_at` | timestamptz | NULL | — | Waktu rujukan dikirim |
| `accepted_at` | timestamptz | NULL | — | Waktu rujukan diterima |
| `arrived_at` | timestamptz | NULL | — | Waktu pasien tiba di tujuan |
| `created_at` | timestamptz | NOT NULL | `now()` | — |
| `updated_at` | timestamptz | NOT NULL | `now()` | — |

---

### 18. `vital_signs`

**Deskripsi:** Data tanda vital pasien dari perangkat IoT (wearable/sensor). Ini adalah **TimescaleDB hypertable** (time-series). Memiliki 2 chunk partition.

**Jumlah Baris:** 1.300

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `patient_id` | uuid | NOT NULL | — | FK → patients.id (CASCADE) |
| `device_id` | varchar(100) | NULL | — | ID perangkat IoT pengirim |
| `heart_rate` | smallint | NULL | — | Detak jantung (bpm) |
| `spo2` | numeric(5,2) | NULL | — | Saturasi oksigen (%) |
| `systolic_bp` | smallint | NULL | — | Tekanan darah sistolik (mmHg) |
| `diastolic_bp` | smallint | NULL | — | Tekanan darah diastolik (mmHg) |
| `temperature` | numeric(4,1) | NULL | — | Suhu tubuh (°C) |
| `activity_level` | varchar(20) | NULL | — | Level aktivitas: REST, LIGHT, MODERATE, ACTIVE |
| `battery_level` | smallint | NULL | — | Level baterai perangkat (%) |
| `signal_strength` | smallint | NULL | — | Kekuatan sinyal (dBm) |
| `source` | vital_source | NOT NULL | `'WEARABLE'` | Enum: WEARABLE, MANUAL, DEVICE |
| `raw_payload` | jsonb | NULL | — | Payload mentah dari perangkat |
| `recorded_at` | timestamptz | NOT NULL | `now()` | Waktu pencatatan (partition key) |

**Catatan:** TimescaleDB melakukan partisi otomatis berdasarkan `recorded_at`. Endpoint ingestion via `iot-ingestion` (port 4001, Go service).

---

### 19. `alerts`

**Deskripsi:** Peringatan anomali tanda vital yang dihasilkan otomatis oleh `alert-service` ketika nilai vital melampaui ambang batas.

**Jumlah Baris:** 16

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `patient_id` | uuid | NOT NULL | — | FK → patients.id (CASCADE) |
| `device_id` | varchar(100) | NULL | — | ID perangkat yang memicu alert |
| `vital_sign_id` | uuid | NULL | — | ID vital sign pemicu |
| `level` | alert_level | NOT NULL | — | Enum: LEVEL_1, LEVEL_2, LEVEL_3 |
| `status` | alert_status | NOT NULL | `'ACTIVE'` | Enum: ACTIVE, ACKNOWLEDGED, RESOLVED, FALSE_POSITIVE |
| `trigger_metric` | varchar(50) | NOT NULL | — | Metrik pemicu: heart_rate, spo2, temperature |
| `trigger_value` | numeric(8,2) | NOT NULL | — | Nilai aktual saat alert |
| `threshold_value` | numeric(8,2) | NOT NULL | — | Nilai ambang batas |
| `message` | text | NOT NULL | — | Pesan deskriptif alert |
| `acknowledged_by` | uuid | NULL | — | FK → users.id yang mengakui alert |
| `acknowledged_at` | timestamptz | NULL | — | Waktu diakui |
| `resolved_at` | timestamptz | NULL | — | Waktu diselesaikan |
| `escalated_to_level` | alert_level | NULL | — | Level setelah eskalasi |
| `created_at` | timestamptz | NOT NULL | `now()` | — |

**Endpoint API terkait:**
- `GET /v1/alerts` → daftar alert (COMMAND_CENTER, ADMIN)
- `PATCH /v1/alerts/:id/acknowledge` → akui alert
- `PATCH /v1/alerts/:id/resolve` → selesaikan alert

---

### 20. `notifications`

**Deskripsi:** Notifikasi ke pengguna melalui berbagai kanal (push, SMS, email, in-app).

**Jumlah Baris:** 27

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `user_id` | uuid | NOT NULL | — | FK → users.id (CASCADE) |
| `channel` | notification_channel | NOT NULL | — | Enum: PUSH, SMS, EMAIL, IN_APP |
| `status` | notification_status | NOT NULL | `'PENDING'` | Enum: PENDING, SENT, DELIVERED, READ, FAILED |
| `title` | varchar(255) | NULL | — | Judul notifikasi |
| `body` | text | NOT NULL | — | Isi pesan notifikasi |
| `data` | jsonb | NULL | — | Payload data tambahan |
| `priority` | varchar(20) | NOT NULL | `'NORMAL'` | Prioritas: LOW, NORMAL, HIGH, CRITICAL |
| `reference_id` | uuid | NULL | — | ID entitas terkait |
| `reference_type` | varchar(50) | NULL | — | Tipe entitas: consultation, alert, prescription |
| `sent_at` | timestamptz | NULL | — | Waktu terkirim |
| `delivered_at` | timestamptz | NULL | — | Waktu tersampaikan |
| `read_at` | timestamptz | NULL | — | Waktu dibaca pengguna |
| `failed_reason` | text | NULL | — | Alasan gagal kirim |
| `retry_count` | smallint | NOT NULL | `0` | Jumlah percobaan pengiriman ulang |
| `created_at` | timestamptz | NOT NULL | `now()` | — |

---

### 21. `push_tokens`

**Deskripsi:** Token perangkat mobile untuk notifikasi push (FCM/APNs). Kosong saat ini.

**Jumlah Baris:** 0

| Kolom | Tipe | Nullable | Keterangan |
|---|---|---|---|
| `id` | uuid | NOT NULL | Primary key |
| `user_id` | uuid | NOT NULL | FK → users.id (CASCADE) |
| `token` | text | NOT NULL | Token FCM/APNs (UNIQUE) |
| `platform` | varchar(20) | NOT NULL | Platform: android, ios, web |
| `is_active` | boolean | NOT NULL | Status aktif |
| `last_used_at` | timestamptz | NULL | Waktu terakhir digunakan |
| `created_at` | timestamptz | NOT NULL | — |

---

### 22. `refresh_tokens`

**Deskripsi:** Token refresh JWT untuk perpanjangan sesi autentikasi. Kosong saat ini (sesi bersih).

**Jumlah Baris:** 0

| Kolom | Tipe | Nullable | Keterangan |
|---|---|---|---|
| `id` | uuid | NOT NULL | Primary key |
| `user_id` | uuid | NOT NULL | FK → users.id (CASCADE) |
| `token_hash` | text | NOT NULL | Hash token (UNIQUE) |
| `device_info` | text | NULL | Info perangkat |
| `ip_address` | inet | NULL | IP address saat login |
| `expires_at` | timestamptz | NOT NULL | Waktu kedaluwarsa |
| `revoked_at` | timestamptz | NULL | Waktu token dicabut |
| `created_at` | timestamptz | NOT NULL | — |

---

### 23. `otp_codes`

**Deskripsi:** Kode OTP satu kali pakai untuk verifikasi email, telepon, dan reset password.

**Jumlah Baris:** 0

| Kolom | Tipe | Nullable | Keterangan |
|---|---|---|---|
| `id` | uuid | NOT NULL | Primary key |
| `user_id` | uuid | NOT NULL | FK → users.id (CASCADE) |
| `code_hash` | text | NOT NULL | Hash kode OTP |
| `purpose` | varchar(50) | NOT NULL | Tujuan: EMAIL_VERIFY, PHONE_VERIFY, PASSWORD_RESET |
| `expires_at` | timestamptz | NOT NULL | Waktu kedaluwarsa OTP |
| `used_at` | timestamptz | NULL | Waktu OTP digunakan |
| `attempts` | smallint | NOT NULL | Jumlah percobaan input |
| `created_at` | timestamptz | NOT NULL | — |

---

### 24. `auth_audit_logs`

**Deskripsi:** Log audit semua aktivitas autentikasi: login, logout, gagal login, reset password, dll.

**Jumlah Baris:** 273

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `id` | bigint | NOT NULL | `nextval(...)` | Primary key (auto-increment) |
| `user_id` | uuid | NULL | — | FK → users.id (SET NULL jika user dihapus) |
| `event` | varchar(100) | NOT NULL | — | Jenis event: LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT, PASSWORD_RESET, dll. |
| `ip_address` | inet | NULL | — | IP address klien |
| `user_agent` | text | NULL | — | User agent browser/aplikasi |
| `metadata` | jsonb | NULL | — | Data konteks tambahan |
| `created_at` | timestamptz | NOT NULL | `now()` | — |

**Endpoint API terkait:**
- `GET /v1/admin/audit-logs` → log audit (ADMIN)

---

### 25. `medical_audit_logs`

**Deskripsi:** Log audit HIPAA-compliant untuk setiap akses ke rekam medis pasien. Kosong saat ini.

**Jumlah Baris:** 0

| Kolom | Tipe | Nullable | Keterangan |
|---|---|---|---|
| `id` | bigint | NOT NULL | Primary key (auto-increment) |
| `accessor_id` | uuid | NOT NULL | FK → users.id yang mengakses |
| `accessor_role` | user_role | NOT NULL | Role pengguna saat akses |
| `patient_id` | uuid | NULL | FK → patients.id (SET NULL) |
| `action` | varchar(100) | NOT NULL | Aksi: VIEW, UPDATE, CREATE |
| `resource_type` | varchar(100) | NOT NULL | Tipe resource: vital_signs, prescriptions, dll. |
| `resource_id` | uuid | NULL | ID resource yang diakses |
| `ip_address` | inet | NULL | IP address |
| `user_agent` | text | NULL | User agent |
| `request_id` | uuid | NULL | ID request unik |
| `justification` | text | NULL | Alasan akses |
| `created_at` | timestamptz | NOT NULL | — |

---

### 26. `iot_devices`

**Deskripsi:** Perangkat IoT (wearable, sensor) yang terdaftar dan dipasangkan ke pasien tertentu.

**Jumlah Baris:** 3

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `patient_id` | uuid | NOT NULL | — | FK → patients.id (CASCADE) |
| `device_id` | varchar(100) | NOT NULL | — | ID unik perangkat (UNIQUE) |
| `device_type` | varchar(100) | NOT NULL | — | Tipe: SmartWatch, BPMonitor, Glucometer, Pulse Oximeter |
| `firmware_version` | varchar(20) | NULL | — | Versi firmware terpasang |
| `certificate_pem` | text | NULL | — | Sertifikat TLS untuk autentikasi perangkat |
| `is_active` | boolean | NOT NULL | `true` | Status aktif perangkat |
| `last_seen_at` | timestamptz | NULL | — | Waktu terakhir perangkat mengirim data |
| `paired_at` | timestamptz | NOT NULL | `now()` | Waktu perangkat dipasangkan |

---

### 27. `patient_conditions`

**Deskripsi:** Kondisi medis / riwayat diagnosis pasien dengan kode ICD-10.

**Jumlah Baris:** 37

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `patient_id` | uuid | NOT NULL | — | FK → patients.id (CASCADE) |
| `icd10_code` | varchar(10) | NULL | — | Kode diagnosa ICD-10 |
| `description` | text | NOT NULL | — | Deskripsi kondisi medis |
| `diagnosed_at` | date | NULL | — | Tanggal didiagnosis |
| `is_active` | boolean | NOT NULL | `true` | Kondisi masih aktif/ongoing |
| `notes` | text | NULL | — | Catatan tambahan dokter |
| `created_at` | timestamptz | NOT NULL | `now()` | — |

---

### 28. `patient_allergies`

**Deskripsi:** Daftar alergi pasien beserta reaksi dan tingkat keparahan.

**Jumlah Baris:** 17

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `patient_id` | uuid | NOT NULL | — | FK → patients.id (CASCADE) |
| `allergen` | varchar(255) | NOT NULL | — | Nama alergen (obat, makanan, lingkungan) |
| `reaction` | text | NULL | — | Deskripsi reaksi alergi |
| `severity` | varchar(50) | NULL | — | Tingkat: MILD, MODERATE, SEVERE |
| `created_at` | timestamptz | NOT NULL | `now()` | — |

---

### 29. `command_center_users`

**Deskripsi:** Mapping tambahan pengguna Command Center ke rumah sakit tertentu. Kosong saat ini.

**Jumlah Baris:** 0

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `id` | integer | NOT NULL | `nextval(...)` | Primary key |
| `user_id` | uuid | NOT NULL | — | ID pengguna (role COMMAND_CENTER) |
| `hospital_id` | uuid | NULL | — | FK → hospitals (opsional) |
| `created_at` | timestamptz | NULL | `now()` | — |

---

### 30. `consent_records`

**Deskripsi:** Rekam persetujuan (consent) pengguna terhadap kebijakan privasi dan penggunaan data.

**Jumlah Baris:** 0

| Kolom | Tipe | Nullable | Default | Keterangan |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `user_id` | uuid | NOT NULL | — | FK → users.id (CASCADE) |
| `consent_type` | varchar(100) | NOT NULL | — | Tipe: PRIVACY_POLICY, DATA_SHARING, MARKETING |
| `is_granted` | boolean | NOT NULL | `false` | Apakah persetujuan diberikan |
| `granted_at` | timestamptz | NULL | — | Waktu persetujuan diberikan |
| `revoked_at` | timestamptz | NULL | — | Waktu persetujuan dicabut |
| `version` | varchar(20) | NOT NULL | `'1.0'` | Versi dokumen consent |
| `ip_address` | inet | NULL | — | IP address saat consent |
| `created_at` | timestamptz | NOT NULL | `now()` | — |

---

### 31. `schema_migrations`

**Deskripsi:** Tabel pelacak riwayat migrasi database yang telah dijalankan.

**Jumlah Baris:** 10

| Kolom | Tipe | Nullable | Keterangan |
|---|---|---|---|
| `version` | varchar(255) | NOT NULL | ID versi migrasi (Primary key) |
| `applied_at` | timestamptz | NOT NULL | Waktu migrasi dijalankan |

**Riwayat Migrasi:**
| Versi | Keterangan | Dijalankan |
|---|---|---|
| V001__create_extensions | Setup extensions (uuid-ossp, pg_trgm, timescaledb) | 2026-09-20 |
| V002__auth_schema | Tabel users, refresh_tokens, otp_codes, auth_audit_logs | 2026-09-20 |
| V003__patient_schema | Tabel patients, doctors, patient_conditions, patient_allergies, iot_devices, vital_signs, medical_audit_logs | 2026-09-20 |
| V004__consultation_schema | Tabel consultations, consultation_messages, consultation_ratings | 2026-09-20 |
| V005__prescription_pharmacy_schema | Tabel prescriptions, prescription_items, prescription_deliveries, pharmacies, pharmacy_inventory, drugs | 2026-09-20 |
| V006__hospital_ambulance_referral_alert_schema | Tabel hospitals, hospital_beds, ambulances, ambulance_locations, referrals, alerts | 2026-09-20 |
| V007__notifications_audit_consent_seed | Tabel notifications, push_tokens, consent_records, command_center_users, seed awal | 2026-09-20 |
| V008__rich_seed_data | Data seed kaya (users, patients, doctors, hospitals, dll.) | 2026-09-21 |
| V009__data_enrichment | Pengayaan data vital signs, konsultasi, resep | 2026-09-22 |
| V010__data_enrichment_fix | Perbaikan data seed konsultasi & pasien | 2026-09-22 |

---

## Diagram Relasi Entitas (ERD)

```
users ──────────────────────────────────────────────────────────────┐
  │ 1                                                                │
  ├──< patients (1:1)                                                │
  │       │ 1                                                        │
  │       ├──< vital_signs                                           │
  │       ├──< patient_conditions                                    │
  │       ├──< patient_allergies                                     │
  │       ├──< iot_devices                                           │
  │       ├──< consultations >──── doctors ────< users               │
  │       │       └──< consultation_messages                         │
  │       │       └──< consultation_ratings                          │
  │       │       └──< prescriptions >──── pharmacies                │
  │       │               └──< prescription_items >── drugs          │
  │       │               └──< prescription_deliveries               │
  │       ├──< hospital_beds >──── hospitals                         │
  │       ├──< alerts                                                │
  │       └──< referrals >── hospitals (from) >── hospitals (to)    │
  │               └──< ambulances >── hospitals                      │
  ├──< notifications                                                 │
  ├──< push_tokens                                                   │
  ├──< refresh_tokens                                                │
  ├──< otp_codes                                                     │
  ├──< auth_audit_logs                                               │
  ├──< medical_audit_logs                                            │
  └──< consent_records                                               │
                                                                     │
doctors ─────────────────────────────────────────────────────────────┘
```

---

## Enum Kustom

| Nama Enum | Nilai-nilai |
|---|---|
| `user_role` | PATIENT, DOCTOR, PHARMACIST, AMBULANCE_DRIVER, COMMAND_CENTER, ADMIN |
| `user_status` | PENDING_VERIFICATION, ACTIVE, SUSPENDED, DELETED |
| `gender` | MALE, FEMALE |
| `blood_type` | A+, A-, B+, B-, O+, O-, AB+, AB-, UNKNOWN |
| `hospital_type` | TYPE_A, TYPE_B, TYPE_C, TYPE_D, CLINIC, PUSKESMAS |
| `bed_status` | AVAILABLE, OCCUPIED, RESERVED, MAINTENANCE |
| `ambulance_status` | AVAILABLE, OFFLINE, DISPATCHED, EN_ROUTE, AT_SCENE, TRANSPORTING, RETURNING |
| `consultation_status` | PENDING, IN_PROGRESS, COMPLETED, CANCELLED |
| `message_type` | TEXT, IMAGE, FILE, PRESCRIPTION |
| `prescription_status` | ISSUED, PROCESSING, READY, DISPENSED, CANCELLED |
| `fulfillment_type` | PICKUP, DELIVERY |
| `referral_status` | DRAFT, SENT, ACCEPTED, REJECTED, IN_TRANSIT, ARRIVED, CANCELLED |
| `alert_level` | LEVEL_1, LEVEL_2, LEVEL_3 |
| `alert_status` | ACTIVE, ACKNOWLEDGED, RESOLVED, FALSE_POSITIVE |
| `vital_source` | WEARABLE, MANUAL, DEVICE |
| `notification_channel` | PUSH, SMS, EMAIL, IN_APP |
| `notification_status` | PENDING, SENT, DELIVERED, READ, FAILED |

---

## Cara Akses Database

```bash
# Masuk ke container PostgreSQL
docker exec -it hs-postgres psql -U healthsync -d healthsync

# Query cepat — cek jumlah baris semua tabel
docker exec hs-postgres psql -U healthsync -d healthsync -c "
SELECT schemaname, tablename, n_live_tup AS rows
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;"

# Lihat struktur tabel
docker exec hs-postgres psql -U healthsync -d healthsync -c "\d nama_tabel"

# Lihat semua enum
docker exec hs-postgres psql -U healthsync -d healthsync -c "\dT+"
```
