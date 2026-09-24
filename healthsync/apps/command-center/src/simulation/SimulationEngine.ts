// SimulationEngine.ts — Singleton EventEmitter untuk event real-time HealthSync
// Semua teks dalam Bahasa Indonesia, tidak ada tipe any

import {
  Dokter,
  Pasien,
  Ambulans,
  RumahSakit,
  SEED_DOKTER,
  SEED_PASIEN,
  SEED_AMBULANS,
  SEED_RUMAH_SAKIT,
  SEED_APOTEK,
  SEED_DRIVER_APOTEK,
  NAMA_OBAT,
  TOPIK_KONSULTASI,
} from './SimulationData';

// ─── Tipe Event ────────────────────────────────────────────────────────────────

export type SimEvent =
  | { type: 'DOCTOR_STATUS'; doctorId: string; name: string; status: 'Tersedia' | 'Konsultasi' | 'Tidak Tersedia'; topic?: string }
  | { type: 'CONSULTATION_START'; patientName: string; doctorName: string; topic: string; duration: number }
  | { type: 'MEDICINE_ORDER'; patientName: string; medicines: string[]; pharmacyName: string; driverId: string }
  | { type: 'PATIENT_EMERGENCY'; patientId: string; patientName: string; condition: string; location: { lat: number; lng: number }; contactFamily: string; contactPhone: string }
  | { type: 'AMBULANCE_REQUEST'; requestId: string; patientId: string; ambulanceId: string; eta: number }
  | { type: 'BLOOD_REQUEST'; bloodType: string; units: number; hospitalId: string; urgency: 'Tinggi' | 'Kritis' }
  | { type: 'REFERRAL_REQUEST'; patientId: string; fromHospital: string; toHospital: string; reason: string; roomType: 'IGD' | 'ICU' | 'Inap' | 'Operasi' }
  | { type: 'HOSPITAL_CAPACITY_UPDATE'; hospitalId: string; hospitalName: string; IGD: number; ICU: number; Inap: number; Operasi: number; doctorsAvailable: number; bloodStock: Record<string, number> }
  | { type: 'LOCATION_UPDATE'; entityType: 'pasien' | 'ambulans' | 'driver'; entityId: string; koordinat: { lat: number; lng: number } };

// ─── Tipe State ────────────────────────────────────────────────────────────────

interface SimState {
  dokter: Dokter[];
  pasien: Pasien[];
  ambulans: Ambulans[];
  rumahSakit: RumahSakit[];
}

// ─── Utilitas ──────────────────────────────────────────────────────────────────

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

function pickRandomMultiple<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Gerak acak kecil dalam batas Jakarta */
function jitterKoordinat(
  lat: number,
  lng: number,
  delta = 0.001,
): { lat: number; lng: number } {
  const newLat = Math.min(Math.max(lat + (Math.random() - 0.5) * delta * 2, -6.35), -6.10);
  const newLng = Math.min(Math.max(lng + (Math.random() - 0.5) * delta * 2, 106.70), 106.95);
  return { lat: parseFloat(newLat.toFixed(6)), lng: parseFloat(newLng.toFixed(6)) };
}

const GOLONGAN_DARAH = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
const ALASAN_RUJUKAN = [
  'Kapasitas ICU penuh',
  'Kebutuhan spesialis tidak tersedia',
  'Peralatan diagnostik tidak memadai',
  'Operasi lanjutan diperlukan',
  'Perawatan intensif pasca operasi',
];

// ─── SimulationEngine ─────────────────────────────────────────────────────────

class SimulationEngine {
  private listeners: Map<string, Set<(event: SimEvent) => void>>;
  private timers: ReturnType<typeof setInterval>[];
  private running: boolean;
  private state: SimState;

  constructor() {
    this.listeners = new Map();
    this.timers = [];
    this.running = false;

    // Salin seed data agar state bisa dimutasi tanpa mengubah seed asli
    this.state = {
      dokter: SEED_DOKTER.map((d) => ({ ...d, koordinat: { ...d.koordinat } })),
      pasien: SEED_PASIEN.map((p) => ({ ...p, koordinat: { ...p.koordinat } })),
      ambulans: SEED_AMBULANS.map((a) => ({ ...a, koordinat: { ...a.koordinat } })),
      rumahSakit: SEED_RUMAH_SAKIT.map((rs) => ({
        ...rs,
        koordinat: { ...rs.koordinat },
        kapasitas: {
          IGD: { ...rs.kapasitas.IGD },
          ICU: { ...rs.kapasitas.ICU },
          Inap: { ...rs.kapasitas.Inap },
          Operasi: { ...rs.kapasitas.Operasi },
        },
        stokDarah: { ...rs.stokDarah },
        dokterJaga: rs.dokterJaga.map((dj) => ({ ...dj })),
      })),
    };
  }

