import express, { Request, Response, NextFunction } from 'express';
import cors, { CorsOptions } from 'cors';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z, ZodError } from 'zod';
import { Pool, PoolClient } from 'pg';

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────
const PORT = parseInt(process.env['PORT'] ?? '3007', 10);
const JWT_SECRET: string = process.env['JWT_SECRET'] ?? (() => {
  throw new Error('JWT_SECRET is required; refusing to start with a fallback secret');
})();
const SERVICE_NAME = 'hospital-service';

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

async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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
// Schemas
// ─────────────────────────────────────────────
const SearchHospitalSchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radius_km: z.coerce.number().min(1).max(100).default(20),
  specialization: z.string().optional(),
  city: z.string().optional(),
  hasIcu: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  minAvailableBeds: z.coerce.number().int().optional(),
});

const CreateHospitalSchema = z.object({
  name: z.string().min(2),
  type: z.enum(['TYPE_A', 'TYPE_B', 'TYPE_C', 'TYPE_D', 'CLINIC', 'PUSKESMAS']),
  licenseNumber: z.string().min(1),
  address: z.string().min(5),
  city: z.string().min(2),
  province: z.string().min(2),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  phone: z.string().min(8),
  email: z.string().email().optional(),
  igdPhone: z.string().optional(),
  totalBeds: z.number().int().min(0),
  icuTotal: z.number().int().min(0),
  specializations: z.array(z.string()),
  isEmtPartner: z.boolean(),
});

const UpdateCapacitySchema = z.object({
  availableBeds: z.number().int().min(0),
  icuAvailable: z.number().int().min(0),
  notes: z.string().optional(),
});

const UpdateHospitalSchema = z.object({
  name:            z.string().min(2).optional(),
  type:            z.enum(['TYPE_A', 'TYPE_B', 'TYPE_C', 'TYPE_D', 'CLINIC', 'PUSKESMAS']).optional(),
  address:         z.string().min(5).optional(),
  city:            z.string().min(2).optional(),
  province:        z.string().min(2).optional(),
  phone:           z.string().min(8).optional(),
  email:           z.string().email().optional(),
  igdPhone:        z.string().optional(),
  totalBeds:       z.number().int().min(0).optional(),
  icuTotal:        z.number().int().min(0).optional(),
  specializations: z.array(z.string()).optional(),
  isEmtPartner:    z.boolean().optional(),
  isActive:        z.boolean().optional(),
  latitude:        z.number().min(-90).max(90).optional(),
  longitude:       z.number().min(-180).max(180).optional(),
});

const UpdateDoctorAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
});

const ListHospitalQuerySchema = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  type:   z.enum(['TYPE_A', 'TYPE_B', 'TYPE_C', 'TYPE_D', 'CLINIC', 'PUSKESMAS']).optional(),
});

const UpdateBedSchema = z.object({
  status: z.enum(['AVAILABLE', 'OCCUPIED', 'RESERVED', 'MAINTENANCE']),
  patientId: z.string().uuid().optional(),
}).superRefine((data, ctx) => {
  if (data.status === 'OCCUPIED' && !data.patientId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'patientId is required when status is OCCUPIED', path: ['patientId'] });
  }
});

const AddBedSchema = z.object({
  ward: z.string().min(1),
  roomNumber: z.string().min(1),
  bedNumber: z.string().min(1),
});

const BedFilterSchema = z.object({
  ward: z.string().optional(),
  status: z.enum(['AVAILABLE', 'OCCUPIED', 'RESERVED', 'MAINTENANCE']).optional(),
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

/** Like authenticate but non-blocking — sets req.user if token present, continues either way */
function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as JwtPayload;
      (req as AuthRequest).user = payload;
    } catch { /* ignore invalid token for public routes */ }
  }
  next();
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
const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    const configured = (process.env['CORS_ORIGINS'] ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const allowedOrigins = configured.length > 0
      ? configured
      : ['http://localhost:3000', 'http://localhost:5173'];
    callback(null, !origin || allowedOrigins.includes(origin));
  },
  credentials: true,
};

