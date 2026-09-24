import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z, ZodError } from 'zod';
import { Pool } from 'pg';

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────
const PORT = parseInt(process.env['PORT'] ?? '3006', 10);
const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production';
const SERVICE_NAME = 'referral-service';

// ─────────────────────────────────────────────
// DB singleton
// ─────────────────────────────────────────────
let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
    _pool.on('error', (err) => console.error(`[${SERVICE_NAME}] Pool error:`, err.message));
  }
  return _pool;
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface JwtPayload { sub: string; role: string; }
interface AuthRequest extends Request { user: JwtPayload; }
interface ProblemDetail {
  type: string; title: string; status: number;
  detail: string; instance: string; requestId: string;
}

// ─────────────────────────────────────────────
// Referral status machine
// ─────────────────────────────────────────────
type ReferralStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'IN_TRANSIT' | 'ARRIVED' | 'CANCELLED';

const ACTIVE_STATUSES: ReferralStatus[] = ['DRAFT', 'SENT', 'ACCEPTED', 'IN_TRANSIT'];

// ─────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────
const CreateReferralSchema = z.object({
  patientId:              z.string().uuid(),
  toHospitalId:           z.string().uuid(),
  reason:                 z.string().min(20),
  diagnosis:              z.string().optional(),
  urgencyLevel:           z.enum(['CRITICAL', 'URGENT', 'NORMAL']),
  requiredSpecialization: z.string().optional(),
  notes:                  z.string().optional(),
});

const AcceptReferralSchema = z.object({
  receivingDoctorId: z.string().uuid().optional(),
  notes:             z.string().optional(),
});

const RejectReferralSchema = z.object({
  rejectedReason: z.string().min(10),
});

const TransitReferralSchema = z.object({
  ambulanceId: z.string().uuid().optional(),
  notes:       z.string().optional(),
});

const ListReferralQuerySchema = z.object({
  page:         z.coerce.number().int().min(1).default(1),
  limit:        z.coerce.number().int().min(1).max(100).default(20),
  status:       z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'IN_TRANSIT', 'ARRIVED', 'CANCELLED']).optional(),
  urgencyLevel: z.enum(['CRITICAL', 'URGENT', 'NORMAL']).optional(),
});

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function buildProblem(status: number, title: string, detail: string, instance: string): ProblemDetail {
  return {
    type: `https://errors.healthsync.id/${title.toLowerCase().replace(/\s+/g, '-')}`,
    title, status, detail, instance, requestId: crypto.randomUUID(),
  };
}

function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ data, meta: { timestamp: new Date().toISOString() } });
}

function paginated<T>(res: Response, items: T[], page: number, limit: number, total: number): void {
  res.json({
    data: items,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit), timestamp: new Date().toISOString() },
  });
}

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────
function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json(buildProblem(401, 'Unauthorized', 'Missing or invalid Authorization header', req.path));
    return;
  }
  try {
    const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as JwtPayload;
    (req as AuthRequest).user = payload;
    next();
  } catch {
    res.status(401).json(buildProblem(401, 'Unauthorized', 'Token is invalid or expired', req.path));
  }
}

function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthRequest).user;
    if (!user || !roles.includes(user.role)) {
      res.status(403).json(buildProblem(403, 'Forbidden', 'Insufficient permissions', req.path));
      return;
    }
    next();
  };
}

// ─────────────────────────────────────────────
// App
// ─────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  req.headers['x-request-id'] = req.headers['x-request-id'] ?? crypto.randomUUID();
  next();
});

