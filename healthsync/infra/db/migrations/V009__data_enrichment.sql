-- ─────────────────────────────────────────────────────────────────────────────
-- V009: Data Enrichment — lebih banyak rumah sakit, ambulans, pasien,
--       dokter, resep, konsultasi, dan referral.
-- UUID convention lanjutan:
--   hospitals:    a0000000-0000-0000-0000-00000000000x (6–10)
--   users:        00100000-0000-0000-0000-000000000006 dst (dokter)
--                 00200000-0000-0000-0000-000000000011 dst (pasien)
--                 00400000-0000-0000-0000-000000000004 dst (driver)
--   doctors:      00dc0000-0000-0000-0000-000000000006 dst
--   patients:     00bb0000-0000-0000-0000-000000000011 dst
--   ambulances:   00aa0000-0000-0000-0000-000000000005 dst
--   consultations:00cc0000-0000-0000-0000-000000000009 dst
--   prescriptions:00ee0000-0000-0000-0000-000000000006 dst
--   referrals:    00ff0000-0000-0000-0000-000000000004 dst
--   drugs:        d0000000-0000-0000-0000-000000000016 dst
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────
-- 1. RUMAH SAKIT TAMBAHAN
-- ─────────────────────────────────────────────
INSERT INTO hospitals (id, name, type, license_number, address, city, province,
  latitude, longitude, phone, email, igd_phone,
  total_beds, available_beds, icu_total, icu_available,
  specializations, is_active, is_emt_partner)
VALUES
  ('a0000000-0000-0000-0000-000000000006',
   'RS Siloam Kebon Jeruk', 'TYPE_B', 'RS-JKT-2024-006',
   'Jl. Perjuangan No.8, Kebon Jeruk, Jakarta Barat', 'Jakarta Barat', 'DKI Jakarta',
   -6.1878, 106.7668, '021-56968855', 'info@siloamhospitals.com', '021-56968800',
   200, 45, 20, 6,
   ARRAY['INTERNAL_MEDICINE','ORTHOPEDIC','OBSTETRICS','PEDIATRIC','GENERAL_SURGERY'],
   TRUE, TRUE),

  ('a0000000-0000-0000-0000-000000000007',
   'RS Hermina Depok', 'TYPE_B', 'RS-DPK-2024-007',
   'Jl. Raya Siliwangi No.50, Depok', 'Depok', 'Jawa Barat',
   -6.3872, 106.8278, '021-29230345', 'hermina.depok@hermina.co.id', '021-29230350',
   150, 30, 12, 4,
   ARRAY['OBSTETRICS','PEDIATRIC','GENERAL_MEDICINE','INTERNAL_MEDICINE'],
   TRUE, TRUE),

  ('a0000000-0000-0000-0000-000000000008',
   'RSUD Bekasi', 'TYPE_B', 'RS-BKS-2024-008',
   'Jl. Pramuka No.55, Bekasi Selatan', 'Bekasi', 'Jawa Barat',
   -6.2490, 107.0010, '021-8800108', 'rsud@bekasikota.go.id', '021-8800100',
   350, 78, 30, 8,
   ARRAY['GENERAL_MEDICINE','GENERAL_SURGERY','OBSTETRICS','PEDIATRIC','NEUROLOGY','ORTHOPEDIC'],
   TRUE, TRUE),

  ('a0000000-0000-0000-0000-000000000009',
   'Klinik Pratama SehatJakarta', 'CLINIC', 'KLN-JKT-2024-009',
   'Jl. Fatmawati Raya No.15, Jakarta Selatan', 'Jakarta Selatan', 'DKI Jakarta',
   -6.2876, 106.7988, '021-7504123', 'klinik@sehatjkt.id', NULL,
   10, 5, 0, 0,
   ARRAY['GENERAL_MEDICINE','MATERNAL_CHILD_HEALTH'],
   TRUE, FALSE),

  ('a0000000-0000-0000-0000-000000000010',
   'RS EMC Sentul', 'TYPE_C', 'RS-BGR-2024-010',
   'Jl. Babakan Madang No.1, Sentul, Bogor', 'Bogor', 'Jawa Barat',
   -6.5710, 106.8345, '021-29278888', 'info@emchospital.com', '021-29278899',
   120, 25, 10, 3,
   ARRAY['GENERAL_MEDICINE','GENERAL_SURGERY','ORTHOPEDIC','INTERNAL_MEDICINE'],
   TRUE, FALSE);