const app = express();
app.use(cors(corsOptions));
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
// GET /v1/hospitals — List (paginated, filter by search & type)
// ─────────────────────────────────────────────
app.get('/v1/hospitals', optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = ListHospitalQuerySchema.safeParse(req.query);
    if (!q.success) {
      res.status(422).json(buildProblem(422, 'Validation Error', q.error.issues[0]?.message ?? 'Invalid query', req.path));
      return;
    }
    const { page, limit, search, type } = q.data;
    const offset = (page - 1) * limit;
    const pool = getPool();

    const params: unknown[] = [];
    const conditions: string[] = ['is_active = TRUE'];

    if (search) {
      conditions.push(
        `(LOWER(name) LIKE $${params.push('%' + search.toLowerCase() + '%')} OR LOWER(city) LIKE $${params.push('%' + search.toLowerCase() + '%')})`,
      );
    }
    if (type) {
      conditions.push(`type = $${params.push(type)}`);
    }

    const where = conditions.join(' AND ');
    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT id, name, type, address, city, province, phone, igd_phone,
                total_beds, available_beds, icu_total, icu_available,
                specializations, is_emt_partner, latitude, longitude
         FROM hospitals WHERE ${where}
         ORDER BY name
         LIMIT $${params.push(limit)} OFFSET $${params.push(offset)}`,
        params,
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM hospitals WHERE ${where}`,
        params.slice(0, params.length - 2),
      ),
    ]);

    paginated(res, dataRes.rows, page, limit, parseInt(countRes.rows[0]?.count ?? '0', 10));
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// GET /v1/hospitals/search — Smart search
// NOTE: must be registered before /:id
// ─────────────────────────────────────────────
app.get('/v1/hospitals/search', optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = SearchHospitalSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid query', req.path));
      return;
    }
    const { lat, lng, radius_km, specialization, city, hasIcu, minAvailableBeds } = parsed.data;

    const params: unknown[] = [];
    const conditions: string[] = ['h.is_active = TRUE'];

    // Geo params are $1 and $2 when present — they must be first for the ORDER BY clause
    let distanceExpr: string | null = null;
    if (lat !== undefined && lng !== undefined) {
      params.push(lat, lng);
      distanceExpr = `earth_distance(ll_to_earth($1, $2), ll_to_earth(h.latitude, h.longitude)) / 1000`;
      conditions.push(
        `earth_distance(ll_to_earth($1, $2), ll_to_earth(h.latitude, h.longitude)) < $${params.push(radius_km * 1000)}`,
      );
    }

    if (minAvailableBeds !== undefined) {
      conditions.push(`h.available_beds >= $${params.push(minAvailableBeds)}`);
    }
    if (hasIcu === true) {
      conditions.push('h.icu_available > 0');
    }
    if (specialization) {
      conditions.push(`$${params.push(specialization)} = ANY(h.specializations)`);
    }
    if (city) {
      conditions.push(`LOWER(h.city) = LOWER($${params.push(city)})`);
    }

    const selectExtra = distanceExpr ? `, ${distanceExpr} AS distance_km` : '';
    const orderBy = distanceExpr ? 'distance_km ASC' : 'h.available_beds DESC';

    const sql = `
      SELECT h.id, h.name, h.type, h.address, h.city, h.province, h.phone, h.igd_phone,
             h.total_beds, h.available_beds, h.icu_total, h.icu_available,
             h.specializations, h.is_emt_partner, h.latitude, h.longitude${selectExtra}
      FROM hospitals h
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT 20
    `;

    const result = await getPool().query(sql, params);
    ok(res, result.rows);
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// GET /v1/hospitals/:id — Detail
// ─────────────────────────────────────────────
app.get('/v1/hospitals/:id', optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const pool = getPool();

    const [hospitalRes, wardSummaryRes, doctorCountRes] = await Promise.all([
      pool.query(
        `SELECT id, name, type, license_number, address, city, province, phone,
                email, igd_phone, total_beds, available_beds, icu_total, icu_available,
                specializations, is_emt_partner, latitude, longitude, is_active, created_at, updated_at
         FROM hospitals WHERE id = $1`,
        [id],
      ),
      pool.query(
        `SELECT ward,
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'AVAILABLE' THEN 1 ELSE 0 END) AS available,
                SUM(CASE WHEN status = 'OCCUPIED'  THEN 1 ELSE 0 END) AS occupied
         FROM hospital_beds WHERE hospital_id = $1 GROUP BY ward ORDER BY ward`,
        [id],
      ),
      pool.query<{ count: string }>(
        "SELECT COUNT(*) FROM doctors WHERE hospital_id = $1 AND is_available = TRUE",
        [id],
      ),
    ]);

    if (!hospitalRes.rows[0]) {
      res.status(404).json(buildProblem(404, 'Not Found', `Hospital ${id} not found`, req.path));
      return;
    }

    ok(res, {
      ...hospitalRes.rows[0],
      wardSummary: wardSummaryRes.rows,
      activeDoctors: parseInt(doctorCountRes.rows[0]?.count ?? '0', 10),
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// GET /v1/hospitals/:id/capacity — Real-time capacity per ward
// ─────────────────────────────────────────────
app.get('/v1/hospitals/:id/capacity', optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const result = await getPool().query(
      `SELECT ward,
              COUNT(*)                                                  AS total,
              SUM(CASE WHEN status = 'AVAILABLE'   THEN 1 ELSE 0 END) AS available,
              SUM(CASE WHEN status = 'OCCUPIED'    THEN 1 ELSE 0 END) AS occupied,
              SUM(CASE WHEN status = 'RESERVED'    THEN 1 ELSE 0 END) AS reserved,
              SUM(CASE WHEN status = 'MAINTENANCE' THEN 1 ELSE 0 END) AS maintenance
       FROM hospital_beds WHERE hospital_id = $1 GROUP BY ward ORDER BY ward`,
      [id],
    );
    ok(res, { hospitalId: id, wards: result.rows });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// PUT /v1/hospitals/:id/capacity — Update bed counts (COMMAND_CENTER/ADMIN)
// ─────────────────────────────────────────────
app.put(
  '/v1/hospitals/:id/capacity',
  authenticate,
  requireRole('COMMAND_CENTER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const parsed = UpdateCapacitySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
        return;
      }
      const { availableBeds, icuAvailable } = parsed.data;

      const result = await getPool().query(
        `UPDATE hospitals
         SET available_beds = $1, icu_available = $2, updated_at = NOW()
         WHERE id = $3
         RETURNING id, available_beds, icu_available, total_beds, icu_total, updated_at`,
        [availableBeds, icuAvailable, id],
      );

      if (!result.rows[0]) {
        res.status(404).json(buildProblem(404, 'Not Found', `Hospital ${id} not found`, req.path));
        return;
      }
      ok(res, result.rows[0]);
    } catch (err) { next(err); }
  },
);

// ─────────────────────────────────────────────
// GET /v1/hospitals/:id/beds — List beds (COMMAND_CENTER)
// ─────────────────────────────────────────────
app.get(
  '/v1/hospitals/:id/beds',
  authenticate,
  requireRole('COMMAND_CENTER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const filter = BedFilterSchema.safeParse(req.query);
      if (!filter.success) {
        res.status(422).json(buildProblem(422, 'Validation Error', filter.error.issues[0]?.message ?? 'Invalid query', req.path));
        return;
      }

      const params: unknown[] = [id];
      const conditions: string[] = ['hospital_id = $1'];

      if (filter.data.ward) {
        conditions.push(`ward = $${params.push(filter.data.ward)}`);
      }
      if (filter.data.status) {
        conditions.push(`status = $${params.push(filter.data.status)}`);
      }

      const result = await getPool().query(
        `SELECT id, ward, room_number, bed_number, status, patient_id, admitted_at
         FROM hospital_beds
         WHERE ${conditions.join(' AND ')}
         ORDER BY ward, room_number, bed_number`,
        params,
      );
      ok(res, result.rows);
    } catch (err) { next(err); }
  },
);

// ─────────────────────────────────────────────
// POST /v1/hospitals/:id/beds — Add bed (ADMIN)
// ─────────────────────────────────────────────
app.post(
  '/v1/hospitals/:id/beds',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const parsed = AddBedSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
        return;
      }
      const { ward, roomNumber, bedNumber } = parsed.data;
      const pool = getPool();

      // Uniqueness check
      const existing = await pool.query<{ id: string }>(
        'SELECT id FROM hospital_beds WHERE hospital_id = $1 AND room_number = $2 AND bed_number = $3',
        [id, roomNumber, bedNumber],
      );
      if (existing.rows[0]) {
        res.status(409).json(buildProblem(409, 'Conflict', `Bed ${roomNumber}/${bedNumber} already exists in this hospital`, req.path));
        return;
      }

      const result = await pool.query(
        `INSERT INTO hospital_beds (id, hospital_id, ward, room_number, bed_number, status)
         VALUES ($1, $2, $3, $4, $5, 'AVAILABLE')
         RETURNING id, hospital_id, ward, room_number, bed_number, status, admitted_at`,
        [crypto.randomUUID(), id, ward, roomNumber, bedNumber],
      );
      ok(res, result.rows[0], 201);
    } catch (err) { next(err); }
  },
);