// ─────────────────────────────────────────────
// GET /health
// ─────────────────────────────────────────────
app.get('/health', async (_req: Request, res: Response) => {
  let dbOk = false;
  try { await getPool().query('SELECT 1'); dbOk = true; } catch { /* swallowed */ }
  res.json({ status: 'ok', service: SERVICE_NAME, db: dbOk, timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────────
// POST /v1/referrals — Create (DOCTOR)
// ─────────────────────────────────────────────
app.post(
  '/v1/referrals',
  authenticate,
  requireRole('DOCTOR'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const caller = (req as AuthRequest).user.sub;
      const parsed = CreateReferralSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
        return;
      }
      const { patientId, toHospitalId, reason, diagnosis, urgencyLevel, requiredSpecialization, notes } = parsed.data;
      const pool = getPool();

      // Get doctor's hospital_id and doctor id from caller's user_id
      const doctorRow = await pool.query<{ id: string; hospital_id: string }>(
        'SELECT id, hospital_id FROM doctors WHERE user_id = $1',
        [caller],
      );
      if (!doctorRow.rows[0]) {
        res.status(403).json(buildProblem(403, 'Forbidden', 'Caller is not registered as a doctor', req.path));
        return;
      }
      const { id: referringDoctorId, hospital_id: fromHospitalId } = doctorRow.rows[0];

      // Check patient exists
      const patientRow = await pool.query<{ id: string }>(
        'SELECT id FROM patients WHERE id = $1',
        [patientId],
      );
      if (!patientRow.rows[0]) {
        res.status(422).json(buildProblem(422, 'Validation Error', 'Patient not found', req.path));
        return;
      }

      // Check destination hospital exists and is active
      const toHospRow = await pool.query<{ id: string }>(
        "SELECT id FROM hospitals WHERE id = $1 AND is_active = TRUE",
        [toHospitalId],
      );
      if (!toHospRow.rows[0]) {
        res.status(422).json(buildProblem(422, 'Validation Error', 'Destination hospital not found or inactive', req.path));
        return;
      }

      const result = await pool.query(
        `INSERT INTO referrals
           (id, patient_id, from_hospital_id, to_hospital_id, referring_doctor_id,
            status, reason, diagnosis, urgency_level, required_specialization, notes)
         VALUES ($1,$2,$3,$4,$5,'DRAFT',$6,$7,$8,$9,$10)
         RETURNING *`,
        [
          crypto.randomUUID(), patientId, fromHospitalId, toHospitalId, referringDoctorId,
          reason, diagnosis ?? null, urgencyLevel, requiredSpecialization ?? null, notes ?? null,
        ],
      );
      ok(res, result.rows[0], 201);
    } catch (err) { next(err); }
  },
);

// ─────────────────────────────────────────────
// PUT /v1/referrals/:id/send — Send (DOCTOR, must be referring_doctor)
// ─────────────────────────────────────────────
app.put(
  '/v1/referrals/:id/send',
  authenticate,
  requireRole('DOCTOR'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const caller = (req as AuthRequest).user.sub;
      const pool = getPool();

      // Resolve doctor id
      const doctorRow = await pool.query<{ id: string }>(
        'SELECT id FROM doctors WHERE user_id = $1',
        [caller],
      );
      if (!doctorRow.rows[0]) {
        res.status(403).json(buildProblem(403, 'Forbidden', 'Caller is not registered as a doctor', req.path));
        return;
      }
      const doctorId = doctorRow.rows[0].id;

      const referral = await pool.query<{ status: string; referring_doctor_id: string }>(
        'SELECT status, referring_doctor_id FROM referrals WHERE id = $1',
        [id],
      );
      if (!referral.rows[0]) {
        res.status(404).json(buildProblem(404, 'Not Found', `Referral ${id} not found`, req.path));
        return;
      }
      if (referral.rows[0].status !== 'DRAFT') {
        res.status(422).json(buildProblem(422, 'Validation Error', 'Referral must be in DRAFT status to send', req.path));
        return;
      }
      if (referral.rows[0].referring_doctor_id !== doctorId) {
        res.status(403).json(buildProblem(403, 'Forbidden', 'Only the referring doctor can send this referral', req.path));
        return;
      }

      const result = await pool.query(
        "UPDATE referrals SET status = 'SENT', sent_at = NOW() WHERE id = $1 RETURNING *",
        [id],
      );
      ok(res, result.rows[0]);
    } catch (err) { next(err); }
  },
);

// ─────────────────────────────────────────────
// PUT /v1/referrals/:id/accept — Accept (COMMAND_CENTER)
// ─────────────────────────────────────────────
app.put(
  '/v1/referrals/:id/accept',
  authenticate,
  requireRole('COMMAND_CENTER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const parsed = AcceptReferralSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
        return;
      }
      const pool = getPool();

      const referral = await pool.query<{ status: string }>(
        'SELECT status FROM referrals WHERE id = $1',
        [id],
      );
      if (!referral.rows[0]) {
        res.status(404).json(buildProblem(404, 'Not Found', `Referral ${id} not found`, req.path));
        return;
      }
      if (referral.rows[0].status !== 'SENT') {
        res.status(422).json(buildProblem(422, 'Validation Error', 'Referral must be in SENT status to accept', req.path));
        return;
      }

      const result = await pool.query(
        `UPDATE referrals
         SET status = 'ACCEPTED', accepted_at = NOW(), receiving_doctor_id = $1
         WHERE id = $2 RETURNING *`,
        [parsed.data.receivingDoctorId ?? null, id],
      );
      ok(res, result.rows[0]);
    } catch (err) { next(err); }
  },
);

