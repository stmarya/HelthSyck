-- V008: Rich seed data for development & demo scenarios
-- Covers: users, patients, doctors, hospitals, pharmacies, ambulances,
--         consultations, prescriptions, referrals, alerts, vital_signs,
--         notifications, and inventory.
-- All passwords: bcrypt hash of "Password@123"
-- UUID convention (all hex-valid):
--   hospitals:  a0000000-...
--   pharmacies: b0000000-...
--   drugs:      d0000000-...
--   users:      00100000-... (doctors) / 00200000-... (patients) / 00300000-... (pharmacists)
--               00400000-... (drivers) / 00500000-... (command center)
--   doctors:    00dc0000-...
--   patients:   00bb0000-...
--   ambulances: 00aa0000-...
--   consult:    00cc0000-...
--   prescrib:   00ee0000-...
--   referrals:  00ff0000-...
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ADDITIONAL HOSPITALS
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO hospitals (id, name, type, license_number, address, city, province,
  latitude, longitude, phone, email, igd_phone,
  total_beds, available_beds, icu_total, icu_available,
  specializations, is_active, is_emt_partner)
VALUES
  ('a0000000-0000-0000-0000-000000000002',
   'RS Jantung Harapan Kita', 'TYPE_A', 'RS-JKT-2024-002',
   'Jl. Letjen S. Parman Kav.87, Jakarta Barat', 'Jakarta Barat', 'DKI Jakarta',
   -6.1756, 106.7890, '021-5684085', 'info@rsjhk.id', '021-5684085',
   400, 82, 60, 15,
   ARRAY['CARDIOLOGY','CARDIAC_SURGERY','INTERVENTIONAL_CARDIOLOGY','INTERNAL_MEDICINE'],
   TRUE, TRUE),

  ('a0000000-0000-0000-0000-000000000003',
   'RSUP Dr. Cipto Mangunkusumo', 'TYPE_A', 'RS-JKT-2024-003',
   'Jl. Diponegoro No.71, Jakarta Pusat', 'Jakarta Pusat', 'DKI Jakarta',
   -6.1945, 106.8452, '021-3910000', 'info@rscm.id', '021-3910600',
   900, 120, 80, 22,
   ARRAY['ONCOLOGY','NEUROLOGY','NEUROSURGERY','CARDIOLOGY','PEDIATRIC','OBSTETRICS','ORTHOPEDIC'],
   TRUE, TRUE),

  ('a0000000-0000-0000-0000-000000000004',
   'RS Pondok Indah', 'TYPE_B', 'RS-JKT-2024-004',
   'Jl. Metro Duta Kav. UE, Jakarta Selatan', 'Jakarta Selatan', 'DKI Jakarta',
   -6.2672, 106.7890, '021-7657525', 'info@rspi.co.id', '021-7657119',
   300, 55, 30, 10,
   ARRAY['GENERAL_SURGERY','ORTHOPEDIC','INTERNAL_MEDICINE','OBSTETRICS','PEDIATRIC'],
   TRUE, FALSE),

  ('a0000000-0000-0000-0000-000000000005',
   'Puskesmas Tebet', 'PUSKESMAS', 'PKM-JKT-2024-005',
   'Jl. Tebet Raya No.51, Jakarta Selatan', 'Jakarta Selatan', 'DKI Jakarta',
   -6.2256, 106.8504, '021-8298811', 'pkmtebet@jakarta.go.id', NULL,
   20, 8, 0, 0,
   ARRAY['GENERAL_MEDICINE','MATERNAL_CHILD_HEALTH','IMMUNIZATION'],
   TRUE, FALSE);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. PHARMACIES
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO pharmacies (id, name, license_number, address, latitude, longitude,
  phone, is_active, operating_hours)