-- ─────────────────────────────────────────────
-- 2. PENGGUNA BARU — lebih banyak dokter & pasien
-- ─────────────────────────────────────────────
INSERT INTO users (id, email, phone, password_hash, role, status, email_verified, phone_verified)
VALUES
  -- Dokter tambahan (5 lagi)
  ('00100000-0000-0000-0000-000000000006','dr.andi.saputra@healthsync.id',     '+6281100000006','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','DOCTOR','ACTIVE',TRUE,TRUE),
  ('00100000-0000-0000-0000-000000000007','dr.linda.kusumawati@healthsync.id', '+6281100000007','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','DOCTOR','ACTIVE',TRUE,TRUE),
  ('00100000-0000-0000-0000-000000000008','dr.hendra.kurniawan@healthsync.id', '+6281100000008','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','DOCTOR','ACTIVE',TRUE,TRUE),
  ('00100000-0000-0000-0000-000000000009','dr.sri.mulyani@healthsync.id',      '+6281100000009','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','DOCTOR','ACTIVE',TRUE,TRUE),
  ('00100000-0000-0000-0000-000000000010','dr.yoga.pratama@healthsync.id',     '+6281100000010','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','DOCTOR','PENDING_VERIFICATION',TRUE,FALSE),
  -- Pasien tambahan (10 lagi)
  ('00200000-0000-0000-0000-000000000011','tommy.santoso@gmail.com',           '+6281200000011','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','PATIENT','ACTIVE',TRUE,TRUE),
  ('00200000-0000-0000-0000-000000000012','wulandari.putri@gmail.com',         '+6281200000012','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','PATIENT','ACTIVE',TRUE,TRUE),
  ('00200000-0000-0000-0000-000000000013','benny.hardian@gmail.com',           '+6281200000013','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','PATIENT','ACTIVE',TRUE,TRUE),
  ('00200000-0000-0000-0000-000000000014','citra.dewi@gmail.com',              '+6281200000014','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','PATIENT','ACTIVE',TRUE,FALSE),
  ('00200000-0000-0000-0000-000000000015','fajar.nugroho@gmail.com',           '+6281200000015','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','PATIENT','ACTIVE',TRUE,TRUE),
  ('00200000-0000-0000-0000-000000000016','gita.puspita@gmail.com',            '+6281200000016','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','PATIENT','ACTIVE',TRUE,TRUE),
  ('00200000-0000-0000-0000-000000000017','hendra.maulana@gmail.com',          '+6281200000017','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','PATIENT','INACTIVE',FALSE,FALSE),
  ('00200000-0000-0000-0000-000000000018','indra.permana@gmail.com',           '+6281200000018','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','PATIENT','ACTIVE',TRUE,TRUE),
  ('00200000-0000-0000-0000-000000000019','juli.rahayu@gmail.com',             '+6281200000019','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','PATIENT','ACTIVE',TRUE,TRUE),
  ('00200000-0000-0000-0000-000000000020','kartika.sari@gmail.com',            '+6281200000020','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','PATIENT','SUSPENDED',TRUE,TRUE),
  -- Driver ambulans tambahan (2)
  ('00400000-0000-0000-0000-000000000004','driver.sudirman@healthsync.id',     '+6281400000004','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','AMBULANCE_DRIVER','ACTIVE',TRUE,TRUE),
  ('00400000-0000-0000-0000-000000000005','driver.teguh@healthsync.id',        '+6281400000005','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','AMBULANCE_DRIVER','ACTIVE',TRUE,TRUE);

-- ─────────────────────────────────────────────
-- 3. DOKTER TAMBAHAN
-- ─────────────────────────────────────────────
INSERT INTO doctors (id, user_id, str_number, sip_number, specialization, sub_specialization,
  hospital_id, years_experience, consultation_fee, is_available, rating_avg, rating_count,
  str_verified_at, sip_verified_at)