  // ─── PubSub ──────────────────────────────────────────────────────────────────

  on(eventType: string, cb: (event: SimEvent) => void): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(cb);

    // Kembalikan fungsi unsubscribe
    return () => {
      this.listeners.get(eventType)?.delete(cb);
    };
  }

  private emit(event: SimEvent): void {
    // Kirim ke listener spesifik tipe event
    this.listeners.get(event.type)?.forEach((cb) => cb(event));
    // Kirim ke listener wildcard '*'
    this.listeners.get('*')?.forEach((cb) => cb(event));
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  start(): void {
    if (this.running) return;
    this.running = true;

    // DOCTOR_STATUS → 8000ms
    this.timers.push(
      setInterval(() => {
        this.tickDoctorStatus();
      }, 8000),
    );

    // CONSULTATION_START → 15000ms
    this.timers.push(
      setInterval(() => {
        this.tickConsultationStart();
      }, 15000),
    );

    // MEDICINE_ORDER → 12000ms
    this.timers.push(
      setInterval(() => {
        this.tickMedicineOrder();
      }, 12000),
    );

    // PATIENT_EMERGENCY → 45000ms (probabilitas 30%)
    this.timers.push(
      setInterval(() => {
        if (Math.random() < 0.3) {
          this.tickPatientEmergency();
        }
      }, 45000),
    );

    // BLOOD_REQUEST → 60000ms
    this.timers.push(
      setInterval(() => {
        this.tickBloodRequest();
      }, 60000),
    );

    // REFERRAL_REQUEST → 50000ms
    this.timers.push(
      setInterval(() => {
        this.tickReferralRequest();
      }, 50000),
    );

    // HOSPITAL_CAPACITY_UPDATE → 20000ms
    this.timers.push(
      setInterval(() => {
        this.tickHospitalCapacityUpdate();
      }, 20000),
    );

    // LOCATION_UPDATE → 3000ms (semua entitas bergerak)
    this.timers.push(
      setInterval(() => {
        this.tickLocationUpdate();
      }, 3000),
    );
  }

  stop(): void {
    this.timers.forEach((t) => clearInterval(t));
    this.timers = [];
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  getState(): Readonly<SimState> {
    return this.state;
  }

  // ─── Generator Event ─────────────────────────────────────────────────────────

  private tickDoctorStatus(): void {
    const dokter = pickRandom(this.state.dokter);
    const statusOptions: Dokter['status'][] = ['Tersedia', 'Konsultasi', 'Tidak Tersedia'];
    const newStatus = pickRandom(statusOptions);
    const topic = newStatus === 'Konsultasi' ? pickRandom(TOPIK_KONSULTASI) : undefined;

    // Mutasi state
    dokter.status = newStatus;
    dokter.topik = topic;

    const event: SimEvent = {
      type: 'DOCTOR_STATUS',
      doctorId: dokter.id,
      name: dokter.nama,
      status: newStatus,
      ...(topic !== undefined && { topic }),
    };
    this.emit(event);
  }

  private tickConsultationStart(): void {
    const dokter = pickRandom(this.state.dokter);
    const pasien = pickRandom(this.state.pasien);
    const topic = pickRandom(TOPIK_KONSULTASI);
    const duration = randomInt(10, 45); // menit

    const event: SimEvent = {
      type: 'CONSULTATION_START',
      patientName: pasien.nama,
      doctorName: dokter.nama,
      topic,
      duration,
    };
    this.emit(event);
  }

  private tickMedicineOrder(): void {
    const pasien = pickRandom(this.state.pasien);
    const jumlahObat = randomInt(1, 4);
    const medicines = pickRandomMultiple(NAMA_OBAT, jumlahObat);
    const apotek = pickRandom(SEED_APOTEK);
    const driver = pickRandom(SEED_DRIVER_APOTEK);

    const event: SimEvent = {
      type: 'MEDICINE_ORDER',
      patientName: pasien.nama,
      medicines,
      pharmacyName: apotek.nama,
      driverId: driver.id,
    };
    this.emit(event);
  }

  private tickPatientEmergency(): void {
    const pasien = pickRandom(this.state.pasien);

    const event: SimEvent = {
      type: 'PATIENT_EMERGENCY',
      patientId: pasien.id,
      patientName: pasien.nama,
      condition: pasien.kondisi,
      location: { ...pasien.koordinat },
      contactFamily: pasien.kontakKeluarga,
      contactPhone: pasien.teleponKeluarga,
    };
    this.emit(event);

    // Otomatis kirim AMBULANCE_REQUEST
    if (this.state.ambulans.length > 0) {
      const ambulans = pickRandom(
        this.state.ambulans.filter((a) => a.status === 'Tersedia').length > 0
          ? this.state.ambulans.filter((a) => a.status === 'Tersedia')
          : this.state.ambulans,
      );
      const eta = randomInt(5, 20);

      const ambulanceEvent: SimEvent = {
        type: 'AMBULANCE_REQUEST',
        requestId: `req-${Date.now()}`,
        patientId: pasien.id,
        ambulanceId: ambulans.id,
        eta,
      };
      ambulans.status = 'Dalam Perjalanan';
      ambulans.eta = eta;
      this.emit(ambulanceEvent);
    }
  }

  private tickBloodRequest(): void {
    const rs = pickRandom(this.state.rumahSakit);
    const bloodType = pickRandom([...GOLONGAN_DARAH]);
    const units = randomInt(1, 5);
    const urgency: 'Tinggi' | 'Kritis' = Math.random() < 0.4 ? 'Kritis' : 'Tinggi';

    const event: SimEvent = {
      type: 'BLOOD_REQUEST',
      bloodType,
      units,
      hospitalId: rs.id,
      urgency,
    };
    this.emit(event);
  }

  private tickReferralRequest(): void {
    const pasien = pickRandom(this.state.pasien);
    const [fromHospital, toHospital] = pickRandomMultiple(this.state.rumahSakit, 2);
    if (!fromHospital || !toHospital) return;

    const roomTypes: Array<'IGD' | 'ICU' | 'Inap' | 'Operasi'> = ['IGD', 'ICU', 'Inap', 'Operasi'];
    const roomType = pickRandom(roomTypes);
    const reason = pickRandom(ALASAN_RUJUKAN);

    const event: SimEvent = {
      type: 'REFERRAL_REQUEST',
      patientId: pasien.id,
      fromHospital: fromHospital.nama,
      toHospital: toHospital.nama,
      reason,
      roomType,
    };
    this.emit(event);
  }

  private tickHospitalCapacityUpdate(): void {
    const rs = pickRandom(this.state.rumahSakit);

    // Variasikan kapasitas tersedia secara realistis (±1 per siklus)
    const varKap = (val: number, total: number): number =>
      Math.min(Math.max(val + randomInt(-1, 1), 0), total);

    rs.kapasitas.IGD.tersedia = varKap(rs.kapasitas.IGD.tersedia, rs.kapasitas.IGD.total);
    rs.kapasitas.ICU.tersedia = varKap(rs.kapasitas.ICU.tersedia, rs.kapasitas.ICU.total);
    rs.kapasitas.Inap.tersedia = varKap(rs.kapasitas.Inap.tersedia, rs.kapasitas.Inap.total);
    rs.kapasitas.Operasi.tersedia = varKap(rs.kapasitas.Operasi.tersedia, rs.kapasitas.Operasi.total);
    rs.dokterTersedia = Math.max(rs.dokterTersedia + randomInt(-1, 1), 1);

    // Variasikan stok darah (±1 per jenis)
    const updatedBloodStock: Record<string, number> = {};
    for (const [type, qty] of Object.entries(rs.stokDarah)) {
      updatedBloodStock[type] = Math.max(qty + randomInt(-1, 1), 0);
    }
    rs.stokDarah = updatedBloodStock;

    const event: SimEvent = {
      type: 'HOSPITAL_CAPACITY_UPDATE',
      hospitalId: rs.id,
      hospitalName: rs.nama,
      IGD: rs.kapasitas.IGD.tersedia,
      ICU: rs.kapasitas.ICU.tersedia,
      Inap: rs.kapasitas.Inap.tersedia,
      Operasi: rs.kapasitas.Operasi.tersedia,
      doctorsAvailable: rs.dokterTersedia,
      bloodStock: { ...rs.stokDarah },
    };
    this.emit(event);
  }

  private tickLocationUpdate(): void {
    // Gerakkan semua pasien
    for (const pasien of this.state.pasien) {
      const newKoordinat = jitterKoordinat(pasien.koordinat.lat, pasien.koordinat.lng);
      pasien.koordinat = newKoordinat;
      this.emit({
        type: 'LOCATION_UPDATE',
        entityType: 'pasien',
        entityId: pasien.id,
        koordinat: newKoordinat,
      });
    }

    // Gerakkan semua ambulans (lebih cepat — delta lebih besar)
    for (const ambulans of this.state.ambulans) {
      const newKoordinat = jitterKoordinat(ambulans.koordinat.lat, ambulans.koordinat.lng, 0.003);
      ambulans.koordinat = newKoordinat;
      this.emit({
        type: 'LOCATION_UPDATE',
        entityType: 'ambulans',
        entityId: ambulans.id,
        koordinat: newKoordinat,
      });
    }

    // Gerakkan semua driver apotek
    for (const driver of SEED_DRIVER_APOTEK) {
      const newKoordinat = jitterKoordinat(driver.koordinat.lat, driver.koordinat.lng, 0.002);
      driver.koordinat = newKoordinat;
      this.emit({
        type: 'LOCATION_UPDATE',
        entityType: 'driver',
        entityId: driver.id,
        koordinat: newKoordinat,
      });
    }
  }

  // ─── Teks & Level untuk Activity Feed ────────────────────────────────────────

  getEventDisplayText(event: SimEvent): string {
    switch (event.type) {
      case 'DOCTOR_STATUS':
        return event.status === 'Konsultasi' && event.topic !== undefined
          ? `${event.name} sedang konsultasi: ${event.topic}`
          : `${event.name} status berubah menjadi ${event.status}`;

      case 'CONSULTATION_START':
        return `Konsultasi dimulai — ${event.doctorName} dengan ${event.patientName} (${event.topic}, ${event.duration} menit)`;

      case 'MEDICINE_ORDER':
        return `Pesanan obat untuk ${event.patientName}: ${event.medicines.join(', ')} dari ${event.pharmacyName}`;

      case 'PATIENT_EMERGENCY':
        return `DARURAT: ${event.patientName} — ${event.condition}. Hubungi ${event.contactFamily} (${event.contactPhone})`;

      case 'AMBULANCE_REQUEST':
        return `Ambulans ${event.ambulanceId} dikirim untuk pasien ${event.patientId}, ETA ${event.eta} menit`;

      case 'BLOOD_REQUEST':
        return `Permintaan darah ${event.bloodType} (${event.units} kantong) di ${event.hospitalId} — urgensi ${event.urgency}`;

      case 'REFERRAL_REQUEST':
        return `Rujukan pasien ${event.patientId} dari ${event.fromHospital} ke ${event.toHospital} (${event.roomType}): ${event.reason}`;

      case 'HOSPITAL_CAPACITY_UPDATE':
        return `Kapasitas ${event.hospitalName} diperbarui — IGD: ${event.IGD}, ICU: ${event.ICU}, Inap: ${event.Inap}, Operasi: ${event.Operasi}`;

      case 'LOCATION_UPDATE':
        return `Lokasi ${event.entityType} ${event.entityId} diperbarui (${event.koordinat.lat.toFixed(4)}, ${event.koordinat.lng.toFixed(4)})`;
    }
  }

  getEventLevel(event: SimEvent): 'info' | 'warning' | 'danger' | 'success' {
    switch (event.type) {
      case 'DOCTOR_STATUS':
        return event.status === 'Tersedia' ? 'success' : event.status === 'Konsultasi' ? 'info' : 'warning';

      case 'CONSULTATION_START':
        return 'info';

      case 'MEDICINE_ORDER':
        return 'info';

      case 'PATIENT_EMERGENCY':
        return 'danger';

      case 'AMBULANCE_REQUEST':
        return 'warning';

      case 'BLOOD_REQUEST':
        return event.urgency === 'Kritis' ? 'danger' : 'warning';

      case 'REFERRAL_REQUEST':
        return event.roomType === 'ICU' || event.roomType === 'Operasi' ? 'warning' : 'info';

      case 'HOSPITAL_CAPACITY_UPDATE':
        return event.ICU <= 1 || event.IGD <= 1 ? 'danger' : event.ICU <= 3 || event.IGD <= 3 ? 'warning' : 'info';

      case 'LOCATION_UPDATE':
        return 'info';
    }
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

export const simulationEngine = new SimulationEngine();