VALUES
  ('f0000000-0000-0000-0000-000000000001',
   'Apotek Kimia Farma Sudirman', 'APT-KF-001',
   'Jl. Jend. Sudirman No.5, Jakarta Pusat',
   -6.2088, 106.8200, '021-5700801', TRUE,
   '{"monday":{"open":"08:00","close":"22:00"},"tuesday":{"open":"08:00","close":"22:00"},"saturday":{"open":"09:00","close":"21:00"},"sunday":{"open":"10:00","close":"20:00"}}'::jsonb),

  ('f0000000-0000-0000-0000-000000000002',
   'Apotek Guardian Pondok Indah Mall', 'APT-GRD-002',
   'Pondok Indah Mall 2 Lt.1, Jakarta Selatan',
   -6.2672, 106.7890, '021-7656789', TRUE,
   '{"monday":{"open":"10:00","close":"22:00"},"tuesday":{"open":"10:00","close":"22:00"},"saturday":{"open":"10:00","close":"22:00"},"sunday":{"open":"10:00","close":"22:00"}}'::jsonb),

  ('f0000000-0000-0000-0000-000000000003',
   'Apotek RS Jantung Harapan Kita', 'APT-RSJHK-003',
   'RS Jantung Harapan Kita, Jl. Letjen S. Parman Kav.87',
   -6.1756, 106.7890, '021-5684086', TRUE,
   '{"monday":{"open":"07:00","close":"21:00"},"tuesday":{"open":"07:00","close":"21:00"},"saturday":{"open":"07:00","close":"17:00"},"sunday":{"open":"08:00","close":"14:00"}}'::jsonb);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ADDITIONAL DRUGS
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO drugs (id, generic_name, brand_name, dosage_form, strength, unit, drug_class, requires_prescription)
VALUES
  ('d0000000-0000-0000-0000-000000000006', 'Clopidogrel',     'Plavix',    'TABLET',   '75mg',      'tablet',  'ANTIPLATELET',  TRUE),
  ('d0000000-0000-0000-0000-000000000007', 'Atorvastatin',    'Lipitor',   'TABLET',   '20mg',      'tablet',  'STATIN',        TRUE),
  ('d0000000-0000-0000-0000-000000000008', 'Bisoprolol',      'Concor',    'TABLET',   '5mg',       'tablet',  'BETA_BLOCKER',  TRUE),
  ('d0000000-0000-0000-0000-000000000009', 'Furosemide',      'Lasix',     'TABLET',   '40mg',      'tablet',  'DIURETIC',      TRUE),
  ('d0000000-0000-0000-0000-000000000010', 'Insulin Glargine','Lantus',    'INJECTION','100IU/mL',  'vial',    'INSULIN',       TRUE),
  ('d0000000-0000-0000-0000-000000000011', 'Cetirizine',      'Zyrtec',    'TABLET',   '10mg',      'tablet',  'ANTIHISTAMINE', FALSE),
  ('d0000000-0000-0000-0000-000000000012', 'Salbutamol',      'Ventolin',  'INHALER',  '100mcg',    'inhaler', 'BRONCHODILATOR',TRUE),
  ('d0000000-0000-0000-0000-000000000013', 'Prednisone',      'Deltasone', 'TABLET',   '5mg',       'tablet',  'CORTICOSTEROID',TRUE),
  ('d0000000-0000-0000-0000-000000000014', 'Lisinopril',      'Zestril',   'TABLET',   '10mg',      'tablet',  'ACE_INHIBITOR', TRUE),
  ('d0000000-0000-0000-0000-000000000015', 'Vitamin D3',      'Blackmores','CAPSULE',  '1000IU',    'capsule', 'SUPPLEMENT',    FALSE);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. PHARMACY INVENTORY
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO pharmacy_inventory (pharmacy_id, drug_id, stock_qty, unit_price, batch_number, expires_at, reorder_level)
VALUES
  ('f0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001',250, 8500,  'KF-25-A01','2027-06-30',50),
  ('f0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002',500, 1200,  'KF-25-A02','2027-12-31',100),
  ('f0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000003',180, 15000, 'KF-25-A03','2027-08-31',40),
  ('f0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000004',300, 12000, 'KF-25-A04','2027-09-30',60),
  ('f0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000005',200, 6500,  'KF-25-A05','2027-10-31',50),
  ('f0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000007',150, 25000, 'KF-25-A07','2027-06-30',30),
  ('f0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000008',120, 18000, 'KF-25-A08','2027-07-31',25),
  ('f0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000011',400, 7500,  'KF-25-A11','2027-11-30',80),
  ('f0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000015',600, 45000, 'KF-25-A15','2028-01-31',100),
  ('f0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000002',800, 1300,  'GD-25-B02','2027-12-31',150),
  ('f0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000004',200, 13500, 'GD-25-B04','2027-09-30',40),
  ('f0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000011',350, 8000,  'GD-25-B11','2027-11-30',70),
  ('f0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000012',90,  85000, 'GD-25-B12','2027-05-31',20),
  ('f0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000015',450, 48000, 'GD-25-B15','2028-01-31',90),
  ('f0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000006',100, 22000, 'JH-25-C06','2027-08-31',20),
  ('f0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000007',200, 24000, 'JH-25-C07','2027-06-30',40),
  ('f0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000008',180, 17000, 'JH-25-C08','2027-07-31',35),
  ('f0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000009',120, 9000,  'JH-25-C09','2027-10-31',25),
  ('f0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000010',30,  450000,'JH-25-C10','2027-03-31',5),
  ('f0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000014',150, 11000, 'JH-25-C14','2027-09-30',30);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. USERS — doctors, patients, pharmacists, ambulance drivers, command center
-- Password hash = bcrypt('Password@123', 10 rounds)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO users (id, email, phone, password_hash, role, status, email_verified, phone_verified)
VALUES
  -- Doctors (5)
  ('00100000-0000-0000-0000-000000000001','dr.budi.santoso@healthsync.id', '+6281100000001','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','DOCTOR','ACTIVE',TRUE,TRUE),
  ('00100000-0000-0000-0000-000000000002','dr.siti.rahayu@healthsync.id',  '+6281100000002','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','DOCTOR','ACTIVE',TRUE,TRUE),
  ('00100000-0000-0000-0000-000000000003','dr.ahmad.fauzi@healthsync.id',  '+6281100000003','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','DOCTOR','ACTIVE',TRUE,TRUE),
  ('00100000-0000-0000-0000-000000000004','dr.dewi.kusuma@healthsync.id',  '+6281100000004','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','DOCTOR','ACTIVE',TRUE,TRUE),
  ('00100000-0000-0000-0000-000000000005','dr.rizal.hakim@healthsync.id',  '+6281100000005','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','DOCTOR','ACTIVE',TRUE,TRUE),
  -- Patients (10)
  ('00200000-0000-0000-0000-000000000001','budi.pekerti@gmail.com',        '+6281200000001','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','PATIENT','ACTIVE',TRUE,TRUE),
  ('00200000-0000-0000-0000-000000000002','siti.aminah@gmail.com',         '+6281200000002','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','PATIENT','ACTIVE',TRUE,TRUE),
  ('00200000-0000-0000-0000-000000000003','hendra.wijaya@gmail.com',       '+6281200000003','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','PATIENT','ACTIVE',TRUE,TRUE),
  ('00200000-0000-0000-0000-000000000004','rina.lestari@gmail.com',        '+6281200000004','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','PATIENT','ACTIVE',TRUE,TRUE),
  ('00200000-0000-0000-0000-000000000005','doni.prasetyo@gmail.com',       '+6281200000005','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','PATIENT','ACTIVE',TRUE,TRUE),
  ('00200000-0000-0000-0000-000000000006','maya.sari@gmail.com',           '+6281200000006','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','PATIENT','ACTIVE',TRUE,TRUE),
  ('00200000-0000-0000-0000-000000000007','agus.salim@gmail.com',          '+6281200000007','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','PATIENT','ACTIVE',TRUE,TRUE),
  ('00200000-0000-0000-0000-000000000008','fitri.handayani@gmail.com',     '+6281200000008','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','PATIENT','ACTIVE',TRUE,FALSE),
  ('00200000-0000-0000-0000-000000000009','joko.widodo@gmail.com',         '+6281200000009','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','PATIENT','ACTIVE',TRUE,TRUE),
  ('00200000-0000-0000-0000-000000000010','nurul.hidayah@gmail.com',       '+6281200000010','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','PATIENT','ACTIVE',TRUE,TRUE),
  -- Pharmacists (2)
  ('00300000-0000-0000-0000-000000000001','apt.ratna.dewi@healthsync.id',  '+6281300000001','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','PHARMACIST','ACTIVE',TRUE,TRUE),
  ('00300000-0000-0000-0000-000000000002','apt.farhan.rizki@healthsync.id','+6281300000002','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','PHARMACIST','ACTIVE',TRUE,TRUE),
  -- Ambulance Drivers (3)
  ('00400000-0000-0000-0000-000000000001','driver.supriadi@healthsync.id', '+6281400000001','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','AMBULANCE_DRIVER','ACTIVE',TRUE,TRUE),
  ('00400000-0000-0000-0000-000000000002','driver.bambang@healthsync.id',  '+6281400000002','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','AMBULANCE_DRIVER','ACTIVE',TRUE,TRUE),
  ('00400000-0000-0000-0000-000000000003','driver.wahyu@healthsync.id',    '+6281400000003','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','AMBULANCE_DRIVER','ACTIVE',TRUE,TRUE),
  -- Command Center (2 more)
  ('00500000-0000-0000-0000-000000000001','cc.indah.permata@healthsync.id','+6281500000001','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','COMMAND_CENTER','ACTIVE',TRUE,TRUE),
  ('00500000-0000-0000-0000-000000000002','cc.rendi.saputra@healthsync.id','+6281500000002','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO','COMMAND_CENTER','ACTIVE',TRUE,TRUE);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. DOCTORS
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO doctors (id, user_id, str_number, sip_number, specialization, sub_specialization,
  hospital_id, years_experience, consultation_fee, is_available, rating_avg, rating_count,
  str_verified_at, sip_verified_at)