VALUES
  ('00dc0000-0000-0000-0000-000000000006','00100000-0000-0000-0000-000000000006',
   'STR-2019-JKT-006','SIP-2024-JKT-006','OBSTETRICS','Fetal Medicine',
   'a0000000-0000-0000-0000-000000000007', 7, 280000, TRUE, 4.7, 112,
   NOW()-INTERVAL '2 years', NOW()-INTERVAL '8 months'),

  ('00dc0000-0000-0000-0000-000000000007','00100000-0000-0000-0000-000000000007',
   'STR-2021-JKT-007','SIP-2024-JKT-007','PEDIATRIC',NULL,
   'a0000000-0000-0000-0000-000000000006', 4, 175000, TRUE, 4.6, 78,
   NOW()-INTERVAL '1 year', NOW()-INTERVAL '4 months'),

  ('00dc0000-0000-0000-0000-000000000008','00100000-0000-0000-0000-000000000008',
   'STR-2014-JKT-008','SIP-2022-JKT-008','ONCOLOGY','Surgical Oncology',
   'a0000000-0000-0000-0000-000000000003', 12, 500000, FALSE, 4.9, 203,
   NOW()-INTERVAL '5 years', NOW()-INTERVAL '2 years'),

  ('00dc0000-0000-0000-0000-000000000009','00100000-0000-0000-0000-000000000009',
   'STR-2022-JKT-009','SIP-2024-JKT-009','GENERAL_MEDICINE',NULL,
   'a0000000-0000-0000-0000-000000000009', 3, 85000, TRUE, 4.4, 55,
   NOW()-INTERVAL '6 months', NOW()-INTERVAL '3 months'),

  ('00dc0000-0000-0000-0000-000000000010','00100000-0000-0000-0000-000000000010',
   'STR-2023-JKT-010','SIP-PENDING-JKT-010','DERMATOLOGY',NULL,
   'a0000000-0000-0000-0000-000000000004', 2, 150000, FALSE, 0, 0,
   NULL, NULL);

-- ─────────────────────────────────────────────
-- 4. PASIEN TAMBAHAN
-- ─────────────────────────────────────────────
INSERT INTO patients (id, user_id, nik_token, name, date_of_birth, gender,
  blood_type, phone, address, emergency_contact_name, emergency_contact_phone)
VALUES
  ('00bb0000-0000-0000-0000-000000000011','00200000-0000-0000-0000-000000000011',
   encode(sha256('3271110111000011'::bytea),'hex'),
   'Tommy Santoso','2000-11-01','MALE','O+','+6281200000011','Jl. Ciledug Raya No.3, Tangerang','Susi Santoso','+6281200009011'),

  ('00bb0000-0000-0000-0000-000000000012','00200000-0000-0000-0000-000000000012',
   encode(sha256('3271120212970012'::bytea),'hex'),
   'Wulandari Putri','1997-12-02','FEMALE','A-','+6281200000012','Jl. Margonda Raya No.45, Depok','Budi Putri','+6281200009012'),

  ('00bb0000-0000-0000-0000-000000000013','00200000-0000-0000-0000-000000000013',
   encode(sha256('3271130313820013'::bytea),'hex'),
   'Benny Hardian','1982-03-13','MALE','B+','+6281200000013','Jl. Ahmad Yani No.12, Bekasi','Rita Hardian','+6281200009013'),

  ('00bb0000-0000-0000-0000-000000000014','00200000-0000-0000-0000-000000000014',
   encode(sha256('3271140414030014'::bytea),'hex'),
   'Citra Dewi','2003-04-14','FEMALE','AB+','+6281200000014','Jl. Cinere Raya No.7, Depok','Rian Dewi','+6281200009014'),

  ('00bb0000-0000-0000-0000-000000000015','00200000-0000-0000-0000-000000000015',
   encode(sha256('3271150515750015'::bytea),'hex'),
   'Fajar Nugroho','1975-05-15','MALE','O-','+6281200000015','Jl. Cibubur Raya No.21, Jakarta Timur','Dewi Nugroho','+6281200009015'),

  ('00bb0000-0000-0000-0000-000000000016','00200000-0000-0000-0000-000000000016',
   encode(sha256('3271160616930016'::bytea),'hex'),
   'Gita Puspita','1993-06-16','FEMALE','A+','+6281200000016','Jl. Pasar Minggu No.8, Jakarta Selatan','Eko Puspita','+6281200009016'),

  ('00bb0000-0000-0000-0000-000000000017','00200000-0000-0000-0000-000000000017',
   encode(sha256('3271170717680017'::bytea),'hex'),
   'Hendra Maulana','1968-07-17','MALE','B-','+6281200000017','Jl. Kalimalang No.55, Bekasi','Sari Maulana','+6281200009017'),

  ('00bb0000-0000-0000-0000-000000000018','00200000-0000-0000-0000-000000000018',
   encode(sha256('3271180818880018'::bytea),'hex'),
   'Indra Permana','1988-08-18','MALE','AB-','+6281200000018','Jl. Kelapa Gading Blok A, Jakarta Utara','Tini Permana','+6281200009018'),

  ('00bb0000-0000-0000-0000-000000000019','00200000-0000-0000-0000-000000000019',
   encode(sha256('3271190919810019'::bytea),'hex'),
   'Juli Rahayu','1981-09-19','FEMALE','O+','+6281200000019','Jl. Thamrin No.6, Jakarta Pusat','Ahmad Rahayu','+6281200009019'),

  ('00bb0000-0000-0000-0000-000000000020','00200000-0000-0000-0000-000000000020',
   encode(sha256('3271201020020020'::bytea),'hex'),
   'Kartika Sari','2002-10-20','FEMALE','A+','+6281200000020','Jl. Pondok Labu No.30, Jakarta Selatan','Wahyu Sari','+6281200009020');

