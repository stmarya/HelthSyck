import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z, ZodError } from 'zod';
import { Pool } from 'pg';

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────
const PORT = parseInt(process.env['PORT'] ?? '3002', 10);
const JWT_SECRET: string = process.env['JWT_SECRET'] ?? (() => {
  throw new Error('JWT_SECRET is required; refusing to start with a fallback secret');
})();
const SERVICE_NAME = 'patient-service';

// ─────────────────────────────────────────────
// DB singleton
// ─────────────────────────────────────────────
let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  }
  return _pool;
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface JwtPayload {
  sub: string;
  role: string;
}

interface AuthRequest extends Request {
  user: JwtPayload;
}

interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  requestId: string;
}

// ─────────────────────────────────────────────
// Validation schemas
// ─────────────────────────────────────────────
const CreatePatientSchema = z.object({
  userId: z.string().uuid(),
  nik: z.string().regex(/^\d{16}$/, 'NIK must be exactly 16 digits'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  bloodType: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN']),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  phone: z.string().min(8, 'Phone must be at least 8 characters'),
  address: z.string().min(5, 'Address must be at least 5 characters'),
  emergencyContactName: z.string().min(2).optional(),
  emergencyContactPhone: z.string().min(8).optional(),
});

const UpdatePatientSchema = CreatePatientSchema
  .omit({ userId: true, nik: true })
  .partial();

const RecordVitalSchema = z.object({
  heartRate: z.number().int().min(20).max(300),
  spo2: z.number().min(50).max(100),
  temperature: z.number().min(30).max(45).optional(),
  systolicBp: z.number().int().min(50).max(300).optional(),
  diastolicBp: z.number().int().min(30).max(200).optional(),
  activityLevel: z.enum(['resting', 'walking', 'running']).optional(),
  source: z.enum(['MANUAL', 'IOT_DEVICE', 'WEARABLE']).default('MANUAL'),
  deviceId: z.string().optional(),
});

const VitalsQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  page: z.coerce.number().int().min(1).default(1),
});

const AddConditionSchema = z.object({
  icd10Code: z.string().max(10).optional(),
  description: z.string().min(1),
  diagnosedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  isActive: z.boolean().default(true),
  notes: z.string().optional(),
});

const AddAllergySchema = z.object({
  allergen: z.string().min(1),
  reaction: z.string().optional(),
  severity: z.enum(['MILD', 'MODERATE', 'SEVERE']).optional(),
});

const PairDeviceSchema = z.object({
  deviceId: z.string().min(1),
  deviceType: z.string().min(1),
  firmwareVersion: z.string().optional(),
});

const ListPatientsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function buildProblem(status: number, title: string, detail: string, instance: string): ProblemDetail {
  return {
    type: `https://errors.healthsync.id/${title.toLowerCase().replace(/\s+/g, '-')}`,
    title,
    status,
    detail,
    instance,
    requestId: crypto.randomUUID(),
  };
}

function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ data, meta: { timestamp: new Date().toISOString() } });
}

async function writeAuditLog(
  patientId: string,
  actorId: string,
  event: string,
  req: Request,
): Promise<void> {
  try {
    await getPool().query(
      `INSERT INTO medical_audit_logs
         (accessor_id, accessor_role, patient_id, action, resource_type, ip_address, user_agent, request_id)
       SELECT $1, u.role, $2, $3, 'patient', $4::inet, $5, $6
       FROM users u
       WHERE u.id = $1`,
      [
        actorId,
        patientId,
        event,
        req.ip ?? null,
        req.headers['user-agent'] ?? null,
        req.headers['x-request-id'] ?? crypto.randomUUID(),
      ],
    );
  } catch (err) {
    console.error(`[${SERVICE_NAME}] Audit log write failed:`, err);
  }
}

async function assertPatientAccess(
  req: Request,
  res: Response,
  patientId: string,
  write = false,
): Promise<boolean> {
  const actor = (req as AuthRequest).user;
  if (actor.role === 'ADMIN' || (!write && actor.role === 'COMMAND_CENTER')) {
    return true;
  }

  if (actor.role === 'PATIENT') {
    const result = await getPool().query<{ id: string }>(
      'SELECT id FROM patients WHERE id = $1 AND user_id = $2',
      [patientId, actor.sub],
    );
    if (result.rows[0]) return true;
  }

  if (!write && actor.role === 'DOCTOR') {
    const result = await getPool().query<{ id: string }>(
      `SELECT c.id
       FROM consultations c
       JOIN doctors d ON d.id = c.doctor_id
       WHERE c.patient_id = $1 AND d.user_id = $2
       LIMIT 1`,
      [patientId, actor.sub],
    );
    if (result.rows[0]) return true;
  }

  res.status(403).json(buildProblem(403, 'Forbidden', 'You are not authorized for this patient', req.path));
  return false;
}