VALUES
  ('00dc0000-0000-0000-0000-000000000001','00100000-0000-0000-0000-000000000001',
   'STR-2015-JKT-001','SIP-2023-JKT-001','CARDIOLOGY','Interventional Cardiology',
   'a0000000-0000-0000-0000-000000000002', 12, 350000, TRUE,  4.8, 124,
   NOW()-INTERVAL '3 years', NOW()-INTERVAL '1 year'),

  ('00dc0000-0000-0000-0000-000000000002','00100000-0000-0000-0000-000000000002',
   'STR-2018-JKT-002','SIP-2023-JKT-002','INTERNAL_MEDICINE','Endocrinology',
   'a0000000-0000-0000-0000-000000000001', 8, 200000, TRUE,  4.6, 87,
   NOW()-INTERVAL '2 years', NOW()-INTERVAL '6 months'),

  ('00dc0000-0000-0000-0000-000000000003','00100000-0000-0000-0000-000000000003',
   'STR-2016-JKT-003','SIP-2022-JKT-003','NEUROLOGY',NULL,
   'a0000000-0000-0000-0000-000000000003', 10, 300000, FALSE, 4.7, 98,
   NOW()-INTERVAL '4 years', NOW()-INTERVAL '2 years'),

  ('00dc0000-0000-0000-0000-000000000004','00100000-0000-0000-0000-000000000004',
   'STR-2020-JKT-004','SIP-2023-JKT-004','GENERAL_MEDICINE',NULL,
   'a0000000-0000-0000-0000-000000000005', 5, 75000, TRUE,  4.5, 210,
   NOW()-INTERVAL '1 year', NOW()-INTERVAL '6 months'),

  ('00dc0000-0000-0000-0000-000000000005','00100000-0000-0000-0000-000000000005',
   'STR-2017-JKT-005','SIP-2023-JKT-005','ORTHOPEDIC','Spine Surgery',
   'a0000000-0000-0000-0000-000000000001', 9, 400000, TRUE,  4.9, 156,
   NOW()-INTERVAL '3 years', NOW()-INTERVAL '1 year');

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. PATIENTS
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO patients (id, user_id, nik_token, name, date_of_birth, gender,
  blood_type, phone, address, emergency_contact_name, emergency_contact_phone)
VALUES
  ('00bb0000-0000-0000-0000-000000000001','00200000-0000-0000-0000-000000000001',
   encode(sha256('3171010101650001'::bytea),'hex'),
   'Budi Pekerti','1965-01-01','MALE','A+','+6281200000001','Jl. Sudirman No.12, Jakarta Selatan','Siti Pekerti','+6281200009001'),

  ('00bb0000-0000-0000-0000-000000000002','00200000-0000-0000-0000-000000000002',
   encode(sha256('3171020202700002'::bytea),'hex'),
   'Siti Aminah','1970-02-02','FEMALE','O+','+6281200000002','Jl. Gatot Subroto No.22, Jakarta Pusat','Ahmad Aminah','+6281200009002'),

  ('00bb0000-0000-0000-0000-000000000003','00200000-0000-0000-0000-000000000003',
   encode(sha256('3171030303850003'::bytea),'hex'),
   'Hendra Wijaya','1985-03-03','MALE','B+','+6281200000003','Jl. Rasuna Said Blok X, Jakarta Selatan','Rina Wijaya','+6281200009003'),

  ('00bb0000-0000-0000-0000-000000000004','00200000-0000-0000-0000-000000000004',
   encode(sha256('3171040404900004'::bytea),'hex'),
   'Rina Lestari','1990-04-04','FEMALE','AB-','+6281200000004','Jl. Kuningan Raya No.9, Jakarta Selatan','Dodi Lestari','+6281200009004'),

  ('00bb0000-0000-0000-0000-000000000005','00200000-0000-0000-0000-000000000005',
   encode(sha256('3171050505780005'::bytea),'hex'),
   'Doni Prasetyo','1978-05-05','MALE','O-','+6281200000005','Jl. HR Rasuna Said No.15, Kuningan','Dewi Prasetyo','+6281200009005'),

  ('00bb0000-0000-0000-0000-000000000006','00200000-0000-0000-0000-000000000006',
   encode(sha256('3171060606920006'::bytea),'hex'),
   'Maya Sari','1992-06-06','FEMALE','A-','+6281200000006','Jl. Kemang Raya No.88, Jakarta Selatan','Eko Sari','+6281200009006'),

  ('00bb0000-0000-0000-0000-000000000007','00200000-0000-0000-0000-000000000007',
   encode(sha256('3171070707550007'::bytea),'hex'),
   'Agus Salim','1955-07-07','MALE','B-','+6281200000007','Jl. Tebet Raya No.45, Jakarta Selatan','Heri Salim','+6281200009007'),

  ('00bb0000-0000-0000-0000-000000000008','00200000-0000-0000-0000-000000000008',
   encode(sha256('3171080808880008'::bytea),'hex'),
   'Fitri Handayani','1988-08-08','FEMALE','O+','+6281200000008','Jl. Blok M Raya No.10, Jakarta Selatan','Bayu Handayani','+6281200009008'),

  ('00bb0000-0000-0000-0000-000000000009','00200000-0000-0000-0000-000000000009',
   encode(sha256('3171090909600009'::bytea),'hex'),
   'Joko Widodo','1960-09-09','MALE','A+','+6281200000009','Jl. Senayan No.1, Jakarta Pusat','Iriana Widodo','+6281200009009'),

  ('00bb0000-0000-0000-0000-000000000010','00200000-0000-0000-0000-000000000010',
   encode(sha256('3171101010950010'::bytea),'hex'),
   'Nurul Hidayah','1995-10-10','FEMALE','AB+','+6281200000010','Jl. Menteng Raya No.30, Jakarta Pusat','Faisal Hidayah','+6281200009010');