-- Kondisi pasien tambahan
INSERT INTO patient_conditions (patient_id, icd10_code, description, diagnosed_at, is_active, notes)
VALUES
  ('00bb0000-0000-0000-0000-000000000012','N18', 'Penyakit Ginjal Kronis Stadium 3', '2021-05-10', TRUE, 'Kreatinin serum 2.1 mg/dL'),
  ('00bb0000-0000-0000-0000-000000000013','J45', 'Asma Bronkial Persisten Sedang',   '2005-09-20', TRUE, 'Terkontrol dengan ICS'),
  ('00bb0000-0000-0000-0000-000000000015','K21', 'GERD Kronis',                       '2019-03-01', TRUE, 'Omeprazole 20mg 1x sehari'),
  ('00bb0000-0000-0000-0000-000000000016','O24', 'Diabetes Gestasional',              '2025-02-01', TRUE, 'Dipantau ketat diet dan gula darah'),
  ('00bb0000-0000-0000-0000-000000000018','F32', 'Episode Depresi Sedang',            '2023-11-15', TRUE, 'Fluoxetine 20mg 1x sehari'),
  ('00bb0000-0000-0000-0000-000000000019','I10', 'Hipertensi Esensial',               '2018-07-20', TRUE, 'Amlodipine 10mg 1x sehari'),
  ('00bb0000-0000-0000-0000-000000000020','L30', 'Dermatitis Atopik',                 '2010-03-12', TRUE, 'Flare berulang saat stres');

-- Alergi pasien tambahan
INSERT INTO patient_allergies (patient_id, allergen, reaction, severity)
VALUES
  ('00bb0000-0000-0000-0000-000000000013','NSAIDs',    'Bronkospasme akut',     'SEVERE'),
  ('00bb0000-0000-0000-0000-000000000015','Metformin', 'Diare dan mual berat', 'MODERATE'),
  ('00bb0000-0000-0000-0000-000000000019','Ibuprofen', 'Urtikaria',            'MILD');

-- ─────────────────────────────────────────────
-- 5. AMBULANS TAMBAHAN
-- ─────────────────────────────────────────────
INSERT INTO ambulances (id, hospital_id, plate_number, type, status,
  driver_id, latitude, longitude, is_active)
VALUES
  ('00aa0000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000006',
   'B 9105 RS','BLS','AVAILABLE','00400000-0000-0000-0000-000000000004',-6.1882,106.7671,TRUE),

  ('00aa0000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000007',
   'B 9106 RS','ALS','OFFLINE','00400000-0000-0000-0000-000000000005',-6.3875,106.8280,TRUE),

  ('00aa0000-0000-0000-0000-000000000007','a0000000-0000-0000-0000-000000000008',
   'D 9107 RS','BLS','AVAILABLE',NULL,-6.2493,107.0015,TRUE),

  ('00aa0000-0000-0000-0000-000000000008','a0000000-0000-0000-0000-000000000003',
   'B 9108 RS','NICU','OFFLINE',NULL,-6.1950,106.8460,TRUE);

