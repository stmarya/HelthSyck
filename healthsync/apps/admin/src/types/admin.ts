// ─────────────────────────────────────────────────────────────────────────────
// Shared TypeScript types for the Admin Panel
// Aligned with openapi.yaml, STANDARDS.md, and backend schema
// ─────────────────────────────────────────────────────────────────────────────

export type UserRole =
  | 'PATIENT'
  | 'DOCTOR'
  | 'COMMAND_CENTER'
  | 'PHARMACIST'
  | 'PHARMACY_DRIVER'
  | 'AMBULANCE_DRIVER'
  | 'ADMIN';

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';

export interface AdminUser {
  id: string;
  email: string;
  role: UserRole;
  name: string;
}

// ── Users ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  phone?: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  lastLoginAt?: string;
}

export interface UserDetail extends User {
  emailVerified?: boolean;
  phoneVerified?: boolean;
}

// ── User CRUD forms ───────────────────────────────────────────────────────────

export interface CreateUserForm {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  phone?: string;
}

export interface UpdateUserForm {
  name?: string;
  email?: string;
  role?: UserRole;
  status?: UserStatus;
  phone?: string;
}

// ── Pagination meta ───────────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  timestamp?: string;
}

export interface PagedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export interface RoleCount {
  role: UserRole;
  count: number;
}

export interface KpiRow {
  metric: string;
  current: number;
  previous: number;
}

export interface DayCount {
  day: number;
  count: number;
}

export interface WeeklyStats {
  week: string;
  count: number;
}

// ── Consultations ─────────────────────────────────────────────────────────────

export type ConsultationStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export interface Consultation {
  id: string;
  patientId: string;
  patientName?: string;
  doctorId: string;
  doctorName?: string;
  status: ConsultationStatus;
  createdAt: string;
  updatedAt?: string;
  complaint?: string;
  specialization?: string;
}

// ── Hospitals ─────────────────────────────────────────────────────────────────

export type HospitalType = 'TYPE_A' | 'TYPE_B' | 'TYPE_C' | 'TYPE_D' | 'CLINIC' | 'PUSKESMAS';

export interface Hospital {
  id: string;
  name: string;
  type: HospitalType;
  kodeRS?: string;
  address: string;
  city: string;
  province?: string;
  phone?: string;
  igdPhone?: string;
  totalBeds: number;
  availableBeds?: number;
  icuTotal?: number;
  icuAvailable?: number;
  accreditation?: string;
  isBPJSProvider?: boolean;
  specializations?: string[];
}

// ── Hospital CRUD forms ───────────────────────────────────────────────────────

export interface CreateHospitalForm {
  name: string;
  type: HospitalType;
  kodeRS?: string;
  address: string;
  city: string;
  province?: string;
  phone?: string;
  igdPhone?: string;
  totalBeds: number;
  accreditation?: string;
  isBPJSProvider: boolean;
}

export type UpdateHospitalForm = Partial<CreateHospitalForm>;

// ── Activity logs ─────────────────────────────────────────────────────────────

export interface ActivityLog {
  id: string;
  timestamp: string;
  userId?: string;
  userEmail?: string;
  action: string;
  resource: string;
  resourceId?: string;
  ipAddress?: string;
  status: 'SUCCESS' | 'FAILURE' | 'WARNING';
  detail?: string;
}

// ── Service health ────────────────────────────────────────────────────────────

export type ServiceStatus = 'ONLINE' | 'OFFLINE' | 'CHECKING';

export interface ServiceHealth {
  name: string;
  port: number;
  url: string;
  status: ServiceStatus;
  latency?: number;
}

// ── Toast ─────────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

// ── Consultations (extended) ──────────────────────────────────────────────────

/** Shape lengkap dari GET /v1/consultations */
export interface ConsultationRow {
  id: string;
  patient_id: string;
  doctor_id: string;
  status: ConsultationStatus;
  chief_complaint: string | null;
  diagnosis: string | null;
  notes: string | null;
  symptom_data: Record<string, unknown> | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  patient_name: string | null;
  doctor_email: string | null;
}

// ── Patients ──────────────────────────────────────────────────────────────────

export type GenderType = 'MALE' | 'FEMALE';
export type BloodType = 'A+' | 'A-' | 'B+' | 'B-' | 'O+' | 'O-' | 'AB+' | 'AB-' | 'UNKNOWN';

export interface Patient {
  id: string;
  user_id: string;
  name: string;
  date_of_birth: string;
  blood_type: BloodType;
  gender: GenderType;
  phone: string | null;
  created_at: string;
}

/** Response dari GET /v1/patients (bungkus nested) */
export interface PatientsApiResponse {
  data: {
    patients: Patient[];
    meta: PaginationMeta;
  };
  meta: { timestamp: string };
}

// ── Prescriptions ─────────────────────────────────────────────────────────────

export type PrescriptionStatus = 'ISSUED' | 'CONFIRMED' | 'DISPENSED' | 'DELIVERED' | 'CANCELLED';
export type FulfillmentType = 'PICKUP' | 'DELIVERY';

