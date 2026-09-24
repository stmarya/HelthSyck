import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
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

const PORT = Number.parseInt(process.env['PORT'] ?? '3008', 10);
const SERVICE_NAME = 'pharmacy-service';
const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

type Queryable = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const raw = jwt.verify(header.slice(7), process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production');
      if (raw && typeof raw === 'object' && 'sub' in raw) (req as AuthenticatedRequest).user = raw as AuthenticatedRequest['user'];
    } catch { /* Public routes remain public when an optional token is invalid. */ }
  }
  next();
}

const PharmacyListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  includeInactive: z.enum(['true', 'false']).optional(),
});
const SearchPharmacySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius_km: z.coerce.number().min(1).max(50).default(10),
});
const UpdateInventorySchema = z.object({
  drugId: z.string().uuid(), stockQty: z.number().int().min(0), unitPrice: z.number().positive(),
  batchNumber: z.string().trim().max(100).optional(), expiresAt: z.string().date().optional(),
});
const AdjustStockSchema = z.object({
  drugId: z.string().uuid(), delta: z.number().int().refine((value) => value !== 0, 'delta must not be zero'),
  reason: z.string().trim().min(3).max(500),
});
const DrugSearchSchema = z.object({
  q: z.string().trim().min(2).max(100), page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const CreatePharmacySchema = z.object({
  name: z.string().trim().min(2).max(255), license_number: z.string().trim().min(3).max(100),
  address: z.string().trim().min(5), phone: z.string().trim().max(20).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(), longitude: z.coerce.number().min(-180).max(180).optional(),
  operating_hours: z.record(z.object({ open: z.string(), close: z.string() })).optional(),
});
const UpdatePharmacySchema = CreatePharmacySchema.partial();

async function assigned(db: Queryable, userId: string, pharmacyId: string): Promise<boolean> {
  const result = await db.query(
    'SELECT 1 FROM pharmacy_staff WHERE user_id=$1 AND pharmacy_id=$2 AND is_active=TRUE',
    [userId, pharmacyId],
  );
  return Boolean(result.rows[0]);
}

async function canManage(db: Queryable, actor: AuthenticatedRequest['user'], pharmacyId: string): Promise<boolean> {
  return actor.role === 'ADMIN' || (actor.role === 'PHARMACIST' && await assigned(db, actor.sub, pharmacyId));
}

function invalid(req: Request, res: Response, detail: string): void {
  res.status(422).json(buildProblem(422, 'Validation Error', detail, req.path, (req as AuthenticatedRequest).requestId));
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

app.get('/v1/pharmacies', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  const parsed = PharmacyListSchema.safeParse(req.query);
  if (!parsed.success) return invalid(req, res, parsed.error.issues[0]?.message ?? 'Invalid query');
  const { page, limit, q } = parsed.data;
  const includeInactive = authReq.user.role === 'ADMIN' && parsed.data.includeInactive !== 'false';
  const params: unknown[] = [];
  const conditions: string[] = [];
  if (!includeInactive) conditions.push('p.is_active=TRUE');
  if (q) {
    params.push(`%${q}%`);
    conditions.push(`(p.name ILIKE $${params.length} OR p.address ILIKE $${params.length} OR p.license_number ILIKE $${params.length})`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    const count = await pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM pharmacies p ${where}`, params);
    const total = Number.parseInt(count.rows[0]?.count ?? '0', 10);
    const queryParams = [...params, limit, (page - 1) * limit];
    const data = await pool.query(
      `SELECT p.id,p.name,p.license_number,p.address,p.latitude,p.longitude,p.phone,p.operating_hours,p.is_active,
              COUNT(inventory.id)::int AS drug_count,
              COUNT(inventory.id) FILTER (WHERE inventory.stock_qty<=inventory.reorder_level)::int AS low_stock_count
       FROM pharmacies p LEFT JOIN pharmacy_inventory inventory ON inventory.pharmacy_id=p.id
       ${where} GROUP BY p.id ORDER BY p.is_active DESC,p.name
       LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`,
      queryParams,
    );
    paginated(res, data.rows, page, limit, total);
  } catch (error) { next(error); }
});

app.get('/v1/pharmacies/nearby', optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
  const parsed = SearchPharmacySchema.safeParse(req.query);
  if (!parsed.success) return invalid(req, res, parsed.error.issues[0]?.message ?? 'Invalid query');
  try {
    const result = await pool.query(
      `SELECT id,name,address,latitude,longitude,phone,
       earth_distance(ll_to_earth($1,$2),ll_to_earth(latitude,longitude))/1000 AS distance_km
       FROM pharmacies WHERE is_active=TRUE AND latitude IS NOT NULL AND longitude IS NOT NULL
       AND earth_distance(ll_to_earth($1,$2),ll_to_earth(latitude,longitude))<$3*1000
       ORDER BY distance_km LIMIT 20`,
      [parsed.data.lat, parsed.data.lng, parsed.data.radius_km],
    );
    ok(res, result.rows);
  } catch (error) { next(error); }
});

app.get('/v1/pharmacies/reports/summary', authenticate, requireRole('ADMIN'), async (_req, res, next) => {
  try {
    const pharmacies = await pool.query(
      `SELECT p.id,p.name,p.license_number,p.is_active,
       COUNT(i.id)::int AS drug_count,COALESCE(SUM(i.stock_qty),0)::int AS total_units,
       COUNT(i.id) FILTER (WHERE i.stock_qty<=i.reorder_level)::int AS low_stock_count,
       COUNT(i.id) FILTER (WHERE i.expires_at<CURRENT_DATE)::int AS expired_count,
       COUNT(i.id) FILTER (WHERE i.expires_at BETWEEN CURRENT_DATE AND CURRENT_DATE+30)::int AS expiring_soon_count,
       COALESCE(SUM(i.stock_qty*i.unit_price),0)::numeric AS total_value
       FROM pharmacies p LEFT JOIN pharmacy_inventory i ON i.pharmacy_id=p.id
       GROUP BY p.id ORDER BY p.name`,
    );
    const totals = await pool.query(
      `SELECT COUNT(DISTINCT p.id)::int AS pharmacy_count,COUNT(i.id)::int AS drug_count,
       COALESCE(SUM(i.stock_qty),0)::int AS total_units,
       COUNT(i.id) FILTER (WHERE i.stock_qty<=i.reorder_level)::int AS low_stock_count,
       COUNT(i.id) FILTER (WHERE i.expires_at<CURRENT_DATE)::int AS expired_count,
       COUNT(i.id) FILTER (WHERE i.expires_at BETWEEN CURRENT_DATE AND CURRENT_DATE+30)::int AS expiring_soon_count,
       COALESCE(SUM(i.stock_qty*i.unit_price),0)::numeric AS total_value
       FROM pharmacies p LEFT JOIN pharmacy_inventory i ON i.pharmacy_id=p.id`,
    );
    const topDrugs = await pool.query(
      `SELECT d.id,d.generic_name,d.brand_name,COALESCE(SUM(i.stock_qty),0)::int AS total_units,
       COALESCE(SUM(i.stock_qty*i.unit_price),0)::numeric AS total_value
       FROM pharmacy_inventory i JOIN drugs d ON d.id=i.drug_id
       GROUP BY d.id ORDER BY total_value DESC LIMIT 10`,
    );
    ok(res, { pharmacies: pharmacies.rows, totals: totals.rows[0], topDrugs: topDrugs.rows, generatedAt: new Date().toISOString() });
  } catch (error) { next(error); }
});

app.get('/v1/pharmacies/:id', optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      `SELECT p.*,COUNT(i.id)::int AS drug_count,
       COUNT(i.id) FILTER (WHERE i.stock_qty<=i.reorder_level)::int AS low_stock_count
       FROM pharmacies p LEFT JOIN pharmacy_inventory i ON i.pharmacy_id=p.id
       WHERE p.id=$1 GROUP BY p.id`, [req.params['id']],
    );
    if (!result.rows[0]) {
      res.status(404).json(buildProblem(404, 'Not Found', 'Pharmacy not found', req.path, (req as AuthenticatedRequest).requestId));
      return;
    }
    ok(res, result.rows[0]);
  } catch (error) { next(error); }
});

app.get('/v1/pharmacies/:id/inventory', authenticate, requireRole('PHARMACIST', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  try {
    if (!(await canManage(pool, authReq.user, req.params['id']!))) {
      res.status(403).json(buildProblem(403, 'Forbidden', 'You are not assigned to this pharmacy', req.path, authReq.requestId));
      return;
    }
    const result = await pool.query(
      `SELECT i.*,d.generic_name,d.brand_name,d.dosage_form,d.strength,d.drug_class,
       (i.stock_qty<=i.reorder_level) AS is_low_stock
       FROM pharmacy_inventory i JOIN drugs d ON d.id=i.drug_id
       WHERE i.pharmacy_id=$1 ORDER BY d.generic_name,i.expires_at NULLS LAST`, [req.params['id']],
    );
    ok(res, result.rows);
  } catch (error) { next(error); }
});

app.put('/v1/pharmacies/:id/inventory', authenticate, requireRole('PHARMACIST', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  const parsed = UpdateInventorySchema.safeParse(req.body);
  if (!parsed.success) return invalid(req, res, parsed.error.issues[0]?.message ?? 'Invalid input');
  try {
    if (!(await canManage(pool, authReq.user, req.params['id']!))) {
      res.status(403).json(buildProblem(403, 'Forbidden', 'You are not assigned to this pharmacy', req.path, authReq.requestId));
      return;
    }
    const result = await pool.query(
      `INSERT INTO pharmacy_inventory (pharmacy_id,drug_id,stock_qty,unit_price,batch_number,expires_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (pharmacy_id,drug_id,batch_number)
       DO UPDATE SET stock_qty=EXCLUDED.stock_qty,unit_price=EXCLUDED.unit_price,expires_at=EXCLUDED.expires_at,updated_at=NOW()
       RETURNING *`,
      [req.params['id'], parsed.data.drugId, parsed.data.stockQty, parsed.data.unitPrice, parsed.data.batchNumber ?? null, parsed.data.expiresAt ?? null],
    );
    ok(res, result.rows[0]);
  } catch (error) { next(error); }
});

app.post('/v1/pharmacies/:id/inventory/adjust', authenticate, requireRole('PHARMACIST', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  const parsed = AdjustStockSchema.safeParse(req.body);
  if (!parsed.success) return invalid(req, res, parsed.error.issues[0]?.message ?? 'Invalid input');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!(await canManage(client, authReq.user, req.params['id']!))) {
      await client.query('ROLLBACK');
      res.status(403).json(buildProblem(403, 'Forbidden', 'You are not assigned to this pharmacy', req.path, authReq.requestId));
      return;
    }
    const batches = await client.query<{ id: string; stock_qty: number }>(
      `SELECT id,stock_qty FROM pharmacy_inventory WHERE pharmacy_id=$1 AND drug_id=$2
       ORDER BY expires_at ASC NULLS LAST,updated_at ASC,id ASC FOR UPDATE`,
      [req.params['id'], parsed.data.drugId],
    );
    if (batches.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json(buildProblem(404, 'Not Found', 'Inventory item not found', req.path, authReq.requestId));
      return;
    }
    const current = batches.rows.reduce((sum, batch) => sum + batch.stock_qty, 0);
    if (current + parsed.data.delta < 0) {
      await client.query('ROLLBACK');
      invalid(req, res, 'Insufficient stock for this adjustment');
      return;
    }
    if (parsed.data.delta > 0) {
      await client.query('UPDATE pharmacy_inventory SET stock_qty=stock_qty+$1,updated_at=NOW() WHERE id=$2', [parsed.data.delta, batches.rows[0]!.id]);
    } else {
      let remaining = Math.abs(parsed.data.delta);
      for (const batch of batches.rows) {
        if (remaining === 0) break;
        const deduction = Math.min(batch.stock_qty, remaining);
        await client.query('UPDATE pharmacy_inventory SET stock_qty=stock_qty-$1,updated_at=NOW() WHERE id=$2', [deduction, batch.id]);
        remaining -= deduction;
      }
    }
    const resulting = current + parsed.data.delta;
    await client.query(
      `INSERT INTO pharmacy_inventory_adjustments (pharmacy_id,drug_id,actor_user_id,delta,reason,resulting_stock)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.params['id'], parsed.data.drugId, authReq.user.sub, parsed.data.delta, parsed.data.reason, resulting],
    );
    await client.query('COMMIT');
    ok(res, { pharmacyId: req.params['id'], drugId: parsed.data.drugId, delta: parsed.data.delta, reason: parsed.data.reason, newStockQty: resulting });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally { client.release(); }
});

app.get('/v1/drugs/search', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  const parsed = DrugSearchSchema.safeParse(req.query);
  if (!parsed.success) return invalid(req, res, parsed.error.issues[0]?.message ?? 'Search query must be at least 2 characters');
  const { q, page, limit } = parsed.data;
  try {
    const count = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM drugs WHERE generic_name ILIKE $1 OR brand_name ILIKE $1`, [`%${q}%`],
    );
    const total = Number.parseInt(count.rows[0]?.count ?? '0', 10);
    const result = await pool.query(
      `SELECT id,generic_name,brand_name,dosage_form,strength,unit,drug_class,requires_prescription
       FROM drugs WHERE generic_name ILIKE $1 OR brand_name ILIKE $1
       ORDER BY generic_name LIMIT $2 OFFSET $3`, [`%${q}%`, limit, (page - 1) * limit],
    );
    paginated(res, result.rows, page, limit, total);
  } catch (error) { next(error); }
});

app.get('/v1/drugs/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query('SELECT * FROM drugs WHERE id=$1', [req.params['id']]);
    if (!result.rows[0]) {
      res.status(404).json(buildProblem(404, 'Not Found', 'Drug not found', req.path, (req as AuthenticatedRequest).requestId));
      return;
    }
    ok(res, result.rows[0]);
  } catch (error) { next(error); }
});

app.post('/v1/pharmacies', authenticate, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  const parsed = CreatePharmacySchema.safeParse(req.body);
  if (!parsed.success) return invalid(req, res, parsed.error.issues[0]?.message ?? 'Invalid input');
  const value = parsed.data;
  try {
    const result = await pool.query(
      `INSERT INTO pharmacies (name,license_number,address,phone,latitude,longitude,operating_hours)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [value.name, value.license_number, value.address, value.phone ?? null, value.latitude ?? null, value.longitude ?? null, value.operating_hours ? JSON.stringify(value.operating_hours) : null],
    );
    ok(res, result.rows[0], 201);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      res.status(409).json(buildProblem(409, 'Conflict', 'Nomor SIA apotek sudah terdaftar', req.path, authReq.requestId));
      return;
    }
    next(error);
  }
});

