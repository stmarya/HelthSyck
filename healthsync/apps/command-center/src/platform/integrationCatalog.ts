export type IntegrationKind = 'service' | 'realtime' | 'contract' | 'client';

export interface IntegrationDescriptor {
  id: string;
  label: string;
  owner: string;
  kind: IntegrationKind;
  healthPath?: string;
  contractVersion: string;
  consumers: string[];
  critical: boolean;
  requiredEnv?: string[];
}

export interface CompatibilityLink {
  from: string;
  to: string;
  capability: string;
  contract: string;
  status: 'READY' | 'CONFIG_REQUIRED' | 'BACKEND_REQUIRED';
}

export const INTEGRATIONS: IntegrationDescriptor[] = [
  { id: 'auth-rbac', label: 'Auth & RBAC', owner: 'auth-service', kind: 'service', healthPath: '/health/auth', contractVersion: 'auth.v1', consumers: ['admin', 'command-center', 'mobile'], critical: true },
  { id: 'patient-service', label: 'Patient Service', owner: 'patient-service', kind: 'service', healthPath: '/health/patient', contractVersion: 'patient.v1', consumers: ['admin', 'command-center', 'mobile'], critical: true },
  { id: 'consultation-service', label: 'Consultation Service', owner: 'consultation-service', kind: 'service', healthPath: '/health/consultation', contractVersion: 'consultation.v1', consumers: ['admin', 'command-center', 'mobile'], critical: true },
  { id: 'hospital-service', label: 'Hospital & Capacity', owner: 'hospital-service', kind: 'service', healthPath: '/health/hospital', contractVersion: 'hospital-capacity.v1', consumers: ['admin', 'command-center', 'mobile'], critical: true },
  { id: 'ambulance-service', label: 'Ambulance & Dispatch', owner: 'ambulance-service', kind: 'service', healthPath: '/health/ambulance', contractVersion: 'ambulance.v1', consumers: ['admin', 'command-center', 'mobile'], critical: true },
  { id: 'pharmacy-service', label: 'Pharmacy & Inventory', owner: 'pharmacy-service', kind: 'service', healthPath: '/health/pharmacy', contractVersion: 'pharmacy.v1', consumers: ['admin', 'command-center', 'mobile'], critical: true },
  { id: 'realtime-gateway', label: 'Realtime Gateway', owner: 'realtime-gateway', kind: 'realtime', healthPath: '/health/realtime', contractVersion: 'realtime.v1', consumers: ['command-center', 'mobile'], critical: true },
  { id: 'map-routing', label: 'Map & Routing', owner: 'platform', kind: 'client', contractVersion: 'map-routing.v1', consumers: ['command-center', 'mobile'], critical: false, requiredEnv: ['VITE_MAP_PROVIDER', 'VITE_ROUTING_URL'] },
  { id: 'event-envelope', label: 'Event Envelope', owner: 'platform', kind: 'contract', contractVersion: 'command-center-event.v1', consumers: ['admin', 'command-center', 'mobile'], critical: true },
  { id: 'communication', label: 'Chat & WebRTC Call', owner: 'realtime-gateway', kind: 'realtime', healthPath: '/health/realtime', contractVersion: 'communication.v1', consumers: ['command-center', 'admin', 'mobile'], critical: true, requiredEnv: ['VITE_TURN_URL', 'VITE_TURN_USERNAME', 'VITE_TURN_CREDENTIAL'] },
];

export const COMPATIBILITY_LINKS: CompatibilityLink[] = [
  { from: 'command-center', to: 'admin', capability: 'audit, alert, reports', contract: 'event-envelope.v1', status: 'READY' },
  { from: 'command-center', to: 'mobile', capability: 'dispatch, GPS, chat, call', contract: 'ambulance.v1 + communication.v1', status: 'BACKEND_REQUIRED' },
  { from: 'command-center', to: 'hospital-service', capability: 'capacity, referral, blood', contract: 'hospital-capacity.v1', status: 'BACKEND_REQUIRED' },
  { from: 'command-center', to: 'pharmacy-service', capability: 'order, stock, delivery', contract: 'pharmacy.v1', status: 'BACKEND_REQUIRED' },
  { from: 'admin', to: 'all-services', capability: 'governance and audit', contract: 'auth.v1 + event-envelope.v1', status: 'READY' },
];
