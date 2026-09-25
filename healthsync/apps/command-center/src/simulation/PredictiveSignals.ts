import type { SimState } from './SimulationEngine';
import type { PredictiveSignal } from '../platform/operationalContracts';

export function generatePredictiveSignals(state: Readonly<SimState>, now = Date.now()): PredictiveSignal[] {
  const signals: PredictiveSignal[] = [];
  for (const hospital of state.rumahSakit) {
    const resources = [hospital.kapasitas.IGD, hospital.kapasitas.ICU, hospital.kapasitas.Inap, hospital.kapasitas.Operasi];
    const pressure = resources.filter((item) => item.total > 0 && item.tersedia / item.total <= 0.15).length;
    if (pressure >= 2) signals.push({ id: `capacity-${hospital.id}`, severity: 'critical', title: 'Kapasitas rumah sakit kritis', detail: `${hospital.nama} memiliki ${pressure} resource di bawah 15%.`, entityId: hospital.id, confidence: 0.88, generatedAt: now });
    else if (pressure === 1) signals.push({ id: `capacity-${hospital.id}`, severity: 'warning', title: 'Kapasitas mulai menipis', detail: `${hospital.nama} memiliki resource dengan sisa ≤15%.`, entityId: hospital.id, confidence: 0.74, generatedAt: now });
  }
  const emergencyCount = state.emergencies.filter((item) => !['RESOLVED', 'CANCELLED', 'ADMITTED'].includes(item.status)).length;
  if (emergencyCount >= 3) signals.push({ id: 'emergency-load', severity: 'warning', title: 'Beban emergency meningkat', detail: `${emergencyCount} kasus emergency masih aktif dan berpotensi menekan SLA.`, confidence: 0.71, generatedAt: now });
  return signals;
}