// ─────────────────────────────────────────────
// PUT /v1/hospitals/:id/beds/:bedId — Update bed status (COMMAND_CENTER)
// ─────────────────────────────────────────────
app.put(
  '/v1/hospitals/:id/beds/:bedId',
  authenticate,
  requireRole('COMMAND_CENTER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, bedId } = req.params;
      const parsed = UpdateBedSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
        return;
      }
      const { status, patientId } = parsed.data;

      const updatedBed = await withTransaction(async (client) => {
        // Fetch current bed
        const current = await client.query<{ id: string; status: string }>(
          'SELECT id, status FROM hospital_beds WHERE id = $1 AND hospital_id = $2',
          [bedId, id],
        );
        if (!current.rows[0]) return null;

        // Update bed
        const bedResult = await client.query(
          `UPDATE hospital_beds
           SET status      = $1,
               patient_id  = $2,
               admitted_at = CASE WHEN $1 = 'OCCUPIED' THEN NOW() ELSE NULL END,
               updated_at  = NOW()
           WHERE id = $3 AND hospital_id = $4
           RETURNING id, ward, room_number, bed_number, status, patient_id, admitted_at`,
          [status, patientId ?? null, bedId, id],
        );

        // Sync aggregate counts on hospital row
        await client.query(
          `UPDATE hospitals
           SET available_beds = (
                 SELECT COUNT(*) FROM hospital_beds WHERE hospital_id = $1 AND status = 'AVAILABLE'
               ),
               icu_available  = (
                 SELECT COUNT(*) FROM hospital_beds WHERE hospital_id = $1 AND ward = 'ICU' AND status = 'AVAILABLE'
               ),
               updated_at     = NOW()
           WHERE id = $1`,
          [id],
        );

        return bedResult.rows[0] ?? null;
      });

      if (!updatedBed) {
        res.status(404).json(buildProblem(404, 'Not Found', `Bed ${bedId} not found in hospital ${id}`, req.path));
        return;
      }
      ok(res, updatedBed);
    } catch (err) { next(err); }
  },
);

