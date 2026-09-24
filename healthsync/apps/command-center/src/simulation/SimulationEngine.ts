// SimulationEngine.ts — operational simulator untuk Command Center
// Deterministic, replayable, dan menjadi single source of truth untuk semua halaman simulator.

import type {
  Dokter,
  Pasien,
  Ambulans,
  RumahSakit,
  DriverApotek,
} from './SimulationData';
import {
  SEED_DOKTER,
  SEED_PASIEN,
  SEED_AMBULANS,
  SEED_RUMAH_SAKIT,
  SEED_APOTEK,
  SEED_DRIVER_APOTEK,
  NAMA_OBAT,
  TOPIK_KONSULTASI,
} from './SimulationData';

export type EmergencyStatus =
  | 'STABLE'
  | 'DEGRADING'
  | 'CRITICAL_ALERT'
  | 'ACKNOWLEDGED'
  | 'CONTACTING'
  | 'DISPATCHING'
  | 'EN_ROUTE'
  | 'ON_SCENE'
  | 'TRANSPORTING'
  | 'ARRIVED_AT_HOSPITAL'
  | 'ADMITTED'
  | 'ESCALATED'
  | 'RESOLVED'
  | 'CANCELLED';

export interface VitalSigns {
  heartRate: number;
  spo2: number;
  systolicBp: number;
  respiratoryRate: number;
}

export interface TeleconsultationSession {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  topic: string;
  status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  startedAt: number;
  durationMinutes: number;
}

export interface LogisticsOrder {
  id: string;
  patientId: string;
  patientName: string;
  pharmacyName: string;
  medicines: string[];
  driverId: string;
  status: 'CREATED' | 'ASSIGNED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED';
  createdAt: number;
}

export interface EmergencyCase {
  id: string;
  patientId: string;
  patientName: string;
  condition: string;
  status: EmergencyStatus;
  severity: 'HIGH' | 'CRITICAL';
  vitals: VitalSigns;
  location: { lat: number; lng: number };
  contactFamily: string;
  contactPhone: string;
  ambulanceId?: string;
  hospitalId?: string;
  openedAt: number;
  updatedAt: number;
  acknowledgedAt?: number;
  dispatchedAt?: number;
}

export interface BloodRequest {
  id: string;
  hospitalId: string;
  hospitalName: string;
  bloodType: string;
  units: number;
  urgency: 'Tinggi' | 'Kritis';
  status: 'OPEN' | 'RESERVED' | 'FULFILLED' | 'CANCELLED';
  createdAt: number;
}

export interface ReferralCase {
  id: string;
  patientId: string;
  patientName: string;
  fromHospitalId: string;
  toHospitalId: string;
  toHospitalName: string;
  roomType: 'IGD' | 'ICU' | 'Inap' | 'Operasi';
  reason: string;
  status: 'REQUESTED' | 'ACCEPTED' | 'REJECTED' | 'ARRIVED' | 'CANCELLED';
  createdAt: number;
}

export type SimEvent =
  | { type: 'DOCTOR_STATUS'; doctorId: string; name: string; status: Dokter['status']; topic?: string }
  | { type: 'CONSULTATION_START'; session: TeleconsultationSession; patientName: string; doctorName: string; topic: string; duration: number }
  | { type: 'CONSULTATION_UPDATED'; session: TeleconsultationSession }
  | { type: 'MEDICINE_ORDER'; order: LogisticsOrder; patientName: string; medicines: string[]; pharmacyName: string; driverId: string }
  | { type: 'ORDER_UPDATED'; order: LogisticsOrder }
  | { type: 'PATIENT_EMERGENCY'; emergency: EmergencyCase; patientId: string; patientName: string; condition: string; location: { lat: number; lng: number }; contactFamily: string; contactPhone: string }
  | { type: 'EMERGENCY_UPDATED'; emergency: EmergencyCase }
  | { type: 'AMBULANCE_REQUEST'; requestId: string; patientId: string; ambulanceId: string; eta: number; caseId?: string }
  | { type: 'AMBULANCE_STATUS'; ambulance: Ambulans }
  | { type: 'BLOOD_REQUEST'; request: BloodRequest; bloodType: string; units: number; hospitalId: string; urgency: 'Tinggi' | 'Kritis' }
  | { type: 'BLOOD_REQUEST_UPDATED'; request: BloodRequest }
  | { type: 'REFERRAL_REQUEST'; referral: ReferralCase; patientId: string; fromHospital: string; toHospital: string; reason: string; roomType: ReferralCase['roomType'] }
  | { type: 'REFERRAL_UPDATED'; referral: ReferralCase }
  | { type: 'HOSPITAL_CAPACITY_UPDATE'; hospitalId: string; hospitalName: string; IGD: number; ICU: number; Inap: number; Operasi: number; doctorsAvailable: number; bloodStock: Record<string, number> }
  | { type: 'LOCATION_UPDATE'; entityType: 'pasien' | 'ambulans' | 'driver'; entityId: string; koordinat: { lat: number; lng: number } }
  | { type: 'SIMULATION_RESET'; seed: number };