-- Patient conditions
INSERT INTO patient_conditions (patient_id, icd10_code, description, diagnosed_at, is_active, notes)
VALUES
  ('00bb0000-0000-0000-0000-000000000001','I10',  'Hipertensi Esensial',     '2015-03-10', TRUE, 'Terkontrol dengan Amlodipine 5mg'),
  ('00bb0000-0000-0000-0000-000000000001','E11',  'Diabetes Mellitus Tipe 2','2018-07-20', TRUE, 'HbA1c terakhir 7.2%'),
  ('00bb0000-0000-0000-0000-000000000002','E11',  'Diabetes Mellitus Tipe 2','2020-01-15', TRUE, 'Menggunakan insulin glargine malam'),
  ('00bb0000-0000-0000-0000-000000000003','M54.5','Low Back Pain Kronik',    '2022-06-01', TRUE, 'Riwayat HNP L4-L5'),
  ('00bb0000-0000-0000-0000-000000000005','I25',  'Penyakit Jantung Koroner','2019-11-05', TRUE, 'Post PCI LAD 2020'),
  ('00bb0000-0000-0000-0000-000000000007','J45',  'Asma Bronkial',           '2010-04-20', TRUE, 'Menggunakan inhaler salbutamol PRN'),
  ('00bb0000-0000-0000-0000-000000000009','I25',  'Penyakit Jantung Koroner','2017-08-12', TRUE, 'Riwayat stent 3 pembuluh'),
  ('00bb0000-0000-0000-0000-000000000009','I10',  'Hipertensi',              '2015-05-01', TRUE, 'Kombinasi 3 obat antihipertensi');

-- Patient allergies
INSERT INTO patient_allergies (patient_id, allergen, reaction, severity)
VALUES
  ('00bb0000-0000-0000-0000-000000000004','Penicillin','Urtikaria seluruh tubuh','SEVERE'),
  ('00bb0000-0000-0000-0000-000000000006','Sulfa',     'Ruam makulopapular',     'MODERATE'),
  ('00bb0000-0000-0000-0000-000000000008','Aspirin',   'Bronkospasme',           'SEVERE'),
  ('00bb0000-0000-0000-0000-000000000010','Codeine',   'Mual muntah berat',      'MODERATE');

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. AMBULANCES
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO ambulances (id, hospital_id, plate_number, type, status,
  driver_id, latitude, longitude, is_active)
VALUES
  ('00aa0000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',
   'B 9101 RS','ALS','AVAILABLE','00400000-0000-0000-0000-000000000001',-6.2091,106.8460,TRUE),
  ('00aa0000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001',
   'B 9102 RS','BLS','DISPATCHED','00400000-0000-0000-0000-000000000002',-6.2150,106.8350,TRUE),
  ('00aa0000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000002',
   'B 9103 RS','ALS','AVAILABLE','00400000-0000-0000-0000-000000000003',-6.1760,106.7893,TRUE),
  ('00aa0000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000003',
   'B 9104 RS','NICU','OFFLINE',NULL,-6.1948,106.8455,TRUE);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. CONSULTATIONS
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO consultations (id, patient_id, doctor_id, status, chief_complaint,
  diagnosis, notes, started_at, ended_at, created_at)
