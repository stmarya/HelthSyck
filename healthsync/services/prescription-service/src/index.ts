import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { z } from 'zod';
import crypto from 'crypto';
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

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env['PORT'] ?? '3004', 10);
const SERVICE_NAME = 'prescription-service';

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

const PrescriptionItemSchema = z.object({
  drugId:               z.string().uuid(),
  drugName:             z.string().min(1),
  dosage:               z.string().min(1),
  quantity:             z.number().int().min(1).max(100),
  instructions:         z.string().optional(),
  substitutionAllowed:  z.boolean(),
});

const CreatePrescriptionSchema = z.object({
  consultationId: z.string().uuid(),
  patientId:      z.string().uuid(),
  items:          z.array(PrescriptionItemSchema).min(1),
});

const SelectPharmacySchema = z.object({
  pharmacyId:      z.string().uuid(),
  fulfillmentType: z.enum(['PICKUP', 'DELIVERY']),
  deliveryAddress: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.fulfillmentType === 'DELIVERY' && !data.deliveryAddress) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['deliveryAddress'],
      message: 'deliveryAddress is required for DELIVERY fulfillment',
    });
  }
});

const DeliverSchema = z.object({
  courierId:          z.string().uuid(),
  trackingCode:       z.string().min(1),
  estimatedDelivery:  z.string().datetime(),
});

const PaginationSchema = z.object({
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(100).default(20),
  pharmacyId: z.string().uuid().optional(),
  status:     z.enum(['ISSUED','SENT_TO_PHARMACY','PREPARING','READY','DISPENSED','DELIVERED','CANCELLED']).optional(),
  patientId:  z.string().uuid().optional(),
  doctorId:   z.string().uuid().optional(),
});

async function resolvePatientId(userId: string): Promise<string | null> {
  const result = await pool.query<{ id: string }>(
    'SELECT id FROM patients WHERE user_id = $1',
    [userId],
  );
  return result.rows[0]?.id ?? null;
}

async function resolveDoctorId(userId: string): Promise<string | null> {
  const result = await pool.query<{ id: string }>(
    'SELECT id FROM doctors WHERE user_id = $1',
    [userId],
  );
  return result.rows[0]?.id ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());
app.use(requestIdMiddleware);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: SERVICE_NAME, timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /v1/prescriptions — Dokter buat resep
// ─────────────────────────────────────────────────────────────────────────────

