import type { SimState } from './SimulationEngine';
import type { HospitalReservation, ReservationResource } from '../platform/operationalContracts';

const ACTIVE: HospitalReservation['status'][] = ['HELD', 'RESERVED'];

type ReservationRequest = {
  hospitalId: string;
  patientId: string;
  resource: ReservationResource;
  ttlMs?: number;
  createdBy?: string;
};

export class HospitalReservationService {
  private readonly reservations = new Map<string, HospitalReservation>();
  private sequence = 0;

  reserve(state: Readonly<SimState>, request: ReservationRequest, now = Date.now()): HospitalReservation | null {
    const existing = [...this.reservations.values()].find((item) => item.patientId === request.patientId && item.hospitalId === request.hospitalId && item.resource === request.resource && ACTIVE.includes(item.status));
    if (existing) return existing;
    const hospital = state.rumahSakit.find((item) => item.id === request.hospitalId);
    if (!hospital || hospital.kapasitas[request.resource].tersedia < 1) return null;
    const mutableHospital = hospital as typeof hospital;
    mutableHospital.kapasitas[request.resource].tersedia -= 1;
    const reservation: HospitalReservation = {
      id: `res-${now}-${++this.sequence}`,
      hospitalId: request.hospitalId,
      patientId: request.patientId,
      resource: request.resource,
      status: 'HELD',
      expiresAt: now + Math.max(30_000, request.ttlMs ?? 5 * 60_000),
      createdAt: now,
      createdBy: request.createdBy ?? 'command-center',
    };
    this.reservations.set(reservation.id, reservation);
    return reservation;
  }

  confirm(state: Readonly<SimState>, reservationId: string): HospitalReservation | null {
    const reservation = this.reservations.get(reservationId);
    if (!reservation || reservation.status !== 'HELD') return null;
    reservation.status = 'RESERVED';
    reservation.expiresAt = Date.now() + 30 * 60_000;
    return reservation;
  }

  release(state: Readonly<SimState>, reservationId: string, status: 'RELEASED' | 'EXPIRED' = 'RELEASED'): boolean {
    const reservation = this.reservations.get(reservationId);
    if (!reservation || !ACTIVE.includes(reservation.status)) return false;
    const hospital = state.rumahSakit.find((item) => item.id === reservation.hospitalId);
    if (hospital) hospital.kapasitas[reservation.resource].tersedia += 1;
    reservation.status = status;
    return true;
  }

  expire(state: Readonly<SimState>, now = Date.now()): HospitalReservation[] {
    const expired: HospitalReservation[] = [];
    for (const reservation of this.reservations.values()) {
      if (ACTIVE.includes(reservation.status) && reservation.expiresAt <= now) {
        this.release(state, reservation.id, 'EXPIRED');
        expired.push(reservation);
      }
    }
    return expired;
  }

  list(): HospitalReservation[] {
    return [...this.reservations.values()].map((item) => ({ ...item }));
  }
}

export const hospitalReservationService = new HospitalReservationService();
