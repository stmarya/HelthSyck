-- ─────────────────────────────────────────────────────────────────────────────
-- V010: Lanjutan enrichment — isi data yang gagal di V009
--       (doctors, ambulances, patients, consultations, prescriptions, referrals)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────
-- 1. DOKTER TAMBAHAN (V009 gagal karena sip_number dan FK)
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
-- 2. AMBULANS TAMBAHAN (MAINTENANCE tidak valid → OFFLINE)
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
-- 3. PASIEN TAMBAHAN (cek pasien yang sudah ada, sisipkan yang belum)
-- ─────────────────────────────────────────────
INSERT INTO patients (id, user_id, nik_token, name, date_of_birth, gender,
  blood_type, phone, address, emergency_contact_name, emergency_contact_phone)
SELECT * FROM (VALUES
  ('00bb0000-0000-0000-0000-000000000011'::uuid, '00200000-0000-0000-0000-000000000011'::uuid,
   encode(sha256('3271110111000011'::bytea),'hex'),
   'Tommy Santoso','2000-11-01'::date,'MALE'::gender,'O+'::blood_type,
   '+6281200000011','Jl. Ciledug Raya No.3, Tangerang','Susi Santoso','+6281200009011'),
  ('00bb0000-0000-0000-0000-000000000012'::uuid, '00200000-0000-0000-0000-000000000012'::uuid,
   encode(sha256('3271120212970012'::bytea),'hex'),
   'Wulandari Putri','1997-12-02'::date,'FEMALE'::gender,'A-'::blood_type,
   '+6281200000012','Jl. Margonda Raya No.45, Depok','Budi Putri','+6281200009012'),
  ('00bb0000-0000-0000-0000-000000000013'::uuid, '00200000-0000-0000-0000-000000000013'::uuid,
   encode(sha256('3271130313820013'::bytea),'hex'),
   'Benny Hardian','1982-03-13'::date,'MALE'::gender,'B+'::blood_type,
   '+6281200000013','Jl. Ahmad Yani No.12, Bekasi','Rita Hardian','+6281200009013'),
  ('00bb0000-0000-0000-0000-000000000014'::uuid, '00200000-0000-0000-0000-000000000014'::uuid,
   encode(sha256('3271140414030014'::bytea),'hex'),
   'Citra Dewi','2003-04-14'::date,'FEMALE'::gender,'AB+'::blood_type,
   '+6281200000014','Jl. Cinere Raya No.7, Depok','Rian Dewi','+6281200009014'),
  ('00bb0000-0000-0000-0000-000000000015'::uuid, '00200000-0000-0000-0000-000000000015'::uuid,
   encode(sha256('3271150515750015'::bytea),'hex'),
   'Fajar Nugroho','1975-05-15'::date,'MALE'::gender,'O-'::blood_type,
   '+6281200000015','Jl. Cibubur Raya No.21, Jakarta Timur','Dewi Nugroho','+6281200009015'),
  ('00bb0000-0000-0000-0000-000000000016'::uuid, '00200000-0000-0000-0000-000000000016'::uuid,
   encode(sha256('3271160616930016'::bytea),'hex'),
   'Gita Puspita','1993-06-16'::date,'FEMALE'::gender,'A+'::blood_type,
   '+6281200000016','Jl. Pasar Minggu No.8, Jakarta Selatan','Eko Puspita','+6281200009016'),
  ('00bb0000-0000-0000-0000-000000000017'::uuid, '00200000-0000-0000-0000-000000000017'::uuid,
   encode(sha256('3271170717680017'::bytea),'hex'),
   'Hendra Maulana','1968-07-17'::date,'MALE'::gender,'B-'::blood_type,
   '+6281200000017','Jl. Kalimalang No.55, Bekasi','Sari Maulana','+6281200009017'),
  ('00bb0000-0000-0000-0000-000000000018'::uuid, '00200000-0000-0000-0000-000000000018'::uuid,
   encode(sha256('3271180818880018'::bytea),'hex'),
   'Indra Permana','1988-08-18'::date,'MALE'::gender,'AB-'::blood_type,
   '+6281200000018','Jl. Kelapa Gading Blok A, Jakarta Utara','Tini Permana','+6281200009018'),
  ('00bb0000-0000-0000-0000-000000000019'::uuid, '00200000-0000-0000-0000-000000000019'::uuid,
   encode(sha256('3271190919810019'::bytea),'hex'),
   'Juli Rahayu','1981-09-19'::date,'FEMALE'::gender,'O+'::blood_type,
   '+6281200000019','Jl. Thamrin No.6, Jakarta Pusat','Ahmad Rahayu','+6281200009019'),
  ('00bb0000-0000-0000-0000-000000000020'::uuid, '00200000-0000-0000-0000-000000000020'::uuid,
   encode(sha256('3271201020020020'::bytea),'hex'),
   'Kartika Sari','2002-10-20'::date,'FEMALE'::gender,'A+'::blood_type,
   '+6281200000020','Jl. Pondok Labu No.30, Jakarta Selatan','Wahyu Sari','+6281200009020')
) AS v(id, user_id, nik_token, name, date_of_birth, gender, blood_type, phone, address, emergency_contact_name, emergency_contact_phone)
WHERE NOT EXISTS (SELECT 1 FROM patients p WHERE p.id = v.id);

