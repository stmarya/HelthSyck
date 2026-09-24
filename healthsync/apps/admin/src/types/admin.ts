export type UserRole = 'PATIENT' | 'DOCTOR' | 'COMMAND_CENTER' | 'PHARMACIST' | 'AMBULANCE_DRIVER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';
export interface AdminUser { id: string; email: string; role: UserRole; name: string }
export interface User { id: string; email: string; phone?: string; name: string; role: UserRole; status: UserStatus; createdAt: string; lastLoginAt?: string }
export interface UserDetail extends User { emailVerified?: boolean; phoneVerified?: boolean }
export interface CreateUserForm { email: string; password: string; role: UserRole; phone?: string }
export interface UpdateUserForm { name?: string; email?: string; role?: UserRole; status?: UserStatus; phone?: string }
export interface PaginationMeta { page: number; limit: number; total: number; totalPages: number; timestamp?: string }
export interface PagedResponse<T> { data: T[]; meta: PaginationMeta }
export interface RoleCount { role: UserRole; count: number }
export interface KpiRow { metric: string; current: number; previous: number }
export interface DayCount { day: number; count: number }
export interface WeeklyStats { week: string; count: number }
export type ConsultationStatus = 'PENDING' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
export interface Consultation { id: string; patientId: string; patientName?: string; doctorId: string; doctorName?: string; status: ConsultationStatus; createdAt: string; updatedAt?: string; complaint?: string; specialization?: string }
export type HospitalType = 'TYPE_A' | 'TYPE_B' | 'TYPE_C' | 'TYPE_D' | 'CLINIC' | 'PUSKESMAS';
export interface Hospital { id: string; name: string; type: HospitalType; licenseNumber?: string; address: string; city: string; province: string; latitude: number; longitude: number; phone: string; email?: string; igdPhone?: string; totalBeds: number; availableBeds?: number; icuTotal: number; icuAvailable?: number; specializations: string[]; isEmtPartner: boolean }
export interface CreateHospitalForm { name: string; type: HospitalType; licenseNumber: string; address: string; city: string; province: string; latitude: number; longitude: number; phone: string; email?: string; igdPhone?: string; totalBeds: number; icuTotal: number; specializations: string[]; isEmtPartner: boolean }
export type UpdateHospitalForm = Partial<Omit<CreateHospitalForm, 'licenseNumber'>>;
export interface ActivityLog { id: string; timestamp: string; userId?: string; userEmail?: string; action: string; resource: string; resourceId?: string; ipAddress?: string; status: 'SUCCESS' | 'FAILURE' | 'WARNING'; detail?: string }
export type ServiceStatus = 'ONLINE' | 'OFFLINE' | 'CHECKING';
export interface ServiceHealth { name: string; port: number; url: string; status: ServiceStatus; latency?: number }
export type ToastType = 'success' | 'error' | 'warning' | 'info';
export interface Toast { id: string; type: ToastType; message: string }
export interface ConsultationRow { id: string; patient_id: string; doctor_id: string; status: ConsultationStatus; chief_complaint: string | null; diagnosis: string | null; notes: string | null; symptom_data: Record<string, unknown> | null; started_at: string | null; ended_at: string | null; created_at: string; updated_at: string; patient_name: string | null; doctor_email: string | null }
export type GenderType = 'MALE' | 'FEMALE';
export type BloodType = 'A+' | 'A-' | 'B+' | 'B-' | 'O+' | 'O-' | 'AB+' | 'AB-' | 'UNKNOWN';
export interface Patient { id: string; user_id: string; name: string; date_of_birth: string; blood_type: BloodType; gender: GenderType; phone: string | null; created_at: string }
export interface PatientsApiResponse { data: { patients: Patient[]; meta: PaginationMeta }; meta: { timestamp: string } }
export type PrescriptionStatus = 'ISSUED' | 'SENT_TO_PHARMACY' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'DELIVERING' | 'DELIVERED' | 'CANCELLED';
export type FulfillmentType = 'PICKUP' | 'DELIVERY';
export interface Prescription { id: string; consultation_id: string; patient_id: string; doctor_id: string; pharmacy_id: string | null; status: PrescriptionStatus; fulfillment_type: FulfillmentType | null; delivery_address: string | null; notes: string | null; issued_at: string; expires_at: string; updated_at: string }
export type ReferralStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'IN_TRANSIT' | 'ARRIVED' | 'CANCELLED';
export type UrgencyLevel = 'NORMAL' | 'URGENT' | 'EMERGENCY' | 'CRITICAL';
export interface Referral { id: string; patient_id: string; from_hospital_id: string; to_hospital_id: string; referring_doctor_id?: string | null; receiving_doctor_id?: string | null; ambulance_id?: string | null; status: ReferralStatus; urgency_level: UrgencyLevel; reason: string; required_specialization?: string | null; diagnosis?: string | null; notes?: string | null; sent_at: string | null; accepted_at: string | null; arrived_at?: string | null; created_at: string; updated_at?: string; patient_name?: string | null; from_hospital_name?: string | null; to_hospital_name?: string | null }
export type AmbulanceStatus = 'OFFLINE' | 'AVAILABLE' | 'DISPATCHED' | 'EN_ROUTE' | 'AT_SCENE' | 'TRANSPORTING' | 'RETURNING';
export interface Ambulance { id: string; plate_number: string | null; type: 'BLS' | 'ALS' | 'NICU' | null; status: AmbulanceStatus; hospital_id: string | null; driver_id: string | null; latitude: string | null; longitude: string | null; heading: number | null; speed_kmh: number | null; last_location_at: string | null; hospital_name: string | null; driver_phone: string | null }
export interface DoctorSpecialization { id: string; code: string; name: string; doctorCount: number; createdAt: string }
export interface ServiceType { id: string; code: string; name: string; description?: string; isActive: boolean; createdAt: string }
export interface FacilityCategory { id: string; code: string; name: string; description?: string; isActive: boolean; createdAt: string }
export interface SystemConfig { key: string; value: string; type: 'string' | 'number' | 'boolean'; description: string; updatedAt: string }
export type AlertLevel = 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';
export type AlertStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'FALSE_POSITIVE';
export type AlertTriggerMetric = 'heart_rate' | 'spo2' | 'temperature';
export interface AlertRow { id: string; patient_id: string; patient_name?: string | null; level: AlertLevel; status: AlertStatus; trigger_metric: AlertTriggerMetric | string; trigger_value: number; trigger_threshold: number; message: string; acknowledged_by?: string | null; acknowledged_at?: string | null; resolved_at?: string | null; created_at: string }
export interface AlertsApiResponse { data: AlertRow[]; meta: { limit: number; offset: number } }
export type NotificationChannel = 'PUSH' | 'SMS' | 'IN_APP' | 'EMAIL';
export type NotificationStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'READ';
export type NotificationPriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
export type NotificationReferenceType = 'ALERT' | 'REFERRAL' | 'CONSULTATION' | 'PRESCRIPTION' | 'AMBULANCE';
export interface NotificationRow { id: string; user_id: string; channel: NotificationChannel; status: NotificationStatus; title: string | null; body: string; data?: Record<string, unknown> | null; priority: NotificationPriority; reference_id?: string | null; reference_type?: NotificationReferenceType | string | null; sent_at?: string | null; delivered_at?: string | null; read_at?: string | null; created_at: string }
export interface NotificationsApiResponse { data: NotificationRow[]; meta: { page: number; limit: number; total: number; totalPages: number } }
export interface UnreadCountResponse { data: { count: number } }
