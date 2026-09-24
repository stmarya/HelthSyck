// SimulationData.ts — Seed data realistis simulasi Jakarta
// Semua teks dalam Bahasa Indonesia, tidak ada tipe any

export interface Dokter {
  id: string;
  nama: string;
  spesialisasi: string;
  status: 'Tersedia' | 'Konsultasi' | 'Tidak Tersedia';
  topik?: string;
  koordinat: { lat: number; lng: number };
  avatar: string; // inisial nama
}

export interface Pasien {
  id: string;
  nama: string;
  usia: number;
  golonganDarah: string;
  kondisi: string;
  status: 'Stabil' | 'Kritis' | 'Darurat';
  koordinat: { lat: number; lng: number };
  kontakKeluarga: string;
  teleponKeluarga: string;
}

export interface Ambulans {
  id: string;
  nomorUnit: string;
  pengemudi: string;
  status: 'Tersedia' | 'Dalam Perjalanan' | 'Tiba' | 'Kembali';
  koordinat: { lat: number; lng: number };
  eta?: number; // menit
  destinasi?: string;
}

export interface DriverApotek {
  id: string;
  nama: string;
  apotekId: string;
  status: 'Mengantarkan' | 'Menunggu' | 'Selesai';
  koordinat: { lat: number; lng: number };
  orderSaat?: string;
}

export interface RumahSakit {
  id: string;
  nama: string;
  alamat: string;
  telepon: string;
  koordinat: { lat: number; lng: number };
  kapasitas: {
    IGD: { tersedia: number; total: number };
    ICU: { tersedia: number; total: number };
    Inap: { tersedia: number; total: number };
    Operasi: { tersedia: number; total: number };
  };
  stokDarah: Record<string, number>;
  dokterTersedia: number;
  dokterJaga: { nama: string; spesialisasi: string }[];
  statusKoneksi: 'Online' | 'Offline';
}

export interface Apotek {
  id: string;
  nama: string;
  alamat: string;
  koordinat: { lat: number; lng: number };
}

// ─── DOKTER ────────────────────────────────────────────────────────────────────

export const SEED_DOKTER: Dokter[] = [
  {
    id: 'dok-001',
    nama: 'Dr. Budi Santoso',
    spesialisasi: 'Kardiologi',
    status: 'Tersedia',
    koordinat: { lat: -6.1751, lng: 106.8272 },
    avatar: 'BS',
  },
  {
    id: 'dok-002',
    nama: 'Dr. Siti Rahayu',
    spesialisasi: 'Neurologi',
    status: 'Konsultasi',
    topik: 'Migrain kronis',
    koordinat: { lat: -6.2088, lng: 106.8456 },
    avatar: 'SR',
  },
  {
    id: 'dok-003',
    nama: 'Dr. Ahmad Fauzi',
    spesialisasi: 'Pediatri',
    status: 'Tersedia',
    koordinat: { lat: -6.2297, lng: 106.7989 },
    avatar: 'AF',
  },
  {
    id: 'dok-004',
    nama: 'Dr. Dewi Kusuma',
    spesialisasi: 'Ortopedi',
    status: 'Tidak Tersedia',
    koordinat: { lat: -6.1560, lng: 106.8721 },
    avatar: 'DK',
  },
  {
    id: 'dok-005',
    nama: 'Dr. Rizky Pratama',
    spesialisasi: 'Penyakit Dalam',
    status: 'Tersedia',
    koordinat: { lat: -6.2615, lng: 106.8103 },
    avatar: 'RP',
  },
  {
    id: 'dok-006',
    nama: 'Dr. Nur Hidayah',
    spesialisasi: 'Obstetri & Ginekologi',
    status: 'Konsultasi',
    topik: 'Kehamilan trimester ketiga',
    koordinat: { lat: -6.1924, lng: 106.7612 },
    avatar: 'NH',
  },
  {
    id: 'dok-007',
    nama: 'Dr. Hendra Wijaya',
    spesialisasi: 'Bedah Umum',
    status: 'Tidak Tersedia',
    koordinat: { lat: -6.3001, lng: 106.8437 },
    avatar: 'HW',
  },
  {
    id: 'dok-008',
    nama: 'Dr. Lestari Wulandari',
    spesialisasi: 'Dermatologi',
    status: 'Tersedia',
    koordinat: { lat: -6.2438, lng: 106.9102 },
    avatar: 'LW',
  },
];

// ─── PASIEN ────────────────────────────────────────────────────────────────────