-- Kondisi pasien tambahan (guard dengan NOT EXISTS)
INSERT INTO patient_conditions (patient_id, icd10_code, description, diagnosed_at, is_active, notes)
SELECT v.* FROM (VALUES
  ('00bb0000-0000-0000-0000-000000000012'::uuid,'N18', 'Penyakit Ginjal Kronis Stadium 3', '2021-05-10'::date, TRUE, 'Kreatinin serum 2.1 mg/dL'),
  ('00bb0000-0000-0000-0000-000000000013'::uuid,'J45', 'Asma Bronkial Persisten Sedang',   '2005-09-20'::date, TRUE, 'Terkontrol dengan ICS'),
  ('00bb0000-0000-0000-0000-000000000015'::uuid,'K21', 'GERD Kronis',                       '2019-03-01'::date, TRUE, 'Omeprazole 20mg 1x sehari'),
  ('00bb0000-0000-0000-0000-000000000016'::uuid,'O24', 'Diabetes Gestasional',              '2025-02-01'::date, TRUE, 'Dipantau ketat diet dan gula darah'),
  ('00bb0000-0000-0000-0000-000000000018'::uuid,'F32', 'Episode Depresi Sedang',            '2023-11-15'::date, TRUE, 'Fluoxetine 20mg 1x sehari'),
  ('00bb0000-0000-0000-0000-000000000019'::uuid,'I10', 'Hipertensi Esensial',               '2018-07-20'::date, TRUE, 'Amlodipine 10mg 1x sehari'),
  ('00bb0000-0000-0000-0000-000000000020'::uuid,'L30', 'Dermatitis Atopik',                 '2010-03-12'::date, TRUE, 'Flare berulang saat stres')
) AS v(patient_id, icd10_code, description, diagnosed_at, is_active, notes)
WHERE EXISTS (SELECT 1 FROM patients p WHERE p.id = v.patient_id);

-- Alergi pasien tambahan
INSERT INTO patient_allergies (patient_id, allergen, reaction, severity)
SELECT v.* FROM (VALUES
  ('00bb0000-0000-0000-0000-000000000013'::uuid,'NSAIDs',    'Bronkospasme akut',     'SEVERE'),
  ('00bb0000-0000-0000-0000-000000000015'::uuid,'Metformin', 'Diare dan mual berat', 'MODERATE'),
  ('00bb0000-0000-0000-0000-000000000019'::uuid,'Ibuprofen', 'Urtikaria',            'MILD')
) AS v(patient_id, allergen, reaction, severity)
WHERE EXISTS (SELECT 1 FROM patients p WHERE p.id = v.patient_id);

