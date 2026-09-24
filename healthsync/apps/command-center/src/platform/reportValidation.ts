export interface ReportSnapshot {
  reportId: string;
  periodStart: string;
  periodEnd: string;
  timeZone: string;
  source: string;
  updatedAt: string;
  rows: readonly Record<string, unknown>[];
}

export type ValidationIssue = { field: string; message: string };

export function validateReportSnapshot(snapshot: ReportSnapshot): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!snapshot.reportId) issues.push({ field: 'reportId', message: 'Report ID wajib diisi' });
  if (!snapshot.periodStart || !snapshot.periodEnd) issues.push({ field: 'period', message: 'Periode report wajib diisi' });
  if (!snapshot.timeZone) issues.push({ field: 'timeZone', message: 'Timezone wajib diisi' });
  if (!snapshot.source) issues.push({ field: 'source', message: 'Source data wajib diisi' });
  if (!Number.isFinite(Date.parse(snapshot.updatedAt))) issues.push({ field: 'updatedAt', message: 'updatedAt harus ISO-8601' });
  if (Date.parse(snapshot.periodEnd) < Date.parse(snapshot.periodStart)) issues.push({ field: 'period', message: 'periodEnd tidak boleh sebelum periodStart' });
  return issues;
}
