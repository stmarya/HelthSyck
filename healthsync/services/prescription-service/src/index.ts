import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import {
  authenticate,
  requireRole,
  requestIdMiddleware,
  errorHandler,
  buildProblem,
  ok,
  paginated,
  AuthenticatedRequest,
} from '@healthsync/shared';

const PORT = Number.parseInt(process.env['PORT'] ?? '3004', 10);
const SERVICE_NAME = 'prescription-service';
const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

const PrescriptionStatusSchema = z.enum([
  'ISSUED', 'SENT_TO_PHARMACY', 'CONFIRMED', 'PREPARING',
  'READY', 'DELIVERING', 'DELIVERED', 'CANCELLED',
]);

const PrescriptionItemSchema = z.object({
  drugId: z.string().uuid(),
  drugName: z.string().trim().min(1),
  dosage: z.string().trim().min(1),
  quantity: z.number().int().min(1).max(100),
  instructions: z.string().trim().optional(),
  substitutionAllowed: z.boolean(),
});

const CreatePrescriptionSchema = z.object({
  consultationId: z.string().uuid(),
  patientId: z.string().uuid(),
  items: z.array(PrescriptionItemSchema).min(1),
});

const SelectPharmacySchema = z.object({
  pharmacyId: z.string().uuid(),
  fulfillmentType: z.enum(['PICKUP', 'DELIVERY']),
  deliveryAddress: z.string().trim().min(5).optional(),
}).superRefine((value, context) => {
  if (value.fulfillmentType === 'DELIVERY' && !value.deliveryAddress) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['deliveryAddress'], message: 'deliveryAddress is required for DELIVERY fulfillment' });
  }
});

const DeliverSchema = z.object({
  courierId: z.string().uuid(),
  trackingCode: z.string().trim().min(1).max(100),
  estimatedDelivery: z.string().datetime(),
});

const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  pharmacyId: z.string().uuid().optional(),
  status: PrescriptionStatusSchema.optional(),
  patientId: z.string().uuid().optional(),
  doctorId: z.string().uuid().optional(),
});

type Actor = AuthenticatedRequest['user'];
type Queryable = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

async function resolvePatientId(db: Queryable, subject: string): Promise<string | null> {
  const result = await db.query<{ id: string }>('SELECT id FROM patients WHERE user_id=$1 OR id=$1 LIMIT 1', [subject]);
  return result.rows[0]?.id ?? null;
}

async function resolveDoctorId(db: Queryable, subject: string): Promise<string | null> {
  const result = await db.query<{ id: string }>('SELECT id FROM doctors WHERE user_id=$1 OR id=$1 LIMIT 1', [subject]);
  return result.rows[0]?.id ?? null;
}

async function assignedPharmacyIds(db: Queryable, subject: string): Promise<string[]> {
  const result = await db.query<{ pharmacy_id: string }>(
    'SELECT pharmacy_id FROM pharmacy_staff WHERE user_id=$1 AND is_active=TRUE',
    [subject],
  );
  return result.rows.map((row) => row.pharmacy_id);
}

async function canAccessPrescription(
  db: Queryable,
  actor: Actor,
  prescription: { patient_id: string; doctor_id: string; pharmacy_id: string | null },
): Promise<boolean> {
  if (actor.role === 'ADMIN') return true;
  if (actor.role === 'PATIENT') return (await resolvePatientId(db, actor.sub)) === prescription.patient_id;
  if (actor.role === 'DOCTOR') return (await resolveDoctorId(db, actor.sub)) === prescription.doctor_id;
  if (actor.role === 'PHARMACIST') {
    return prescription.pharmacy_id !== null && (await assignedPharmacyIds(db, actor.sub)).includes(prescription.pharmacy_id);
  }
  return false;
}

async function requireAssignedPharmacy(db: Queryable, actor: Actor, pharmacyId: string | null): Promise<boolean> {
  if (actor.role === 'ADMIN') return true;
  return actor.role === 'PHARMACIST'
    && pharmacyId !== null
    && (await assignedPharmacyIds(db, actor.sub)).includes(pharmacyId);
}

function validationError(req: Request, res: Response, detail: string): void {
  const requestId = (req as AuthenticatedRequest).requestId;
  res.status(422).json(buildProblem(422, 'Validation Error', detail, req.path, requestId));
}

