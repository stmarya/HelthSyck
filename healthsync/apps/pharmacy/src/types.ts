export type PrescriptionStatus =
  | 'ISSUED'
  | 'SENT_TO_PHARMACY'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'DELIVERING'
  | 'DELIVERED'
  | 'CANCELLED';

export interface Pharmacy {
  id: string;
  name: string;
  license_number: string;
  address: string;
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  operating_hours?: Record<string, { open: string; close: string }> | null;
  drug_count?: number;
  low_stock_count?: number;
}

export interface InventoryItem {
  id: string;
  pharmacy_id: string;
  drug_id: string;
  generic_name: string;
  brand_name?: string | null;
  dosage_form?: string | null;
  strength?: string | null;
  stock_qty: number;
  unit_price: number;
  batch_number?: string | null;
  expires_at?: string | null;
  reorder_level: number;
  is_low_stock?: boolean;
}

export interface PrescriptionItem {
  id: string;
  drug_id: string;
  drug_name: string;
  generic_name?: string;
  brand_name?: string;
  dosage: string;
  quantity: number;
  instructions?: string | null;
  substitution_allowed: boolean;
}

export interface Prescription {
  id: string;
  patient_id: string;
  patient_name?: string | null;
  doctor_id: string;
  doctor_email?: string | null;
  pharmacy_id?: string | null;
  status: PrescriptionStatus;
  fulfillment_type?: 'PICKUP' | 'DELIVERY' | null;
  delivery_address?: string | null;
  notes?: string | null;
  issued_at: string;
  expires_at: string;
  updated_at: string;
  items?: PrescriptionItem[];
  delivery_id?: string | null;
  delivery_status?: string | null;
  tracking_code?: string | null;
  courier_id?: string | null;
}

export interface Courier {
  id: string;
  email: string;
  phone?: string | null;
  status: string;
}