-- ─────────────────────────────────────────────
-- 6. OBAT TAMBAHAN
-- ─────────────────────────────────────────────
INSERT INTO drugs (id, generic_name, brand_name, dosage_form, strength, unit, drug_class, requires_prescription)
VALUES
  ('d0000000-0000-0000-0000-000000000016', 'Omeprazole',      'Prilosec',  'CAPSULE', '20mg',  'capsule','PROTON_PUMP_INHIBITOR',TRUE),
  ('d0000000-0000-0000-0000-000000000017', 'Fluoxetine',      'Prozac',    'CAPSULE', '20mg',  'capsule','ANTIDEPRESSANT',       TRUE),
  ('d0000000-0000-0000-0000-000000000018', 'Amoxicillin-Clav','Augmentin', 'TABLET',  '625mg', 'tablet', 'ANTIBIOTIC',           TRUE),
  ('d0000000-0000-0000-0000-000000000019', 'Ibuprofen',       'Advil',     'TABLET',  '400mg', 'tablet', 'NSAID',                FALSE),
  ('d0000000-0000-0000-0000-000000000020', 'Metronidazole',   'Flagyl',    'TABLET',  '500mg', 'tablet', 'ANTIBIOTIC',           TRUE),
  ('d0000000-0000-0000-0000-000000000021', 'Dexamethasone',   'Decadron',  'INJECTION','4mg/mL','ampul', 'CORTICOSTEROID',       TRUE),
  ('d0000000-0000-0000-0000-000000000022', 'Ranitidine',      'Zantac',    'TABLET',  '150mg', 'tablet', 'H2_BLOCKER',           FALSE),
  ('d0000000-0000-0000-0000-000000000023', 'Captopril',       'Capoten',   'TABLET',  '25mg',  'tablet', 'ACE_INHIBITOR',        TRUE),
  ('d0000000-0000-0000-0000-000000000024', 'Spironolactone',  'Aldactone', 'TABLET',  '25mg',  'tablet', 'DIURETIC',             TRUE),
  ('d0000000-0000-0000-0000-000000000025', 'Ondansetron',     'Zofran',    'TABLET',  '8mg',   'tablet', 'ANTIEMETIC',           TRUE);

-- Stok apotek untuk obat baru
INSERT INTO pharmacy_inventory (pharmacy_id, drug_id, stock_qty, unit_price, batch_number, expires_at, reorder_level)
VALUES
  ('f0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000016',200, 9000,  'KF-25-A16','2027-11-30',40),
  ('f0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000019',500, 4500,  'KF-25-A19','2027-12-31',80),
  ('f0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000022',300, 5500,  'KF-25-A22','2027-10-31',60),
  ('f0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000016',150, 9500,  'GD-25-B16','2027-11-30',30),
  ('f0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000017',80,  32000, 'GD-25-B17','2027-09-30',15),
  ('f0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000018',120, 28000, 'GD-25-B18','2027-08-31',25),
  ('f0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000021',50,  75000, 'JH-25-C21','2027-06-30',10),
  ('f0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000023',200, 8500,  'JH-25-C23','2027-09-30',40),
  ('f0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000024',160, 12000, 'JH-25-C24','2027-10-31',30),
  ('f0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000025',100, 15000, 'JH-25-C25','2027-08-31',20);

-- ─────────────────────────────────────────────
-- 7. KONSULTASI TAMBAHAN
-- ─────────────────────────────────────────────
INSERT INTO consultations (id, patient_id, doctor_id, status, chief_complaint,
  diagnosis, notes, started_at, ended_at, created_at)