export const SEED_PASIEN: Pasien[] = [
  {
    id: 'pas-001',
    nama: 'Bambang Setiawan',
    usia: 54,
    golonganDarah: 'O+',
    kondisi: 'Serangan jantung akut',
    status: 'Darurat',
    koordinat: { lat: -6.1843, lng: 106.8195 },
    kontakKeluarga: 'Rina Setiawan',
    teleponKeluarga: '081234567890',
  },
  {
    id: 'pas-002',
    nama: 'Yuliana Putri',
    usia: 32,
    golonganDarah: 'A+',
    kondisi: 'Diabetes tipe 2 terkontrol',
    status: 'Stabil',
    koordinat: { lat: -6.2102, lng: 106.8312 },
    kontakKeluarga: 'Hendri Putra',
    teleponKeluarga: '081298765432',
  },
  {
    id: 'pas-003',
    nama: 'Agus Mulyono',
    usia: 67,
    golonganDarah: 'B-',
    kondisi: 'Stroke iskemik',
    status: 'Kritis',
    koordinat: { lat: -6.2251, lng: 106.7754 },
    kontakKeluarga: 'Sri Mulyono',
    teleponKeluarga: '082112345678',
  },
  {
    id: 'pas-004',
    nama: 'Fitria Handayani',
    usia: 28,
    golonganDarah: 'AB+',
    kondisi: 'Kehamilan berisiko tinggi',
    status: 'Kritis',
    koordinat: { lat: -6.1678, lng: 106.8903 },
    kontakKeluarga: 'Dodi Handayani',
    teleponKeluarga: '085387654321',
  },
  {
    id: 'pas-005',
    nama: 'Rudi Hartanto',
    usia: 45,
    golonganDarah: 'O-',
    kondisi: 'Patah tulang femur',
    status: 'Stabil',
    koordinat: { lat: -6.2563, lng: 106.8540 },
    kontakKeluarga: 'Maya Hartanto',
    teleponKeluarga: '087765432109',
  },
  {
    id: 'pas-006',
    nama: 'Supriyadi',
    usia: 71,
    golonganDarah: 'A-',
    kondisi: 'Gagal ginjal kronis',
    status: 'Kritis',
    koordinat: { lat: -6.1401, lng: 106.8088 },
    kontakKeluarga: 'Wahyu Supriyadi',
    teleponKeluarga: '081556789012',
  },
  {
    id: 'pas-007',
    nama: 'Indah Permata',
    usia: 19,
    golonganDarah: 'B+',
    kondisi: 'Demam berdarah dengue',
    status: 'Kritis',
    koordinat: { lat: -6.3048, lng: 106.8267 },
    kontakKeluarga: 'Hadi Permata',
    teleponKeluarga: '089912345678',
  },
  {
    id: 'pas-008',
    nama: 'Martono',
    usia: 60,
    golonganDarah: 'AB-',
    kondisi: 'Hipertensi tidak terkontrol',
    status: 'Darurat',
    koordinat: { lat: -6.1987, lng: 106.7601 },
    kontakKeluarga: 'Sari Martono',
    teleponKeluarga: '082287654321',
  },
  {
    id: 'pas-009',
    nama: 'Dini Anggraini',
    usia: 38,
    golonganDarah: 'O+',
    kondisi: 'Asma bronkial',
    status: 'Stabil',
    koordinat: { lat: -6.2789, lng: 106.9023 },
    kontakKeluarga: 'Fajar Anggraini',
    teleponKeluarga: '083409876543',
  },
  {
    id: 'pas-010',
    nama: 'Teguh Prasetyo',
    usia: 52,
    golonganDarah: 'A+',
    kondisi: 'Pasca operasi usus buntu',
    status: 'Stabil',
    koordinat: { lat: -6.2334, lng: 106.8431 },
    kontakKeluarga: 'Wati Prasetyo',
    teleponKeluarga: '081701234567',
  },
];

// ─── AMBULANS ─────────────────────────────────────────────────────────────────

export const SEED_AMBULANS: Ambulans[] = [
  {
    id: 'amb-001',
    nomorUnit: 'AMB-JKT-01',
    pengemudi: 'Surya Dinata',
    status: 'Tersedia',
    koordinat: { lat: -6.1892, lng: 106.8148 },
  },
  {
    id: 'amb-002',
    nomorUnit: 'AMB-JKT-02',
    pengemudi: 'Eko Purwanto',
    status: 'Dalam Perjalanan',
    koordinat: { lat: -6.2145, lng: 106.8502 },
    eta: 8,
    destinasi: 'RS Cipto Mangunkusumo',
  },
  {
    id: 'amb-003',
    nomorUnit: 'AMB-JKT-03',
    pengemudi: 'Wahid Nugroho',
    status: 'Tiba',
    koordinat: { lat: -6.2477, lng: 106.7921 },
    eta: 0,
    destinasi: 'RS Fatmawati',
  },
  {
    id: 'amb-004',
    nomorUnit: 'AMB-JKT-04',
    pengemudi: 'Dimas Kurniawan',
    status: 'Kembali',
    koordinat: { lat: -6.1612, lng: 106.8673 },
    eta: 12,
    destinasi: 'Pos Ambulans Jakarta Pusat',
  },
];