// ─────────────────────────────────────────────
// Middleware — JWT Authentication
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
  try {
    await getPool().query('SELECT 1');
    dbOk = true;
  } catch { /* intentionally swallowed */ }
  res.json({ status: 'ok', service: SERVICE_NAME, db: dbOk, timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────────
// POST /v1/patients — Create patient profile
// ─────────────────────────────────────────────
app.post('/v1/patients', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = CreatePatientSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
      return;
    }

    const {
      userId, nik, name, dateOfBirth, bloodType, gender,
      phone, address, emergencyContactName, emergencyContactPhone,
    } = parsed.data;
    const actor = (req as AuthRequest).user;
    if (actor.role !== 'ADMIN' && userId !== actor.sub) {
      res.status(403).json(buildProblem(403, 'Forbidden', 'You may only create your own patient profile', req.path));
      return;
    }

    const pool = getPool();

    // Verify userId is a PATIENT
    const userCheck = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE id = $1 AND role = 'PATIENT'",
      [userId],
    );
    if (!userCheck.rows[0]) {
      res.status(422).json(buildProblem(422, 'Validation Error', 'userId must reference an existing PATIENT user', req.path));
      return;
    }

    // Check NIK uniqueness using hash
    const nikToken = crypto.createHash('sha256').update(nik).digest('hex');
    const nikCheck = await pool.query<{ id: string }>(
      'SELECT id FROM patients WHERE nik_token = $1',
      [nikToken],
    );
    if (nikCheck.rows[0]) {
      res.status(409).json(buildProblem(409, 'Conflict', 'NIK already registered', req.path));
      return;
    }

    const patientId = crypto.randomUUID();

    const result = await pool.query<{
      id: string; user_id: string; name: string; date_of_birth: string;
      blood_type: string; gender: string; phone: string | null; address: string | null;
      emergency_contact_name: string | null; emergency_contact_phone: string | null;
      created_at: string;
    }>(
      `INSERT INTO patients
         (id, user_id, nik_token, name, date_of_birth, blood_type, gender,
          phone, address, emergency_contact_name, emergency_contact_phone)
       VALUES ($1,$2,$3,$4,$5,$6::blood_type,$7::gender,$8,$9,$10,$11)
       RETURNING id, user_id, name, date_of_birth, blood_type, gender,
                 phone, address, emergency_contact_name, emergency_contact_phone, created_at`,
      [
        patientId, userId, nikToken, name, dateOfBirth,
        bloodType, gender, phone ?? null, address ?? null,
        emergencyContactName ?? null, emergencyContactPhone ?? null,
      ],
    );

    const patient = result.rows[0];
    if (!patient) throw new Error('Insert failed unexpectedly');

    await writeAuditLog(patient.id, actor.sub, 'CREATE_PATIENT_PROFILE', req);

    ok(res, patient, 201);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
// GET /v1/patients — List patients (staff only)
// ─────────────────────────────────────────────
app.get(
  '/v1/patients',
  authenticate,
  requireRole('DOCTOR', 'COMMAND_CENTER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = ListPatientsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid query', req.path));
        return;
      }

      const { page, limit, search } = parsed.data;
      const offset = (page - 1) * limit;
      const pool = getPool();

      let patientsQuery: string;
      let countQuery: string;
      let params: unknown[];

      if (search) {
        patientsQuery = `
          SELECT id, user_id, name, date_of_birth, blood_type, gender, phone, created_at
          FROM patients
          WHERE name ILIKE '%' || $1 || '%'
          ORDER BY name ASC
          LIMIT $2 OFFSET $3`;
        countQuery = "SELECT COUNT(*) FROM patients WHERE name ILIKE '%' || $1 || '%'";
        params = [search, limit, offset];
      } else {
        patientsQuery = `
          SELECT id, user_id, name, date_of_birth, blood_type, gender, phone, created_at
          FROM patients
          ORDER BY created_at DESC
          LIMIT $1 OFFSET $2`;
        countQuery = 'SELECT COUNT(*) FROM patients';
        params = [limit, offset];
      }

      const [patientsResult, countResult] = await Promise.all([
        pool.query(patientsQuery, params),
        pool.query(countQuery, search ? [search] : []),
      ]);

      const total = parseInt((countResult.rows[0] as { count: string }).count, 10);

      ok(res, {
        patients: patientsResult.rows,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────
// GET /v1/patients/:id — Get patient by ID
// ─────────────────────────────────────────────
app.get('/v1/patients/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const pool = getPool();

    const patientResult = await pool.query(
      `SELECT p.id, p.user_id, p.name, p.date_of_birth, p.gender, p.blood_type,
              p.phone, p.address, p.emergency_contact_name, p.emergency_contact_phone,
              p.profile_photo_url, p.created_at, p.updated_at,
              u.email, u.phone AS user_phone
       FROM patients p
       JOIN users u ON u.id = p.user_id
       WHERE p.id = $1`,
      [id],
    );

    const patient = patientResult.rows[0];
    if (!patient) {
      res.status(404).json(buildProblem(404, 'Not Found', 'Patient not found', req.path));
      return;
    }
    if (!(await assertPatientAccess(req, res, id))) return;

    const [conditionsResult, allergiesResult, devicesResult] = await Promise.all([
      pool.query(
        'SELECT * FROM patient_conditions WHERE patient_id = $1 AND is_active = TRUE',
        [id],
      ),
      pool.query(
        'SELECT * FROM patient_allergies WHERE patient_id = $1',
        [id],
      ),
      pool.query(
        'SELECT device_id, device_type, firmware_version, last_seen_at FROM iot_devices WHERE patient_id = $1 AND is_active = TRUE',
        [id],
      ),
    ]);

    const actor = (req as AuthRequest).user;
    await writeAuditLog(id, actor.sub, 'READ_PATIENT_PROFILE', req);

    ok(res, {
      ...patient,
      conditions: conditionsResult.rows,
      allergies: allergiesResult.rows,
      devices: devicesResult.rows,
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
// PUT /v1/patients/:id — Update patient
// ─────────────────────────────────────────────
app.put('/v1/patients/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!(await assertPatientAccess(req, res, id, true))) return;
    const parsed = UpdatePatientSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
      return;
    }

    const data = parsed.data;
    const pool = getPool();

    // Check patient exists
    const existing = await pool.query<{ id: string }>('SELECT id FROM patients WHERE id = $1', [id]);
    if (!existing.rows[0]) {
      res.status(404).json(buildProblem(404, 'Not Found', 'Patient not found', req.path));
      return;
    }

    // Build dynamic SET clause — only update fields that were sent
    const columnMap: Record<string, string> = {
      name: 'name',
      dateOfBirth: 'date_of_birth',
      bloodType: 'blood_type',
      gender: 'gender',
      phone: 'phone',
      address: 'address',
      emergencyContactName: 'emergency_contact_name',
      emergencyContactPhone: 'emergency_contact_phone',
    };

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    for (const [key, col] of Object.entries(columnMap)) {
      if (key in data && data[key as keyof typeof data] !== undefined) {
        // Cast enums explicitly
        if (key === 'bloodType') {
          setClauses.push(`${col} = $${paramIdx}::blood_type`);
        } else if (key === 'gender') {
          setClauses.push(`${col} = $${paramIdx}::gender`);
        } else {
          setClauses.push(`${col} = $${paramIdx}`);
        }
        values.push(data[key as keyof typeof data]);
        paramIdx++;
      }
    }

    if (setClauses.length === 0) {
      res.status(422).json(buildProblem(422, 'Validation Error', 'No fields to update', req.path));
      return;
    }

    values.push(id);
    const updateQuery = `UPDATE patients SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${paramIdx} RETURNING *`;
    const result = await pool.query(updateQuery, values);

    const actor = (req as AuthRequest).user;
    await writeAuditLog(id, actor.sub, 'UPDATE_PATIENT_PROFILE', req);

    ok(res, result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
// POST /v1/patients/:id/vitals — Record vitals
// ─────────────────────────────────────────────
app.post('/v1/patients/:id/vitals', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: patientId } = req.params;
    const parsed = RecordVitalSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
      return;
    }
    if (!(await assertPatientAccess(req, res, patientId, true))) return;

    const pool = getPool();

    // Verify patient exists
    const patientCheck = await pool.query<{ id: string }>('SELECT id FROM patients WHERE id = $1', [patientId]);
    if (!patientCheck.rows[0]) {
      res.status(404).json(buildProblem(404, 'Not Found', 'Patient not found', req.path));
      return;
    }

    const { heartRate, spo2, temperature, systolicBp, diastolicBp, activityLevel, source, deviceId } = parsed.data;
    const vitalId = crypto.randomUUID();

    const result = await pool.query(
      `INSERT INTO vital_signs
         (id, patient_id, device_id, heart_rate, spo2, systolic_bp, diastolic_bp,
          temperature, activity_level, source, recorded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::vital_source, NOW())
       RETURNING *`,
      [
        vitalId, patientId, deviceId ?? null,
        heartRate, spo2, systolicBp ?? null, diastolicBp ?? null,
        temperature ?? null, activityLevel ?? null, source,
      ],
    );

    const actor = (req as AuthRequest).user;
    await writeAuditLog(patientId, actor.sub, 'RECORD_VITALS', req);

    ok(res, result.rows[0], 201);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
// GET /v1/patients/:id/vitals — Vitals history
// ─────────────────────────────────────────────
app.get('/v1/patients/:id/vitals', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: patientId } = req.params;
    if (!(await assertPatientAccess(req, res, patientId))) return;
    const parsed = VitalsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid query', req.path));
      return;
    }

    const pool = getPool();

    // Verify patient exists
    const patientCheck = await pool.query<{ id: string }>('SELECT id FROM patients WHERE id = $1', [patientId]);
    if (!patientCheck.rows[0]) {
      res.status(404).json(buildProblem(404, 'Not Found', 'Patient not found', req.path));
      return;
    }

    const { from, to, limit, page } = parsed.data;
    const offset = (page - 1) * limit;

    // Default to last 24 hours if no range specified
    const fromDate = from ? new Date(from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const result = await pool.query(
      `SELECT * FROM vital_signs
       WHERE patient_id = $1
         AND recorded_at BETWEEN $2 AND $3
       ORDER BY recorded_at DESC
       LIMIT $4 OFFSET $5`,
      [patientId, fromDate.toISOString(), toDate.toISOString(), limit, offset],
    );

    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM vital_signs
       WHERE patient_id = $1 AND recorded_at BETWEEN $2 AND $3`,
      [patientId, fromDate.toISOString(), toDate.toISOString()],
    );

    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    ok(res, {
      vitals: result.rows,
      meta: { count: total, from: fromDate.toISOString(), to: toDate.toISOString(), page, limit },
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
// GET /v1/patients/:id/vitals/latest — Latest vital
// ─────────────────────────────────────────────
app.get('/v1/patients/:id/vitals/latest', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: patientId } = req.params;
    if (!(await assertPatientAccess(req, res, patientId))) return;
    const pool = getPool();

    const patientCheck = await pool.query<{ id: string }>('SELECT id FROM patients WHERE id = $1', [patientId]);
    if (!patientCheck.rows[0]) {
      res.status(404).json(buildProblem(404, 'Not Found', 'Patient not found', req.path));
      return;
    }

    const result = await pool.query(
      'SELECT * FROM vital_signs WHERE patient_id = $1 ORDER BY recorded_at DESC LIMIT 1',
      [patientId],
    );

    if (!result.rows[0]) {
      res.status(404).json(buildProblem(404, 'Not Found', 'No vital signs recorded for this patient', req.path));
      return;
    }

    ok(res, result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
// POST /v1/patients/:id/conditions — Add condition
// ─────────────────────────────────────────────
app.post('/v1/patients/:id/conditions', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: patientId } = req.params;
    if (!(await assertPatientAccess(req, res, patientId, true))) return;
    const parsed = AddConditionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
      return;
    }

    const pool = getPool();

    const patientCheck = await pool.query<{ id: string }>('SELECT id FROM patients WHERE id = $1', [patientId]);
    if (!patientCheck.rows[0]) {
      res.status(404).json(buildProblem(404, 'Not Found', 'Patient not found', req.path));
      return;
    }

    const { icd10Code, description, diagnosedAt, isActive, notes } = parsed.data;

    const result = await pool.query(
      `INSERT INTO patient_conditions (id, patient_id, icd10_code, description, diagnosed_at, is_active, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        crypto.randomUUID(), patientId,
        icd10Code ?? null, description,
        diagnosedAt ?? null, isActive, notes ?? null,
      ],
    );

    ok(res, result.rows[0], 201);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
// POST /v1/patients/:id/allergies — Add allergy
// ─────────────────────────────────────────────
app.post('/v1/patients/:id/allergies', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: patientId } = req.params;
    if (!(await assertPatientAccess(req, res, patientId, true))) return;
    const parsed = AddAllergySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
      return;
    }

    const pool = getPool();

    const patientCheck = await pool.query<{ id: string }>('SELECT id FROM patients WHERE id = $1', [patientId]);
    if (!patientCheck.rows[0]) {
      res.status(404).json(buildProblem(404, 'Not Found', 'Patient not found', req.path));
      return;
    }

    const { allergen, reaction, severity } = parsed.data;

    const result = await pool.query(
      `INSERT INTO patient_allergies (id, patient_id, allergen, reaction, severity)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [crypto.randomUUID(), patientId, allergen, reaction ?? null, severity ?? null],
    );

    ok(res, result.rows[0], 201);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
// POST /v1/patients/:id/devices — Pair IoT device
// ─────────────────────────────────────────────
app.post('/v1/patients/:id/devices', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: patientId } = req.params;
    if (!(await assertPatientAccess(req, res, patientId, true))) return;
    const parsed = PairDeviceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
      return;
    }

    const pool = getPool();

    const patientCheck = await pool.query<{ id: string }>('SELECT id FROM patients WHERE id = $1', [patientId]);
    if (!patientCheck.rows[0]) {
      res.status(404).json(buildProblem(404, 'Not Found', 'Patient not found', req.path));
      return;
    }

    const { deviceId, deviceType, firmwareVersion } = parsed.data;

    // Ensure device is not already paired to another patient
    const deviceCheck = await pool.query<{ patient_id: string }>(
      'SELECT patient_id FROM iot_devices WHERE device_id = $1 AND is_active = TRUE',
      [deviceId],
    );
    if (deviceCheck.rows[0]) {
      res.status(409).json(buildProblem(409, 'Conflict', 'Device is already paired to another patient', req.path));
      return;
    }

    const result = await pool.query(
      `INSERT INTO iot_devices (id, patient_id, device_id, device_type, firmware_version, is_active, paired_at)
       VALUES ($1,$2,$3,$4,$5,TRUE,NOW())
       RETURNING id, patient_id, device_id, device_type, firmware_version, is_active, paired_at`,
      [crypto.randomUUID(), patientId, deviceId, deviceType, firmwareVersion ?? null],
    );

    ok(res, result.rows[0], 201);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
// DELETE /v1/patients/:id/devices/:deviceId — Unpair device
// ─────────────────────────────────────────────
app.delete('/v1/patients/:id/devices/:deviceId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: patientId, deviceId } = req.params;
    if (!(await assertPatientAccess(req, res, patientId, true))) return;
    const pool = getPool();

    const result = await pool.query(
      'UPDATE iot_devices SET is_active = FALSE WHERE device_id = $1 AND patient_id = $2 RETURNING id',
      [deviceId, patientId],
    );

    if (!result.rows[0]) {
      res.status(404).json(buildProblem(404, 'Not Found', 'Device not found for this patient', req.path));
      return;
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
// Global error handler (RFC 7807)
// ─────────────────────────────────────────────
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(422).json(buildProblem(422, 'Validation Error', err.issues[0]?.message ?? 'Invalid input', req.path));
    return;
  }
  console.error(`[${SERVICE_NAME}] Unhandled error:`, err);
  res.status(500).json(buildProblem(500, 'Internal Server Error', 'An unexpected error occurred', req.path));
});

// ─────────────────────────────────────────────
// Graceful shutdown
// ─────────────────────────────────────────────
function shutdown(signal: string): void {
  console.log(`[${SERVICE_NAME}] ${signal} received — shutting down gracefully`);
  void (async () => {
    try {
      if (_pool) await _pool.end();
    } finally {
      process.exit(0);
    }
  })();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ─────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[${SERVICE_NAME}] Listening on port ${PORT}`);
  });
}

export default app;