function forbidden(req: Request, res: Response, detail = 'You do not have access to this prescription'): void {
  const requestId = (req as AuthenticatedRequest).requestId;
  res.status(403).json(buildProblem(403, 'Forbidden', detail, req.path, requestId));
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(requestIdMiddleware);

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: SERVICE_NAME, db: true, timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'degraded', service: SERVICE_NAME, db: false, timestamp: new Date().toISOString() });
  }
});

app.post('/v1/prescriptions', authenticate, requireRole('DOCTOR'), async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  const parsed = CreatePrescriptionSchema.safeParse(req.body);
  if (!parsed.success) return validationError(req, res, parsed.error.issues[0]?.message ?? 'Invalid input');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const doctorId = await resolveDoctorId(client, authReq.user.sub);
    if (!doctorId) {
      await client.query('ROLLBACK');
      return forbidden(req, res, 'Doctor profile is not linked to this account');
    }

    const consultation = await client.query<{ status: string; doctor_id: string | null; patient_id: string }>(
      'SELECT status, doctor_id, patient_id FROM consultations WHERE id=$1 FOR UPDATE',
      [parsed.data.consultationId],
    );
    const row = consultation.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      res.status(404).json(buildProblem(404, 'Not Found', 'Consultation not found', req.path, authReq.requestId));
      return;
    }
    if (!['IN_PROGRESS', 'COMPLETED'].includes(row.status)) {
      await client.query('ROLLBACK');
      res.status(409).json(buildProblem(409, 'Conflict', 'Prescription can only be created for an active or completed consultation', req.path, authReq.requestId));
      return;
    }
    if (row.doctor_id !== doctorId) {
      await client.query('ROLLBACK');
      return forbidden(req, res, 'You are not the assigned doctor for this consultation');
    }
    if (row.patient_id !== parsed.data.patientId) {
      await client.query('ROLLBACK');
      return validationError(req, res, 'patientId does not match the consultation patient');
    }

    const active = await client.query(
      `SELECT id FROM prescriptions WHERE consultation_id=$1
       AND status NOT IN ('CANCELLED','DELIVERED') AND expires_at > NOW() LIMIT 1`,
      [parsed.data.consultationId],
    );
    if ((active.rowCount ?? 0) > 0) {
      await client.query('ROLLBACK');
      res.status(409).json(buildProblem(409, 'Conflict', 'An active prescription already exists for this consultation', req.path, authReq.requestId));
      return;
    }

    const prescriptionId = crypto.randomUUID();
    const created = await client.query(
      `INSERT INTO prescriptions (id, consultation_id, patient_id, doctor_id, status, expires_at)
       VALUES ($1,$2,$3,$4,'ISSUED',NOW()+INTERVAL '30 days') RETURNING *`,
      [prescriptionId, parsed.data.consultationId, parsed.data.patientId, doctorId],
    );
    const items: unknown[] = [];
    for (const item of parsed.data.items) {
      const inserted = await client.query(
        `INSERT INTO prescription_items
         (id,prescription_id,drug_id,drug_name,dosage,quantity,instructions,substitution_allowed)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [crypto.randomUUID(), prescriptionId, item.drugId, item.drugName, item.dosage, item.quantity, item.instructions ?? null, item.substitutionAllowed],
      );
      items.push(inserted.rows[0]);
    }
    await client.query('COMMIT');
    ok(res, { ...created.rows[0], items }, 201);
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

app.get('/v1/prescriptions', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  const parsed = PaginationSchema.safeParse(req.query);
  if (!parsed.success) return validationError(req, res, parsed.error.issues[0]?.message ?? 'Invalid query');
  const { page, limit, pharmacyId, patientId, doctorId, status } = parsed.data;
  const params: unknown[] = [];
  const conditions: string[] = [];
  const add = (value: unknown): string => { params.push(value); return `$${params.length}`; };

  try {
    if (authReq.user.role === 'PATIENT') {
      const id = await resolvePatientId(pool, authReq.user.sub);
      if (!id) return forbidden(req, res, 'Patient profile is not linked to this account');
      conditions.push(`p.patient_id=${add(id)}`);
    } else if (authReq.user.role === 'DOCTOR') {
      const id = await resolveDoctorId(pool, authReq.user.sub);
      if (!id) return forbidden(req, res, 'Doctor profile is not linked to this account');
      conditions.push(`p.doctor_id=${add(id)}`);
    } else if (authReq.user.role === 'PHARMACIST') {
      const ids = await assignedPharmacyIds(pool, authReq.user.sub);
      if (ids.length === 0) return forbidden(req, res, 'Pharmacist is not assigned to an active pharmacy');
      conditions.push(`p.pharmacy_id=ANY(${add(ids)}::uuid[])`);
    } else if (authReq.user.role === 'ADMIN') {
      if (pharmacyId) conditions.push(`p.pharmacy_id=${add(pharmacyId)}`);
      if (patientId) conditions.push(`p.patient_id=${add(patientId)}`);
      if (doctorId) conditions.push(`p.doctor_id=${add(doctorId)}`);
    } else {
      return forbidden(req, res);
    }
    if (status) conditions.push(`p.status=${add(status)}::prescription_status`);
    const where = `WHERE ${conditions.join(' AND ') || 'TRUE'}`;
    const count = await pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM prescriptions p ${where}`, params);
    const total = Number.parseInt(count.rows[0]?.count ?? '0', 10);
    const dataParams = [...params, limit, (page - 1) * limit];
    const data = await pool.query(
      `SELECT p.* FROM prescriptions p ${where} ORDER BY p.issued_at DESC
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams,
    );
    paginated(res, data.rows, page, limit, total);
  } catch (error) { next(error); }
});

app.get('/v1/prescriptions/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const result = await pool.query(
      `SELECT p.*, pat.name AS patient_name, u.email AS doctor_email
       FROM prescriptions p JOIN patients pat ON pat.id=p.patient_id
       JOIN doctors d ON d.id=p.doctor_id JOIN users u ON u.id=d.user_id WHERE p.id=$1`,
      [req.params['id']],
    );
    const prescription = result.rows[0] as { patient_id: string; doctor_id: string; pharmacy_id: string | null } | undefined;
    if (!prescription) {
      res.status(404).json(buildProblem(404, 'Not Found', 'Prescription not found', req.path, authReq.requestId));
      return;
    }
    if (!(await canAccessPrescription(pool, authReq.user, prescription))) return forbidden(req, res);
    const items = await pool.query(
      `SELECT pi.*, d.generic_name, d.brand_name, d.dosage_form, d.strength
       FROM prescription_items pi JOIN drugs d ON d.id=pi.drug_id
       WHERE pi.prescription_id=$1 ORDER BY pi.id`,
      [req.params['id']],
    );
    ok(res, { ...result.rows[0], items: items.rows });
  } catch (error) { next(error); }
});

app.put('/v1/prescriptions/:id/pharmacy', authenticate, requireRole('PATIENT'), async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  const parsed = SelectPharmacySchema.safeParse(req.body);
  if (!parsed.success) return validationError(req, res, parsed.error.issues[0]?.message ?? 'Invalid input');
  try {
    const patientId = await resolvePatientId(pool, authReq.user.sub);
    if (!patientId) return forbidden(req, res, 'Patient profile is not linked to this account');
    const pharmacy = await pool.query('SELECT id FROM pharmacies WHERE id=$1 AND is_active=TRUE', [parsed.data.pharmacyId]);
    if (!pharmacy.rows[0]) {
      res.status(404).json(buildProblem(404, 'Not Found', 'Pharmacy not found or inactive', req.path, authReq.requestId));
      return;
    }
    const updated = await pool.query(
      `UPDATE prescriptions SET pharmacy_id=$1, fulfillment_type=$2, delivery_address=$3,
       status='SENT_TO_PHARMACY', updated_at=NOW()
       WHERE id=$4 AND patient_id=$5 AND status='ISSUED' AND expires_at>NOW() RETURNING *`,
      [parsed.data.pharmacyId, parsed.data.fulfillmentType, parsed.data.deliveryAddress ?? null, req.params['id'], patientId],
    );
    if (!updated.rows[0]) {
      res.status(409).json(buildProblem(409, 'Conflict', 'Prescription is unavailable, expired, not owned by you, or no longer ISSUED', req.path, authReq.requestId));
      return;
    }
    ok(res, updated.rows[0]);
  } catch (error) { next(error); }
});

async function pharmacistTransition(
  req: Request,
  res: Response,
  next: NextFunction,
  fromStatus: string,
  toStatus: string,
  checkStock = false,
): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query<{ pharmacy_id: string | null; status: string }>(
      'SELECT pharmacy_id,status FROM prescriptions WHERE id=$1 FOR UPDATE', [req.params['id']],
    );
    const row = current.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      res.status(404).json(buildProblem(404, 'Not Found', 'Prescription not found', req.path, authReq.requestId));
      return;
    }
    if (!(await requireAssignedPharmacy(client, authReq.user, row.pharmacy_id))) {
      await client.query('ROLLBACK');
      return forbidden(req, res, 'Prescription is not assigned to your pharmacy');
    }
    if (row.status !== fromStatus) {
      await client.query('ROLLBACK');
      res.status(409).json(buildProblem(409, 'Conflict', `Expected ${fromStatus}, found ${row.status}`, req.path, authReq.requestId));
      return;
    }
    if (checkStock) {
      const insufficient = await client.query<{ drug_id: string }>(
        `SELECT pi.drug_id FROM prescription_items pi
         LEFT JOIN pharmacy_inventory inventory ON inventory.pharmacy_id=$2 AND inventory.drug_id=pi.drug_id
         WHERE pi.prescription_id=$1 GROUP BY pi.drug_id,pi.quantity
         HAVING COALESCE(SUM(inventory.stock_qty),0)<pi.quantity`,
        [req.params['id'], row.pharmacy_id],
      );
      if (insufficient.rows.length > 0) {
        await client.query('ROLLBACK');
        validationError(req, res, `Insufficient stock for drug(s): ${insufficient.rows.map((item) => item.drug_id).join(', ')}`);
        return;
      }
    }
    const updated = await client.query(
      'UPDATE prescriptions SET status=$1::prescription_status,updated_at=NOW() WHERE id=$2 AND status=$3::prescription_status RETURNING *',
      [toStatus, req.params['id'], fromStatus],
    );
    await client.query('COMMIT');
    ok(res, updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally { client.release(); }
}

app.put('/v1/prescriptions/:id/confirm', authenticate, requireRole('PHARMACIST'), (req, res, next) => {
  void pharmacistTransition(req, res, next, 'SENT_TO_PHARMACY', 'CONFIRMED', true);
});
app.put('/v1/prescriptions/:id/prepare', authenticate, requireRole('PHARMACIST'), (req, res, next) => {
  void pharmacistTransition(req, res, next, 'CONFIRMED', 'PREPARING');
});
app.put('/v1/prescriptions/:id/ready', authenticate, requireRole('PHARMACIST'), (req, res, next) => {
  void pharmacistTransition(req, res, next, 'PREPARING', 'READY');
});

app.put('/v1/prescriptions/:id/deliver', authenticate, requireRole('PHARMACIST', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  const parsed = DeliverSchema.safeParse(req.body);
  if (!parsed.success) return validationError(req, res, parsed.error.issues[0]?.message ?? 'Invalid input');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query<{ pharmacy_id: string | null; status: string; fulfillment_type: string | null }>(
      'SELECT pharmacy_id,status,fulfillment_type FROM prescriptions WHERE id=$1 FOR UPDATE', [req.params['id']],
    );
    const row = current.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      res.status(404).json(buildProblem(404, 'Not Found', 'Prescription not found', req.path, authReq.requestId));
      return;
    }
    if (!(await requireAssignedPharmacy(client, authReq.user, row.pharmacy_id))) {
      await client.query('ROLLBACK');
      return forbidden(req, res, 'Prescription is not assigned to your pharmacy');
    }
    if (row.status !== 'READY' || row.fulfillment_type !== 'DELIVERY') {
      await client.query('ROLLBACK');
      res.status(409).json(buildProblem(409, 'Conflict', 'Only READY delivery prescriptions can start delivery', req.path, authReq.requestId));
      return;
    }
    const delivery = await client.query(
      `INSERT INTO prescription_deliveries
       (id,prescription_id,courier_id,tracking_code,status,estimated_delivery)
       VALUES ($1,$2,$3,$4,'ASSIGNED',$5) RETURNING *`,
      [crypto.randomUUID(), req.params['id'], parsed.data.courierId, parsed.data.trackingCode, parsed.data.estimatedDelivery],
    );
    const prescription = await client.query(
      `UPDATE prescriptions SET status='DELIVERING',updated_at=NOW()
       WHERE id=$1 AND status='READY' RETURNING *`, [req.params['id']],
    );
    await client.query('COMMIT');
    ok(res, { prescription: prescription.rows[0], delivery: delivery.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally { client.release(); }
});

app.put('/v1/prescriptions/:id/complete', authenticate, requireRole('PATIENT', 'PHARMACIST', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query<{
      patient_id: string; doctor_id: string; pharmacy_id: string | null;
      status: string; fulfillment_type: string | null;
    }>('SELECT patient_id,doctor_id,pharmacy_id,status,fulfillment_type FROM prescriptions WHERE id=$1 FOR UPDATE', [req.params['id']]);
    const prescription = current.rows[0];
    if (!prescription) {
      await client.query('ROLLBACK');
      res.status(404).json(buildProblem(404, 'Not Found', 'Prescription not found', req.path, authReq.requestId));
      return;
    }
    if (!(await canAccessPrescription(client, authReq.user, prescription))) {
      await client.query('ROLLBACK');
      return forbidden(req, res);
    }
    const expectedStatus = prescription.fulfillment_type === 'DELIVERY' ? 'DELIVERING' : 'READY';
    if (prescription.status !== expectedStatus || !prescription.pharmacy_id) {
      await client.query('ROLLBACK');
      res.status(409).json(buildProblem(409, 'Conflict', `Prescription must be ${expectedStatus} before completion`, req.path, authReq.requestId));
      return;
    }

    const items = await client.query<{ drug_id: string; quantity: number }>(
      'SELECT drug_id,quantity FROM prescription_items WHERE prescription_id=$1 ORDER BY id', [req.params['id']],
    );
    for (const item of items.rows) {
      const batches = await client.query<{ id: string; stock_qty: number }>(
        `SELECT id,stock_qty FROM pharmacy_inventory
         WHERE pharmacy_id=$1 AND drug_id=$2 AND stock_qty>0
         ORDER BY expires_at ASC NULLS LAST,updated_at ASC,id ASC FOR UPDATE`,
        [prescription.pharmacy_id, item.drug_id],
      );
      const available = batches.rows.reduce((sum, batch) => sum + batch.stock_qty, 0);
      if (available < item.quantity) {
        await client.query('ROLLBACK');
        validationError(req, res, `Stock changed and is now insufficient for drug ${item.drug_id}`);
        return;
      }
      let remaining = item.quantity;
      for (const batch of batches.rows) {
        if (remaining === 0) break;
        const deduction = Math.min(batch.stock_qty, remaining);
        await client.query(
          'UPDATE pharmacy_inventory SET stock_qty=stock_qty-$1,updated_at=NOW() WHERE id=$2 AND stock_qty>=$1',
          [deduction, batch.id],
        );
        remaining -= deduction;
      }
    }

    if (prescription.fulfillment_type === 'DELIVERY') {
      await client.query(
        `UPDATE prescription_deliveries SET delivered_at=NOW(),status='DELIVERED',updated_at=NOW()
         WHERE prescription_id=$1 AND status<>'DELIVERED'`, [req.params['id']],
      );
    }
    const updated = await client.query(
      `UPDATE prescriptions SET status='DELIVERED',updated_at=NOW()
       WHERE id=$1 AND status=$2::prescription_status RETURNING *`, [req.params['id'], expectedStatus],
    );
    await client.query('COMMIT');
    ok(res, updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally { client.release(); }
});

app.use(errorHandler(SERVICE_NAME));

if (!process.env['JEST_WORKER_ID']) {
  const server = app.listen(PORT, () => console.log(`[${SERVICE_NAME}] Listening on port ${PORT}`));
  process.on('SIGTERM', () => {
    server.close(() => { void pool.end().finally(() => process.exit(0)); });
  });
}

export default app;
