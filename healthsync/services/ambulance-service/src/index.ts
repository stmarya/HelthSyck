import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z, ZodError } from 'zod';
import { Pool, PoolClient } from 'pg';
import Redis from 'ioredis';

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────
const PORT = parseInt(process.env['PORT'] ?? '3005', 10);
const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production';
const SERVICE_NAME = 'ambulance-service';

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
// Redis singleton
// ─────────────────────────────────────────────
let _redis: Redis | null = null;
function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
    _redis.on('error', (err: Error) => console.error(`[${SERVICE_NAME}] Redis error:`, err.message));
  }
  return _redis;
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
// Ambulance status machine
// ─────────────────────────────────────────────
type AmbulanceStatus =
  | 'OFFLINE'
  | 'AVAILABLE'
  | 'DISPATCHED'
  | 'EN_ROUTE'
  | 'AT_SCENE'
  | 'TRANSPORTING'
  | 'RETURNING';

const VALID_TRANSITIONS: Record<AmbulanceStatus, AmbulanceStatus[]> = {
  OFFLINE:      ['AVAILABLE'],
  AVAILABLE:    ['DISPATCHED', 'OFFLINE'],
  DISPATCHED:   ['EN_ROUTE'],
  EN_ROUTE:     ['AT_SCENE'],
  AT_SCENE:     ['TRANSPORTING'],
  TRANSPORTING: ['RETURNING'],
  RETURNING:    ['AVAILABLE', 'OFFLINE'],
};

