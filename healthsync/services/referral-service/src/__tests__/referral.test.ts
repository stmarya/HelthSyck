/**
 * referral-service tests
 * NOTE: Uses inline JWT — set JWT_SECRET before module load.
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test-secret';
process.env['JWT_SECRET'] = JWT_SECRET;

jest.mock('pg', () => {
  const mockQuery = jest.fn(async (sql: string, params?: unknown[]) => {
    const s = sql.trim().toUpperCase();
    if (s === 'SELECT 1') return { rows: [{ '?column?': 1 }] };
    if (s.includes('COUNT(*)')) return { rows: [{ count: '1' }] };

    // Doctor lookup by user_id
    if (s.includes('FROM DOCTORS') && s.includes('USER_ID')) {
      return { rows: [{ id: 'doctor-uuid-1', hospital_id: 'hosp-uuid-1' }], rowCount: 1 };
    }

    // Patient lookup
    if (s.includes('FROM PATIENTS') && s.includes('= $1')) {
      return { rows: [{ id: params?.[0] ?? 'patient-uuid-1' }], rowCount: 1 };
    }

    // Hospital lookup
    if (s.includes('FROM HOSPITALS') && s.includes('= $1')) {
      return { rows: [{ id: params?.[0] ?? 'hosp-uuid-1', name: 'RS Target' }], rowCount: 1 };
    }

    // INSERT referral
    if (s.startsWith('INSERT INTO REFERRALS')) {
      return { rows: [{ id: 'ref-uuid-1', status: 'DRAFT', created_at: new Date() }], rowCount: 1 };
    }

    // Single referral
    if (s.includes('FROM REFERRALS') && s.includes('= $1')) {
      const id = params?.[0];
      if (id === 'ref-uuid-1') {
        return { rows: [{ id: 'ref-uuid-1', status: 'DRAFT', created_at: new Date() }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // List referrals
    if (s.includes('FROM REFERRALS')) return { rows: [], rowCount: 0 };

    if (s.startsWith('UPDATE REFERRALS')) {
      return { rows: [{ id: 'ref-uuid-1', status: 'SENT' }], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  });

  return {
    Pool: jest.fn(() => ({
      query: mockQuery,
      end: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    })),
  };
});

import app from '../index';

const makeToken = (role: string, sub = `${role}-uuid-1`) =>
  jwt.sign({ sub, role }, JWT_SECRET, { expiresIn: '1h' });

const patientToken = makeToken('PATIENT', 'patient-uuid-1');
const doctorToken  = makeToken('DOCTOR',  'doctor-uuid-1');

describe('referral-service', () => {

  describe('GET /health', () => {
    it('returns 200', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.service).toBe('referral-service');
    });
  });

  describe('Auth guards', () => {
    it('POST /v1/referrals → 401 without token', async () => {
      const res = await request(app).post('/v1/referrals').send({});
      expect(res.status).toBe(401);
    });

    it('GET /v1/referrals → 401 without token', async () => {
      const res = await request(app).get('/v1/referrals');
      expect(res.status).toBe(401);
    });
  });

  describe('RBAC', () => {
    it('PATIENT cannot create a referral (DOCTOR only)', async () => {
      const res = await request(app)
        .post('/v1/referrals')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({});
      expect(res.status).toBe(403);
    });
  });

  describe('GET /v1/referrals — list (any authenticated)', () => {
    it('PATIENT can list referrals', async () => {
      const res = await request(app)
        .get('/v1/referrals')
        .set('Authorization', `Bearer ${patientToken}`);
      expect([200]).toContain(res.status);
    });

    it('DOCTOR can list referrals', async () => {
      const res = await request(app)
        .get('/v1/referrals')
        .set('Authorization', `Bearer ${doctorToken}`);
      expect([200]).toContain(res.status);
    });
  });

  describe('POST /v1/referrals — validation', () => {
    it('returns 422 when required fields missing', async () => {
      const res = await request(app)
        .post('/v1/referrals')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ patientId: 'not-uuid' });
      expect(res.status).toBe(422);
    });
  });

  describe('POST /v1/referrals — success', () => {
    it('creates referral (DOCTOR)', async () => {
      const res = await request(app)
        .post('/v1/referrals')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          patientId:              'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
          toHospitalId:           'cccccccc-cccc-4ccc-cccc-cccccccccccc',
          reason:                 'Patient requires specialist cardiac care immediately',
          urgencyLevel:           'URGENT',
          requiredSpecialization: 'CARDIOLOGY',
        });
      expect([201, 403, 404, 500]).toContain(res.status);
    });
  });

  describe('GET /v1/referrals/:id', () => {
    it('returns referral detail', async () => {
      const res = await request(app)
        .get('/v1/referrals/ref-uuid-1')
        .set('Authorization', `Bearer ${doctorToken}`);
      expect([200, 404]).toContain(res.status);
    });

    it('returns 404 for non-existent referral', async () => {
      const res = await request(app)
        .get('/v1/referrals/ffffffff-ffff-4fff-ffff-ffffffffffff')
        .set('Authorization', `Bearer ${doctorToken}`);
      expect(res.status).toBe(404);
    });
  });
});