// ─────────────────────────────────────────────
// GET /v1/hospitals/:id/doctors — List doctors
// ─────────────────────────────────────────────
app.get('/v1/hospitals/:id/doctors', optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const result = await getPool().query(
      `SELECT d.id, d.specialization, d.is_available, d.rating_avg, d.consultation_fee,
              u.email, u.phone
       FROM doctors d
       JOIN users u ON u.id = d.user_id
       WHERE d.hospital_id = $1
       ORDER BY d.specialization, d.rating_avg DESC`,
      [id],
    );
    ok(res, result.rows);
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// POST /v1/hospitals — Create hospital (ADMIN)
// ─────────────────────────────────────────────
app.post(
  '/v1/hospitals',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = CreateHospitalSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
        return;
      }
      const d = parsed.data;
      const result = await getPool().query(
        `INSERT INTO hospitals
           (id, name, type, license_number, address, city, province, latitude, longitude,
            phone, email, igd_phone, total_beds, available_beds, icu_total, icu_available,
            specializations, is_emt_partner, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13,$14,$14,$15,$16,TRUE)
         RETURNING *`,
        [
          crypto.randomUUID(), d.name, d.type, d.licenseNumber, d.address, d.city, d.province,
          d.latitude, d.longitude, d.phone, d.email ?? null, d.igdPhone ?? null,
          d.totalBeds, d.icuTotal, d.specializations, d.isEmtPartner,
        ],
      );
      ok(res, result.rows[0], 201);
    } catch (err) { next(err); }
  },
);

