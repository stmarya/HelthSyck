import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { z } from 'zod';
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

/** Non-blocking auth — attaches req.user if token valid, always calls next() */
function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const raw = jwt.verify(
        authHeader.slice(7),
        process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production',
      );
      if (raw && typeof raw === 'object' && 'sub' in raw) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (req as AuthenticatedRequest).user = raw as any;
      }
    } catch { /* ignore */ }
  }
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env['PORT'] ?? '3008', 10);
const SERVICE_NAME = 'pharmacy-service';

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

const SearchPharmacySchema = z.object({
  lat:            z.coerce.number(),
  lng:            z.coerce.number(),
  radius_km:      z.coerce.number().min(1).max(50).default(10),
  specialization: z.string().optional(),
});

const UpdateInventorySchema = z.object({
  drugId:      z.string().uuid(),
  stockQty:    z.number().int().min(0),
  unitPrice:   z.number().positive(),
  batchNumber: z.string().optional(),
  expiresAt:   z.string().datetime().optional(),
});

const AdjustStockSchema = z.object({
  drugId: z.string().uuid(),
  delta:  z.number().int(),
  reason: z.string().min(1),
});

const AssignStaffSchema = z.object({
  userId: z.string().uuid(),
  isActive: z.boolean().default(true),
});

const PaginationSchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const DrugSearchSchema = z.object({
  q: z.string().min(2),
});

const CreatePharmacySchema = z.object({
  name:            z.string().min(2).max(255),
  license_number:  z.string().min(3).max(100),
  address:         z.string().min(5),
  phone:           z.string().max(20).optional(),
  latitude:        z.coerce.number().min(-90).max(90).optional(),
  longitude:       z.coerce.number().min(-180).max(180).optional(),
  operating_hours: z.record(z.object({ open: z.string(), close: z.string() })).optional(),
});

const UpdatePharmacySchema = CreatePharmacySchema.partial();