app.post(
  '/v1/prescriptions',
  authenticate,
  requireRole('DOCTOR'),
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const parsed = CreatePrescriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(
        buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path, authReq.requestId),
      );
      return;
    }

    const { consultationId, patientId, items } = parsed.data;

    try {
      // Validate consultation exists, is IN_PROGRESS or COMPLETED, and doctor matches
      const consultResult = await pool.query<{
        status: string;
        doctor_id: string | null;
        patient_id: string;
      }>(
        `SELECT status, doctor_id, patient_id FROM consultations WHERE id=$1`,
        [consultationId],
      );
      if (consultResult.rowCount === 0) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Consultation not found', req.path, authReq.requestId));
        return;
      }

      const { status: consultStatus, doctor_id, patient_id: consultationPatientId } = consultResult.rows[0]!;
      if (consultStatus !== 'IN_PROGRESS' && consultStatus !== 'COMPLETED') {
        res.status(409).json(
          buildProblem(409, 'Conflict', 'Prescription can only be created for IN_PROGRESS or COMPLETED consultations', req.path, authReq.requestId),
        );
        return;
      }
      const doctorId = await resolveDoctorId(authReq.user.sub);
      if (!doctorId || doctor_id !== doctorId) {
        res.status(403).json(buildProblem(403, 'Forbidden', 'You are not the assigned doctor for this consultation', req.path, authReq.requestId));
        return;
      }
      if (patientId !== consultationPatientId) {
        res.status(422).json(buildProblem(422, 'Validation Error', 'patientId must match the consultation patient', req.path, authReq.requestId));
        return;
      }

      // Check no active unexpired prescription from same consultation
      const activeRx = await pool.query<{ id: string }>(
        `SELECT id FROM prescriptions
         WHERE consultation_id=$1
           AND status NOT IN ('CANCELLED','DELIVERED')
           AND expires_at > NOW()`,
        [consultationId],
      );
      if ((activeRx.rowCount ?? 0) > 0) {
        res.status(409).json(
          buildProblem(409, 'Conflict', 'An active prescription already exists for this consultation', req.path, authReq.requestId),
        );
        return;
      }

      const prescriptionId = crypto.randomUUID();
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const rxResult = await client.query(
          `INSERT INTO prescriptions
             (id, consultation_id, patient_id, doctor_id, status, expires_at)
           VALUES ($1, $2, $3, $4, 'ISSUED', NOW() + INTERVAL '30 days')
           RETURNING *`,
          [prescriptionId, consultationId, consultationPatientId, doctorId],
        );

        const insertedItems: unknown[] = [];
        for (const item of items) {
          const itemId = crypto.randomUUID();
          const itemResult = await client.query(
            `INSERT INTO prescription_items
               (id, prescription_id, drug_id, drug_name, dosage, quantity, instructions, substitution_allowed)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [
              itemId,
              prescriptionId,
              item.drugId,
              item.drugName,
              item.dosage,
              item.quantity,
              item.instructions ?? null,
              item.substitutionAllowed,
            ],
          );
          insertedItems.push(itemResult.rows[0]);
        }

        await client.query('COMMIT');
        ok(res, { ...rxResult.rows[0], items: insertedItems }, 201);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/prescriptions/:id — Get prescription detail
// ─────────────────────────────────────────────────────────────────────────────

app.get(
  '/v1/prescriptions/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;

    try {
      const rxResult = await pool.query(
        `SELECT p.*,
                pat.full_name AS patient_name,
                u.email       AS doctor_email
         FROM prescriptions p
         JOIN patients pat ON pat.id = p.patient_id
         JOIN doctors  d   ON d.id   = p.doctor_id
         JOIN users    u   ON u.id   = d.user_id
         WHERE p.id=$1`,
        [id],
      );

      if (rxResult.rowCount === 0) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Prescription not found', req.path, authReq.requestId));
        return;
      }

      const itemsResult = await pool.query(
        `SELECT pi.*, d.generic_name, d.brand_name, d.dosage_form, d.strength
         FROM prescription_items pi
         JOIN drugs d ON d.id = pi.drug_id
         WHERE pi.prescription_id=$1
         ORDER BY pi.created_at ASC`,
        [id],
      );

      ok(res, { ...rxResult.rows[0], items: itemsResult.rows });
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/prescriptions — List prescriptions
// ─────────────────────────────────────────────────────────────────────────────

app.get(
  '/v1/prescriptions',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const parsed = PaginationSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(422).json(
        buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid query', req.path, authReq.requestId),
      );
      return;
    }

    const { page, limit, pharmacyId, status, patientId, doctorId } = parsed.data;
    const offset = (page - 1) * limit;
    const { role, sub } = authReq.user;

    try {
      const conditions: string[] = [];
      const params: unknown[] = [];

      const addParam = (v: unknown): string => { params.push(v); return `$${params.length}`; };

      if (role === 'PATIENT') {
        const profileId = await resolvePatientId(sub);
        if (!profileId) {
          res.status(403).json(buildProblem(403, 'Forbidden', 'Patient profile is not complete', req.path, authReq.requestId));
          return;
        }
        conditions.push(`p.patient_id=${addParam(profileId)}`);
      } else if (role === 'DOCTOR') {
        const profileId = await resolveDoctorId(sub);
        if (!profileId) {
          res.status(403).json(buildProblem(403, 'Forbidden', 'Doctor profile is not registered', req.path, authReq.requestId));
          return;
        }
        conditions.push(`p.doctor_id=${addParam(profileId)}`);
      } else if (role === 'PHARMACIST') {
        conditions.push(`(p.pharmacy_id=${addParam(sub)} OR p.status='ISSUED')`);
      }
      // ADMIN — tidak ada filter wajib, tapi boleh pakai filter opsional
      if (role === 'ADMIN') {
        if (pharmacyId) conditions.push(`p.pharmacy_id=${addParam(pharmacyId)}`);
        if (patientId)  conditions.push(`p.patient_id=${addParam(patientId)}`);
        if (doctorId)   conditions.push(`p.doctor_id=${addParam(doctorId)}`);
      }
      if (status) conditions.push(`p.status=${addParam(status)}`);

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM prescriptions p ${where}`,
        params,
      );
      const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

      const dataResult = await pool.query(
        `SELECT p.* FROM prescriptions p ${where}
         ORDER BY p.issued_at DESC
         LIMIT ${addParam(limit)} OFFSET ${addParam(offset)}`,
        params,
      );

      paginated(res, dataResult.rows, page, limit, total);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// PUT /v1/prescriptions/:id/pharmacy — Pasien pilih apotek
// ─────────────────────────────────────────────────────────────────────────────

app.put(
  '/v1/prescriptions/:id/pharmacy',
  authenticate,
  requireRole('PATIENT'),
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const parsed = SelectPharmacySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(
        buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path, authReq.requestId),
      );
      return;
    }

    const { pharmacyId, fulfillmentType, deliveryAddress } = parsed.data;

    try {
      const rxResult = await pool.query<{ patient_id: string; status: string }>(
        'SELECT patient_id, status FROM prescriptions WHERE id=$1',
        [id],
      );
      if (rxResult.rowCount === 0) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Prescription not found', req.path, authReq.requestId));
        return;
      }

      const { patient_id, status } = rxResult.rows[0]!;
      const patientId = await resolvePatientId(authReq.user.sub);
      if (!patientId || patient_id !== patientId) {
        res.status(403).json(buildProblem(403, 'Forbidden', 'This prescription does not belong to you', req.path, authReq.requestId));
        return;
      }
      if (status !== 'ISSUED') {
        res.status(409).json(buildProblem(409, 'Conflict', `Cannot select pharmacy for prescription in status ${status}`, req.path, authReq.requestId));
        return;
      }

      // Check pharmacy exists and is active
      const pharmacyResult = await pool.query<{ id: string }>(
        'SELECT id FROM pharmacies WHERE id=$1 AND is_active=TRUE',
        [pharmacyId],
      );
      if (pharmacyResult.rowCount === 0) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Pharmacy not found or inactive', req.path, authReq.requestId));
        return;
      }

      const result = await pool.query(
        `UPDATE prescriptions
         SET pharmacy_id=$1, fulfillment_type=$2, delivery_address=$3, status='SENT_TO_PHARMACY', updated_at=NOW()
         WHERE id=$4
         RETURNING *`,
        [pharmacyId, fulfillmentType, deliveryAddress ?? null, id],
      );

      ok(res, result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// PUT /v1/prescriptions/:id/confirm — Apotek konfirmasi (PHARMACIST only)
// ─────────────────────────────────────────────────────────────────────────────

app.put(
  '/v1/prescriptions/:id/confirm',
  authenticate,
  requireRole('PHARMACIST'),
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;

    try {
      const rxResult = await pool.query<{ pharmacy_id: string | null; status: string }>(
        'SELECT pharmacy_id, status FROM prescriptions WHERE id=$1',
        [id],
      );
      if (rxResult.rowCount === 0) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Prescription not found', req.path, authReq.requestId));
        return;
      }

      const { pharmacy_id, status } = rxResult.rows[0]!;
      if (pharmacy_id !== authReq.user.sub) {
        res.status(403).json(buildProblem(403, 'Forbidden', 'This prescription is not assigned to your pharmacy', req.path, authReq.requestId));
        return;
      }
      if (status !== 'SENT_TO_PHARMACY') {
        res.status(409).json(buildProblem(409, 'Conflict', `Cannot confirm prescription in status ${status}`, req.path, authReq.requestId));
        return;
      }

      // Check stock for each item
      const itemsResult = await pool.query<{ drug_id: string; quantity: number }>(
        'SELECT drug_id, quantity FROM prescription_items WHERE prescription_id=$1',
        [id],
      );

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const outOfStock: string[] = [];
        for (const item of itemsResult.rows) {
          const stockResult = await client.query<{ stock_qty: number }>(
            'SELECT stock_qty FROM pharmacy_inventory WHERE pharmacy_id=$1 AND drug_id=$2',
            [pharmacy_id, item.drug_id],
          );
          const stockQty = stockResult.rows[0]?.stock_qty ?? 0;
          if (stockQty < item.quantity) {
            outOfStock.push(item.drug_id);
          }
        }

        if (outOfStock.length > 0) {
          await client.query('ROLLBACK');
          res.status(422).json(
            buildProblem(422, 'Unprocessable Entity', `Insufficient stock for drug(s): ${outOfStock.join(', ')}`, req.path, authReq.requestId),
          );
          return;
        }

        const result = await client.query(
          `UPDATE prescriptions SET status='CONFIRMED', updated_at=NOW() WHERE id=$1 RETURNING *`,
          [id],
        );

        await client.query('COMMIT');
        ok(res, result.rows[0]);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// PUT /v1/prescriptions/:id/prepare — Apotek siapkan
// ─────────────────────────────────────────────────────────────────────────────

app.put(
  '/v1/prescriptions/:id/prepare',
  authenticate,
  requireRole('PHARMACIST'),
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;

    try {
      const current = await pool.query<{ status: string; pharmacy_id: string | null }>(
        'SELECT status, pharmacy_id FROM prescriptions WHERE id=$1',
        [id],
      );
      if (current.rowCount === 0) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Prescription not found', req.path, authReq.requestId));
        return;
      }

      const { status, pharmacy_id } = current.rows[0]!;
      if (pharmacy_id !== authReq.user.sub) {
        res.status(403).json(buildProblem(403, 'Forbidden', 'This prescription is not assigned to your pharmacy', req.path, authReq.requestId));
        return;
      }
      if (status !== 'CONFIRMED') {
        res.status(409).json(buildProblem(409, 'Conflict', `Cannot prepare prescription in status ${status}`, req.path, authReq.requestId));
        return;
      }

      const result = await pool.query(
        `UPDATE prescriptions SET status='PREPARING', updated_at=NOW() WHERE id=$1 AND pharmacy_id=$2 RETURNING *`,
        [id, authReq.user.sub],
      );

      ok(res, result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// PUT /v1/prescriptions/:id/ready — Apotek selesai siapkan
// ─────────────────────────────────────────────────────────────────────────────

app.put(
  '/v1/prescriptions/:id/ready',
  authenticate,
  requireRole('PHARMACIST'),
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;

    try {
      const current = await pool.query<{ status: string; pharmacy_id: string | null }>(
        'SELECT status, pharmacy_id FROM prescriptions WHERE id=$1',
        [id],
      );
      if (current.rowCount === 0) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Prescription not found', req.path, authReq.requestId));
        return;
      }

      const { status, pharmacy_id } = current.rows[0]!;
      if (pharmacy_id !== authReq.user.sub) {
        res.status(403).json(buildProblem(403, 'Forbidden', 'This prescription is not assigned to your pharmacy', req.path, authReq.requestId));
        return;
      }
      if (status !== 'PREPARING') {
        res.status(409).json(buildProblem(409, 'Conflict', `Cannot mark ready prescription in status ${status}`, req.path, authReq.requestId));
        return;
      }

      const result = await pool.query(
        `UPDATE prescriptions SET status='READY', updated_at=NOW() WHERE id=$1 AND pharmacy_id=$2 RETURNING *`,
        [id, authReq.user.sub],
      );

      ok(res, result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// PUT /v1/prescriptions/:id/deliver — Assign kurir dan mulai pengiriman
// ─────────────────────────────────────────────────────────────────────────────

app.put(
  '/v1/prescriptions/:id/deliver',
  authenticate,
  requireRole('PHARMACIST', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const parsed = DeliverSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(
        buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path, authReq.requestId),
      );
      return;
    }

    const { courierId, trackingCode, estimatedDelivery } = parsed.data;

    try {
      const current = await pool.query<{ status: string; pharmacy_id: string | null }>(
        'SELECT status, pharmacy_id FROM prescriptions WHERE id=$1',
        [id],
      );
      if (current.rowCount === 0) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Prescription not found', req.path, authReq.requestId));
        return;
      }

      const { status } = current.rows[0]!;
      if (status !== 'READY') {
        res.status(409).json(buildProblem(409, 'Conflict', `Cannot start delivery for prescription in status ${status}`, req.path, authReq.requestId));
        return;
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const deliveryId = crypto.randomUUID();
        const deliveryResult = await client.query(
          `INSERT INTO prescription_deliveries
             (id, prescription_id, courier_id, tracking_code, status, estimated_delivery)
           VALUES ($1, $2, $3, $4, 'ASSIGNED', $5)
           RETURNING *`,
          [deliveryId, id, courierId, trackingCode, estimatedDelivery],
        );

        const rxResult = await client.query(
          `UPDATE prescriptions SET status='DELIVERING', updated_at=NOW() WHERE id=$1 RETURNING *`,
          [id],
        );

        await client.query('COMMIT');
        ok(res, { prescription: rxResult.rows[0], delivery: deliveryResult.rows[0] });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// PUT /v1/prescriptions/:id/complete — Konfirmasi diterima
// ─────────────────────────────────────────────────────────────────────────────

app.put(
  '/v1/prescriptions/:id/complete',
  authenticate,
  requireRole('PATIENT', 'PHARMACIST', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;

    try {
      const rxResult = await pool.query<{ status: string; pharmacy_id: string | null }>(
        'SELECT status, pharmacy_id FROM prescriptions WHERE id=$1',
        [id],
      );
      if (rxResult.rowCount === 0) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Prescription not found', req.path, authReq.requestId));
        return;
      }

      const { status, pharmacy_id } = rxResult.rows[0]!;
      const validFromStatuses = ['DELIVERING', 'READY'];
      if (!validFromStatuses.includes(status)) {
        res.status(409).json(
          buildProblem(409, 'Conflict', `Cannot complete prescription in status ${status}`, req.path, authReq.requestId),
        );
        return;
      }

      // Fetch items for stock deduction
      const itemsResult = await pool.query<{ drug_id: string; quantity: number }>(
        'SELECT drug_id, quantity FROM prescription_items WHERE prescription_id=$1',
        [id],
      );

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Update delivery record if exists
        await client.query(
          `UPDATE prescription_deliveries
           SET delivered_at=NOW(), status='DELIVERED'
           WHERE prescription_id=$1`,
          [id],
        );

        // Deduct stock for each item
        for (const item of itemsResult.rows) {
          await client.query(
            `UPDATE pharmacy_inventory
             SET stock_qty=stock_qty-$1, updated_at=NOW()
             WHERE pharmacy_id=$2 AND drug_id=$3`,
            [item.quantity, pharmacy_id, item.drug_id],
          );
        }

        const result = await client.query(
          `UPDATE prescriptions SET status='DELIVERED', updated_at=NOW() WHERE id=$1 RETURNING *`,
          [id],
        );

        await client.query('COMMIT');
        ok(res, result.rows[0]);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Error handler & shutdown
// ─────────────────────────────────────────────────────────────────────────────

app.use(errorHandler(SERVICE_NAME));

/* istanbul ignore next — skip binding when run inside Jest */
if (!process.env['JEST_WORKER_ID']) {
  const server = app.listen(PORT, () =>
    console.log(`[${SERVICE_NAME}] Listening on port ${PORT}`),
  );

  process.on('SIGTERM', async () => {
    console.log(`[${SERVICE_NAME}] SIGTERM received — shutting down`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  });
}

export default app;