// ─── DRIVER APOTEK ────────────────────────────────────────────────────────────

export const SEED_DRIVER_APOTEK: DriverApotek[] = [
  {
    id: 'drv-001',
    nama: 'Galih Prabowo',
    apotekId: 'apt-001',
    status: 'Mengantarkan',
    koordinat: { lat: -6.2031, lng: 106.8299 },
    orderSaat: '10:15',
  },
  {
    id: 'drv-002',
    nama: 'Taufik Hidayat',
    apotekId: 'apt-002',
    status: 'Menunggu',
    koordinat: { lat: -6.1734, lng: 106.8512 },
  },
  {
    id: 'drv-003',
    nama: 'Ridwan Maulana',
    apotekId: 'apt-003',
    status: 'Selesai',
    koordinat: { lat: -6.2698, lng: 106.8045 },
    orderSaat: '09:30',
  },
];

// ─── RUMAH SAKIT ──────────────────────────────────────────────────────────────

export const SEED_RUMAH_SAKIT: RumahSakit[] = [
  {
    id: 'rs-001',
    nama: 'RSUP Dr. Cipto Mangunkusumo',
    alamat: 'Jl. Diponegoro No.71, Kenari, Senen, Jakarta Pusat 10430',
    telepon: '(021) 500-135',
    koordinat: { lat: -6.1913, lng: 106.8454 },
    kapasitas: {
      IGD: { tersedia: 5, total: 20 },
      ICU: { tersedia: 2, total: 15 },
      Inap: { tersedia: 34, total: 120 },
      Operasi: { tersedia: 3, total: 8 },
    },
    stokDarah: { 'A+': 15, 'A-': 4, 'B+': 12, 'B-': 2, 'AB+': 6, 'AB-': 1, 'O+': 20, 'O-': 3 },
    dokterTersedia: 12,
    dokterJaga: [
      { nama: 'Dr. Anwar Hamid', spesialisasi: 'Gawat Darurat' },
      { nama: 'Dr. Rini Anggraini', spesialisasi: 'Bedah' },
    ],
    statusKoneksi: 'Online',
  },
  {
    id: 'rs-002',
    nama: 'RS Fatmawati',
    alamat: 'Jl. RS Fatmawati No.4, Cilandak, Jakarta Selatan 12430',
    telepon: '(021) 7660-552',
    koordinat: { lat: -6.2942, lng: 106.7992 },
    kapasitas: {
      IGD: { tersedia: 8, total: 18 },
      ICU: { tersedia: 4, total: 12 },
      Inap: { tersedia: 50, total: 150 },
      Operasi: { tersedia: 2, total: 6 },
    },
    stokDarah: { 'A+': 10, 'A-': 2, 'B+': 8, 'B-': 1, 'AB+': 3, 'AB-': 0, 'O+': 14, 'O-': 2 },
    dokterTersedia: 9,
    dokterJaga: [
      { nama: 'Dr. Sigit Nugroho', spesialisasi: 'Gawat Darurat' },
      { nama: 'Dr. Yeni Kusumawati', spesialisasi: 'Penyakit Dalam' },
    ],
    statusKoneksi: 'Online',
  },
  {
    id: 'rs-003',
    nama: 'RSUD Tarakan',
    alamat: 'Jl. Kyai Caringin No.7, Cideng, Gambir, Jakarta Pusat 10150',
    telepon: '(021) 384-5328',
    koordinat: { lat: -6.1644, lng: 106.8179 },
    kapasitas: {
      IGD: { tersedia: 3, total: 12 },
      ICU: { tersedia: 1, total: 8 },
      Inap: { tersedia: 20, total: 80 },
      Operasi: { tersedia: 1, total: 4 },
    },
    stokDarah: { 'A+': 7, 'A-': 1, 'B+': 5, 'B-': 0, 'AB+': 2, 'AB-': 0, 'O+': 9, 'O-': 1 },
    dokterTersedia: 6,
    dokterJaga: [
      { nama: 'Dr. Bambang Irianto', spesialisasi: 'Gawat Darurat' },
    ],
    statusKoneksi: 'Online',
  },
  {
    id: 'rs-004',
    nama: 'RS Persahabatan',
    alamat: 'Jl. Persahabatan Raya No.1, Rawamangun, Pulo Gadung, Jakarta Timur 13230',
    telepon: '(021) 489-1708',
    koordinat: { lat: -6.1862, lng: 106.8963 },
    kapasitas: {
      IGD: { tersedia: 6, total: 16 },
      ICU: { tersedia: 3, total: 10 },
      Inap: { tersedia: 42, total: 130 },
      Operasi: { tersedia: 2, total: 7 },
    },
    stokDarah: { 'A+': 11, 'A-': 3, 'B+': 9, 'B-': 1, 'AB+': 4, 'AB-': 1, 'O+': 16, 'O-': 2 },
    dokterTersedia: 10,
    dokterJaga: [
      { nama: 'Dr. Gunawan Saputra', spesialisasi: 'Paru' },
      { nama: 'Dr. Tini Suryati', spesialisasi: 'Gawat Darurat' },
    ],
    statusKoneksi: 'Online',
  },
  {
    id: 'rs-005',
    nama: 'RSUD Koja',
    alamat: 'Jl. Deli No.4, Tugu Utara, Koja, Jakarta Utara 14220',
    telepon: '(021) 435-0580',
    koordinat: { lat: -6.1108, lng: 106.8783 },
    kapasitas: {
      IGD: { tersedia: 4, total: 14 },
      ICU: { tersedia: 2, total: 9 },
      Inap: { tersedia: 28, total: 100 },
      Operasi: { tersedia: 1, total: 5 },
    },
    stokDarah: { 'A+': 8, 'A-': 2, 'B+': 6, 'B-': 1, 'AB+': 2, 'AB-': 0, 'O+': 11, 'O-': 1 },
    dokterTersedia: 7,
    dokterJaga: [
      { nama: 'Dr. Haris Salim', spesialisasi: 'Gawat Darurat' },
      { nama: 'Dr. Nia Rahmawati', spesialisasi: 'Bedah' },
    ],
    statusKoneksi: 'Offline',
  },
  {
    id: 'rs-006',
    nama: 'RS Pelni',
    alamat: 'Jl. Aipda K.S. Tubun No.92-94, Slipi, Palmerah, Jakarta Barat 11410',
    telepon: '(021) 548-0608',
    koordinat: { lat: -6.1958, lng: 106.7891 },
    kapasitas: {
      IGD: { tersedia: 7, total: 15 },
      ICU: { tersedia: 3, total: 11 },
      Inap: { tersedia: 38, total: 110 },
      Operasi: { tersedia: 2, total: 6 },
    },
    stokDarah: { 'A+': 9, 'A-': 2, 'B+': 7, 'B-': 1, 'AB+': 3, 'AB-': 0, 'O+': 13, 'O-': 2 },
    dokterTersedia: 8,
    dokterJaga: [
      { nama: 'Dr. Faisal Azhari', spesialisasi: 'Jantung' },
      { nama: 'Dr. Lina Marlina', spesialisasi: 'Gawat Darurat' },
    ],
    statusKoneksi: 'Online',
  },
];