export interface SimState {
  dokter: Dokter[];
  pasien: Pasien[];
  ambulans: Ambulans[];
  driver: DriverApotek[];
  rumahSakit: RumahSakit[];
  teleconsultations: TeleconsultationSession[];
  orders: LogisticsOrder[];
  emergencies: EmergencyCase[];
  bloodRequests: BloodRequest[];
  referrals: ReferralCase[];
  elapsedSeconds: number;
  seed: number;
}

type Listener = (event: SimEvent) => void;

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const REFERRAL_REASONS = ['Kapasitas ICU penuh', 'Kebutuhan spesialis tidak tersedia', 'Peralatan diagnostik tidak memadai', 'Operasi lanjutan diperlukan'];

function cloneState(seed: number): SimState {
  return {
    dokter: SEED_DOKTER.map((d) => ({ ...d, koordinat: { ...d.koordinat } })),
    pasien: SEED_PASIEN.map((p) => ({ ...p, koordinat: { ...p.koordinat } })),
    ambulans: SEED_AMBULANS.map((a) => ({ ...a, koordinat: { ...a.koordinat } })),
    driver: SEED_DRIVER_APOTEK.map((d) => ({ ...d, koordinat: { ...d.koordinat } })),
    rumahSakit: SEED_RUMAH_SAKIT.map((rs) => ({
      ...rs,
      koordinat: { ...rs.koordinat },
      kapasitas: { IGD: { ...rs.kapasitas.IGD }, ICU: { ...rs.kapasitas.ICU }, Inap: { ...rs.kapasitas.Inap }, Operasi: { ...rs.kapasitas.Operasi } },
      stokDarah: { ...rs.stokDarah },
      dokterJaga: rs.dokterJaga.map((dj) => ({ ...dj })),
    })),
    teleconsultations: [], orders: [], emergencies: [], bloodRequests: [], referrals: [], elapsedSeconds: 0, seed,
  };
}

class SimulationEngine {
  private listeners = new Map<string, Set<Listener>>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private state: SimState;
  private random: () => number;
  private sequence = 0;
  private emergencyCreated = false;
  private speed = 1;

  constructor(seed = 20260924) {
    this.state = cloneState(seed);
    this.random = this.createRandom(seed);
  }