// ─────────────────────────────────────────────
// PATCH /v1/hospitals/:id — Update data rumah sakit (ADMIN)
// ─────────────────────────────────────────────
app.patch(
  '/v1/hospitals/:id',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const parsed = UpdateHospitalSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
        return;
      }
      const updates = parsed.data;
      if (Object.keys(updates).length === 0) {
        res.status(422).json(buildProblem(422, 'Validation Error', 'Tidak ada field yang diperbarui', req.path));
        return;
      }

      const pool = getPool();

      // Pastikan RS ada
      const existing = await pool.query<{ id: string }>('SELECT id FROM hospitals WHERE id = $1', [id]);
      if (!existing.rows[0]) {
        res.status(404).json(buildProblem(404, 'Not Found', `Rumah sakit ${id} tidak ditemukan`, req.path));
        return;
      }

      // Bangun SET clause dinamis
      const sets: string[] = [];
      const params: unknown[] = [];

      const fieldMap: Record<string, string> = {
        name: 'name', type: 'type', address: 'address', city: 'city',
        province: 'province', phone: 'phone', email: 'email', igdPhone: 'igd_phone',
        totalBeds: 'total_beds', icuTotal: 'icu_total',
        specializations: 'specializations', isEmtPartner: 'is_emt_partner',
        isActive: 'is_active', latitude: 'latitude', longitude: 'longitude',
      };

      for (const [key, col] of Object.entries(fieldMap)) {
        if (key in updates) {
          const val = (updates as Record<string, unknown>)[key];
          sets.push(`${col} = $${params.push(val)}`);
        }
      }
      sets.push(`updated_at = NOW()`);
      params.push(id);

      const result = await pool.query(
        `UPDATE hospitals SET ${sets.join(', ')} WHERE id = $${params.length}
         RETURNING id, name, type, address, city, province, phone, igd_phone,
                   total_beds, available_beds, icu_total, icu_available,
                   specializations, is_emt_partner, is_active, latitude, longitude, updated_at`,
        params,
      );

      ok(res, result.rows[0]);
    } catch (err) { next(err); }
  },
);

// ─────────────────────────────────────────────
// DELETE /v1/hospitals/:id — Nonaktifkan RS (soft-delete, ADMIN)
// ─────────────────────────────────────────────
app.delete(
  '/v1/hospitals/:id',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await getPool().query(
        "UPDATE hospitals SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id, name, is_active",
        [id],
      );
      if (!result.rows[0]) {
        res.status(404).json(buildProblem(404, 'Not Found', `Rumah sakit ${id} tidak ditemukan`, req.path));
        return;
      }
      ok(res, { ...result.rows[0], message: 'Rumah sakit berhasil dinonaktifkan' });
    } catch (err) { next(err); }
  },
);