VALUES
  ('00cc0000-0000-0000-0000-000000000001',
   '00bb0000-0000-0000-0000-000000000001','00dc0000-0000-0000-0000-000000000002',
   'COMPLETED','Gula darah tidak terkontrol, sering haus dan sering kencing',
   'Diabetes Mellitus Tipe 2 tidak terkontrol. Naikkan dosis Metformin.',
   'HbA1c = 8.5%. Naikkan Metformin ke 850mg 3x/hari. Cek ulang 1 bulan.',
   NOW()-INTERVAL '10 days', NOW()-INTERVAL '10 days'+INTERVAL '35 min', NOW()-INTERVAL '10 days'),

  ('00cc0000-0000-0000-0000-000000000002',
   '00bb0000-0000-0000-0000-000000000005','00dc0000-0000-0000-0000-000000000001',
   'COMPLETED','Nyeri dada seperti ditekan, muncul saat aktivitas ringan',
   'Angina pektoris stabil pada pasien PJK. EKG: ST depresi V4-V6.',
   'Tambahkan nitrat sublingual PRN. Jadwalkan stress test bulan depan.',
   NOW()-INTERVAL '7 days', NOW()-INTERVAL '7 days'+INTERVAL '45 min', NOW()-INTERVAL '7 days'),

  ('00cc0000-0000-0000-0000-000000000003',
   '00bb0000-0000-0000-0000-000000000003','00dc0000-0000-0000-0000-000000000005',
   'COMPLETED','Nyeri pinggang bawah menjalar ke kaki kiri sejak 2 minggu',
   'HNP L4-L5 eksaserbasi akut. MRI: protrusi diskus dengan penekanan radiks L5.',
   'Fisioterapi 3x seminggu. Analgesik + muscle relaxant. Hindari angkat berat.',
   NOW()-INTERVAL '5 days', NOW()-INTERVAL '5 days'+INTERVAL '30 min', NOW()-INTERVAL '5 days'),

  ('00cc0000-0000-0000-0000-000000000004',
   '00bb0000-0000-0000-0000-000000000009','00dc0000-0000-0000-0000-000000000001',
   'IN_PROGRESS','Jantung berdebar tidak teratur sejak kemarin malam, sesak napas ringan',
   NULL, NULL,
   NOW()-INTERVAL '20 min', NULL, NOW()-INTERVAL '25 min'),

  ('00cc0000-0000-0000-0000-000000000005',
   '00bb0000-0000-0000-0000-000000000007','00dc0000-0000-0000-0000-000000000004',
   'PENDING','Sesak napas dan mengi, obat inhaler habis',
   NULL, NULL, NULL, NULL, NOW()-INTERVAL '1 hour'),

  ('00cc0000-0000-0000-0000-000000000006',
   '00bb0000-0000-0000-0000-000000000002','00dc0000-0000-0000-0000-000000000002',
   'COMPLETED','Kontrol rutin diabetes, luka di kaki kiri tidak sembuh 2 minggu',
   'DM Tipe 2 + ulkus diabetikum grade 2 kaki kiri.',
   'Rawat luka setiap hari. Konsul bedah vaskular. Titration insulin.',
   NOW()-INTERVAL '3 days', NOW()-INTERVAL '3 days'+INTERVAL '50 min', NOW()-INTERVAL '3 days'),

  ('00cc0000-0000-0000-0000-000000000007',
   '00bb0000-0000-0000-0000-000000000004','00dc0000-0000-0000-0000-000000000004',
   'COMPLETED','Demam 3 hari, batuk pilek, nyeri tenggorokan',
   'ISPA akut, faringitis bakterial.',
   'Amoxicillin 500mg 3x1 selama 7 hari. Paracetamol 500mg k/p.',
   NOW()-INTERVAL '2 days', NOW()-INTERVAL '2 days'+INTERVAL '20 min', NOW()-INTERVAL '2 days'),

  ('00cc0000-0000-0000-0000-000000000008',
   '00bb0000-0000-0000-0000-000000000006','00dc0000-0000-0000-0000-000000000004',
   'CANCELLED','Sakit kepala dan mual',
   NULL, 'Pasien membatalkan sebelum konsultasi dimulai.',
   NULL, NULL, NOW()-INTERVAL '1 day');

-- Consultation messages
INSERT INTO consultation_messages (consultation_id, sender_id, message_type, content, is_read, read_at, created_at)
VALUES
  ('00cc0000-0000-0000-0000-000000000001','00200000-0000-0000-0000-000000000001','TEXT',
   'Selamat pagi Dokter, gula darah saya sudah 3 minggu terus di atas 300 meski sudah minum obat rutin.',
   TRUE,NOW()-INTERVAL '10 days'+INTERVAL '2 min',NOW()-INTERVAL '10 days'+INTERVAL '1 min'),
  ('00cc0000-0000-0000-0000-000000000001','00100000-0000-0000-0000-000000000002','TEXT',
   'Selamat pagi Pak Budi. Boleh saya lihat catatan obat yang dikonsumsi saat ini?',
   TRUE,NOW()-INTERVAL '10 days'+INTERVAL '4 min',NOW()-INTERVAL '10 days'+INTERVAL '3 min'),
  ('00cc0000-0000-0000-0000-000000000001','00200000-0000-0000-0000-000000000001','TEXT',
   'Saya minum Metformin 500mg 2x sehari dan Amlodipine 5mg malam hari.',
   TRUE,NOW()-INTERVAL '10 days'+INTERVAL '6 min',NOW()-INTERVAL '10 days'+INTERVAL '5 min'),
  ('00cc0000-0000-0000-0000-000000000001','00100000-0000-0000-0000-000000000002','TEXT',
   'Baik. Saya naikkan dosis Metformin dan tambahkan cek HbA1c. Mohon ke lab terdekat.',
   TRUE,NOW()-INTERVAL '10 days'+INTERVAL '10 min',NOW()-INTERVAL '10 days'+INTERVAL '9 min'),
  ('00cc0000-0000-0000-0000-000000000004','00200000-0000-0000-0000-000000000009','TEXT',
   'Dokter, jantung saya tiba-tiba berdebar kencang dan tidak teratur sejak semalam. Saya takut.',
   FALSE,NULL,NOW()-INTERVAL '22 min'),
  ('00cc0000-0000-0000-0000-000000000004','00100000-0000-0000-0000-000000000001','TEXT',
   'Halo Pak Joko. Apakah ada nyeri dada, keringat dingin, atau pusing bersamaan?',
   FALSE,NULL,NOW()-INTERVAL '20 min'),
  ('00cc0000-0000-0000-0000-000000000004','00200000-0000-0000-0000-000000000009','TEXT',
   'Ada sedikit sesak napas tapi tidak nyeri dada. Kemarin saya lupa minum Clopidogrel.',
   FALSE,NULL,NOW()-INTERVAL '18 min');