  private createRandom(seed: number): () => number {
    let value = (seed >>> 0) || 1;
    return () => {
      value += 0x6d2b79f5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  private int(min: number, max: number): number { return Math.floor(this.random() * (max - min + 1)) + min; }
  private pick<T>(items: T[]): T { return items[Math.floor(this.random() * items.length)] as T; }

  private emit(event: SimEvent): void {
    this.listeners.get(event.type)?.forEach((listener) => listener(event));
    this.listeners.get('*')?.forEach((listener) => listener(event));
  }

  on(eventType: string, listener: Listener): () => void {
    if (!this.listeners.has(eventType)) this.listeners.set(eventType, new Set());
    this.listeners.get(eventType)!.add(listener);
    return () => this.listeners.get(eventType)?.delete(listener);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => this.tick(), Math.max(250, Math.round(1000 / this.speed)));
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.running = false;
  }

  isRunning(): boolean { return this.running; }
  getSpeed(): number { return this.speed; }
  setSpeed(speed: number): void {
    this.speed = Math.min(Math.max(speed, 0.25), 8);
    if (this.running) { this.stop(); this.start(); }
  }
  getState(): Readonly<SimState> { return this.state; }

  reset(seed = this.state.seed): void {
    this.stop();
    this.state = cloneState(seed);
    this.random = this.createRandom(seed);
    this.sequence = 0;
    this.emergencyCreated = false;
    this.emit({ type: 'SIMULATION_RESET', seed });
  }

  private tick(): void {
    this.state.elapsedSeconds += 1;
    this.updateLocations();
    if (this.state.elapsedSeconds % 8 === 0) this.updateDoctor();
    if (this.state.elapsedSeconds % 12 === 0) this.createConsultation();
    if (this.state.elapsedSeconds % 15 === 0) this.createOrder();
    if (this.state.elapsedSeconds % 18 === 0) this.updateHospitalCapacity();
    if (this.state.elapsedSeconds % 25 === 0) this.createBloodRequest();
    if (this.state.elapsedSeconds % 30 === 0) this.createReferral();
    if (this.state.elapsedSeconds >= 12 && !this.emergencyCreated) this.createEmergency();
    this.progressWorkflows();
  }

  private jitter(point: { lat: number; lng: number }, delta: number): { lat: number; lng: number } {
    return {
      lat: Number(Math.min(Math.max(point.lat + (this.random() - 0.5) * delta, -6.35), -6.10).toFixed(6)),
      lng: Number(Math.min(Math.max(point.lng + (this.random() - 0.5) * delta, 106.70), 106.95).toFixed(6)),
    };
  }

  private updateLocations(): void {
    for (const patient of this.state.pasien) {
      patient.koordinat = this.jitter(patient.koordinat, 0.0008);
      this.emit({ type: 'LOCATION_UPDATE', entityType: 'pasien', entityId: patient.id, koordinat: patient.koordinat });
    }
    for (const ambulance of this.state.ambulans) {
      ambulance.koordinat = this.jitter(ambulance.koordinat, ambulance.status === 'Dalam Perjalanan' ? 0.003 : 0.001);
      this.emit({ type: 'LOCATION_UPDATE', entityType: 'ambulans', entityId: ambulance.id, koordinat: ambulance.koordinat });
    }
    for (const driver of this.state.driver) {
      driver.koordinat = this.jitter(driver.koordinat, driver.status === 'Mengantarkan' ? 0.002 : 0.0007);
      this.emit({ type: 'LOCATION_UPDATE', entityType: 'driver', entityId: driver.id, koordinat: driver.koordinat });
    }
  }

  private updateDoctor(): void {
    const doctor = this.pick(this.state.dokter);
    doctor.status = this.pick(['Tersedia', 'Konsultasi', 'Tidak Tersedia'] as Dokter['status'][]);
    doctor.topik = doctor.status === 'Konsultasi' ? this.pick(TOPIK_KONSULTASI) : undefined;
    this.emit({ type: 'DOCTOR_STATUS', doctorId: doctor.id, name: doctor.nama, status: doctor.status, topic: doctor.topik });
  }

  private createConsultation(): void {
    const doctor = this.pick(this.state.dokter.filter((d) => d.status !== 'Tidak Tersedia'));
    const patient = this.pick(this.state.pasien);
    const session: TeleconsultationSession = {
      id: `consult-${this.state.elapsedSeconds}-${++this.sequence}`,
      patientId: patient.id, patientName: patient.nama, doctorId: doctor.id, doctorName: doctor.nama,
      topic: this.pick(TOPIK_KONSULTASI), status: 'IN_PROGRESS', startedAt: Date.now(), durationMinutes: this.int(10, 45),
    };
    this.state.teleconsultations = [session, ...this.state.teleconsultations].slice(0, 30);
    doctor.status = 'Konsultasi';
    doctor.topik = session.topic;
    this.emit({ type: 'CONSULTATION_START', session, patientName: session.patientName, doctorName: session.doctorName, topic: session.topic, duration: session.durationMinutes });
  }

  private createOrder(): void {
    const patient = this.pick(this.state.pasien);
    const driver = this.pick(this.state.driver);
    const order: LogisticsOrder = {
      id: `order-${this.state.elapsedSeconds}-${++this.sequence}`, patientId: patient.id, patientName: patient.nama,
      pharmacyName: this.pick(SEED_APOTEK).nama, medicines: [this.pick(NAMA_OBAT), this.pick(NAMA_OBAT)], driverId: driver.id, status: 'ASSIGNED', createdAt: Date.now(),
    };
    driver.status = 'Mengantarkan'; driver.orderSaat = order.id;
    this.state.orders = [order, ...this.state.orders].slice(0, 30);
    this.emit({ type: 'MEDICINE_ORDER', order, patientName: patient.nama, medicines: order.medicines, pharmacyName: order.pharmacyName, driverId: driver.id });
  }

  private createEmergency(): void {
    this.emergencyCreated = true;
    const patient = this.state.pasien.find((p) => p.status === 'Darurat') ?? this.state.pasien[0]!;
    const emergency: EmergencyCase = {
      id: `case-${patient.id}`, patientId: patient.id, patientName: patient.nama, condition: patient.kondisi,
      status: 'CRITICAL_ALERT', severity: 'CRITICAL', vitals: { heartRate: 124, spo2: 91, systolicBp: 98, respiratoryRate: 26 },
      location: { ...patient.koordinat }, contactFamily: patient.kontakKeluarga, contactPhone: patient.teleponKeluarga,
      openedAt: Date.now(), updatedAt: Date.now(),
    };
    this.state.emergencies = [emergency, ...this.state.emergencies];
    this.emit({ type: 'PATIENT_EMERGENCY', emergency, patientId: patient.id, patientName: patient.nama, condition: patient.kondisi, location: emergency.location, contactFamily: patient.kontakKeluarga, contactPhone: patient.teleponKeluarga });
  }

  acknowledgeEmergency(caseId: string): boolean { return this.updateEmergency(caseId, { status: 'ACKNOWLEDGED', acknowledgedAt: Date.now() }); }
  contactEmergency(caseId: string): boolean { return this.updateEmergency(caseId, { status: 'CONTACTING' }); }

  dispatchNearestAmbulance(caseId: string): EmergencyCase | null {
    const emergency = this.state.emergencies.find((item) => item.id === caseId);
    if (!emergency || emergency.ambulanceId || ['RESOLVED', 'CANCELLED'].includes(emergency.status)) return emergency ?? null;
    const available = this.state.ambulans.filter((a) => a.status === 'Tersedia');
    const ambulance = (available.length > 0 ? available : this.state.ambulans)[0];
    if (!ambulance) return null;
    ambulance.status = 'Dalam Perjalanan'; ambulance.eta = this.int(5, 18); ambulance.destinasi = emergency.patientName;
    emergency.ambulanceId = ambulance.id; emergency.status = 'EN_ROUTE'; emergency.dispatchedAt = Date.now(); emergency.updatedAt = Date.now();
    this.emit({ type: 'AMBULANCE_REQUEST', requestId: `req-${caseId}`, patientId: emergency.patientId, ambulanceId: ambulance.id, eta: ambulance.eta, caseId });
    this.emit({ type: 'AMBULANCE_STATUS', ambulance });
    this.emit({ type: 'EMERGENCY_UPDATED', emergency });
    return emergency;
  }

  requestReferral(patientId: string, toHospitalId: string, roomType: ReferralCase['roomType'], reason: string): ReferralCase | null {
    const patient = this.state.pasien.find((p) => p.id === patientId);
    const hospital = this.state.rumahSakit.find((rs) => rs.id === toHospitalId);
    const source = this.state.rumahSakit[0];
    if (!patient || !hospital || !source) return null;
    const referral: ReferralCase = { id: `ref-${this.state.elapsedSeconds}-${++this.sequence}`, patientId, patientName: patient.nama, fromHospitalId: source.id, toHospitalId, toHospitalName: hospital.nama, roomType, reason, status: 'REQUESTED', createdAt: Date.now() };
    this.state.referrals = [referral, ...this.state.referrals].slice(0, 30);
    this.emit({ type: 'REFERRAL_REQUEST', referral, patientId, fromHospital: source.nama, toHospital: hospital.nama, reason, roomType });
    return referral;
  }

  requestBlood(hospitalId: string, bloodType: string, units: number, urgency: 'Tinggi' | 'Kritis'): BloodRequest | null {
    const hospital = this.state.rumahSakit.find((rs) => rs.id === hospitalId);
    if (!hospital || !BLOOD_TYPES.includes(bloodType)) return null;
    const request: BloodRequest = { id: `blood-${this.state.elapsedSeconds}-${++this.sequence}`, hospitalId, hospitalName: hospital.nama, bloodType, units: Math.max(1, units), urgency, status: 'OPEN', createdAt: Date.now() };
    this.state.bloodRequests = [request, ...this.state.bloodRequests].slice(0, 30);
    this.emit({ type: 'BLOOD_REQUEST', request, bloodType, units: request.units, hospitalId, urgency });
    return request;
  }

  private updateEmergency(caseId: string, patch: Partial<EmergencyCase>): boolean {
    const emergency = this.state.emergencies.find((item) => item.id === caseId);
    if (!emergency || ['RESOLVED', 'CANCELLED'].includes(emergency.status)) return false;
    Object.assign(emergency, patch, { updatedAt: Date.now() });
    this.emit({ type: 'EMERGENCY_UPDATED', emergency });
    return true;
  }

  private updateHospitalCapacity(): void {
    const hospital = this.pick(this.state.rumahSakit);
    const vary = (value: number, total: number) => Math.min(Math.max(value + this.int(-1, 1), 0), total);
    hospital.kapasitas.IGD.tersedia = vary(hospital.kapasitas.IGD.tersedia, hospital.kapasitas.IGD.total);
    hospital.kapasitas.ICU.tersedia = vary(hospital.kapasitas.ICU.tersedia, hospital.kapasitas.ICU.total);
    hospital.kapasitas.Inap.tersedia = vary(hospital.kapasitas.Inap.tersedia, hospital.kapasitas.Inap.total);
    hospital.kapasitas.Operasi.tersedia = vary(hospital.kapasitas.Operasi.tersedia, hospital.kapasitas.Operasi.total);
    hospital.dokterTersedia = Math.max(1, hospital.dokterTersedia + this.int(-1, 1));
    const bloodStock = { ...hospital.stokDarah };
    for (const type of Object.keys(bloodStock)) bloodStock[type] = Math.max(0, bloodStock[type]! + this.int(-1, 1));
    hospital.stokDarah = bloodStock;
    this.emit({ type: 'HOSPITAL_CAPACITY_UPDATE', hospitalId: hospital.id, hospitalName: hospital.nama, IGD: hospital.kapasitas.IGD.tersedia, ICU: hospital.kapasitas.ICU.tersedia, Inap: hospital.kapasitas.Inap.tersedia, Operasi: hospital.kapasitas.Operasi.tersedia, doctorsAvailable: hospital.dokterTersedia, bloodStock });
  }

  private createBloodRequest(): void {
    const hospital = this.pick(this.state.rumahSakit);
    this.requestBlood(hospital.id, this.pick(BLOOD_TYPES), this.int(1, 4), this.random() < 0.35 ? 'Kritis' : 'Tinggi');
  }

  private createReferral(): void {
    const patient = this.pick(this.state.pasien);
    const target = this.pick(this.state.rumahSakit);
    this.requestReferral(patient.id, target.id, this.pick(['IGD', 'ICU', 'Inap', 'Operasi'] as ReferralCase['roomType'][]), this.pick(REFERRAL_REASONS));
  }

  private progressWorkflows(): void {
    if (this.state.elapsedSeconds % 5 === 0) {
      for (const emergency of this.state.emergencies) {
        if (!['CRITICAL_ALERT', 'ACKNOWLEDGED', 'CONTACTING'].includes(emergency.status)) continue;
        const nextVitals: VitalSigns = {
          heartRate: Math.min(148, emergency.vitals.heartRate + 4),
          spo2: Math.max(84, emergency.vitals.spo2 - 1),
          systolicBp: Math.max(78, emergency.vitals.systolicBp - 4),
          respiratoryRate: Math.min(34, emergency.vitals.respiratoryRate + 1),
        };
        if (JSON.stringify(nextVitals) !== JSON.stringify(emergency.vitals)) {
          emergency.vitals = nextVitals;
          emergency.severity = 'CRITICAL';
          emergency.updatedAt = Date.now();
          this.emit({ type: 'EMERGENCY_UPDATED', emergency });
        }
      }
    }
    for (const order of this.state.orders) {
      if (order.status === 'ASSIGNED' && this.state.elapsedSeconds % 30 === 0) { order.status = 'IN_TRANSIT'; this.emit({ type: 'ORDER_UPDATED', order }); }
    }
    for (const referral of this.state.referrals) {
      if (referral.status === 'REQUESTED' && this.state.elapsedSeconds % 40 === 0) { referral.status = 'ACCEPTED'; this.emit({ type: 'REFERRAL_UPDATED', referral }); }
    }
    for (const emergency of this.state.emergencies) {
      if (emergency.status === 'CRITICAL_ALERT' && Date.now() - emergency.openedAt > 90_000) this.updateEmergency(emergency.id, { status: 'ESCALATED' });
    }
  }

  getEventDisplayText(event: SimEvent): string {
    switch (event.type) {
      case 'DOCTOR_STATUS': return `${event.name} status menjadi ${event.status}${event.topic ? `: ${event.topic}` : ''}`;
      case 'CONSULTATION_START': return `Telekonsultasi ${event.session.doctorName} — ${event.session.patientName}: ${event.session.topic}`;
      case 'CONSULTATION_UPDATED': return `Sesi konsultasi ${event.session.id} menjadi ${event.session.status}`;
      case 'MEDICINE_ORDER': return `Order obat ${event.order.id} untuk ${event.order.patientName} dari ${event.order.pharmacyName}`;
      case 'ORDER_UPDATED': return `Order ${event.order.id} menjadi ${event.order.status}`;
      case 'PATIENT_EMERGENCY': return `DARURAT: ${event.emergency.patientName} — ${event.emergency.condition}`;
      case 'EMERGENCY_UPDATED': return `Emergency ${event.emergency.id} menjadi ${event.emergency.status}`;
      case 'AMBULANCE_REQUEST': return `Ambulans ${event.ambulanceId} dikirim, ETA ${event.eta} menit`;
      case 'AMBULANCE_STATUS': return `${event.ambulance.nomorUnit} status ${event.ambulance.status}`;
      case 'BLOOD_REQUEST': return `Request darah ${event.bloodType} ${event.units} kantong di ${event.hospitalId}`;
      case 'BLOOD_REQUEST_UPDATED': return `Request darah ${event.request.id} menjadi ${event.request.status}`;
      case 'REFERRAL_REQUEST': return `Rujukan ${event.patientId} ke ${event.toHospital}`;
      case 'REFERRAL_UPDATED': return `Rujukan ${event.referral.id} menjadi ${event.referral.status}`;
      case 'HOSPITAL_CAPACITY_UPDATE': return `Kapasitas ${event.hospitalName} berubah — IGD ${event.IGD}, ICU ${event.ICU}`;
      case 'LOCATION_UPDATE': return `Lokasi ${event.entityType} ${event.entityId} diperbarui`;
      case 'SIMULATION_RESET': return `Simulator di-reset dengan seed ${event.seed}`;
    }
  }

  getEventLevel(event: SimEvent): 'info' | 'warning' | 'danger' | 'success' {
    if (event.type === 'PATIENT_EMERGENCY' || event.type === 'EMERGENCY_UPDATED' && event.emergency.severity === 'CRITICAL') return 'danger';
    if (event.type === 'BLOOD_REQUEST' && event.urgency === 'Kritis') return 'danger';
    if (event.type === 'AMBULANCE_REQUEST' || event.type === 'REFERRAL_REQUEST' || event.type === 'BLOOD_REQUEST') return 'warning';
    if (event.type === 'DOCTOR_STATUS' && event.status === 'Tersedia') return 'success';
    return 'info';
  }
}

export const simulationEngine = new SimulationEngine();
