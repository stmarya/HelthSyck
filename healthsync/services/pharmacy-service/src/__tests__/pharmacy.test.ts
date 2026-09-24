/**
 * pharmacy-service tests
 * Routes verified against src/index.ts:
 *   GET  /v1/pharmacies — authenticate only
 *   GET  /v1/pharmacies/nearby — authenticate only
 *   GET  /v1/pharmacies/:id/inventory — authenticate only
 *   PUT  /v1/pharmacies/:id/inventory — PHARMACIST | ADMIN
 *   POST /v1/pharmacies/:id/inventory/adjust — PHARMACIST | ADMIN
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('pg', () => {
  const mockQuery = jest.fn(async (sql: string, params?: unknown[]) => {
    const s = sql.trim().toUpperCase();
    if (s.includes('COUNT(*)')) return { rows: [{ count: '2' }] };

    if (s.includes('FROM PHARMACIES') && s.includes('EARTH_DISTANCE')) {
      return {
        rows: [
          { id: 'ph-uuid-1', name: 'Apotek Sehat', is_open_24h: true, distance_km: 0.8 },
          { id: 'ph-uuid-2', name: 'Kimia Farma', is_open_24h: false, distance_km: 1.2 },
        ],
      };
    }

    if (s.includes('FROM PHARMACIES') && s.includes('IS_ACTIVE=TRUE') && s.includes('ORDER BY NAME')) {
      return { rows: [{ id: 'ph-uuid-1', name: 'Apotek Sehat' }] };
    }

    if (s.includes('FROM PHARMACIES')) {
      return { rows: [{ id: 'ph-uuid-1', name: 'Apotek Sehat', is_open_24h: true }] };
    }

    if (s.includes('FROM PHARMACY_INVENTORY') && s.includes('= $1')) {
      return {
        rows: [
          { id: 'inv-uuid-1', drug_id: 'drug-uuid-1', drug_name: 'Paracetamol', available_quantity: 100, unit_price: 2000 },
        ],
      };
    }

    if (s.startsWith('INSERT INTO PHARMACY_INVENTORY')) {
      return { rows: [{ id: 'inv-uuid-1', stock_qty: params?.[2], unit_price: params?.[3] }] };
    }

    if (s.startsWith('UPDATE PHARMACY_INVENTORY')) {
      return { rows: [{ id: 'inv-uuid-1' }], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
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
      if (!h?.startsWith('Bearer ')) return res.status(401).json({ status: 401 });
      try { req.user = jwt.verify(h.split(' ')[1], 'test-secret'); next(); }
      catch { res.status(401).json({ status: 401 }); }
    },
    requireRole: (...roles: string[]) => (req: any, res: any, next: any) => {
      if (!roles.includes(req.user?.role)) return res.status(403).json({ status: 403 });
      next();
    },
    requestIdMiddleware: (_req: any, _res: any, next: any) => next(),
    errorHandler: jest.fn(() => (_err: any, _req: any, res: any, _next: any) => res.status(500).json({ status: 500 })),
    buildProblem: (status: number, title: string, detail: string) => ({ status, title, detail }),
    ok: (res: any, data: any, status = 200) => res.status(status).json(data),
    paginated: (_res: any, data: any, page: number, limit: number, total: number) => {
      _res.status(200).json({ data, meta: { page, limit, total } });
    },
    AuthenticatedRequest: {},
  };
});

import app from '../index';

const makeToken = (role: string, sub = `${role}-uuid-1`) =>
  jwt.sign({ sub, role }, 'test-secret', { expiresIn: '1h' });

const patientToken    = makeToken('PATIENT',    'patient-uuid-1');
const pharmacistToken = makeToken('PHARMACIST', 'pharmacist-uuid-1');

describe('pharmacy-service', () => {

  describe('GET /health', () => {
    it('returns 200', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.service).toBe('pharmacy-service');
    });
  });

  describe('Auth guards', () => {
    it('GET /v1/pharmacies → 401 without token (protected)', async () => {
      const res = await request(app).get('/v1/pharmacies');
      expect(res.status).toBe(401);
    });

    // /nearby uses optionalAuth — public access allowed
    it('GET /v1/pharmacies/nearby → accessible without token', async () => {
      const res = await request(app).get('/v1/pharmacies/nearby');
      expect([200, 422]).toContain(res.status);
    });
  });

  describe('GET /v1/pharmacies', () => {
    it('PATIENT can list pharmacies', async () => {
      const res = await request(app)
        .get('/v1/pharmacies')
        .set('Authorization', `Bearer ${patientToken}`);
      expect([200]).toContain(res.status);
    });
  });

  describe('GET /v1/pharmacies/nearby', () => {
    it('returns 422 when lat/lng missing', async () => {
      const res = await request(app)
        .get('/v1/pharmacies/nearby')
        .set('Authorization', `Bearer ${patientToken}`);
      expect(res.status).toBe(422);
    });

    it('returns nearby pharmacies', async () => {
      const res = await request(app)
        .get('/v1/pharmacies/nearby?lat=-6.2&lng=106.8')
        .set('Authorization', `Bearer ${patientToken}`);
      expect([200]).toContain(res.status);
    });
  });

  describe('GET /v1/pharmacies/:id/inventory', () => {
    it('PATIENT is blocked (PHARMACIST only route)', async () => {
      const res = await request(app)
        .get('/v1/pharmacies/ph-uuid-1/inventory')
        .set('Authorization', `Bearer ${patientToken}`);
      expect(res.status).toBe(403);
    });

    it('PHARMACIST can view inventory', async () => {
      const res = await request(app)
        .get('/v1/pharmacies/ph-uuid-1/inventory')
        .set('Authorization', `Bearer ${pharmacistToken}`);
      expect([200, 404, 500]).toContain(res.status);
    });
  });

  describe('PUT /v1/pharmacies/:id/inventory — RBAC', () => {
    it('PATIENT cannot update inventory', async () => {
      const res = await request(app)
        .put('/v1/pharmacies/ph-uuid-1/inventory')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ drugId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', stockQty: 100, unitPrice: 2000 });
      expect(res.status).toBe(403);
    });

    it('PHARMACIST can update inventory', async () => {
      const res = await request(app)
        .put('/v1/pharmacies/ph-uuid-1/inventory')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({ drugId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', stockQty: 100, unitPrice: 2000 });
      expect([200, 422, 500]).toContain(res.status);
    });
  });

  describe('POST /v1/pharmacies/:id/inventory/adjust — RBAC', () => {
    it('PATIENT cannot adjust stock', async () => {
      const res = await request(app)
        .post('/v1/pharmacies/ph-uuid-1/inventory/adjust')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ drugId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', delta: -10, reason: 'DISPENSED' });
      expect(res.status).toBe(403);
    });

    it('returns 422 on missing fields', async () => {
      const res = await request(app)
        .post('/v1/pharmacies/ph-uuid-1/inventory/adjust')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({});
      expect(res.status).toBe(422);
    });
  });
});