VALUES
  -- Konsultasi selesai
  ('00cc0000-0000-0000-0000-000000000009',
   '00bb0000-0000-0000-0000-000000000011','00dc0000-0000-0000-0000-000000000004',
   'COMPLETED','Batuk berdahak 1 minggu, demam ringan',
   'Bronkitis akut. Tidak ada konsolidasi paru.',
   'Amoxicillin 500mg 3x1 selama 7 hari. Paracetamol k/p. Perbanyak minum.',
   NOW()-INTERVAL '14 days', NOW()-INTERVAL '14 days'+INTERVAL '25 min', NOW()-INTERVAL '14 days'),

  ('00cc0000-0000-0000-0000-000000000010',
   '00bb0000-0000-0000-0000-000000000012','00dc0000-0000-0000-0000-000000000002',
   'COMPLETED','Kontrol rutin PGK, kaki bengkak bilateral',
   'Penyakit Ginjal Kronis Std 3B dengan edema bilateral. eGFR 32.',
   'Tambahkan Furosemide 40mg 1x sehari. Batasi asupan kalium. Kontrol 2 minggu.',
   NOW()-INTERVAL '6 days', NOW()-INTERVAL '6 days'+INTERVAL '40 min', NOW()-INTERVAL '6 days'),

  ('00cc0000-0000-0000-0000-000000000011',
   '00bb0000-0000-0000-0000-000000000016','00dc0000-0000-0000-0000-000000000006',
   'COMPLETED','Kontrol kehamilan 32 minggu, gerakan janin berkurang',
   'Kehamilan 32 minggu dengan penurunan gerak janin. NST reaktif. TBJ 1950g.',
   'Monitoring ketat. Jadwalkan USG doppler minggu depan. Bed rest.',
   NOW()-INTERVAL '4 days', NOW()-INTERVAL '4 days'+INTERVAL '35 min', NOW()-INTERVAL '4 days'),

  -- Konsultasi aktif saat ini
  ('00cc0000-0000-0000-0000-000000000012',
   '00bb0000-0000-0000-0000-000000000013','00dc0000-0000-0000-0000-000000000004',
   'IN_PROGRESS','Sesak napas tiba-tiba, inhaler tidak membantu',
   NULL, NULL,
   NOW()-INTERVAL '10 min', NULL, NOW()-INTERVAL '15 min'),

  ('00cc0000-0000-0000-0000-000000000013',
   '00bb0000-0000-0000-0000-000000000019','00dc0000-0000-0000-0000-000000000009',
   'IN_PROGRESS','Tekanan darah tinggi, pusing dan pandangan kabur',
   NULL, NULL,
   NOW()-INTERVAL '5 min', NULL, NOW()-INTERVAL '8 min'),

  -- Konsultasi menunggu
  ('00cc0000-0000-0000-0000-000000000014',
   '00bb0000-0000-0000-0000-000000000014','00dc0000-0000-0000-0000-000000000007',
   'PENDING','Demam 38.5°C pada anak, ruam di badan',
   NULL, NULL, NULL, NULL, NOW()-INTERVAL '30 min'),

  ('00cc0000-0000-0000-0000-000000000015',
   '00bb0000-0000-0000-0000-000000000018','00dc0000-0000-0000-0000-000000000009',
   'PENDING','Sulit tidur, mudah lelah, tidak nafsu makan 3 minggu',
   NULL, NULL, NULL, NULL, NOW()-INTERVAL '45 min'),

  -- Konsultasi dibatalkan
  ('00cc0000-0000-0000-0000-000000000016',
   '00bb0000-0000-0000-0000-000000000020','00dc0000-0000-0000-0000-000000000009',
   'CANCELLED','Ruam gatal di lengan',
   NULL, 'Pasien memiliki akun tersuspensi.',
   NULL, NULL, NOW()-INTERVAL '2 hours');

-- Pesan konsultasi aktif
INSERT INTO consultation_messages (consultation_id, sender_id, message_type, content, is_read, read_at, created_at)
VALUES
  ('00cc0000-0000-0000-0000-000000000012','00200000-0000-0000-0000-000000000013','TEXT',
   'Dokter, tiba-tiba sesak napas parah. Inhaler salbutamol saya sudah 4x semprot tapi tidak membaik.',
   FALSE, NULL, NOW()-INTERVAL '12 min'),
  ('00cc0000-0000-0000-0000-000000000012','00100000-0000-0000-0000-000000000004','TEXT',
   'Pak Benny, segera ke IGD terdekat sekarang! Ini bisa serangan asma berat. Saya koordinasikan ambulans.',
   FALSE, NULL, NOW()-INTERVAL '10 min'),
  ('00cc0000-0000-0000-0000-000000000013','00200000-0000-0000-0000-000000000019','TEXT',
   'Dokter, tensi saya 190/110 dan kepala sangat pusing. Pandangan mulai kabur sebelah kiri.',
   FALSE, NULL, NOW()-INTERVAL '6 min'),
  ('00cc0000-0000-0000-0000-000000000013','00100000-0000-0000-0000-000000000009','TEXT',
   'Bu Juli, ini termasuk hypertensive urgency. Minum Nifedipin sublingual jika tersedia, ke IGD segera!',
   FALSE, NULL, NOW()-INTERVAL '4 min');