async function pharmacistCanAccess(pharmacyId: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1
     FROM pharmacy_staff
     WHERE pharmacy_id=$1 AND user_id=$2 AND is_active=TRUE
     LIMIT 1`,
    [pharmacyId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

async function writePharmacyAudit(
  pharmacyId: string,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO pharmacy_audit_logs
         (pharmacy_id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [pharmacyId, actorId, action, entityType, entityId, JSON.stringify(metadata)],
    );
  } catch (err) {
    // Auditing must never take down an inventory or assignment operation.
    console.error(`[${SERVICE_NAME}] audit write failed`, err);
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
// GET /v1/pharmacies — List pharmacies (paginated)
// ─────────────────────────────────────────────────────────────────────────────

app.get(
  '/v1/pharmacies',
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

    const { page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    try {
      const countResult = await pool.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM pharmacies WHERE is_active=TRUE',
      );
      const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

      const dataResult = await pool.query(
        `SELECT id, name, address, latitude, longitude, phone, operating_hours
         FROM pharmacies
         WHERE is_active=TRUE
         ORDER BY name
         LIMIT $1 OFFSET $2`,
        [limit, offset],
      );

      paginated(res, dataResult.rows, page, limit, total);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/pharmacies/nearby — Find nearby pharmacies
// ─────────────────────────────────────────────────────────────────────────────

app.get(
  '/v1/pharmacies/nearby',
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const parsed = SearchPharmacySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(422).json(
        buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid query', req.path, authReq.requestId),
      );
      return;
    }

    const { lat, lng, radius_km } = parsed.data;

    try {
      const result = await pool.query(
        `SELECT id, name, address, latitude, longitude,
                earth_distance(ll_to_earth($1,$2), ll_to_earth(latitude,longitude)) / 1000 AS distance_km
         FROM pharmacies
         WHERE is_active=TRUE
           AND earth_distance(ll_to_earth($1,$2), ll_to_earth(latitude,longitude)) < $3 * 1000
         ORDER BY distance_km ASC
         LIMIT 20`,
        [lat, lng, radius_km],
      );

      ok(res, result.rows);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/pharmacies/me — Get pharmacy mapped to current pharmacist
// ─────────────────────────────────────────────────────────────────────────────

app.get(
  '/v1/pharmacies/me',
  authenticate,
  requireRole('PHARMACIST'),
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const result = await pool.query(
        `SELECT p.*,
                ps.staff_role,
                (SELECT COUNT(*) FROM pharmacy_inventory pi WHERE pi.pharmacy_id=p.id) AS drug_count,
                (SELECT COUNT(*) FROM pharmacy_inventory pi WHERE pi.pharmacy_id=p.id AND pi.stock_qty <= pi.reorder_level) AS low_stock_count
         FROM pharmacies p
         JOIN pharmacy_staff ps ON ps.pharmacy_id=p.id
         WHERE ps.user_id=$1 AND ps.is_active=TRUE AND p.is_active=TRUE
         ORDER BY p.name
         LIMIT 1`,
        [authReq.user.sub],
      );

      if (result.rowCount === 0) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Akun apoteker belum dipetakan ke apotek', req.path, authReq.requestId));
        return;
      }

      ok(res, result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// GET /v1/pharmacies/:id/staff — List pharmacist assignments (ADMIN only)
app.get(
  '/v1/pharmacies/:id/staff',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        `SELECT ps.id,
                ps.pharmacy_id AS "pharmacyId",
                ps.user_id AS "userId",
                u.email,
                u.phone,
                ps.staff_role AS "staffRole",
                ps.is_active AS "isActive",
                ps.created_at AS "createdAt"
         FROM pharmacy_staff ps
         JOIN users u ON u.id=ps.user_id
         WHERE ps.pharmacy_id=$1
         ORDER BY ps.is_active DESC, u.email`,
        [req.params.id],
      );
      ok(res, result.rows);
    } catch (err) {
      next(err);
    }
  },
);

// PUT /v1/pharmacies/:id/staff — Assign or reactivate a pharmacist (ADMIN only)
app.put(
  '/v1/pharmacies/:id/staff',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const parsed = AssignStaffSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(
        buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path, authReq.requestId),
      );
      return;
    }

    try {
      const pharmacy = await pool.query(
        'SELECT id FROM pharmacies WHERE id=$1 AND is_active=TRUE',
        [req.params.id],
      );
      if (pharmacy.rowCount === 0) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Apotek tidak ditemukan atau nonaktif', req.path, authReq.requestId));
        return;
      }

      const user = await pool.query(
        `SELECT id FROM users
         WHERE id=$1 AND role='PHARMACIST'::user_role AND status='ACTIVE'::user_status`,
        [parsed.data.userId],
      );
      if (user.rowCount === 0) {
        res.status(422).json(buildProblem(422, 'Validation Error', 'Akun harus berupa apoteker aktif', req.path, authReq.requestId));
        return;
      }

      const result = await pool.query(
        `INSERT INTO pharmacy_staff (pharmacy_id, user_id, is_active)
         VALUES ($1, $2, $3)
         ON CONFLICT (pharmacy_id, user_id)
         DO UPDATE SET is_active=EXCLUDED.is_active
         RETURNING id, pharmacy_id AS "pharmacyId", user_id AS "userId", staff_role AS "staffRole",
                   is_active AS "isActive", created_at AS "createdAt"`,
        [req.params.id, parsed.data.userId, parsed.data.isActive],
      );

      await writePharmacyAudit(
        req.params.id,
        authReq.user.sub,
        parsed.data.isActive ? 'STAFF_ASSIGNED' : 'STAFF_DEACTIVATED',
        'pharmacy_staff',
        result.rows[0]?.id ?? null,
        { userId: parsed.data.userId },
      );
      ok(res, result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /v1/pharmacies/:id/staff/:userId — Deactivate a pharmacist assignment
app.delete(
  '/v1/pharmacies/:id/staff/:userId',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const result = await pool.query(
        `UPDATE pharmacy_staff
         SET is_active=FALSE
         WHERE pharmacy_id=$1 AND user_id=$2 AND is_active=TRUE
         RETURNING id`,
        [req.params.id, req.params.userId],
      );
      if (result.rowCount === 0) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Assignment apoteker tidak ditemukan', req.path, authReq.requestId));
        return;
      }

      await writePharmacyAudit(req.params.id, authReq.user.sub, 'STAFF_DEACTIVATED', 'pharmacy_staff', result.rows[0]!.id, {
        userId: req.params.userId,
      });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

// GET /v1/pharmacies/:id — Get pharmacy detail
app.get(
  '/v1/pharmacies/:id',
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;

    try {
      const pharmacyResult = await pool.query(
        `SELECT p.*,
                (SELECT COUNT(*) FROM pharmacy_inventory pi WHERE pi.pharmacy_id=p.id) AS drug_count,
                (SELECT COUNT(*) FROM pharmacy_inventory pi WHERE pi.pharmacy_id=p.id AND pi.stock_qty <= pi.reorder_level) AS low_stock_count
         FROM pharmacies p
         WHERE p.id=$1 AND p.is_active=TRUE`,
        [id],
      );

      if (pharmacyResult.rowCount === 0) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Pharmacy not found', req.path, authReq.requestId));
        return;
      }

      ok(res, pharmacyResult.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/pharmacies/:id/inventory — Get full inventory (PHARMACIST only)
// ─────────────────────────────────────────────────────────────────────────────

app.get(
  '/v1/pharmacies/:id/inventory',
  authenticate,
  requireRole('PHARMACIST', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;

    try {
      if (authReq.user.role === 'PHARMACIST' && !(await pharmacistCanAccess(id, authReq.user.sub))) {
        res.status(403).json(buildProblem(403, 'Forbidden', 'Apotek tidak terhubung ke akun ini', req.path, authReq.requestId));
        return;
      }

      const result = await pool.query(
        `SELECT pi.*, d.generic_name, d.brand_name, d.dosage_form, d.strength,
                (pi.stock_qty <= pi.reorder_level) AS is_low_stock
         FROM pharmacy_inventory pi
         JOIN drugs d ON d.id = pi.drug_id
         WHERE pi.pharmacy_id=$1
         ORDER BY d.generic_name`,
        [id],
      );

      ok(res, result.rows);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// PUT /v1/pharmacies/:id/inventory — Update inventory item (PHARMACIST only)
// ─────────────────────────────────────────────────────────────────────────────

app.put(
  '/v1/pharmacies/:id/inventory',
  authenticate,
  requireRole('PHARMACIST', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const parsed = UpdateInventorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(
        buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path, authReq.requestId),
      );
      return;
    }

    const { drugId, stockQty, unitPrice, batchNumber, expiresAt } = parsed.data;

    try {
      if (authReq.user.role === 'PHARMACIST' && !(await pharmacistCanAccess(id, authReq.user.sub))) {
        res.status(403).json(buildProblem(403, 'Forbidden', 'Apotek tidak terhubung ke akun ini', req.path, authReq.requestId));
        return;
      }

      const result = await pool.query(
        `INSERT INTO pharmacy_inventory
           (pharmacy_id, drug_id, stock_qty, unit_price, batch_number, expires_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (pharmacy_id, drug_id, batch_number)
         DO UPDATE SET stock_qty=$3, unit_price=$4, updated_at=NOW()
         RETURNING *`,
        [id, drugId, stockQty, unitPrice, batchNumber ?? null, expiresAt ?? null],
      );

      void writePharmacyAudit(id, authReq.user.sub, 'INVENTORY_UPDATED', 'pharmacy_inventory', result.rows[0]?.id ?? null, {
        drugId,
        stockQty,
        unitPrice,
      });
      ok(res, result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /v1/pharmacies/:id/inventory/adjust — Adjust stock (PHARMACIST only)
// ─────────────────────────────────────────────────────────────────────────────

app.post(
  '/v1/pharmacies/:id/inventory/adjust',
  authenticate,
  requireRole('PHARMACIST', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const parsed = AdjustStockSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(
        buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path, authReq.requestId),
      );
      return;
    }

    const { drugId, delta, reason } = parsed.data;

    try {
      if (authReq.user.role === 'PHARMACIST' && !(await pharmacistCanAccess(id, authReq.user.sub))) {
        res.status(403).json(buildProblem(403, 'Forbidden', 'Apotek tidak terhubung ke akun ini', req.path, authReq.requestId));
        return;
      }

      const result = await pool.query<{ stock_qty: number }>(
        `UPDATE pharmacy_inventory
         SET stock_qty=stock_qty+$1, updated_at=NOW()
         WHERE pharmacy_id=$2 AND drug_id=$3 AND stock_qty+$1 >= 0
         RETURNING stock_qty`,
        [delta, id, drugId],
      );

      if (result.rowCount === 0) {
        res.status(422).json(
          buildProblem(422, 'Unprocessable Entity', 'Insufficient stock — adjustment would result in negative stock', req.path, authReq.requestId),
        );
        return;
      }

      void writePharmacyAudit(id, authReq.user.sub, 'STOCK_ADJUSTED', 'pharmacy_inventory', null, {
        drugId,
        delta,
        reason,
        newStockQty: result.rows[0]!.stock_qty,
      });
      ok(res, { pharmacyId: id, drugId, delta, reason, newStockQty: result.rows[0]!.stock_qty });
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/drugs/search — Search drugs
// ─────────────────────────────────────────────────────────────────────────────

app.get(
  '/v1/drugs/search',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const parsed = DrugSearchSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(422).json(
        buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Search query must be at least 2 characters', req.path, authReq.requestId),
      );
      return;
    }

    const { q } = parsed.data;

    try {
      const result = await pool.query(
        `SELECT id, generic_name, brand_name, dosage_form, strength, requires_prescription
         FROM drugs
         WHERE generic_name ILIKE '%' || $1 || '%'
            OR brand_name   ILIKE '%' || $1 || '%'
         LIMIT 20`,
        [q],
      );

      ok(res, result.rows);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/drugs/:id — Get drug detail
// ─────────────────────────────────────────────────────────────────────────────

app.get(
  '/v1/drugs/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;

    try {
      const result = await pool.query(
        `SELECT * FROM drugs WHERE id=$1`,
        [id],
      );

      if (result.rowCount === 0) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Drug not found', req.path, authReq.requestId));
        return;
      }

      ok(res, result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /v1/pharmacies — Tambah apotek baru (ADMIN only)
// ─────────────────────────────────────────────────────────────────────────────

app.post(
  '/v1/pharmacies',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const parsed = CreatePharmacySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(
        buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path, authReq.requestId),
      );
      return;
    }

    const { name, license_number, address, phone, latitude, longitude, operating_hours } = parsed.data;

    try {
      const result = await pool.query(
        `INSERT INTO pharmacies (name, license_number, address, phone, latitude, longitude, operating_hours)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [name, license_number, address, phone ?? null, latitude ?? null, longitude ?? null, operating_hours ? JSON.stringify(operating_hours) : null],
      );

      res.status(201).json({ data: result.rows[0] });
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === '23505') {
        res.status(409).json(
          buildProblem(409, 'Conflict', 'Nomor SIA apotek sudah terdaftar', req.path, authReq.requestId),
        );
        return;
      }
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /v1/pharmacies/:id — Update data apotek (ADMIN only)
// ─────────────────────────────────────────────────────────────────────────────