export interface Prescription {
  id: string;
  consultation_id: string;
  patient_id: string;
  doctor_id: string;
  pharmacy_id: string | null;
  status: PrescriptionStatus;
  fulfillment_type: FulfillmentType | null;
  delivery_address: string | null;
  notes: string | null;
  issued_at: string;
  expires_at: string;
  updated_at: string;
}

// ── Referrals ─────────────────────────────────────────────────────────────────

export type ReferralStatus =
  | 'DRAFT'
  | 'SENT'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'IN_TRANSIT'
  | 'ARRIVED'
  | 'CANCELLED';

export type UrgencyLevel = 'NORMAL' | 'URGENT' | 'EMERGENCY' | 'CRITICAL';

export interface Referral {
  id: string;
  patient_id: string;
  from_hospital_id: string;
  to_hospital_id: string;
  referring_doctor_id?: string | null;
  receiving_doctor_id?: string | null;
  ambulance_id?: string | null;
  status: ReferralStatus;
  urgency_level: UrgencyLevel;
  reason: string;
  required_specialization?: string | null;
  diagnosis?: string | null;
  notes?: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  arrived_at?: string | null;
  created_at: string;
  updated_at?: string;
  // Join fields dari backend
  patient_name?: string | null;
  from_hospital_name?: string | null;
  to_hospital_name?: string | null;
}

// ── Ambulances ────────────────────────────────────────────────────────────────

// Sesuai enum di ambulance-service: OFFLINE | AVAILABLE | DISPATCHED | EN_ROUTE | AT_SCENE | TRANSPORTING | RETURNING
export type AmbulanceStatus =
  | 'OFFLINE'
  | 'AVAILABLE'
  | 'DISPATCHED'
  | 'EN_ROUTE'
  | 'AT_SCENE'
  | 'TRANSPORTING'
  | 'RETURNING';

export interface Ambulance {
  id: string;
  plate_number: string | null;
  status: AmbulanceStatus;
  hospital_id: string | null;
  driver_id: string | null;
  latitude: string | null;
  longitude: string | null;
  heading: number | null;
  speed_kmh: number | null;
  last_location_at: string | null;
  hospital_name: string | null;
  driver_phone: string | null;
}

// ── Master Data ───────────────────────────────────────────────────────────────

export interface DoctorSpecialization {
  id: string;
  code: string;
  name: string;
  doctorCount: number;
  createdAt: string;
}

export interface ServiceType {
  id: string;
  code: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
}

export interface FacilityCategory {
  id: string;
  code: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
}

export interface SystemConfig {
  key: string;
  value: string;
  type: 'string' | 'number' | 'boolean';
  description: string;
  updatedAt: string;
}

// ── Alerts (dari alert-service port 4002) ─────────────────────────────────────

/** Level urgensi alert dari IoT / vital signs — makin tinggi angka makin kritis */
export type AlertLevel = 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';

/** Status siklus hidup sebuah alert */
export type AlertStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'FALSE_POSITIVE';

/** Metrik yang memicu alert */
export type AlertTriggerMetric = 'heart_rate' | 'spo2' | 'temperature';

/** Satu baris alert dari GET /v1/alerts */
export interface AlertRow {
  id: string;
  patient_id: string;
  patient_name?: string | null;  // tersedia di /v1/alerts/active
  level: AlertLevel;
  status: AlertStatus;
  trigger_metric: AlertTriggerMetric | string;
  trigger_value: number;
  trigger_threshold: number;
  message: string;
  acknowledged_by?: string | null;
  acknowledged_at?: string | null;
  resolved_at?: string | null;
  created_at: string;
}

/** Response dari GET /v1/alerts */
export interface AlertsApiResponse {
  data: AlertRow[];
  meta: { limit: number; offset: number };
}

// ── Notifications (dari notification-service port 3009) ───────────────────────

/** Saluran pengiriman notifikasi */
export type NotificationChannel = 'PUSH' | 'SMS' | 'IN_APP' | 'EMAIL';

/** Status pengiriman notifikasi */
export type NotificationStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'READ';

/** Prioritas notifikasi */
export type NotificationPriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';

/** Tipe entitas yang di-referensikan */
export type NotificationReferenceType = 'ALERT' | 'REFERRAL' | 'CONSULTATION' | 'PRESCRIPTION' | 'AMBULANCE';

/** Satu baris notifikasi dari GET /v1/notifications */
export interface NotificationRow {
  id: string;
  user_id: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  title: string | null;
  body: string;
  data?: Record<string, unknown> | null;
  priority: NotificationPriority;
  reference_id?: string | null;
  reference_type?: NotificationReferenceType | string | null;
  sent_at?: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
  created_at: string;
}

/** Response dari GET /v1/notifications */
export interface NotificationsApiResponse {
  data: NotificationRow[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/** Response dari GET /v1/notifications/unread-count */
export interface UnreadCountResponse {
  data: { count: number };
}