-- ─────────────────────────────────────────────
-- 8. RESEP TAMBAHAN
-- ─────────────────────────────────────────────
INSERT INTO prescriptions (id, consultation_id, patient_id, doctor_id, pharmacy_id,
  status, fulfillment_type, delivery_address, notes, issued_at, expires_at)
VALUES
  ('00ee0000-0000-0000-0000-000000000006',
   '00cc0000-0000-0000-0000-000000000009','00bb0000-0000-0000-0000-000000000011','00dc0000-0000-0000-0000-000000000004',
   'f0000000-0000-0000-0000-000000000001',
   'DELIVERED','PICKUP',NULL,
   'Habiskan antibiotik meski sudah merasa baik.',
   NOW()-INTERVAL '14 days', NOW()-INTERVAL '14 days'+INTERVAL '30 days'),

  ('00ee0000-0000-0000-0000-000000000007',
   '00cc0000-0000-0000-0000-000000000010','00bb0000-0000-0000-0000-000000000012','00dc0000-0000-0000-0000-000000000002',
   'f0000000-0000-0000-0000-000000000003',
   'CONFIRMED','DELIVERY','Jl. Margonda Raya No.45, Depok',
   'Pantau keseimbangan cairan. Timbang badan setiap hari.',
   NOW()-INTERVAL '6 days', NOW()-INTERVAL '6 days'+INTERVAL '30 days'),

  ('00ee0000-0000-0000-0000-000000000008',
   '00cc0000-0000-0000-0000-000000000011','00bb0000-0000-0000-0000-000000000016','00dc0000-0000-0000-0000-000000000006',
   NULL,
   'ISSUED',NULL,NULL,
   'Suplemen kehamilan diminum tiap malam.',
   NOW()-INTERVAL '4 days', NOW()-INTERVAL '4 days'+INTERVAL '30 days');

INSERT INTO prescription_items (prescription_id, drug_id, drug_name, dosage, quantity, instructions, substitution_allowed)
VALUES
  ('00ee0000-0000-0000-0000-000000000006','d0000000-0000-0000-0000-000000000001','Amoxicillin 500mg','500mg 3x sehari',21,'Habiskan seluruh antibiotik',FALSE),
  ('00ee0000-0000-0000-0000-000000000006','d0000000-0000-0000-0000-000000000002','Paracetamol 500mg','500mg k/p demam >38',15,'Maksimal 4 tablet sehari',TRUE),
  ('00ee0000-0000-0000-0000-000000000007','d0000000-0000-0000-0000-000000000009','Furosemide 40mg',  '40mg 1x sehari pagi',30,'Monitor tekanan darah dan urin',FALSE),
  ('00ee0000-0000-0000-0000-000000000007','d0000000-0000-0000-0000-000000000024','Spironolactone 25mg','25mg 1x sehari',30,'Pantau kalium darah',FALSE),
  ('00ee0000-0000-0000-0000-000000000008','d0000000-0000-0000-0000-000000000015','Vitamin D3 1000IU', '1x sehari',30,'Dengan makanan',TRUE);

-- ─────────────────────────────────────────────
-- 9. REFERRAL TAMBAHAN
-- ─────────────────────────────────────────────
INSERT INTO referrals (id, patient_id, from_hospital_id, to_hospital_id,
  referring_doctor_id, receiving_doctor_id, ambulance_id,
  status, reason, diagnosis, urgency_level, required_specialization,
  sent_at, accepted_at, arrived_at, created_at)
