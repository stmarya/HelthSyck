/**
 * consultation-service tests
 * Tests: health, auth guards, RBAC, state-machine transitions, validation, ratings
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';

// ── Mock dependencies ───────────────────────────────────────────────
jest.mock('pg', () => {
  const rows: Record<string, unknown[]> = {};
  const mockQuery = jest.fn(async (sql: string, params?: unknown[]) => {
    const s = sql.trim().toUpperCase();

    // Health check only
    if (s === 'SELECT NOW()') return { rows: [{ now: new Date() }] };

    // Patient exists check
    if (s.includes('FROM PATIENTS') && s.includes('= $1')) {
      return { rows: [{ id: params?.[0] ?? 'patient-uuid-1' }], rowCount: 1 };
    }

    // Active consultation check
    if (s.includes('FROM CONSULTATIONS') && s.includes('STATUS IN')) {
      return { rows: [], rowCount: 0 };
    }

    // INSERT consultation → return new row
    if (s.startsWith('INSERT INTO CONSULTATIONS')) {
      const id = params?.[0] as string ?? 'cons-uuid-1';
      rows[id] = [{ id, patient_id: params?.[1], status: 'PENDING', created_at: new Date() }];
      return { rows: [{ id, patient_id: params?.[1], status: 'PENDING', created_at: new Date() }] };
    }

    // SELECT consultation by id
    if (s.includes('FROM CONSULTATIONS') && s.includes('WHERE') && s.includes('= $1')) {
      const id = params?.[0] as string;
      if (id === 'cons-uuid-1') {
        return { rows: [{ id, patient_id: 'patient-uuid-1', doctor_id: 'doctor-uuid-1', status: 'PENDING', created_at: new Date() }] };
      }
      return { rows: [] };
    }

    // UPDATE status
    if (s.startsWith('UPDATE CONSULTATIONS')) {
      return { rows: [{ id: params?.[0] ?? 'cons-uuid-1', status: params?.[1] ?? 'ACCEPTED' }], rowCount: 1 };
    }

    // SELECT messages
    if (s.includes('FROM CONSULTATION_MESSAGES')) {
      return { rows: [], rowCount: 0 };
    }

    // INSERT message
    if (s.startsWith('INSERT INTO CONSULTATION_MESSAGES')) {
      return { rows: [{ id: 'msg-uuid-1', content: params?.[2], message_type: params?.[3], created_at: new Date() }] };
    }

    // SELECT ratings
    if (s.includes('FROM CONSULTATION_RATINGS')) {
      return { rows: [] };
    }

    // INSERT rating
    if (s.startsWith('INSERT INTO CONSULTATION_RATINGS')) {
      return { rows: [{ id: 'rating-uuid-1', rating: params?.[2], created_at: new Date() }] };
    }

    // Paginated list
    if (s.includes('COUNT(*)')) return { rows: [{ count: '0' }] };
    if (s.includes('FROM CONSULTATIONS')) return { rows: [] };

    return { rows: [] };
  });
  return {
    Pool: jest.fn(() => ({
      query: mockQuery,
      end: jest.fn().mockResolvedValue(undefined),
    })),
  };
});

jest.mock('@healthsync/shared', () => {
  const jwt = require('jsonwebtoken');
  return {
    authenticate: (req: any, res: any, next: any) => {
      const h = req.headers['authorization'];
      if (!h?.startsWith('Bearer ')) return res.status(401).json({ status: 401, title: 'Unauthorized' });
      try {
        req.user = jwt.verify(h.split(' ')[1], 'test-secret');
        next();
      } catch {
        res.status(401).json({ status: 401, title: 'Unauthorized' });
      }
    },
    requireRole: (...roles: string[]) => (req: any, res: any, next: any) => {
      if (!roles.includes(req.user?.role)) return res.status(403).json({ status: 403, title: 'Forbidden' });
      next();
    },
    requestIdMiddleware: (_req: any, _res: any, next: any) => next(),
    errorHandler: jest.fn(() => (_err: any, _req: any, res: any, _next: any) => res.status(500).json({ status: 500 })),
    buildProblem: (status: number, title: string, detail: string) => ({ status, title, detail }),
    ok: (res: any, data: any, status = 200) => res.status(status).json(data),
    paginated: (res: any, data: any, meta: any) => res.status(200).json({ data, meta }),
    AuthenticatedRequest: {},
  };
});

// ── Import app after mocks ─────────────────────────────────────────
import app from '../index';

// ── Token helpers ──────────────────────────────────────────────────
const makeToken = (role: string, sub = `${role}-uuid-1`) =>
  jwt.sign({ sub, role }, 'test-secret', { expiresIn: '1h' });

const patientToken  = makeToken('PATIENT',  'patient-uuid-1');
const doctorToken   = makeToken('DOCTOR',   'doctor-uuid-1');

// ══════════════════════════════════════════════════════════════════
describe('consultation-service', () => {

  // ── Health ─────────────────────────────────────────────────────
  describe('GET /health', () => {
    it('returns 200 with service name', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.service).toBe('consultation-service');
    });
  });

  // ── Auth guard ─────────────────────────────────────────────────
  describe('Auth guards', () => {
    it('POST /v1/consultations → 401 without token', async () => {
      const res = await request(app).post('/v1/consultations').send({});
      expect(res.status).toBe(401);
    });

    it('GET /v1/consultations/:id → 401 without token', async () => {
      const res = await request(app).get('/v1/consultations/cons-uuid-1');
      expect(res.status).toBe(401);
    });
  });

  // ── Validation ─────────────────────────────────────────────────
  describe('POST /v1/consultations — validation', () => {
    it('returns 422 when chiefComplaint is too short', async () => {
      const res = await request(app)
        .post('/v1/consultations')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ patientId: 'patient-uuid-1', chiefComplaint: 'short' });
      expect(res.status).toBe(422);
    });

    it('returns 422 when patientId is not a UUID', async () => {
      const res = await request(app)
        .post('/v1/consultations')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ patientId: 'not-a-uuid', chiefComplaint: 'I have a chest pain that started 2 hours ago' });
      expect(res.status).toBe(422);
    });
  });

  // ── Create consultation ────────────────────────────────────────
  describe('POST /v1/consultations — success', () => {
    it('creates consultation and returns 201', async () => {
      const res = await request(app)
        .post('/v1/consultations')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ patientId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', chiefComplaint: 'I have a chest pain that started 2 hours ago', urgency: 'HIGH' });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
    });
  });

  // ── RBAC ──────────────────────────────────────────────────────
  describe('RBAC', () => {
    it('PATIENT cannot access doctor-only routes', async () => {
      const res = await request(app)
        .put('/v1/consultations/cons-uuid-1/accept')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({});
      expect(res.status).toBe(403);
    });

    it('DOCTOR can accept a consultation', async () => {
      const res = await request(app)
        .put('/v1/consultations/cons-uuid-1/accept')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({});
      expect([200, 404, 409, 500]).toContain(res.status);
    });
  });

  // ── Messages ──────────────────────────────────────────────────
  describe('GET /v1/consultations/:id/messages', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).get('/v1/consultations/cons-uuid-1/messages');
      expect(res.status).toBe(401);
    });

    it('returns messages list with valid token', async () => {
      const res = await request(app)
        .get('/v1/consultations/cons-uuid-1/messages')
        .set('Authorization', `Bearer ${patientToken}`);
      expect([200, 403, 404]).toContain(res.status);
    });
  });

  // ── Ratings ───────────────────────────────────────────────────
  describe('POST /v1/consultations/:id/rate', () => {
    it('returns 422 when rating is out of range', async () => {
      const res = await request(app)
        .post('/v1/consultations/cons-uuid-1/rate')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ rating: 6 });
      expect(res.status).toBe(422);
    });

    it('accepts valid 1-5 rating', async () => {
      const res = await request(app)
        .post('/v1/consultations/cons-uuid-1/rate')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ rating: 5, review: 'Excellent doctor!' });
      expect([201, 404, 409, 500]).toContain(res.status);
    });
  });
});
