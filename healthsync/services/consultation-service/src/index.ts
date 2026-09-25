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

const PORT = parseInt(process.env['PORT'] ?? '3003', 10);
const SERVICE_NAME = 'consultation-service';

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

// ─────────────────────────────────────────────────────────────────────────────
// Domain types & state machine
// ─────────────────────────────────────────────────────────────────────────────

type ConsultationStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED';

const VALID_TRANSITIONS: Partial<Record<ConsultationStatus, ConsultationStatus[]>> = {
  PENDING:     ['ACCEPTED', 'CANCELLED', 'EXPIRED'],
  ACCEPTED:    ['IN_PROGRESS', 'CANCELLED', 'EXPIRED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED', 'EXPIRED'],
};

function isValidTransition(from: ConsultationStatus, to: ConsultationStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

const CreateConsultationSchema = z.object({
  patientId:      z.string().uuid(),
  chiefComplaint: z.string().min(10),
  symptomData:    z.record(z.unknown()).optional(),
  urgency:        z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']).optional(),
});

const SendMessageSchema = z.object({
  content:     z.string().min(1).max(5000),
  messageType: z.enum(['TEXT', 'IMAGE', 'FILE']),
  fileUrl:     z.string().url().optional(),
  fileName:    z.string().optional(),
});


const CompleteConsultationSchema = z.object({
  diagnosis: z.string().min(1).optional(),
  notes:     z.string().optional(),
});

const RateConsultationSchema = z.object({
  rating: z.number().int().min(1).max(5),
  review: z.string().optional(),
});

const PaginationSchema = z.object({
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(100).default(20),
  status:    z.string().optional(),
  doctorId:  z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
});

const MessageCursorSchema = z.object({
  after: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

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
// POST /v1/consultations — Create consultation request
// ─────────────────────────────────────────────────────────────────────────────

app.post(
  '/v1/consultations',
  authenticate,
  requireRole('PATIENT', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const parsed = CreateConsultationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(
        buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path, authReq.requestId),
      );
      return;
    }

    const { patientId, chiefComplaint, symptomData, urgency } = parsed.data;

    try {
      // Check patient exists
      const patientCheck = await pool.query<{ id: string }>(
        'SELECT id FROM patients WHERE id=$1',
        [patientId],
      );
      if (patientCheck.rowCount === 0) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Patient not found', req.path, authReq.requestId));
        return;
      }

      // Check no active consultation
      const activeCheck = await pool.query<{ id: string }>(
        `SELECT id FROM consultations
         WHERE patient_id=$1 AND status IN ('PENDING','ACCEPTED','IN_PROGRESS')`,
        [patientId],
      );
      if ((activeCheck.rowCount ?? 0) > 0) {
        res.status(409).json(
          buildProblem(409, 'Conflict', 'Patient already has an active consultation', req.path, authReq.requestId),
        );
        return;
      }

      const id = crypto.randomUUID();
      const result = await pool.query(
        `INSERT INTO consultations
           (id, patient_id, status, chief_complaint, symptom_data, urgency, created_at)
         VALUES ($1, $2, 'PENDING', $3, $4, $5, NOW())
         RETURNING *`,
        [id, patientId, chiefComplaint, symptomData ? JSON.stringify(symptomData) : null, urgency ?? 'NORMAL'],
      );

      ok(res, result.rows[0], 201);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/consultations — List consultations
// ─────────────────────────────────────────────────────────────────────────────

app.get(
  '/v1/consultations',
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

    const { page, limit, status, doctorId, patientId } = parsed.data;
    const offset = (page - 1) * limit;
    const { role, sub } = authReq.user;

    try {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (role === 'PATIENT') {
        conditions.push(`c.patient_id=$${paramIdx++}`);
        params.push(sub);
      } else if (role === 'DOCTOR') {
        conditions.push(`c.doctor_id=$${paramIdx++}`);
        params.push(doctorId ?? sub);
      } else {
        // COMMAND_CENTER / ADMIN — optional filters
        if (patientId) { conditions.push(`c.patient_id=$${paramIdx++}`); params.push(patientId); }
        if (doctorId)  { conditions.push(`c.doctor_id=$${paramIdx++}`);  params.push(doctorId); }
      }

      if (status) { conditions.push(`c.status=$${paramIdx++}`); params.push(status); }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM consultations c ${where}`,
        params,
      );
      const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

      const dataResult = await pool.query(
        `SELECT c.*, p.name AS patient_name, u.email AS doctor_email
         FROM consultations c
         LEFT JOIN patients p ON p.id = c.patient_id
         LEFT JOIN doctors d  ON d.id = c.doctor_id
         LEFT JOIN users u    ON u.id = d.user_id
         ${where}
         ORDER BY c.created_at DESC
         LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
        [...params, limit, offset],
      );

      paginated(res, dataResult.rows, page, limit, total);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/consultations/:id — Get consultation detail
// ─────────────────────────────────────────────────────────────────────────────

app.get(
  '/v1/consultations/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;

    try {
      const result = await pool.query(
        `SELECT c.*,
                p.name AS patient_name,
                u.email     AS doctor_email,
                (SELECT COUNT(*) FROM consultation_messages cm WHERE cm.consultation_id=c.id) AS message_count
         FROM consultations c
         LEFT JOIN patients p ON p.id = c.patient_id
         LEFT JOIN doctors  d ON d.id = c.doctor_id
         LEFT JOIN users    u ON u.id = d.user_id
         WHERE c.id=$1`,
        [id],
      );

      if (result.rowCount === 0) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Consultation not found', req.path, authReq.requestId));
        return;
      }

      ok(res, result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// PUT /v1/consultations/:id/accept — Doctor accepts
// ─────────────────────────────────────────────────────────────────────────────

app.put(
  '/v1/consultations/:id/accept',
  authenticate,
  requireRole('DOCTOR'),
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;

    try {
      const current = await pool.query<{ status: ConsultationStatus }>(
        'SELECT status FROM consultations WHERE id=$1',
        [id],
      );
      if (current.rowCount === 0) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Consultation not found', req.path, authReq.requestId));
        return;
      }

      const fromStatus = current.rows[0]!.status;
      if (!isValidTransition(fromStatus, 'ACCEPTED')) {
        res.status(409).json(
          buildProblem(409, 'Conflict', `Cannot transition from ${fromStatus} to ACCEPTED`, req.path, authReq.requestId),
        );
        return;
      }

      const result = await pool.query(
        `UPDATE consultations
         SET status='ACCEPTED', doctor_id=$1, started_at=NOW(), updated_at=NOW()
         WHERE id=$2
         RETURNING *`,
        [authReq.user.sub, id],
      );

      ok(res, result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// PUT /v1/consultations/:id/start — Mark as IN_PROGRESS
// ─────────────────────────────────────────────────────────────────────────────

app.put(
  '/v1/consultations/:id/start',
  authenticate,
  requireRole('DOCTOR', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;

    try {
      const current = await pool.query<{ status: ConsultationStatus }>(
        'SELECT status FROM consultations WHERE id=$1',
        [id],
      );
      if (current.rowCount === 0) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Consultation not found', req.path, authReq.requestId));
        return;
      }

      const fromStatus = current.rows[0]!.status;
      if (!isValidTransition(fromStatus, 'IN_PROGRESS')) {
        res.status(409).json(
          buildProblem(409, 'Conflict', `Cannot transition from ${fromStatus} to IN_PROGRESS`, req.path, authReq.requestId),
        );
        return;
      }

      const result = await pool.query(
        `UPDATE consultations SET status='IN_PROGRESS', updated_at=NOW() WHERE id=$1 RETURNING *`,
        [id],
      );

      ok(res, result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// PUT /v1/consultations/:id/complete — Doctor completes
// ─────────────────────────────────────────────────────────────────────────────

app.put(
  '/v1/consultations/:id/complete',
  authenticate,
  requireRole('DOCTOR'),
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const parsed = CompleteConsultationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(
        buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path, authReq.requestId),
      );
      return;
    }

    try {
      const current = await pool.query<{ status: ConsultationStatus; doctor_id: string }>(
        'SELECT status, doctor_id FROM consultations WHERE id=$1',
        [id],
      );
      if (current.rowCount === 0) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Consultation not found', req.path, authReq.requestId));
        return;
      }

      const { status: fromStatus, doctor_id } = current.rows[0]!;
      if (doctor_id !== authReq.user.sub) {
        res.status(403).json(buildProblem(403, 'Forbidden', 'You are not the assigned doctor', req.path, authReq.requestId));
        return;
      }
      if (!isValidTransition(fromStatus, 'COMPLETED')) {
        res.status(409).json(
          buildProblem(409, 'Conflict', `Cannot transition from ${fromStatus} to COMPLETED`, req.path, authReq.requestId),
        );
        return;
      }

      const { diagnosis, notes } = parsed.data;
      const result = await pool.query(
        `UPDATE consultations
         SET status='COMPLETED', ended_at=NOW(), diagnosis=$1, notes=$2, updated_at=NOW()
         WHERE id=$3
         RETURNING *`,
        [diagnosis ?? null, notes ?? null, id],
      );

      ok(res, result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// PUT /v1/consultations/:id/cancel — Cancel consultation
// ─────────────────────────────────────────────────────────────────────────────

app.put(
  '/v1/consultations/:id/cancel',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;

    try {
      const current = await pool.query<{ status: ConsultationStatus }>(
        'SELECT status FROM consultations WHERE id=$1',
        [id],
      );
      if (current.rowCount === 0) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Consultation not found', req.path, authReq.requestId));
        return;
      }

      const fromStatus = current.rows[0]!.status;
      if (!isValidTransition(fromStatus, 'CANCELLED')) {
        res.status(409).json(
          buildProblem(409, 'Conflict', `Cannot transition from ${fromStatus} to CANCELLED`, req.path, authReq.requestId),
        );
        return;
      }

      const result = await pool.query(
        `UPDATE consultations SET status='CANCELLED', ended_at=NOW(), updated_at=NOW() WHERE id=$1 RETURNING *`,
        [id],
      );

      ok(res, result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /v1/consultations/:id/messages — Send message
// ─────────────────────────────────────────────────────────────────────────────

app.post(
  '/v1/consultations/:id/messages',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const parsed = SendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(
        buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path, authReq.requestId),
      );
      return;
    }

    try {
      const consultResult = await pool.query<{
        status: ConsultationStatus;
        patient_id: string;
        doctor_id: string | null;
      }>(
        'SELECT status, patient_id, doctor_id FROM consultations WHERE id=$1',
        [id],
      );
      if (consultResult.rowCount === 0) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Consultation not found', req.path, authReq.requestId));
        return;
      }

      const { status, patient_id, doctor_id } = consultResult.rows[0]!;

      if (status !== 'IN_PROGRESS' && status !== 'ACCEPTED') {
        res.status(409).json(
          buildProblem(409, 'Conflict', `Cannot send messages in status ${status}`, req.path, authReq.requestId),
        );
        return;
      }

      const senderId = authReq.user.sub;
      const isParticipant = senderId === patient_id || senderId === doctor_id;
      if (!isParticipant) {
        res.status(403).json(buildProblem(403, 'Forbidden', 'You are not a participant in this consultation', req.path, authReq.requestId));
        return;
      }

      const { content, messageType, fileUrl, fileName } = parsed.data;
      const msgId = crypto.randomUUID();

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const msgResult = await client.query(
          `INSERT INTO consultation_messages
             (id, consultation_id, sender_id, message_type, content, file_url, file_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [msgId, id, senderId, messageType, content, fileUrl ?? null, fileName ?? null],
        );

        // Auto-advance ACCEPTED → IN_PROGRESS on first message
        if (status === 'ACCEPTED') {
          await client.query(
            `UPDATE consultations SET status='IN_PROGRESS', updated_at=NOW() WHERE id=$1`,
            [id],
          );
        }

        await client.query('COMMIT');
        ok(res, msgResult.rows[0], 201);
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
// GET /v1/consultations/:id/messages — Get messages (cursor-based pagination)
// ─────────────────────────────────────────────────────────────────────────────

app.get(
  '/v1/consultations/:id/messages',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const parsed = MessageCursorSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(422).json(
        buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid query', req.path, authReq.requestId),
      );
      return;
    }

    const { after, limit } = parsed.data;

    try {
      const params: unknown[] = [id, limit];
      let cursorClause = '';
      if (after) {
        params.push(after);
        cursorClause = `AND cm.created_at > $${params.length}`;
      }

      const result = await pool.query(
        `SELECT cm.*, u.email AS sender_email
         FROM consultation_messages cm
         JOIN users u ON u.id = cm.sender_id
         WHERE cm.consultation_id=$1 ${cursorClause}
         ORDER BY cm.created_at ASC
         LIMIT $2`,
        params,
      );

      // Mark unread messages as read
      await pool.query(
        `UPDATE consultation_messages
         SET is_read=TRUE, read_at=NOW()
         WHERE consultation_id=$1 AND sender_id != $2 AND is_read=FALSE`,
        [id, authReq.user.sub],
      );

      ok(res, result.rows);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /v1/consultations/:id/rate — Rate consultation (PATIENT only)
// ─────────────────────────────────────────────────────────────────────────────

app.post(
  '/v1/consultations/:id/rate',
  authenticate,
  requireRole('PATIENT'),
  async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const parsed = RateConsultationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json(
        buildProblem(422, 'Validation Error', parsed.error.issues[0]?.message ?? 'Invalid input', req.path, authReq.requestId),
      );
      return;
    }

    try {
      const consultResult = await pool.query<{
        status: ConsultationStatus;
        doctor_id: string | null;
      }>(
        'SELECT status, doctor_id FROM consultations WHERE id=$1',
        [id],
      );
      if (consultResult.rowCount === 0) {
        res.status(404).json(buildProblem(404, 'Not Found', 'Consultation not found', req.path, authReq.requestId));
        return;
      }

      const { status, doctor_id } = consultResult.rows[0]!;
      if (status !== 'COMPLETED') {
        res.status(409).json(buildProblem(409, 'Conflict', 'Can only rate completed consultations', req.path, authReq.requestId));
        return;
      }

      const existingRating = await pool.query<{ id: string }>(
        'SELECT id FROM consultation_ratings WHERE consultation_id=$1',
        [id],
      );
      if ((existingRating.rowCount ?? 0) > 0) {
        res.status(409).json(buildProblem(409, 'Conflict', 'Consultation has already been rated', req.path, authReq.requestId));
        return;
      }

      const { rating, review } = parsed.data;
      const ratingId = crypto.randomUUID();

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const ratingResult = await client.query(
          `INSERT INTO consultation_ratings (id, consultation_id, doctor_id, patient_id, rating, review)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [ratingId, id, doctor_id, authReq.user.sub, rating, review ?? null],
        );

        if (doctor_id) {
          await client.query(
            `UPDATE doctors
             SET rating_avg=(SELECT AVG(rating) FROM consultation_ratings WHERE doctor_id=$1),
                 rating_count=rating_count+1
             WHERE id=$1`,
            [doctor_id],
          );
        }

        await client.query('COMMIT');
        ok(res, ratingResult.rows[0], 201);
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
// GET /v1/doctors/available — List available doctors
// ─────────────────────────────────────────────────────────────────────────────

app.get(
  '/v1/doctors/available',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    void (req as AuthenticatedRequest); // auth context available if needed
    const { specialization } = req.query as { specialization?: string };

    try {
      const params: unknown[] = [];
      let specializationClause = '';
      if (specialization) {
        params.push(specialization);
        specializationClause = `AND d.specialization=$${params.length}`;
      }

      const result = await pool.query(
        `SELECT d.*, u.email, u.phone
         FROM doctors d
         JOIN users u ON u.id = d.user_id
         WHERE d.is_available=TRUE ${specializationClause}
         ORDER BY d.rating_avg DESC`,
        params,
      );

      ok(res, result.rows);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/consultations/stats/weekly — consultation count per day-of-week
// Used by Analytics page (Admin Panel). ADMIN only.
// ─────────────────────────────────────────────────────────────────────────────

app.get(
  '/v1/consultations/stats/weekly',
  authenticate,
  requireRole('ADMIN'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      // Returns counts for each day-of-week (0=Sun … 6=Sat) over the last 4 weeks
      const result = await pool.query<{ day: string; count: string }>(`
        SELECT EXTRACT(DOW FROM created_at)::int AS day, COUNT(*) AS count
        FROM consultations
        WHERE created_at >= NOW() - INTERVAL '28 days'
        GROUP BY day
        ORDER BY day
      `);
      ok(res, result.rows.map((r) => ({
        day:   parseInt(r.day,   10),
        count: parseInt(r.count, 10),
      })));
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/consultations/stats/status — consultation count by status
// Used by Analytics page (Admin Panel). ADMIN only.
// ─────────────────────────────────────────────────────────────────────────────

app.get(
  '/v1/consultations/stats/status',
  authenticate,
  requireRole('ADMIN'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query<{ status: string; count: string }>(`
        SELECT status, COUNT(*) AS count
        FROM consultations
        GROUP BY status
        ORDER BY status
      `);
      ok(res, result.rows.map((row) => ({
        status: row.status,
        count: parseInt(row.count, 10),
      })));
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
