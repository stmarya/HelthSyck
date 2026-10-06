import type { EntityIdentity } from './operationalContracts';

export type OperatorRole = 'ADMIN' | 'COMMAND_CENTER' | 'PHARMACIST' | 'DRIVER' | 'DOCTOR' | 'PATIENT';
export type Command = 'VIEW_PATIENT' | 'DISPATCH_AMBULANCE' | 'REQUEST_REFERRAL' | 'RESERVE_CAPACITY' | 'SEND_COMMAND';

const ROLE_COMMANDS: Record<OperatorRole, readonly Command[]> = {
  ADMIN: ['VIEW_PATIENT', 'DISPATCH_AMBULANCE', 'REQUEST_REFERRAL', 'RESERVE_CAPACITY', 'SEND_COMMAND'],
  COMMAND_CENTER: ['VIEW_PATIENT', 'DISPATCH_AMBULANCE', 'REQUEST_REFERRAL', 'RESERVE_CAPACITY', 'SEND_COMMAND'],
  PHARMACIST: [], DRIVER: [], DOCTOR: ['VIEW_PATIENT'], PATIENT: [],
};

export function canExecute(role: OperatorRole, command: Command, target?: EntityIdentity, facilityId?: string): boolean {
  if (!ROLE_COMMANDS[role]?.includes(command)) return false;
  if (role === 'ADMIN' || !target || !facilityId) return true;
  return target.facilityId === undefined || target.facilityId === facilityId;
}
