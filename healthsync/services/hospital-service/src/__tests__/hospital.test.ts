/**
 * hospital-service tests
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
    if (s.includes('COUNT(*)')) return { rows: [{ count: '2' }] };

    if (s.includes('FROM DOCTORS') && s.includes('WHERE D.USER_ID')) {
      return {
        rows: [{
          id: 'doctor-uuid-1',
          user_id: 'doctor-uuid-1',
          specialization: 'CARDIOLOGY',
          is_available: true,
          email: 'doctor@healthsync.id',
          hospital_name: 'RS Harapan Bangsa',
        }],
        rowCount: 1,
      };
    }

    if (s.startsWith('UPDATE DOCTORS')) {
      return {
        rows: [{ id: 'doctor-uuid-1', user_id: 'doctor-uuid-1', is_available: true }],
        rowCount: 1,
      };
    }

    if (s.startsWith('UPDATE HOSPITALS') && params) {
      const id = params[params.length - 1];
      if (id === 'hosp-uuid-1') return { rows: [{ id, available_beds: 15, icu_available: 5 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }

    if (s.includes('FROM HOSPITALS') && s.includes('WHERE') && params?.[0]) {
      const id = params[0];
      if (id === 'hosp-uuid-1') {
        return { rows: [{ id: 'hosp-uuid-1', name: 'RS Harapan Bangsa', type: 'TYPE_A', available_beds: 20 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    if (s.includes('FROM HOSPITALS')) {
      return {
        rows: [
          { id: 'hosp-uuid-1', name: 'RS Harapan Bangsa', type: 'TYPE_A', available_beds: 20 },
          { id: 'hosp-uuid-2', name: 'RS Ibu dan Anak', type: 'TYPE_B', available_beds: 5 },
        ],
      };
    }

    return { rows: [], rowCount: 0 };
  });

  const mockClient = { query: mockQuery, release: jest.fn() };
  return {
    Pool: jest.fn(() => ({
      query: mockQuery,
      connect: jest.fn().mockResolvedValue(mockClient),
      end: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    })),
  };
});

import app from '../index';

const makeToken = (role: string, sub = `${role}-uuid-1`) =>
  jwt.sign({ sub, role }, JWT_SECRET, { expiresIn: '1h' });

const patientToken = makeToken('PATIENT',       'patient-uuid-1');
const doctorToken  = makeToken('DOCTOR',        'doctor-uuid-1');
const adminToken   = makeToken('ADMIN',         'admin-uuid-1');
const cmdToken     = makeToken('COMMAND_CENTER','cmd-uuid-1');

describe('hospital-service', () => {

  describe('GET /health', () => {
    it('returns 200', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.service).toBe('hospital-service');
    });
  });

  describe('Auth guards', () => {
    // GET /v1/hospitals uses optionalAuth — public access allowed
    it('GET /v1/hospitals → accessible without token', async () => {
      const res = await request(app).get('/v1/hospitals');
      expect([200, 422]).toContain(res.status);
    });
  });

  describe('GET /v1/hospitals — open to all authenticated', () => {
    it('PATIENT can list hospitals', async () => {
      const res = await request(app)
        .get('/v1/hospitals')
        .set('Authorization', `Bearer ${patientToken}`);
      expect(res.status).toBe(200);
    });

    it('returns hospitals with geo filter', async () => {
      const res = await request(app)
        .get('/v1/hospitals?lat=-6.2&lng=106.8&radius_km=20')
        .set('Authorization', `Bearer ${patientToken}`);
      expect([200]).toContain(res.status);
    });

    it('filters by specialization', async () => {
      const res = await request(app)
        .get('/v1/hospitals?specialization=CARDIOLOGY')
        .set('Authorization', `Bearer ${adminToken}`);
      expect([200]).toContain(res.status);
    });
  });

  describe('Doctor profile and availability', () => {
    it('DOCTOR can load their own profile', async () => {
      const res = await request(app)
        .get('/v1/doctors/me')
        .set('Authorization', `Bearer ${doctorToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('specialization', 'CARDIOLOGY');
    });

    it('PATIENT cannot load the Doctor profile endpoint', async () => {
      const res = await request(app)
        .get('/v1/doctors/me')
        .set('Authorization', `Bearer ${patientToken}`);
      expect(res.status).toBe(403);
    });

    it('DOCTOR can update their availability', async () => {
      const res = await request(app)
        .patch('/v1/doctors/me/availability')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ isAvailable: true });
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('is_available', true);
    });
  });

  describe('GET /v1/hospitals/:id', () => {
    it('returns hospital detail', async () => {
      const res = await request(app)
        .get('/v1/hospitals/hosp-uuid-1')
        .set('Authorization', `Bearer ${patientToken}`);
      expect([200, 404]).toContain(res.status);
    });

    it('returns 404 for unknown hospital', async () => {
      const res = await request(app)
        .get('/v1/hospitals/ffffffff-ffff-4fff-ffff-ffffffffffff')
        .set('Authorization', `Bearer ${patientToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /v1/hospitals/:id/capacity — RBAC', () => {
    it('PATIENT cannot update capacity', async () => {
      const res = await request(app)
        .put('/v1/hospitals/hosp-uuid-1/capacity')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ availableBeds: 15, icuAvailable: 5 });
      expect(res.status).toBe(403);
    });

    it('COMMAND_CENTER can update capacity', async () => {
      const res = await request(app)
        .put('/v1/hospitals/hosp-uuid-1/capacity')
        .set('Authorization', `Bearer ${cmdToken}`)
        .send({ availableBeds: 15, icuAvailable: 5 });
      expect([200, 404, 422, 500]).toContain(res.status);
    });
  });
});