-- ─────────────────────────────────────────────
-- 4. OBAT TAMBAHAN (hanya yang belum ada)
-- ─────────────────────────────────────────────
INSERT INTO drugs (id, generic_name, brand_name, dosage_form, strength, unit, drug_class, requires_prescription)
SELECT v.* FROM (VALUES
  ('d0000000-0000-0000-0000-000000000016'::uuid, 'Omeprazole',      'Prilosec',  'CAPSULE',   '20mg',  'capsule', 'PROTON_PUMP_INHIBITOR',TRUE),
  ('d0000000-0000-0000-0000-000000000017'::uuid, 'Fluoxetine',      'Prozac',    'CAPSULE',   '20mg',  'capsule', 'ANTIDEPRESSANT',       TRUE),
  ('d0000000-0000-0000-0000-000000000018'::uuid, 'Amoxicillin-Clav','Augmentin', 'TABLET',    '625mg', 'tablet',  'ANTIBIOTIC',           TRUE),
  ('d0000000-0000-0000-0000-000000000019'::uuid, 'Ibuprofen',       'Advil',     'TABLET',    '400mg', 'tablet',  'NSAID',                FALSE),
  ('d0000000-0000-0000-0000-000000000020'::uuid, 'Metronidazole',   'Flagyl',    'TABLET',    '500mg', 'tablet',  'ANTIBIOTIC',           TRUE),
  ('d0000000-0000-0000-0000-000000000021'::uuid, 'Dexamethasone',   'Decadron',  'INJECTION', '4mg/mL','ampul',   'CORTICOSTEROID',       TRUE),
  ('d0000000-0000-0000-0000-000000000022'::uuid, 'Ranitidine',      'Zantac',    'TABLET',    '150mg', 'tablet',  'H2_BLOCKER',           FALSE),
  ('d0000000-0000-0000-0000-000000000023'::uuid, 'Captopril',       'Capoten',   'TABLET',    '25mg',  'tablet',  'ACE_INHIBITOR',        TRUE),
  ('d0000000-0000-0000-0000-000000000024'::uuid, 'Spironolactone',  'Aldactone', 'TABLET',    '25mg',  'tablet',  'DIURETIC',             TRUE),
  ('d0000000-0000-0000-0000-000000000025'::uuid, 'Ondansetron',     'Zofran',    'TABLET',    '8mg',   'tablet',  'ANTIEMETIC',           TRUE)
) AS v(id, generic_name, brand_name, dosage_form, strength, unit, drug_class, requires_prescription)
WHERE NOT EXISTS (SELECT 1 FROM drugs d WHERE d.id = v.id);

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
  ('f0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000025',100, 15000, 'JH-25-C25','2027-08-31',20)
ON CONFLICT (pharmacy_id, drug_id) DO NOTHING;

-- ─────────────────────────────────────────────
-- 5. KONSULTASI TAMBAHAN
-- ─────────────────────────────────────────────
INSERT INTO consultations (id, patient_id, doctor_id, status, chief_complaint,
  diagnosis, notes, started_at, ended_at, created_at)