// ─────────────────────────────────────────────
// GET /v1/doctors/me — Doctor profile for the doctor app
// ─────────────────────────────────────────────
app.get(
  '/v1/doctors/me',
  authenticate,
  requireRole('DOCTOR'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as AuthRequest).user;
      const result = await getPool().query(
        `SELECT d.id, d.user_id, d.str_number, d.sip_number, d.specialization,
                d.sub_specialization, d.hospital_id, d.years_experience,
                d.education, d.bio, d.consultation_fee, d.is_available,
                d.rating_avg, d.rating_count, d.str_verified_at, d.sip_verified_at,
                u.email, u.phone, u.status AS user_status, h.name AS hospital_name
         FROM doctors d
         JOIN users u ON u.id = d.user_id
         LEFT JOIN hospitals h ON h.id = d.hospital_id
         WHERE d.user_id = $1`,
        [user.sub],
      );
      if (!result.rows[0]) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Doctor profile not found', req.path));
        return;
      }
      ok(res, result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────
// PATCH /v1/doctors/me/availability
// ─────────────────────────────────────────────
app.patch(
  '/v1/doctors/me/availability',
  authenticate,
  requireRole('DOCTOR'),
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = UpdateDoctorAvailabilitySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(buildProblem(422, 'Validation Error', 'isAvailable must be boolean', req.path));
      return;
    }
    try {
      const user = (req as AuthRequest).user;
      const result = await getPool().query(
        `UPDATE doctors SET is_available = $1, updated_at = NOW()
         WHERE user_id = $2
         RETURNING id, user_id, is_available, updated_at`,
        [parsed.data.isAvailable, user.sub],
      );
      if (!result.rows[0]) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Doctor profile not found', req.path));
        return;
      }
      ok(res, result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────
// GET /v1/doctors — List semua dokter (ADMIN)
// ─────────────────────────────────────────────
app.get(
  '/v1/doctors',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page  = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10));
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '20'), 10)));
      const q     = typeof req.query['q'] === 'string' ? req.query['q'].trim() : '';

      const offset = (page - 1) * limit;
      const params: unknown[] = [];
      const conditions: string[] = [];

      if (q) {
        const qParam = `%${q}%`;
        conditions.push(
          `(INITCAP(REPLACE(SPLIT_PART(u.email, '@', 1), '.', ' ')) ILIKE $${params.push(qParam)}`
          + ` OR u.email ILIKE $${params.push(qParam)}`
          + ` OR d.specialization ILIKE $${params.push(qParam)})`,
        );
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const [dataRes, countRes] = await Promise.all([
        getPool().query(
          `SELECT d.id, d.user_id, d.str_number, d.sip_number, d.specialization, d.sub_specialization,
                  d.hospital_id, d.years_experience, d.consultation_fee, d.is_available,
                  d.rating_avg, d.rating_count, d.created_at,
                  INITCAP(REPLACE(SPLIT_PART(u.email, '@', 1), '.', ' ')) AS name,
                  u.email, u.phone, u.status AS user_status,
                  h.name AS hospital_name
           FROM doctors d
           JOIN users u ON u.id = d.user_id
           LEFT JOIN hospitals h ON h.id = d.hospital_id
           ${where}
           ORDER BY d.specialization, u.email
           LIMIT $${params.push(limit)} OFFSET $${params.push(offset)}`,
          params,
        ),
        getPool().query<{ count: string }>(
          `SELECT COUNT(*) FROM doctors d JOIN users u ON u.id = d.user_id ${where}`,
          params.slice(0, params.length - 2),
        ),
      ]);

      res.json({
        data: dataRes.rows,
        meta: {
          page, limit,
          total: parseInt(countRes.rows[0]?.count ?? '0', 10),
          totalPages: Math.ceil(parseInt(countRes.rows[0]?.count ?? '0', 10) / limit),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) { next(err); }
  },
);

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
