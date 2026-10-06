export type EntityKind = 'PATIENT' | 'DOCTOR' | 'AMBULANCE' | 'DRIVER' | 'HOSPITAL' | 'PHARMACY';

export interface EntityIdentity {
  id: string;
  kind: EntityKind;
  label: string;
  facilityId?: string;
  capabilities: string[];
  source: 'simulation' | 'backend';
}

export interface FreshnessStamp {
  updatedAt: number;
  source: string;
  staleAfterMs: number;
  confidence: number;
}

export type FreshnessLevel = 'LIVE' | 'STALE' | 'UNKNOWN';

export interface NotificationItem {
  id: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
  title: string;
  body: string;
  createdAt: number;
  correlationId: string;
  acknowledged: boolean;
}

export interface IncidentTimelineEntry {
  id: string;
  incidentId: string;
  status: string;
  actor: string;
  at: number;
  note?: string;
}

export type ReservationResource = 'IGD' | 'ICU' | 'Inap' | 'Operasi';
export type ReservationStatus = 'HELD' | 'RESERVED' | 'RELEASED' | 'EXPIRED';

export interface HospitalReservation {
  id: string;
  hospitalId: string;
  patientId: string;
  resource: ReservationResource;
  status: ReservationStatus;
  expiresAt: number;
  createdAt: number;
  createdBy: string;
}

export interface PredictiveSignal {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  entityId?: string;
  confidence: number;
  generatedAt: number;
}