function isValidTransition(from: AmbulanceStatus, to: AmbulanceStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────
const DispatchSchema = z.object({
  ambulanceId: z.string().uuid(),
  patientId: z.string().uuid(),
  destination: z.string().min(1),
  notes: z.string().optional(),
});

const UpdateLocationSchema = z.object({
  latitude:  z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  heading:   z.number().min(0).max(360).optional(),
  speedKmh:  z.number().min(0).max(200).optional(),
});

const UpdateStatusSchema = z.object({
  status: z.enum(['OFFLINE', 'AVAILABLE', 'DISPATCHED', 'EN_ROUTE', 'AT_SCENE', 'TRANSPORTING', 'RETURNING']),
});

const FindNearbySchema = z.object({
  lat:        z.coerce.number().min(-90).max(90),
  lng:        z.coerce.number().min(-180).max(180),
  hospitalId: z.string().uuid().optional(),
  maxResults: z.coerce.number().int().min(1).max(20).default(5),
});

const ListAmbulancesSchema = z.object({
  hospitalId: z.string().uuid().optional(),
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(100).default(20),
});

const CreateAmbulanceSchema = z.object({
  hospitalId:  z.string().uuid(),
  plateNumber: z.string().min(3).max(20),
  type:        z.enum(['BLS', 'ALS', 'NICU']).default('BLS'),
  driverId:    z.string().uuid().optional(),
  latitude:    z.number().min(-90).max(90).optional(),
  longitude:   z.number().min(-180).max(180).optional(),
});

const UpdateAmbulanceSchema = z.object({
  hospitalId:  z.string().uuid().optional(),
  plateNumber: z.string().min(3).max(20).optional(),
  type:        z.enum(['BLS', 'ALS', 'NICU']).optional(),
  driverId:    z.string().uuid().nullable().optional(),
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

// Redis geo key for available ambulances
const GEO_KEY = 'amb:available';

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

/** Non-blocking — attaches req.user if token valid, always proceeds */
function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as JwtPayload;
      (req as AuthRequest).user = payload;
    } catch { /* ignore */ }
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
  let redisOk = false;
  try { await getPool().query('SELECT 1'); dbOk = true; } catch { /* swallowed */ }
  try { await getRedis().ping(); redisOk = true; } catch { /* swallowed */ }
  res.json({ status: 'ok', service: SERVICE_NAME, db: dbOk, redis: redisOk, timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────────
// GET /v1/ambulances — List (COMMAND_CENTER/ADMIN)
// ─────────────────────────────────────────────
app.get(
  '/v1/ambulances',
  authenticate,
  requireRole('COMMAND_CENTER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter = ListAmbulancesSchema.safeParse(req.query);
      if (!filter.success) {
        res.status(422).json(buildProblem(422, 'Validation Error', filter.error.issues[0]?.message ?? 'Invalid query', req.path));
        return;
      }

      const { hospitalId, page, limit } = filter.data;
      const offset = (page - 1) * limit;
      const pool = getPool();

      const params: unknown[] = [];
      const conditions: string[] = ['a.is_active = TRUE'];
      if (hospitalId) {
        conditions.push(`a.hospital_id = $${params.push(hospitalId)}`);
      }

      const whereClause = conditions.join(' AND ');

      const [dataRes, countRes] = await Promise.all([
        pool.query(
          `SELECT a.id, a.plate_number, a.type, a.status, a.hospital_id, a.driver_id,
                  a.latitude, a.longitude, a.heading, a.speed_kmh, a.last_location_at,
                  h.name AS hospital_name,
                  u.phone AS driver_phone
           FROM ambulances a
           LEFT JOIN hospitals h ON h.id = a.hospital_id
           LEFT JOIN users u ON u.id = a.driver_id
           WHERE ${whereClause}
           ORDER BY a.status, a.plate_number
           LIMIT $${params.push(limit)} OFFSET $${params.push(offset)}`,
          params,
        ),
        pool.query<{ count: string }>(
          `SELECT COUNT(*) FROM ambulances a WHERE ${whereClause}`,
          params.slice(0, params.length - 2), // tanpa limit & offset
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
// GET /v1/ambulances/nearby — Find nearest available
// NOTE: must be registered before /:id
// ─────────────────────────────────────────────
app.get('/v1/ambulances/nearby', optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = FindNearbySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid query', req.path));
      return;
    }
    const { lat, lng, hospitalId, maxResults } = parsed.data;

    const params: unknown[] = [lat, lng, maxResults];
    const conditions: string[] = ["a.status = 'AVAILABLE'", 'a.is_active = TRUE', 'a.latitude IS NOT NULL'];

    if (hospitalId) {
      conditions.push(`a.hospital_id = $${params.push(hospitalId)}`);
    }

    const result = await getPool().query(
      `SELECT a.id, a.plate_number, a.status, a.latitude, a.longitude,
              earth_distance(ll_to_earth($1, $2), ll_to_earth(a.latitude, a.longitude)) / 1000      AS distance_km,
              earth_distance(ll_to_earth($1, $2), ll_to_earth(a.latitude, a.longitude)) / 1000 / 50 * 60 AS eta_minutes
       FROM ambulances a
       WHERE ${conditions.join(' AND ')}
       ORDER BY distance_km ASC
       LIMIT $3`,
      params,
    );
    ok(res, result.rows);
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// GET /v1/ambulances/:id — Detail + recent locations
// ─────────────────────────────────────────────
app.get('/v1/ambulances/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const pool = getPool();

    const [ambRes, locRes] = await Promise.all([
      pool.query(
        `SELECT a.id, a.plate_number, a.status, a.hospital_id, a.driver_id,
                a.latitude, a.longitude, a.heading, a.speed_kmh, a.last_location_at,
                h.name AS hospital_name, u.phone AS driver_phone
         FROM ambulances a
         LEFT JOIN hospitals h ON h.id = a.hospital_id
         LEFT JOIN users u ON u.id = a.driver_id
         WHERE a.id = $1`,
        [id],
      ),
      pool.query(
        `SELECT latitude, longitude, heading, speed_kmh, recorded_at
         FROM ambulance_locations WHERE ambulance_id = $1 ORDER BY recorded_at DESC LIMIT 100`,
        [id],
      ),
    ]);

    if (!ambRes.rows[0]) {
      res.status(404).json(buildProblem(404, 'Not Found', `Ambulance ${id} not found`, req.path));
      return;
    }

    ok(res, { ...ambRes.rows[0], recentLocations: locRes.rows });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// POST /v1/ambulances/:id/dispatch — Dispatch (COMMAND_CENTER)
// ─────────────────────────────────────────────
app.post(
  '/v1/ambulances/:id/dispatch',
  authenticate,
  requireRole('COMMAND_CENTER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const parsed = DispatchSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
        return;
      }

      const dispatchRecord = await withTransaction(async (client) => {
        const ambRow = await client.query<{ id: string; status: string }>(
          "SELECT id, status FROM ambulances WHERE id = $1 AND is_active = TRUE",
          [id],
        );
        if (!ambRow.rows[0]) return null;
        if (ambRow.rows[0].status !== 'AVAILABLE') {
          throw Object.assign(new Error('Ambulance is not available for dispatch'), { httpStatus: 409 });
        }

        await client.query(
          "UPDATE ambulances SET status = 'DISPATCHED', updated_at = NOW() WHERE id = $1",
          [id],
        );

        return { ambulanceId: id, patientId: parsed.data.patientId, destination: parsed.data.destination, notes: parsed.data.notes, dispatchedAt: new Date().toISOString() };
      });

      if (!dispatchRecord) {
        res.status(404).json(buildProblem(404, 'Not Found', `Ambulance ${id} not found`, req.path));
        return;
      }

      // Cache dispatch in Redis for 24 hours
      try {
        await getRedis().setex(
          `amb:dispatch:${id}`,
          86400,
          JSON.stringify(dispatchRecord),
        );
        // Remove from available geo set
        await getRedis().zrem(GEO_KEY, id);
      } catch (redisErr) {
        console.error(`[${SERVICE_NAME}] Redis dispatch cache error:`, redisErr);
      }

      ok(res, dispatchRecord, 201);
    } catch (err) {
      const e = err as Error & { httpStatus?: number };
      if (e.httpStatus === 409) {
        res.status(409).json(buildProblem(409, 'Conflict', e.message, req.path));
        return;
      }
      next(err);
    }
  },
);

// ─────────────────────────────────────────────
// PUT /v1/ambulances/:id/status — Update status (AMBULANCE_DRIVER)
// ─────────────────────────────────────────────
app.put(
  '/v1/ambulances/:id/status',
  authenticate,
  requireRole('AMBULANCE_DRIVER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const caller = (req as AuthRequest).user.sub;

      const parsed = UpdateStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
        return;
      }
      const newStatus = parsed.data.status as AmbulanceStatus;

      const pool = getPool();

      // Verify ownership
      const ambRow = await pool.query<{ id: string; status: string; driver_id: string; latitude: number | null; longitude: number | null }>(
        'SELECT id, status, driver_id, latitude, longitude FROM ambulances WHERE id = $1',
        [id],
      );
      if (!ambRow.rows[0]) {
        res.status(404).json(buildProblem(404, 'Not Found', `Ambulance ${id} not found`, req.path));
        return;
      }
      if (ambRow.rows[0].driver_id !== caller) {
        res.status(403).json(buildProblem(403, 'Forbidden', 'You are not the assigned driver for this ambulance', req.path));
        return;
      }

      const currentStatus = ambRow.rows[0].status as AmbulanceStatus;
      if (!isValidTransition(currentStatus, newStatus)) {
        res.status(422).json(buildProblem(
          422, 'Validation Error',
          `Invalid status transition: ${currentStatus} → ${newStatus}`,
          req.path,
        ));
        return;
      }

      await pool.query(
        'UPDATE ambulances SET status = $1, updated_at = NOW() WHERE id = $2 AND driver_id = $3',
        [newStatus, id, caller],
      );

      // Maintain Redis geo index
      const redis = getRedis();
      try {
        if (newStatus === 'AVAILABLE' && ambRow.rows[0].latitude !== null && ambRow.rows[0].longitude !== null) {
          await redis.geoadd(GEO_KEY, ambRow.rows[0].longitude, ambRow.rows[0].latitude, id);
        } else {
          await redis.zrem(GEO_KEY, id);
        }
      } catch (redisErr) {
        console.error(`[${SERVICE_NAME}] Redis geo index error:`, redisErr);
      }

      ok(res, { id, status: newStatus, updatedAt: new Date().toISOString() });
    } catch (err) { next(err); }
  },
);

// ─────────────────────────────────────────────
// POST /v1/ambulances/:id/location — Update GPS (AMBULANCE_DRIVER)
// ─────────────────────────────────────────────
app.post(
  '/v1/ambulances/:id/location',
  authenticate,
  requireRole('AMBULANCE_DRIVER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const caller = (req as AuthRequest).user.sub;

      const parsed = UpdateLocationSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
        return;
      }
      const { latitude, longitude, heading, speedKmh } = parsed.data;

      const ambRow = await getPool().query<{ driver_id: string; status: string }>(
        'SELECT driver_id, status FROM ambulances WHERE id = $1',
        [id],
      );
      if (!ambRow.rows[0]) {
        res.status(404).json(buildProblem(404, 'Not Found', `Ambulance ${id} not found`, req.path));
        return;
      }
      if (ambRow.rows[0].driver_id !== caller) {
        res.status(403).json(buildProblem(403, 'Forbidden', 'You are not the assigned driver for this ambulance', req.path));
        return;
      }

      await withTransaction(async (client) => {
        await client.query(
          `UPDATE ambulances
           SET latitude = $1, longitude = $2, heading = $3, speed_kmh = $4, last_location_at = NOW(), updated_at = NOW()
           WHERE id = $5`,
          [latitude, longitude, heading ?? null, speedKmh ?? null, id],
        );
        // Catatan: ambulance_locations adalah hypertable TimescaleDB, tidak memiliki kolom id
        await client.query(
          `INSERT INTO ambulance_locations (ambulance_id, latitude, longitude, heading, speed_kmh)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, latitude, longitude, heading ?? null, speedKmh ?? null],
        );
      });

      // Keep geo index up-to-date if ambulance is available
      if (ambRow.rows[0].status === 'AVAILABLE') {
        try {
          await getRedis().geoadd(GEO_KEY, longitude, latitude, id);
        } catch (redisErr) {
          console.error(`[${SERVICE_NAME}] Redis geoadd error:`, redisErr);
        }
      }

      res.status(204).end();
    } catch (err) { next(err); }
  },
);

// ─────────────────────────────────────────────
// GET /v1/ambulances/:id/location/history — Location history
// ─────────────────────────────────────────────
app.get('/v1/ambulances/:id/location/history', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const result = await getPool().query(
      `SELECT latitude, longitude, heading, speed_kmh, recorded_at
       FROM ambulance_locations
       WHERE ambulance_id = $1
         AND recorded_at > NOW() - INTERVAL '24 hours'
       ORDER BY recorded_at DESC
       LIMIT 1000`,
      [id],
    );
    ok(res, result.rows);
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// POST /v1/ambulances — Daftarkan ambulans baru (ADMIN)
// ─────────────────────────────────────────────
app.post(
  '/v1/ambulances',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = CreateAmbulanceSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json(buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path));
        return;
      }
      const { hospitalId, plateNumber, type, driverId, latitude, longitude } = parsed.data;
      const pool = getPool();

      // Cek duplikat plat nomor
      const dup = await pool.query<{ id: string }>('SELECT id FROM ambulances WHERE plate_number = $1', [plateNumber]);
      if (dup.rows[0]) {
        res.status(409).json(buildProblem(409, 'Conflict', `Plat nomor ${plateNumber} sudah terdaftar`, req.path));
        return;
      }

      // Cek hospital ada
      const hosp = await pool.query<{ id: string }>('SELECT id FROM hospitals WHERE id = $1', [hospitalId]);
      if (!hosp.rows[0]) {
        res.status(404).json(buildProblem(404, 'Not Found', `Rumah sakit ${hospitalId} tidak ditemukan`, req.path));
        return;
      }

      const result = await pool.query(
        `INSERT INTO ambulances
           (id, hospital_id, plate_number, type, status, driver_id, latitude, longitude, is_active)
         VALUES ($1, $2, $3, $4, 'OFFLINE', $5, $6, $7, TRUE)
         RETURNING id, hospital_id, plate_number, type, status, driver_id, latitude, longitude, is_active, created_at`,
        [crypto.randomUUID(), hospitalId, plateNumber, type, driverId ?? null, latitude ?? null, longitude ?? null],
      );

      ok(res, result.rows[0], 201);
    } catch (err) { next(err); }
  },
);

// ─────────────────────────────────────────────
// PATCH /v1/ambulances/:id — Update info ambulans (ADMIN)
// ─────────────────────────────────────────────
app.patch(
  '/v1/ambulances/:id',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const parsed = UpdateAmbulanceSchema.safeParse(req.body);
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

      // Cek ambulans ada
      const existing = await pool.query<{ id: string }>('SELECT id FROM ambulances WHERE id = $1', [id]);
      if (!existing.rows[0]) {
        res.status(404).json(buildProblem(404, 'Not Found', `Ambulans ${id} tidak ditemukan`, req.path));
        return;
      }

      // Bangun SET clause dinamis
      const sets: string[] = [];
      const params: unknown[] = [];

      if (updates.hospitalId !== undefined) {
        sets.push(`hospital_id = $${params.push(updates.hospitalId)}`);
      }
      if (updates.plateNumber !== undefined) {
        sets.push(`plate_number = $${params.push(updates.plateNumber)}`);
      }
      if (updates.type !== undefined) {
        sets.push(`type = $${params.push(updates.type)}`);
      }
      if (updates.driverId !== undefined) {
        sets.push(`driver_id = $${params.push(updates.driverId)}`);
      }
      sets.push(`updated_at = NOW()`);
      params.push(id);

      const result = await pool.query(
        `UPDATE ambulances SET ${sets.join(', ')} WHERE id = $${params.length}
         RETURNING id, hospital_id, plate_number, type, status, driver_id, latitude, longitude, updated_at`,
        params,
      );

      ok(res, result.rows[0]);
    } catch (err) { next(err); }
  },
);

// ─────────────────────────────────────────────
// DELETE /v1/ambulances/:id — Nonaktifkan ambulans (ADMIN)
// ─────────────────────────────────────────────
app.delete(
  '/v1/ambulances/:id',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const pool = getPool();

      const result = await pool.query(
        "UPDATE ambulances SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id, plate_number, is_active",
        [id],
      );
      if (!result.rows[0]) {
        res.status(404).json(buildProblem(404, 'Not Found', `Ambulans ${id} tidak ditemukan`, req.path));
        return;
      }

      // Hapus dari Redis geo index
      try { await getRedis().zrem(GEO_KEY, id); } catch { /* abaikan */ }

      ok(res, { ...result.rows[0], message: 'Ambulans berhasil dinonaktifkan' });
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
  const closeDb = _pool ? _pool.end() : Promise.resolve();
  const closeCache = _redis ? _redis.quit() : Promise.resolve('');
  Promise.all([closeDb, closeCache])
    .then(() => { console.log(`[${SERVICE_NAME}] Connections closed`); process.exit(0); })
    .catch(() => process.exit(1));
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

if (require.main === module) {
  app.listen(PORT, () => console.log(`[${SERVICE_NAME}] Listening on port ${PORT}`));
}

export default app;