VALUES
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
   'Monitoring ketat. Jadwalkan USG Doppler minggu depan. Bed rest.',
   NOW()-INTERVAL '4 days', NOW()-INTERVAL '4 days'+INTERVAL '35 min', NOW()-INTERVAL '4 days'),

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

  ('00cc0000-0000-0000-0000-000000000014',
   '00bb0000-0000-0000-0000-000000000014','00dc0000-0000-0000-0000-000000000007',
   'PENDING','Demam 38.5°C pada anak, ruam di badan',
   NULL, NULL, NULL, NULL, NOW()-INTERVAL '30 min'),

  ('00cc0000-0000-0000-0000-000000000015',
   '00bb0000-0000-0000-0000-000000000018','00dc0000-0000-0000-0000-000000000009',
   'PENDING','Sulit tidur, mudah lelah, tidak nafsu makan 3 minggu',
   NULL, NULL, NULL, NULL, NOW()-INTERVAL '45 min'),

  ('00cc0000-0000-0000-0000-000000000016',
   '00bb0000-0000-0000-0000-000000000020','00dc0000-0000-0000-0000-000000000009',
   'CANCELLED','Ruam gatal di lengan',
   NULL, 'Pasien memiliki status tersuspensi, konsultasi dibatalkan sistem.',
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

-- Rating konsultasi tambahan
INSERT INTO consultation_ratings (consultation_id, patient_id, doctor_id, rating, review)
VALUES
  ('00cc0000-0000-0000-0000-000000000009',
   '00bb0000-0000-0000-0000-000000000011','00dc0000-0000-0000-0000-000000000004',5,
   'Dokter Dewi sangat ramah dan penjelasannya mudah dipahami.'),
  ('00cc0000-0000-0000-0000-000000000010',
   '00bb0000-0000-0000-0000-000000000012','00dc0000-0000-0000-0000-000000000002',5,
   'Dr. Siti sangat teliti dan detail dalam memberikan penanganan.'),
  ('00cc0000-0000-0000-0000-000000000011',
   '00bb0000-0000-0000-0000-000000000016','00dc0000-0000-0000-0000-000000000006',5,
   'Dr. Andi sangat berpengalaman dan memberikan rasa aman saat konsultasi kehamilan.');

-- ─────────────────────────────────────────────
-- 6. RESEP TAMBAHAN
-- ─────────────────────────────────────────────
INSERT INTO prescriptions (id, consultation_id, patient_id, doctor_id, pharmacy_id,
  status, fulfillment_type, delivery_address, notes, issued_at, expires_at)
VALUES
  ('00ee0000-0000-0000-0000-000000000006',
   '00cc0000-0000-0000-0000-000000000009',
   '00bb0000-0000-0000-0000-000000000011','00dc0000-0000-0000-0000-000000000004',
   'f0000000-0000-0000-0000-000000000001',
   'DELIVERED','PICKUP',NULL,
   'Habiskan antibiotik meski sudah merasa baik.',
   NOW()-INTERVAL '14 days', NOW()-INTERVAL '14 days'+INTERVAL '30 days'),

  ('00ee0000-0000-0000-0000-000000000007',
   '00cc0000-0000-0000-0000-000000000010',
   '00bb0000-0000-0000-0000-000000000012','00dc0000-0000-0000-0000-000000000002',
   'f0000000-0000-0000-0000-000000000003',
   'CONFIRMED','DELIVERY','Jl. Margonda Raya No.45, Depok',
   'Pantau keseimbangan cairan. Timbang badan setiap hari.',
   NOW()-INTERVAL '6 days', NOW()-INTERVAL '6 days'+INTERVAL '30 days'),

  ('00ee0000-0000-0000-0000-000000000008',
   '00cc0000-0000-0000-0000-000000000011',
   '00bb0000-0000-0000-0000-000000000016','00dc0000-0000-0000-0000-000000000006',
   NULL,
   'ISSUED',NULL,NULL,
   'Suplemen kehamilan diminum tiap malam.',
   NOW()-INTERVAL '4 days', NOW()-INTERVAL '4 days'+INTERVAL '30 days');

INSERT INTO prescription_items (prescription_id, drug_id, drug_name, dosage, quantity, instructions, substitution_allowed)
VALUES
  ('00ee0000-0000-0000-0000-000000000006','d0000000-0000-0000-0000-000000000001','Amoxicillin 500mg',
   '500mg 3x sehari',21,'Habiskan seluruh antibiotik',FALSE),
  ('00ee0000-0000-0000-0000-000000000006','d0000000-0000-0000-0000-000000000002','Paracetamol 500mg',
   '500mg k/p demam >38',15,'Maksimal 4 tablet sehari',TRUE),
  ('00ee0000-0000-0000-0000-000000000007','d0000000-0000-0000-0000-000000000009','Furosemide 40mg',
   '40mg 1x sehari pagi',30,'Monitor tekanan darah dan urin',FALSE),
  ('00ee0000-0000-0000-0000-000000000007','d0000000-0000-0000-0000-000000000024','Spironolactone 25mg',
   '25mg 1x sehari',30,'Pantau kalium darah',FALSE),
  ('00ee0000-0000-0000-0000-000000000008','d0000000-0000-0000-0000-000000000015','Vitamin D3 1000IU',
   '1x sehari',30,'Dengan makanan',TRUE);

-- ─────────────────────────────────────────────
-- 7. REFERRAL TAMBAHAN
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
-- 8. NOTIFIKASI TAMBAHAN
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
   'Pasien Benny Hardian mengalami status asmatikus. Ambulans D-9107-RS dispatch dari RSUD Bekasi.',
   'CRITICAL','ALERT',
   NOW()-INTERVAL '9 min', NOW()-INTERVAL '8 min', NULL, NOW()-INTERVAL '9 min'),

  ('00100000-0000-0000-0000-000000000009','PUSH','DELIVERED',
   'Pasien Baru: Juli Rahayu',
   'Pasien Juli Rahayu (hipertensi urgency) memulai konsultasi. Tekanan darah 190/110 mmHg.',
   'HIGH','CONSULTATION',
   NOW()-INTERVAL '5 min', NOW()-INTERVAL '4 min', NOW()-INTERVAL '3 min', NOW()-INTERVAL '5 min');