// ─── APOTEK ───────────────────────────────────────────────────────────────────

export const SEED_APOTEK: Apotek[] = [
  {
    id: 'apt-001',
    nama: 'Apotek Kimia Farma Senen',
    alamat: 'Jl. Senen Raya No.135, Senen, Jakarta Pusat',
    koordinat: { lat: -6.1778, lng: 106.8421 },
  },
  {
    id: 'apt-002',
    nama: 'Apotek Guardian Menteng',
    alamat: 'Jl. HOS Cokroaminoto No.78, Menteng, Jakarta Pusat',
    koordinat: { lat: -6.1997, lng: 106.8332 },
  },
  {
    id: 'apt-003',
    nama: 'Apotek Centra Fatmawati',
    alamat: 'Jl. RS Fatmawati No.10, Cilandak, Jakarta Selatan',
    koordinat: { lat: -6.2921, lng: 106.7943 },
  },
  {
    id: 'apt-004',
    nama: 'Apotek K-24 Kelapa Gading',
    alamat: 'Jl. Boulevard Raya No.56, Kelapa Gading, Jakarta Utara',
    koordinat: { lat: -6.1589, lng: 106.9058 },
  },
];

// ─── NAMA OBAT ────────────────────────────────────────────────────────────────

export const NAMA_OBAT: string[] = [
  'Amoksisilin 500mg',
  'Parasetamol 500mg',
  'Metformin 850mg',
  'Amlodipine 5mg',
  'Omeprazole 20mg',
  'Simvastatin 20mg',
  'Cetirizine 10mg',
  'Ibuprofen 400mg',
  'Captopril 25mg',
  'Clopidogrel 75mg',
  'Furosemide 40mg',
  'Ranitidine 150mg',
  'Dexamethasone 0.5mg',
  'Salbutamol Inhaler',
  'Vitamin C 1000mg',
];

// ─── TOPIK KONSULTASI ─────────────────────────────────────────────────────────

export const TOPIK_KONSULTASI: string[] = [
  'Sakit kepala berulang',
  'Kontrol tekanan darah',
  'Pengelolaan diabetes',
  'Nyeri dada dan sesak napas',
  'Konsultasi kehamilan',
  'Gangguan pencernaan kronik',
  'Nyeri sendi dan otot',
  'Pemeriksaan rutin pasca operasi',
];