app.patch('/v1/pharmacies/:id', authenticate, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  const parsed = UpdatePharmacySchema.safeParse(req.body);
  if (!parsed.success) return invalid(req, res, parsed.error.issues[0]?.message ?? 'Invalid input');
  const keys = Object.keys(parsed.data) as Array<keyof typeof parsed.data>;
  if (keys.length === 0) return invalid(req, res, 'Tidak ada field yang diupdate');
  const values = keys.map((key) => key === 'operating_hours' ? JSON.stringify(parsed.data[key]) : parsed.data[key] ?? null);
  const sets = keys.map((key, index) => `${key}=$${index + 1}`);
  values.push(req.params['id']);
  try {
    const result = await pool.query(
      `UPDATE pharmacies SET ${sets.join(',')},updated_at=NOW() WHERE id=$${values.length} RETURNING *`, values,
    );
    if (!result.rows[0]) {
      res.status(404).json(buildProblem(404, 'Not Found', 'Apotek tidak ditemukan', req.path, (req as AuthenticatedRequest).requestId));
      return;
    }
    ok(res, result.rows[0]);
  } catch (error) { next(error); }
});

app.delete('/v1/pharmacies/:id/deactivate', authenticate, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      'UPDATE pharmacies SET is_active=FALSE,updated_at=NOW() WHERE id=$1 AND is_active=TRUE RETURNING id', [req.params['id']],
    );
    if (!result.rows[0]) {
      res.status(404).json(buildProblem(404, 'Not Found', 'Apotek tidak ditemukan atau sudah nonaktif', req.path, (req as AuthenticatedRequest).requestId));
      return;
    }
    res.status(204).send();
  } catch (error) { next(error); }
});

app.use(errorHandler(SERVICE_NAME));
if (!process.env['JEST_WORKER_ID']) {
  const server = app.listen(PORT, () => console.log(`[${SERVICE_NAME}] Listening on port ${PORT}`));
  process.on('SIGTERM', () => server.close(() => { void pool.end().finally(() => process.exit(0)); }));
}
export default app;