VALUES
  ('00ff0000-0000-0000-0000-000000000004',
   '00bb0000-0000-0000-0000-000000000013',
   'a0000000-0000-0000-0000-000000000008','a0000000-0000-0000-0000-000000000001',
   '00dc0000-0000-0000-0000-000000000004',NULL,
   '00aa0000-0000-0000-0000-000000000007',
   'SENT',
   'Status asmatikus tidak respons terhadap terapi bronkodilator. Butuh ICU.',
   'Status Asmatikus berat dengan SpO2 88% meski nebulisasi 3x.',
   'CRITICAL','PULMONOLOGY',
   NOW()-INTERVAL '8 min', NULL, NULL, NOW()-INTERVAL '10 min'),

  ('00ff0000-0000-0000-0000-000000000005',
   '00bb0000-0000-0000-0000-000000000016',
   'a0000000-0000-0000-0000-000000000007','a0000000-0000-0000-0000-000000000003',
   '00dc0000-0000-0000-0000-000000000006',NULL,
   NULL,
   'DRAFT',
   'Pasien hamil 32 minggu dengan pertumbuhan janin terhambat. Butuh NICU perinatologi.',
   'IUGR berat dengan reversed diastolic flow. Kemungkinan persalinan preterm segera.',
   'URGENT','PERINATOLOGY',
   NULL, NULL, NULL, NOW()-INTERVAL '1 hour'),

  ('00ff0000-0000-0000-0000-000000000006',
   '00bb0000-0000-0000-0000-000000000015',
   'a0000000-0000-0000-0000-000000000009','a0000000-0000-0000-0000-000000000001',
   '00dc0000-0000-0000-0000-000000000009',NULL,NULL,
   'ACCEPTED',
   'GERD refrakter butuh endoskopi diagnostik dan evaluasi gastroenterologi.',
   'GERD Grade C. H. pylori positif. Tidak respons PPI 2 bulan.',
   'NORMAL','GASTROENTEROLOGY',
   NOW()-INTERVAL '2 days', NOW()-INTERVAL '2 days'+INTERVAL '3 hours',
   NULL, NOW()-INTERVAL '2 days');

-- ─────────────────────────────────────────────
-- 10. NOTIFIKASI TAMBAHAN
-- ─────────────────────────────────────────────
INSERT INTO notifications (user_id, channel, status, title, body, priority,
  reference_type, sent_at, delivered_at, read_at, created_at)
VALUES
  ('00200000-0000-0000-0000-000000000013','PUSH','DELIVERED',
   '[DARURAT] Serangan Asma Berat',
   'Dokter Anda merekomendasikan ke IGD segera. Ambulans sedang dalam perjalanan.',
   'CRITICAL','CONSULTATION',
   NOW()-INTERVAL '10 min', NOW()-INTERVAL '9 min', NULL, NOW()-INTERVAL '10 min'),

  ('00200000-0000-0000-0000-000000000012','IN_APP','READ',
   'Resep Sedang Dikirim',
   'Furosemide dan Spironolactone Anda sedang dalam proses pengiriman ke alamat Anda.',
   'NORMAL','PRESCRIPTION',
   NOW()-INTERVAL '5 days', NOW()-INTERVAL '5 days'+INTERVAL '2 min',
   NOW()-INTERVAL '4 days', NOW()-INTERVAL '5 days'),

  ('00200000-0000-0000-0000-000000000016','PUSH','DELIVERED',
   'Pengingat Kontrol Kehamilan',
   'Jangan lupa jadwal USG Doppler minggu depan. Konsultasikan dengan dr. Andi.',
   'NORMAL','CONSULTATION',
   NOW()-INTERVAL '3 days', NOW()-INTERVAL '3 days'+INTERVAL '1 min',
   NOW()-INTERVAL '2 days', NOW()-INTERVAL '3 days'),

  ('00500000-0000-0000-0000-000000000001','IN_APP','DELIVERED',
   '[KRITIS] Status Asmatikus - Benny Hardian',
   'Pasien Benny Hardian mengalami status asmatikus. Ambulans B-9107-RS dispatch dari RSUD Bekasi.',
   'CRITICAL','ALERT',
   NOW()-INTERVAL '9 min', NOW()-INTERVAL '8 min', NULL, NOW()-INTERVAL '9 min'),

  ('00100000-0000-0000-0000-000000000009','PUSH','DELIVERED',
   'Pasien Baru: Juli Rahayu',
   'Pasien Juli Rahayu (hipertensi urgency) memulai konsultasi. Tekanan darah 190/110 mmHg.',
   'HIGH','CONSULTATION',
   NOW()-INTERVAL '5 min', NOW()-INTERVAL '4 min', NOW()-INTERVAL '3 min', NOW()-INTERVAL '5 min');