-- Consultation ratings
INSERT INTO consultation_ratings (consultation_id, patient_id, doctor_id, rating, review)
VALUES
  ('00cc0000-0000-0000-0000-000000000001','00bb0000-0000-0000-0000-000000000001','00dc0000-0000-0000-0000-000000000002',5,'Dokter Siti sangat sabar menjelaskan. Sangat membantu!'),
  ('00cc0000-0000-0000-0000-000000000002','00bb0000-0000-0000-0000-000000000005','00dc0000-0000-0000-0000-000000000001',5,'Dr. Budi sangat profesional, penjelasan lengkap dan mudah dipahami.'),
  ('00cc0000-0000-0000-0000-000000000003','00bb0000-0000-0000-0000-000000000003','00dc0000-0000-0000-0000-000000000005',5,'Terima kasih Dr. Rizal, kondisi saya dijelaskan dengan sangat detail.'),
  ('00cc0000-0000-0000-0000-000000000007','00bb0000-0000-0000-0000-000000000004','00dc0000-0000-0000-0000-000000000004',4,'Pelayanan cepat dan ramah!');

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. PRESCRIPTIONS + ITEMS
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO prescriptions (id, consultation_id, patient_id, doctor_id, pharmacy_id,
  status, fulfillment_type, delivery_address, notes, issued_at, expires_at)
VALUES
  ('00ee0000-0000-0000-0000-000000000001',
   '00cc0000-0000-0000-0000-000000000001','00bb0000-0000-0000-0000-000000000001','00dc0000-0000-0000-0000-000000000002',
   'b0000000-0000-0000-0000-000000000001',
   'DELIVERED','DELIVERY','Jl. Sudirman No.12, Jakarta Selatan',
   'Minum setelah makan. Monitor gula darah mandiri pagi hari.',
   NOW()-INTERVAL '10 days', NOW()-INTERVAL '10 days'+INTERVAL '30 days'),

  ('00ee0000-0000-0000-0000-000000000002',
   '00cc0000-0000-0000-0000-000000000002','00bb0000-0000-0000-0000-000000000005','00dc0000-0000-0000-0000-000000000001',
   'f0000000-0000-0000-0000-000000000003',
   'READY','PICKUP',NULL,
   'Jangan menghentikan Clopidogrel tanpa konsultasi dokter.',
   NOW()-INTERVAL '7 days', NOW()-INTERVAL '7 days'+INTERVAL '30 days'),

  ('00ee0000-0000-0000-0000-000000000003',
   '00cc0000-0000-0000-0000-000000000003','00bb0000-0000-0000-0000-000000000003','00dc0000-0000-0000-0000-000000000005',
   'f0000000-0000-0000-0000-000000000002',
   'CONFIRMED','DELIVERY','Jl. Rasuna Said Blok X, Jakarta Selatan',
   'Jangan diminum dengan alkohol. Konsumsi bersama makanan.',
   NOW()-INTERVAL '5 days', NOW()-INTERVAL '5 days'+INTERVAL '30 days'),

  ('00ee0000-0000-0000-0000-000000000004',
   '00cc0000-0000-0000-0000-000000000006','00bb0000-0000-0000-0000-000000000002','00dc0000-0000-0000-0000-000000000002',
   NULL,
   'ISSUED',NULL,NULL,
   'Insulin disimpan di kulkas. Jangan sampai beku.',
   NOW()-INTERVAL '3 days', NOW()-INTERVAL '3 days'+INTERVAL '30 days'),

  ('00ee0000-0000-0000-0000-000000000005',
   '00cc0000-0000-0000-0000-000000000007','00bb0000-0000-0000-0000-000000000004','00dc0000-0000-0000-0000-000000000004',
   'b0000000-0000-0000-0000-000000000001',
   'DELIVERED','DELIVERY','Jl. Kuningan Raya No.9, Jakarta Selatan',
   'Habiskan antibiotik meski sudah merasa sembuh.',
   NOW()-INTERVAL '2 days', NOW()-INTERVAL '2 days'+INTERVAL '30 days');

INSERT INTO prescription_items (prescription_id, drug_id, drug_name, dosage, quantity, instructions, substitution_allowed)
VALUES
  ('00ee0000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000005','Metformin 500mg',  '850mg 3x sehari setelah makan',90,'Naikkan bertahap jika mual',FALSE),
  ('00ee0000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000004','Amlodipine 5mg',   '5mg 1x sehari malam hari',    30,'Minum pada jam yang sama setiap hari',TRUE),
  ('00ee0000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000006','Clopidogrel 75mg', '75mg 1x sehari pagi',         30,'Jangan hentikan tanpa konsultasi',FALSE),
  ('00ee0000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000007','Atorvastatin 20mg','20mg 1x sehari malam',         30,'Minum pada jam yang sama',FALSE),
  ('00ee0000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000008','Bisoprolol 5mg',   '5mg 1x sehari pagi',          30,'Monitor nadi <50 bpm hentikan',FALSE),
  ('00ee0000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000002','Paracetamol 500mg','500mg 3x sehari jika nyeri',   30,'Maksimal 4 tablet/hari',TRUE),
  ('00ee0000-0000-0000-0000-000000000004','d0000000-0000-0000-0000-000000000010','Insulin Glargine', '10 unit SC setiap malam',       3,'Rotasi tempat injeksi',FALSE),
  ('00ee0000-0000-0000-0000-000000000004','d0000000-0000-0000-0000-000000000005','Metformin 500mg',  '500mg 2x sehari setelah makan',60,'Lanjutkan dosis saat ini',FALSE),
  ('00ee0000-0000-0000-0000-000000000005','d0000000-0000-0000-0000-000000000001','Amoxicillin 500mg','500mg 3x sehari',              21,'Habiskan semua antibiotik',FALSE),
  ('00ee0000-0000-0000-0000-000000000005','d0000000-0000-0000-0000-000000000002','Paracetamol 500mg','500mg 3x sehari jika demam >38',15,'Minum banyak air',TRUE);

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. REFERRALS
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO referrals (id, patient_id, from_hospital_id, to_hospital_id,
  referring_doctor_id, receiving_doctor_id, ambulance_id,
  status, reason, diagnosis, urgency_level, required_specialization,
  sent_at, accepted_at, arrived_at, created_at)