// ─────────────────────────────────────────────
// PUT /v1/referrals/:id/reject — Reject (COMMAND_CENTER)
// ─────────────────────────────────────────────
app.put(
  '/v1/referrals/:id/reject',
  authenticate,
  requireRole('COMMAND_CENTER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const parsed = RejectReferralSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
        return;
      }
      const pool = getPool();

      const referral = await pool.query<{ status: string }>(
        'SELECT status FROM referrals WHERE id = $1',
        [id],
      );
      if (!referral.rows[0]) {
        res.status(404).json(buildProblem(404, 'Not Found', `Referral ${id} not found`, req.path));
        return;
      }
      if (referral.rows[0].status !== 'SENT') {
        res.status(422).json(buildProblem(422, 'Validation Error', 'Referral must be in SENT status to reject', req.path));
        return;
      }

      const result = await pool.query(
        "UPDATE referrals SET status = 'REJECTED', rejected_reason = $1 WHERE id = $2 RETURNING *",
        [parsed.data.rejectedReason, id],
      );
      ok(res, result.rows[0]);
    } catch (err) { next(err); }
  },
);

// ─────────────────────────────────────────────
// PUT /v1/referrals/:id/transit — Mark in transit (COMMAND_CENTER)
// ─────────────────────────────────────────────
app.put(
  '/v1/referrals/:id/transit',
  authenticate,
  requireRole('COMMAND_CENTER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const parsed = TransitReferralSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
        return;
      }
      const pool = getPool();

      const referral = await pool.query<{ status: string }>(
        'SELECT status FROM referrals WHERE id = $1',
        [id],
      );
      if (!referral.rows[0]) {
        res.status(404).json(buildProblem(404, 'Not Found', `Referral ${id} not found`, req.path));
        return;
      }
      if (referral.rows[0].status !== 'ACCEPTED') {
        res.status(422).json(buildProblem(422, 'Validation Error', 'Referral must be in ACCEPTED status to mark in transit', req.path));
        return;
      }

      const result = await pool.query(
        "UPDATE referrals SET status = 'IN_TRANSIT', ambulance_id = $1 WHERE id = $2 RETURNING *",
        [parsed.data.ambulanceId ?? null, id],
      );
      ok(res, result.rows[0]);
    } catch (err) { next(err); }
  },
);

// ─────────────────────────────────────────────
// PUT /v1/referrals/:id/arrive — Confirm arrival (COMMAND_CENTER)
// ─────────────────────────────────────────────
app.put(
  '/v1/referrals/:id/arrive',
  authenticate,
  requireRole('COMMAND_CENTER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const pool = getPool();

      const referral = await pool.query<{ status: string }>(
        'SELECT status FROM referrals WHERE id = $1',
        [id],
      );
      if (!referral.rows[0]) {
        res.status(404).json(buildProblem(404, 'Not Found', `Referral ${id} not found`, req.path));
        return;
      }
      if (referral.rows[0].status !== 'IN_TRANSIT') {
        res.status(422).json(buildProblem(422, 'Validation Error', 'Referral must be IN_TRANSIT to mark arrived', req.path));
        return;
      }

      const result = await pool.query(
        "UPDATE referrals SET status = 'ARRIVED', arrived_at = NOW() WHERE id = $1 RETURNING *",
        [id],
      );
      ok(res, result.rows[0]);
    } catch (err) { next(err); }
  },
);

// ─────────────────────────────────────────────
// PUT /v1/referrals/:id/cancel — Cancel (DOCTOR/COMMAND_CENTER/ADMIN)
// ─────────────────────────────────────────────
app.put(
  '/v1/referrals/:id/cancel',
  authenticate,
  requireRole('DOCTOR', 'COMMAND_CENTER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const pool = getPool();

      const referral = await pool.query<{ status: ReferralStatus }>(
        'SELECT status FROM referrals WHERE id = $1',
        [id],
      );
      if (!referral.rows[0]) {
        res.status(404).json(buildProblem(404, 'Not Found', `Referral ${id} not found`, req.path));
        return;
      }
      if (!ACTIVE_STATUSES.includes(referral.rows[0].status)) {
        res.status(422).json(buildProblem(
          422, 'Validation Error',
          `Cannot cancel a referral in status ${referral.rows[0].status}`,
          req.path,
        ));
        return;
      }

      const result = await pool.query(
        "UPDATE referrals SET status = 'CANCELLED' WHERE id = $1 RETURNING *",
        [id],
      );
      ok(res, result.rows[0]);
    } catch (err) { next(err); }
  },
);

