import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { z } from 'zod';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
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
const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production';
const NOTIFICATION_SERVICE_URL = process.env['NOTIFICATION_SERVICE_URL'] ?? 'http://notification-service:3009';

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
  status:     z.enum(['ISSUED','SENT_TO_PHARMACY','CONFIRMED','PREPARING','READY','DELIVERING','DELIVERED','CANCELLED']).optional(),
  patientId:  z.string().uuid().optional(),
  doctorId:   z.string().uuid().optional(),
});

const DeliveryStatusSchema = z.object({
  status: z.enum(['PICKED_UP', 'IN_TRANSIT']),
});

async function pharmacistCanAccess(pharmacyId: string | null, userId: string): Promise<boolean> {
  if (!pharmacyId) return false;
  const result = await pool.query(
    `SELECT 1
     FROM pharmacy_staff
     WHERE pharmacy_id=$1 AND user_id=$2 AND is_active=TRUE
     LIMIT 1`,
    [pharmacyId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

async function emitNotification(
  userId: string,
  title: string,
  body: string,
  referenceId: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  try {
    const serviceToken = jwt.sign({ sub: 'prescription-service', role: 'SYSTEM' }, JWT_SECRET, { expiresIn: '2m' });
    await fetch(`${NOTIFICATION_SERVICE_URL}/v1/notifications/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceToken}`,
      },
      body: JSON.stringify({
        userId,
        channel: 'IN_APP',
        title,
        body,
        data,
        priority: 'NORMAL',
        referenceId,
        referenceType: 'prescription',
      }),
    });
  } catch (err) {
    console.warn(`[${SERVICE_NAME}] notification delivery failed`, err);
  }
}

async function notifyPrescriptionPatient(
  prescriptionId: string,
  title: string,
  body: string,
): Promise<void> {
  try {
    const result = await pool.query<{ user_id: string }>(
      `SELECT pat.user_id
       FROM prescriptions p
       JOIN patients pat ON pat.id=p.patient_id
       WHERE p.id=$1`,
      [prescriptionId],
    );
    const userId = result.rows[0]?.user_id;
    if (userId) await emitNotification(userId, title, body, prescriptionId, { prescriptionId });
  } catch (err) {
    console.warn(`[${SERVICE_NAME}] patient notification lookup failed`, err);
  }
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
        doctor_user_id: string | null;
        patient_id: string;
      }>(
        `SELECT c.status, c.doctor_id, d.user_id AS doctor_user_id, c.patient_id
         FROM consultations c
         LEFT JOIN doctors d ON d.id=c.doctor_id
         WHERE c.id=$1`,
        [consultationId],
      );
      if (consultResult.rowCount === 0) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Consultation not found', req.path, authReq.requestId));
        return;
      }

      const { status: consultStatus, doctor_id, doctor_user_id, patient_id: consultationPatientId } = consultResult.rows[0]!;
      if (consultStatus !== 'IN_PROGRESS' && consultStatus !== 'COMPLETED') {
        res.status(409).json(
          buildProblem(409, 'Conflict', 'Prescription can only be created for IN_PROGRESS or COMPLETED consultations', req.path, authReq.requestId),
        );
        return;
      }
      if (doctor_user_id !== authReq.user.sub || doctor_id === null) {
        res.status(403).json(buildProblem(403, 'Forbidden', 'You are not the assigned doctor for this consultation', req.path, authReq.requestId));
        return;
      }
      if (consultationPatientId !== patientId) {
        res.status(403).json(buildProblem(403, 'Forbidden', 'Patient does not match the consultation', req.path, authReq.requestId));
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
          [prescriptionId, consultationId, patientId, doctor_id],
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
      const rxResult = await pool.query<{
        patient_user_id: string;
        doctor_user_id: string;
        pharmacy_id: string | null;
      }>(
        `SELECT p.*,
                pat.name      AS patient_name,
                pat.user_id   AS patient_user_id,
                u.id          AS doctor_user_id,
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

      const prescription = rxResult.rows[0]!;
      if (
        (authReq.user.role === 'PATIENT' && prescription.patient_user_id !== authReq.user.sub)
        || (authReq.user.role === 'DOCTOR' && prescription.doctor_user_id !== authReq.user.sub)
        || (authReq.user.role === 'PHARMACIST'
          && !(await pharmacistCanAccess(prescription.pharmacy_id, authReq.user.sub)))
      ) {
        res.status(403).json(buildProblem(403, 'Forbidden', 'Anda tidak memiliki akses ke resep ini', req.path, authReq.requestId));
        return;
      }
      if (authReq.user.role === 'PHARMACY_DRIVER') {
        const delivery = await pool.query<{ courier_id: string | null }>(
          'SELECT courier_id FROM prescription_deliveries WHERE prescription_id=$1',
          [id],
        );
        if (delivery.rows[0]?.courier_id !== authReq.user.sub) {
          res.status(403).json(buildProblem(403, 'Forbidden', 'Delivery bukan milik driver ini', req.path, authReq.requestId));
          return;
        }
      }

      const itemsResult = await pool.query(
        `SELECT pi.*, d.generic_name, d.brand_name, d.dosage_form, d.strength
         FROM prescription_items pi
         JOIN drugs d ON d.id = pi.drug_id
         WHERE pi.prescription_id=$1
         ORDER BY pi.created_at ASC`,
        [id],
      );

      ok(res, { ...prescription, items: itemsResult.rows });
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
        conditions.push(`p.patient_id=(SELECT id FROM patients WHERE user_id=${addParam(sub)})`);
      } else if (role === 'DOCTOR') {
        conditions.push(`p.doctor_id=${addParam(sub)}`);
      } else if (role === 'PHARMACIST') {
        conditions.push(`(
          p.status='ISSUED'
          OR EXISTS (
            SELECT 1 FROM pharmacy_staff ps
            WHERE ps.pharmacy_id=p.pharmacy_id
              AND ps.user_id=${addParam(sub)}
              AND ps.is_active=TRUE
          )
        )`);
      } else if (role === 'PHARMACY_DRIVER') {
        conditions.push(`EXISTS (
          SELECT 1 FROM prescription_deliveries pd_driver
          WHERE pd_driver.prescription_id=p.id
            AND pd_driver.courier_id=${addParam(sub)}
        )`);
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
        `SELECT p.*,
                pat.name AS patient_name,
                doctor_user.email AS doctor_email,
                pd.id AS delivery_id,
                pd.status AS delivery_status,
                pd.tracking_code,
                pd.courier_id
         FROM prescriptions p
         JOIN patients pat ON pat.id=p.patient_id
         JOIN doctors doctor_profile ON doctor_profile.id=p.doctor_id
         JOIN users doctor_user ON doctor_user.id=doctor_profile.user_id
         LEFT JOIN prescription_deliveries pd ON pd.prescription_id=p.id
         ${where}
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
      const rxResult = await pool.query<{ patient_user_id: string; status: string }>(
        `SELECT p.patient_id, pat.user_id AS patient_user_id, p.status
         FROM prescriptions p
         JOIN patients pat ON pat.id=p.patient_id
         WHERE p.id=$1`,
        [id],
      );
      if (rxResult.rowCount === 0) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Prescription not found', req.path, authReq.requestId));
        return;
      }

      const { patient_user_id, status } = rxResult.rows[0]!;
      if (patient_user_id !== authReq.user.sub) {
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

      const staff = await pool.query<{ user_id: string }>(
        `SELECT user_id FROM pharmacy_staff
         WHERE pharmacy_id=$1 AND is_active=TRUE`,
        [pharmacyId],
      );
      for (const member of staff.rows) {
        void emitNotification(
          member.user_id,
          'Resep baru masuk',
          'Ada resep baru yang menunggu diproses oleh apotek Anda.',
          id,
          { prescriptionId: id, pharmacyId },
        );
      }
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
      if (!(await pharmacistCanAccess(pharmacy_id, authReq.user.sub))) {
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
        void notifyPrescriptionPatient(
          id,
          'Resep dikonfirmasi',
          'Apotek telah mengonfirmasi resep Anda dan mulai menyiapkannya.',
        );
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
      if (!(await pharmacistCanAccess(pharmacy_id, authReq.user.sub))) {
        res.status(403).json(buildProblem(403, 'Forbidden', 'This prescription is not assigned to your pharmacy', req.path, authReq.requestId));
        return;
      }
      if (status !== 'CONFIRMED') {
        res.status(409).json(buildProblem(409, 'Conflict', `Cannot prepare prescription in status ${status}`, req.path, authReq.requestId));
        return;
      }

      const result = await pool.query(
        `UPDATE prescriptions SET status='PREPARING', updated_at=NOW() WHERE id=$1 AND pharmacy_id=$2 RETURNING *`,
        [id, pharmacy_id],
      );

      void notifyPrescriptionPatient(id, 'Resep sedang disiapkan', 'Apotek sedang menyiapkan obat untuk resep Anda.');
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
      if (!(await pharmacistCanAccess(pharmacy_id, authReq.user.sub))) {
        res.status(403).json(buildProblem(403, 'Forbidden', 'This prescription is not assigned to your pharmacy', req.path, authReq.requestId));
        return;
      }
      if (status !== 'PREPARING') {
        res.status(409).json(buildProblem(409, 'Conflict', `Cannot mark ready prescription in status ${status}`, req.path, authReq.requestId));
        return;
      }

      const result = await pool.query(
        `UPDATE prescriptions SET status='READY', updated_at=NOW() WHERE id=$1 AND pharmacy_id=$2 RETURNING *`,
        [id, pharmacy_id],
      );

      void notifyPrescriptionPatient(id, 'Resep siap', 'Obat Anda sudah siap diambil atau dikirim.');
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

      const { status, pharmacy_id } = current.rows[0]!;
      if (authReq.user.role === 'PHARMACIST' && !(await pharmacistCanAccess(pharmacy_id, authReq.user.sub))) {
        res.status(403).json(buildProblem(403, 'Forbidden', 'Resep tidak ditugaskan ke apotek Anda', req.path, authReq.requestId));
        return;
      }
      if (status !== 'READY') {
        res.status(409).json(buildProblem(409, 'Conflict', `Cannot start delivery for prescription in status ${status}`, req.path, authReq.requestId));
        return;
      }

      const courierResult = await pool.query(
        `SELECT id FROM users
         WHERE id=$1 AND role='PHARMACY_DRIVER'::user_role AND status='ACTIVE'::user_status`,
        [courierId],
      );
      if (courierResult.rowCount === 0) {
        res.status(422).json(buildProblem(422, 'Validation Error', 'Driver tidak ditemukan atau tidak aktif', req.path, authReq.requestId));
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
        void emitNotification(
          courierId,
          'Pengiriman ditugaskan',
          'Anda mendapat tugas pengiriman resep baru.',
          id,
          { prescriptionId: id, deliveryId, trackingCode },
        );
        void notifyPrescriptionPatient(id, 'Resep sedang dikirim', `Resep Anda sedang dikirim. Lacak dengan kode ${trackingCode}.`);
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
// GET /v1/delivery/couriers — Driver aktif untuk handoff apotek
// ─────────────────────────────────────────────────────────────────────────────

app.get(
  '/v1/delivery/couriers',
  authenticate,
  requireRole('PHARMACIST', 'ADMIN'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        `SELECT id, email, phone, status
         FROM users
         WHERE role='PHARMACY_DRIVER'::user_role
           AND status='ACTIVE'::user_status
         ORDER BY email`,
      );
      ok(res, result.rows);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/deliveries/me — Delivery milik driver yang sedang login
// ─────────────────────────────────────────────────────────────────────────────

app.get(
  '/v1/deliveries/me',
  authenticate,
  requireRole('PHARMACY_DRIVER'),
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const result = await pool.query(
        `SELECT pd.*,
                p.id AS prescription_id,
                p.pharmacy_id,
                p.delivery_address,
                p.status AS prescription_status,
                p.issued_at,
                pat.name AS patient_name
         FROM prescription_deliveries pd
         JOIN prescriptions p ON p.id=pd.prescription_id
         JOIN patients pat ON pat.id=p.patient_id
         WHERE pd.courier_id=$1
         ORDER BY pd.created_at DESC`,
        [authReq.user.sub],
      );
      ok(res, result.rows);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// PUT /v1/deliveries/:id/status — Driver update status
// ─────────────────────────────────────────────────────────────────────────────

app.put(
  '/v1/deliveries/:id/status',
  authenticate,
  requireRole('PHARMACY_DRIVER'),
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const parsed = DeliveryStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(buildProblem(422, 'Validation Error', 'Status delivery tidak valid', req.path, authReq.requestId));
      return;
    }

    const { id } = req.params;
    const { status } = parsed.data;
    try {
      const current = await pool.query<{ courier_id: string | null; prescription_id: string }>(
        'SELECT courier_id, prescription_id FROM prescription_deliveries WHERE id=$1',
        [id],
      );
      if (current.rowCount === 0) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Delivery tidak ditemukan', req.path, authReq.requestId));
        return;
      }
      if (current.rows[0]!.courier_id !== authReq.user.sub) {
        res.status(403).json(buildProblem(403, 'Forbidden', 'Delivery bukan milik driver ini', req.path, authReq.requestId));
        return;
      }

      const result = await pool.query(
        `UPDATE prescription_deliveries
         SET status=$1,
             pickup_at=CASE WHEN $1='PICKED_UP' THEN COALESCE(pickup_at, NOW()) ELSE pickup_at END,
             updated_at=NOW()
         WHERE id=$2
         RETURNING *`,
        [status, id],
      );
      await pool.query(
        `UPDATE prescriptions
         SET status='DELIVERING', updated_at=NOW()
         WHERE id=$1 AND status='DELIVERING'`,
        [current.rows[0]!.prescription_id],
      );
      ok(res, result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// Driver-friendly alias: mobile clients know the prescription ID, not the
// internal delivery row ID. The ownership check remains identical.
app.put(
  '/v1/prescriptions/:id/delivery-status',
  authenticate,
  requireRole('PHARMACY_DRIVER'),
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const parsed = DeliveryStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(buildProblem(422, 'Validation Error', 'Status delivery tidak valid', req.path, authReq.requestId));
      return;
    }

    const { id } = req.params;
    const { status } = parsed.data;
    try {
      const result = await pool.query(
        `UPDATE prescription_deliveries
         SET status=$1,
             pickup_at=CASE WHEN $1='PICKED_UP' THEN COALESCE(pickup_at, NOW()) ELSE pickup_at END,
             updated_at=NOW()
         WHERE prescription_id=$2 AND courier_id=$3
         RETURNING *`,
        [status, id, authReq.user.sub],
      );
      if (result.rowCount === 0) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Delivery tidak ditemukan untuk driver ini', req.path, authReq.requestId));
        return;
      }
      ok(res, result.rows[0]);
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
  requireRole('PATIENT', 'PHARMACIST', 'PHARMACY_DRIVER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;

    try {
      const rxResult = await pool.query<{
        status: string;
        pharmacy_id: string | null;
        patient_user_id: string;
      }>(
        `SELECT p.status, p.pharmacy_id, pat.user_id AS patient_user_id
         FROM prescriptions p
         JOIN patients pat ON pat.id=p.patient_id
         WHERE p.id=$1`,
        [id],
      );
      if (rxResult.rowCount === 0) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Prescription not found', req.path, authReq.requestId));
        return;
      }

      const { status, pharmacy_id, patient_user_id } = rxResult.rows[0]!;
      if (authReq.user.role === 'PATIENT' && patient_user_id !== authReq.user.sub) {
        res.status(403).json(buildProblem(403, 'Forbidden', 'Resep bukan milik pasien ini', req.path, authReq.requestId));
        return;
      }
      if (authReq.user.role === 'PHARMACIST' && !(await pharmacistCanAccess(pharmacy_id, authReq.user.sub))) {
        res.status(403).json(buildProblem(403, 'Forbidden', 'Resep tidak ditugaskan ke apotek Anda', req.path, authReq.requestId));
        return;
      }
      if (authReq.user.role === 'PHARMACY_DRIVER') {
        const delivery = await pool.query<{ courier_id: string | null }>(
          'SELECT courier_id FROM prescription_deliveries WHERE prescription_id=$1',
          [id],
        );
        if (delivery.rows[0]?.courier_id !== authReq.user.sub) {
          res.status(403).json(buildProblem(403, 'Forbidden', 'Delivery bukan milik driver ini', req.path, authReq.requestId));
          return;
        }
      }
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