-- ─────────────────────────────────────────────
-- 9. VITAL SIGNS UNTUK PASIEN BARU
-- ─────────────────────────────────────────────
-- Pasien 12 (PGK - monitor BP ketat) & 13 (Asma - monitor SpO2)
INSERT INTO vital_signs (patient_id, device_id, heart_rate, spo2, systolic_bp, diastolic_bp,
  temperature, activity_level, battery_level, source, recorded_at)
SELECT
  pat_id::uuid,
  'MANUAL',
  (base_hr + floor(random()*14-7)::int)::smallint,
  round((base_spo2 + random()*3)::numeric, 1),
  (base_sys + floor(random()*16-8)::int)::smallint,
  (base_dia + floor(random()*10-5)::int)::smallint,
  round((36.3 + random()*1.1)::numeric, 1),
  'resting'::text,
  NULL::smallint,
  'MANUAL'::vital_source,
  NOW() - (hrs || ' hours')::interval
FROM
  (VALUES
    ('00bb0000-0000-0000-0000-000000000012', 76, 97.0, 148, 92),  -- PGK, BP tinggi
    ('00bb0000-0000-0000-0000-000000000013', 90, 95.0, 130, 80),  -- Asma, SpO2 batas
    ('00bb0000-0000-0000-0000-000000000019', 84, 97.5, 160, 100)  -- Hipertensi
  ) AS t(pat_id, base_hr, base_spo2, base_sys, base_dia),
  generate_series(1, 47) AS s(hrs);   -- 2 hari terakhir, tiap 1 jam

-- Vital sign abnormal terbaru pasien Benny & Juli
INSERT INTO vital_signs (patient_id, device_id, heart_rate, spo2, systolic_bp, diastolic_bp,
  temperature, activity_level, battery_level, source, recorded_at)
VALUES
  ('00bb0000-0000-0000-0000-000000000013','MANUAL',118, 87.5,135,85,37.4,'resting',NULL,'MANUAL',NOW()-INTERVAL '12 min'),
  ('00bb0000-0000-0000-0000-000000000013','MANUAL',122, 86.0,138,87,37.6,'resting',NULL,'MANUAL',NOW()-INTERVAL '10 min'),
  ('00bb0000-0000-0000-0000-000000000019','MANUAL',98,  96.5,190,110,37.1,'resting',NULL,'MANUAL',NOW()-INTERVAL '8 min'),
  ('00bb0000-0000-0000-0000-000000000019','MANUAL',100, 96.8,195,115,37.2,'resting',NULL,'MANUAL',NOW()-INTERVAL '5 min');

-- ─────────────────────────────────────────────
-- 10. ALERT UNTUK PASIEN BARU
-- ─────────────────────────────────────────────
INSERT INTO alerts (patient_id, device_id, level, status, trigger_metric,
  trigger_value, threshold_value, message, acknowledged_by, acknowledged_at, created_at)
VALUES
  ('00bb0000-0000-0000-0000-000000000013',NULL,
   'LEVEL_3','ACTIVE','spo2',86.0,90.0,
   'KRITIS: Saturasi oksigen Benny Hardian 86% — status asmatikus. Rujukan IGD segera.',
   NULL, NULL, NOW()-INTERVAL '10 min'),

  ('00bb0000-0000-0000-0000-000000000019',NULL,
   'LEVEL_2','ACTIVE','systolic_bp',195,160,
   'PERINGATAN: Tekanan darah Juli Rahayu 195/115 mmHg — hypertensive urgency.',
   NULL, NULL, NOW()-INTERVAL '5 min'),

  ('00bb0000-0000-0000-0000-000000000012',NULL,
   'LEVEL_1','ACKNOWLEDGED','systolic_bp',152,140,
   'INFO: Tekanan darah Wulandari Putri 152 mmHg — pantau ketat.',
   '00500000-0000-0000-0000-000000000001', NOW()-INTERVAL '5 days',
   NOW()-INTERVAL '6 days');

-- ─────────────────────────────────────────────
-- 11. UPDATE RATING DOKTER (setelah konsultasi baru)
-- ─────────────────────────────────────────────
UPDATE doctors d
SET
  rating_avg   = sub.avg,
  rating_count = sub.cnt,
  updated_at   = NOW()
FROM (
  SELECT doctor_id,
         ROUND(AVG(rating)::numeric, 2) AS avg,
         COUNT(*)                        AS cnt
  FROM   consultation_ratings
  GROUP BY doctor_id
) sub
WHERE d.id = sub.doctor_id;