// ─────────────────────────────────────────────
// GET /v1/referrals/:id — Detail
// ─────────────────────────────────────────────
app.get('/v1/referrals/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const result = await getPool().query(
      `SELECT r.*,
              p.name               AS patient_name,
              p.date_of_birth,
              hf.name              AS from_hospital_name,
              ht.name              AS to_hospital_name,
              dr.id                AS referring_doc_id,
              ur.email             AS referring_doc_email,
              a.plate_number       AS ambulance_plate
       FROM referrals r
       JOIN patients   p  ON p.id  = r.patient_id
       JOIN hospitals  hf ON hf.id = r.from_hospital_id
       JOIN hospitals  ht ON ht.id = r.to_hospital_id
       JOIN doctors    dr ON dr.id = r.referring_doctor_id
       JOIN users      ur ON ur.id = dr.user_id
       LEFT JOIN ambulances a ON a.id = r.ambulance_id
       WHERE r.id = $1`,
      [id],
    );
    if (!result.rows[0]) {
      res.status(404).json(buildProblem(404, 'Not Found', `Referral ${id} not found`, req.path));
      return;
    }
    ok(res, result.rows[0]);
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// GET /v1/referrals — List (role-scoped, paginated)
// ─────────────────────────────────────────────
app.get('/v1/referrals', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const caller = (req as AuthRequest).user;
    const q = ListReferralQuerySchema.safeParse(req.query);
    if (!q.success) {
      res.status(422).json(buildProblem(422, 'Validation Error', q.error.issues[0]?.message ?? 'Invalid query', req.path));
      return;
    }
    const { page, limit, status, urgencyLevel } = q.data;
    const offset = (page - 1) * limit;
    const pool = getPool();

    const params: unknown[] = [];
    const conditions: string[] = [];

    if (caller.role === 'DOCTOR') {
      // Scope to referring_doctor_id via user_id lookup
      const doctorRow = await pool.query<{ id: string }>(
        'SELECT id FROM doctors WHERE user_id = $1',
        [caller.sub],
      );
      if (!doctorRow.rows[0]) {
        paginated(res, [], page, limit, 0);
        return;
      }
      conditions.push(`r.referring_doctor_id = $${params.push(doctorRow.rows[0].id)}`);
    } else if (caller.role === 'COMMAND_CENTER') {
      // Scope to hospitals associated with this user (from_hospital or to_hospital)
      const hospRow = await pool.query<{ hospital_id: string }>(
        'SELECT hospital_id FROM command_center_users WHERE user_id = $1',
        [caller.sub],
      );
      if (hospRow.rows[0]) {
        const hId = hospRow.rows[0].hospital_id;
        conditions.push(
          `(r.from_hospital_id = $${params.push(hId)} OR r.to_hospital_id = $${params.push(hId)})`,
        );
      }
    }
    // ADMIN: no scoping — sees all

    if (status) {
      conditions.push(`r.status = $${params.push(status)}`);
    }
    if (urgencyLevel) {
      conditions.push(`r.urgency_level = $${params.push(urgencyLevel)}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Use a separate copy for count query (no LIMIT/OFFSET params)
    const countParams = [...params];
    const dataParams  = [...params, limit, offset];
    const limitIdx    = dataParams.length - 1;
    const offsetIdx   = dataParams.length;

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT r.id, r.patient_id, r.from_hospital_id, r.to_hospital_id,
                r.status, r.urgency_level, r.reason, r.sent_at, r.accepted_at, r.created_at
         FROM referrals r
         ${where}
         ORDER BY r.created_at DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        dataParams,
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM referrals r ${where}`,
        countParams,
      ),
    ]);

    paginated(res, dataRes.rows, page, limit, parseInt(countRes.rows[0]?.count ?? '0', 10));
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// Global error handler
// ─────────────────────────────────────────────
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(422).json(buildProblem(422, 'Validation Error', err.issues[0]?.message ?? 'Invalid input', req.path));
    return;
  }
  console.error(`[${SERVICE_NAME}] Unhandled error:`, err.message, err.stack);
  res.status(500).json(buildProblem(500, 'Internal Server Error', 'An unexpected error occurred', req.path));
});

// ─────────────────────────────────────────────
// Graceful shutdown
// ─────────────────────────────────────────────
function shutdown(signal: string): void {
  console.log(`[${SERVICE_NAME}] Received ${signal}, shutting down gracefully…`);
  if (_pool) {
    _pool.end().then(() => {
      console.log(`[${SERVICE_NAME}] DB pool closed`);
      process.exit(0);
    }).catch(() => process.exit(1));
  } else {
    process.exit(0);
  }
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

if (require.main === module) {
  app.listen(PORT, () => console.log(`[${SERVICE_NAME}] Listening on port ${PORT}`));
}

export default app;