app.patch(
  '/v1/pharmacies/:id',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const parsed = UpdatePharmacySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(
        buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path, authReq.requestId),
      );
      return;
    }

    const fields = parsed.data;
    const keys = Object.keys(fields) as Array<keyof typeof fields>;
    if (keys.length === 0) {
      res.status(422).json(buildProblem(422, 'Validation Error', 'Tidak ada field yang diupdate', req.path, authReq.requestId));
      return;
    }

    // Bangun SET clause dinamis
    const setClauses = keys.map((k, i) => {
      const col = k === 'operating_hours' ? `operating_hours` : k;
      return `${col} = $${i + 1}`;
    });
    const values = keys.map(k => {
      const v = fields[k];
      return k === 'operating_hours' && v !== undefined ? JSON.stringify(v) : (v ?? null);
    });
    values.push(id); // parameter posisi terakhir untuk WHERE id=$N

    try {
      const result = await pool.query(
        `UPDATE pharmacies SET ${setClauses.join(', ')}, updated_at=NOW() WHERE id=$${keys.length + 1} RETURNING *`,
        values,
      );

      if (result.rowCount === 0) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Apotek tidak ditemukan', req.path, authReq.requestId));
        return;
      }

      ok(res, result.rows[0]);
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === '23505') {
        res.status(409).json(
          buildProblem(409, 'Conflict', 'Nomor SIA apotek sudah terdaftar', req.path, authReq.requestId),
        );
        return;
      }
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /v1/pharmacies/:id/deactivate — Nonaktifkan apotek (soft delete, ADMIN only)
// ─────────────────────────────────────────────────────────────────────────────

app.delete(
  '/v1/pharmacies/:id/deactivate',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;

    try {
      const result = await pool.query(
        `UPDATE pharmacies SET is_active=FALSE, updated_at=NOW() WHERE id=$1 AND is_active=TRUE RETURNING id`,
        [id],
      );

      if (result.rowCount === 0) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Apotek tidak ditemukan atau sudah nonaktif', req.path, authReq.requestId));
        return;
      }

      res.status(204).send();
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