VALUES
  ('00ff0000-0000-0000-0000-000000000001',
   '00bb0000-0000-0000-0000-000000000005',
   'a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002',
   '00dc0000-0000-0000-0000-000000000002','00dc0000-0000-0000-0000-000000000001',
   '00aa0000-0000-0000-0000-000000000001',
   'ARRIVED',
   'Pasien memerlukan tindakan kateterisasi jantung segera. Tidak tersedia di RSUD Pilot.',
   'STEMI anterior, onset 2 jam. Perlu primary PCI segera.',
   'CRITICAL','CARDIOLOGY',
   NOW()-INTERVAL '8 days', NOW()-INTERVAL '8 days'+INTERVAL '15 min',
   NOW()-INTERVAL '8 days'+INTERVAL '45 min', NOW()-INTERVAL '8 days'),

  ('00ff0000-0000-0000-0000-000000000002',
   '00bb0000-0000-0000-0000-000000000003',
   'a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000003',
   '00dc0000-0000-0000-0000-000000000005',NULL,
   '00aa0000-0000-0000-0000-000000000002',
   'IN_TRANSIT',
   'Memerlukan MRI 3T dan bedah tulang belakang yang tidak tersedia di sini.',
   'HNP L4-L5 berat dengan sindrom kauda ekuina.',
   'URGENT','NEUROSURGERY',
   NOW()-INTERVAL '4 days', NOW()-INTERVAL '4 days'+INTERVAL '1 hour',
   NULL, NOW()-INTERVAL '4 days'),

  ('00ff0000-0000-0000-0000-000000000003',
   '00bb0000-0000-0000-0000-000000000009',
   'a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002',
   '00dc0000-0000-0000-0000-000000000001',NULL,NULL,
   'DRAFT',
   'Dicurigai aritmia ventrikel. Perlu monitoring Holter 24 jam dan evaluasi EP.',
   'Palpitasi berulang, riwayat PJK, EKG menunjukkan PVC bigemini.',
   'URGENT','CARDIOLOGY',
   NULL,NULL,NULL, NOW()-INTERVAL '10 minutes');

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. IOT DEVICES
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO iot_devices (patient_id, device_id, device_type, firmware_version, is_active, last_seen_at)
VALUES
  ('00bb0000-0000-0000-0000-000000000001','DEVICE-P001-WATCH','Samsung Galaxy Watch 6','3.1.2',TRUE,NOW()-INTERVAL '30 min'),
  ('00bb0000-0000-0000-0000-000000000005','DEVICE-P005-WATCH','Fitbit Sense 2',        '2.8.5',TRUE,NOW()-INTERVAL '3 hours'),
  ('00bb0000-0000-0000-0000-000000000009','DEVICE-P009-WATCH','Apple Watch Series 9',  '10.2.1',TRUE,NOW()-INTERVAL '1 hour');

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. VITAL SIGNS (hourly, 7 days, 3 patients = 504 normal rows)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO vital_signs (patient_id, device_id, heart_rate, spo2, systolic_bp, diastolic_bp,
  temperature, activity_level, battery_level, source, recorded_at)
SELECT
  pat_id::uuid,
  dev_id,
  (base_hr + floor(random()*20-10)::int)::smallint,
  round((95 + random()*4.5)::numeric, 2),
  (base_sys + floor(random()*20-10)::int)::smallint,
  (base_dia + floor(random()*14-7)::int)::smallint,
  round((36.2 + random()*1.3)::numeric, 1),
  (ARRAY['resting','walking','resting','resting','resting'])[floor(random()*5+1)::int],
  (60 + floor(random()*40))::smallint,
  'IOT_DEVICE'::vital_source,
  NOW() - (hrs || ' hours')::interval
FROM
  (VALUES
    ('00bb0000-0000-0000-0000-000000000001','DEVICE-P001-WATCH',75,130,82),
    ('00bb0000-0000-0000-0000-000000000005','DEVICE-P005-WATCH',88,140,90),
    ('00bb0000-0000-0000-0000-000000000009','DEVICE-P009-WATCH',92,145,92)
  ) AS t(pat_id, dev_id, base_hr, base_sys, base_dia),
  generate_series(1, 167) AS s(hrs);

-- Abnormal vitals (trigger alerts)
INSERT INTO vital_signs (patient_id, device_id, heart_rate, spo2, systolic_bp, diastolic_bp,
  temperature, activity_level, battery_level, source, recorded_at)
VALUES
  ('00bb0000-0000-0000-0000-000000000009','DEVICE-P009-WATCH',148,94.0,160,98,36.8,'resting',72,'IOT_DEVICE',NOW()-INTERVAL '2 hours'),
  ('00bb0000-0000-0000-0000-000000000009','DEVICE-P009-WATCH',152,93.5,165,100,37.0,'resting',70,'IOT_DEVICE',NOW()-INTERVAL '1 hour'),
  ('00bb0000-0000-0000-0000-000000000005','DEVICE-P005-WATCH',95, 88.0,150,95, 37.2,'resting',55,'IOT_DEVICE',NOW()-INTERVAL '3 hours'),
  ('00bb0000-0000-0000-0000-000000000001','DEVICE-P001-WATCH',80, 97.5,180,110,36.9,'resting',80,'IOT_DEVICE',NOW()-INTERVAL '30 min');

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. ALERTS
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO alerts (patient_id, device_id, level, status, trigger_metric,
  trigger_value, threshold_value, message,
  acknowledged_by, acknowledged_at, created_at)
VALUES
  ('00bb0000-0000-0000-0000-000000000009','DEVICE-P009-WATCH',
   'LEVEL_3','ACTIVE','heart_rate',152,120,
   'KRITIS: Denyut jantung Joko Widodo 152 bpm — kemungkinan aritmia. Evaluasi segera.',
   NULL,NULL, NOW()-INTERVAL '1 hour'),

  ('00bb0000-0000-0000-0000-000000000005','DEVICE-P005-WATCH',
   'LEVEL_2','ACTIVE','spo2',88.0,90.0,
   'PERINGATAN: Saturasi oksigen Doni Prasetyo turun ke 88%.',
   NULL,NULL, NOW()-INTERVAL '3 hours'),

  ('00bb0000-0000-0000-0000-000000000001','DEVICE-P001-WATCH',
   'LEVEL_2','ACTIVE','systolic_bp',180,160,
   'PERINGATAN: Tekanan darah sistolik Budi Pekerti 180 mmHg.',
   NULL,NULL, NOW()-INTERVAL '30 min'),

  ('00bb0000-0000-0000-0000-000000000001','DEVICE-P001-WATCH',
   'LEVEL_1','ACKNOWLEDGED','heart_rate',105,100,
   'INFO: Denyut jantung Budi Pekerti 105 bpm saat istirahat.',
   '00500000-0000-0000-0000-000000000001', NOW()-INTERVAL '1 day',
   NOW()-INTERVAL '1 day'-INTERVAL '2 hours'),

  ('00bb0000-0000-0000-0000-000000000009','DEVICE-P009-WATCH',
   'LEVEL_3','RESOLVED','heart_rate',145,120,
   'KRITIS: Episode takikardia sebelumnya Joko Widodo telah teratasi.',
   '00500000-0000-0000-0000-000000000002', NOW()-INTERVAL '3 days',
   NOW()-INTERVAL '3 days'-INTERVAL '1 hour');

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. NOTIFICATIONS
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO notifications (user_id, channel, status, title, body, priority,
  reference_type, sent_at, delivered_at, read_at, created_at)
VALUES
  ('00200000-0000-0000-0000-000000000009','PUSH','DELIVERED',
   'Peringatan Detak Jantung',
   'Detak jantung Anda mencapai 152 bpm. Harap segera hubungi dokter atau ke IGD terdekat.',
   'CRITICAL','ALERT',
   NOW()-INTERVAL '1 hour',NOW()-INTERVAL '59 min',NULL,NOW()-INTERVAL '1 hour'),

  ('00200000-0000-0000-0000-000000000005','PUSH','DELIVERED',
   'Saturasi Oksigen Rendah',
   'Saturasi oksigen Anda 88%. Duduklah, rileks, dan hubungi dokter jika tidak membaik.',
   'HIGH','ALERT',
   NOW()-INTERVAL '3 hours',NOW()-INTERVAL '3 hours'+INTERVAL '1 min',
   NOW()-INTERVAL '2 hours',NOW()-INTERVAL '3 hours'),

  ('00200000-0000-0000-0000-000000000005','IN_APP','READ',
   'Resep Siap Diambil',
   'Resep Anda sudah siap diambil di Apotek RS Jantung Harapan Kita.',
   'NORMAL','PRESCRIPTION',
   NOW()-INTERVAL '6 days',NOW()-INTERVAL '6 days'+INTERVAL '5 min',
   NOW()-INTERVAL '6 days'+INTERVAL '30 min',NOW()-INTERVAL '7 days'),

  ('00200000-0000-0000-0000-000000000001','PUSH','DELIVERED',
   'Pengingat Minum Obat',
   'Saatnya minum Amlodipine 5mg malam hari. Jangan lupa!',
   'NORMAL',NULL,
   NOW()-INTERVAL '2 hours',NOW()-INTERVAL '2 hours'+INTERVAL '1 min',
   NULL,NOW()-INTERVAL '2 hours'),

  ('00500000-0000-0000-0000-000000000001','IN_APP','DELIVERED',
   '[KRITIS] Aritmia - Joko Widodo',
   'Pasien Joko Widodo HR 152 bpm. Konsultasi dr. Budi sedang berlangsung.',
   'CRITICAL','ALERT',
   NOW()-INTERVAL '1 hour',NOW()-INTERVAL '58 min',NULL,NOW()-INTERVAL '1 hour'),

  ('00100000-0000-0000-0000-000000000001','PUSH','READ',
   'Pasien Baru: Joko Widodo',
   'Pasien Joko Widodo memulai konsultasi. Keluhan: jantung berdebar tidak teratur.',
   'HIGH','CONSULTATION',
   NOW()-INTERVAL '25 min',NOW()-INTERVAL '24 min',
   NOW()-INTERVAL '22 min',NOW()-INTERVAL '25 min');

-- ─────────────────────────────────────────────────────────────────────────────
-- 16. HOSPITAL BEDS
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO hospital_beds (hospital_id, ward, room_number, bed_number, status, patient_id, admitted_at)
VALUES
  ('a0000000-0000-0000-0000-000000000001','ICU',    '101','A','OCCUPIED',  '00bb0000-0000-0000-0000-000000000005',NOW()-INTERVAL '8 days'),
  ('a0000000-0000-0000-0000-000000000001','ICU',    '101','B','AVAILABLE', NULL,NULL),
  ('a0000000-0000-0000-0000-000000000001','ICU',    '102','A','AVAILABLE', NULL,NULL),
  ('a0000000-0000-0000-0000-000000000001','GENERAL','201','A','OCCUPIED',  '00bb0000-0000-0000-0000-000000000003',NOW()-INTERVAL '5 days'),
  ('a0000000-0000-0000-0000-000000000001','GENERAL','201','B','AVAILABLE', NULL,NULL),
  ('a0000000-0000-0000-0000-000000000001','GENERAL','202','A','MAINTENANCE',NULL,NULL),
  ('a0000000-0000-0000-0000-000000000001','GENERAL','202','B','AVAILABLE', NULL,NULL),
  ('a0000000-0000-0000-0000-000000000002','ICU',    '301','A','OCCUPIED',  '00bb0000-0000-0000-0000-000000000009',NOW()-INTERVAL '1 day'),
  ('a0000000-0000-0000-0000-000000000002','ICU',    '301','B','AVAILABLE', NULL,NULL),
  ('a0000000-0000-0000-0000-000000000002','GENERAL','401','A','AVAILABLE', NULL,NULL);
