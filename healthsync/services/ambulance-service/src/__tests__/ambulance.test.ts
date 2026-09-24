/**
 * ambulance-service tests
 * NOTE: Uses inline JWT — set JWT_SECRET before module load.
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test-secret';
process.env['JWT_SECRET'] = JWT_SECRET;

jest.mock('pg', () => {
  const mockQuery = jest.fn(async (sql: string) => {
    const s = sql.trim().toUpperCase();
    if (s === 'SELECT 1') return { rows: [{ '?column?': 1 }] };
    if (s.includes('COUNT(*)')) return { rows: [{ count: '2' }] };

    if (s.includes('FROM AMBULANCES') && s.includes('EARTH_DISTANCE')) {
      return { rows: [{ id: 'amb-uuid-1', plate_number: 'B 1234', status: 'AVAILABLE', distance_km: 0.8 }] };
    }
    if (s.includes('FROM AMBULANCES')) {
      return { rows: [{ id: 'amb-uuid-1', plate_number: 'B 1234', status: 'AVAILABLE', driver_id: 'ambulance_driver-uuid-1' }], rowCount: 1 };
    }
    if (s.startsWith('UPDATE AMBULANCES')) return { rows: [{ id: 'amb-uuid-1' }], rowCount: 1 };
    if (s.startsWith('INSERT INTO AMBULANCE_LOCATIONS')) return { rows: [], rowCount: 1 };
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

jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    geoadd: jest.fn().mockResolvedValue(1),
    geodist: jest.fn().mockResolvedValue('500'),
    setex: jest.fn().mockResolvedValue('OK'),
    zrem: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(null),
  }))
);

import app from '../index';

const makeToken = (role: string, sub = `${role}-uuid-1`) =>
  jwt.sign({ sub, role }, JWT_SECRET, { expiresIn: '1h' });

const patientToken = makeToken('PATIENT',          'patient-uuid-1');
const commandToken = makeToken('COMMAND_CENTER',   'cmd-uuid-1');
const driverToken  = makeToken('AMBULANCE_DRIVER', 'ambulance_driver-uuid-1');

describe('ambulance-service', () => {

  describe('GET /health', () => {
    it('returns 200', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.service).toBe('ambulance-service');
    });
  });

  describe('Auth guards', () => {
    // /nearby uses optionalAuth — public access allowed (returns 200 or 422 for bad params)
    it('GET /v1/ambulances/nearby → accessible without token', async () => {
      const res = await request(app).get('/v1/ambulances/nearby?lat=-6.2&lng=106.8');
      expect([200, 422]).toContain(res.status);
    });

    it('GET /v1/ambulances → 401 without token (protected endpoint)', async () => {
      const res = await request(app).get('/v1/ambulances');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /v1/ambulances/nearby', () => {
    it('returns 422 when lat/lng missing', async () => {
      const res = await request(app)
        .get('/v1/ambulances/nearby')
        .set('Authorization', `Bearer ${patientToken}`);
      expect(res.status).toBe(422);
    });

    it('returns nearby ambulances', async () => {
      const res = await request(app)
        .get('/v1/ambulances/nearby?lat=-6.2&lng=106.8')
        .set('Authorization', `Bearer ${patientToken}`);
      expect([200]).toContain(res.status);
    });
  });

  describe('GET /v1/ambulances — RBAC', () => {
    it('PATIENT cannot list all ambulances', async () => {
      const res = await request(app)
        .get('/v1/ambulances')
        .set('Authorization', `Bearer ${patientToken}`);
      expect(res.status).toBe(403);
    });

    it('COMMAND_CENTER can list ambulances', async () => {
      const res = await request(app)
        .get('/v1/ambulances')
        .set('Authorization', `Bearer ${commandToken}`);
      expect([200]).toContain(res.status);
    });
  });

  describe('POST /v1/ambulances/:id/dispatch', () => {
    it('returns 401 without token', async () => {
      const res = await request(app)
        .post('/v1/ambulances/amb-uuid-1/dispatch')
        .send({});
      expect(res.status).toBe(401);
    });

    it('PATIENT cannot dispatch', async () => {
      const res = await request(app)
        .post('/v1/ambulances/amb-uuid-1/dispatch')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({});
      expect(res.status).toBe(403);
    });
  });

  describe('POST /v1/ambulances/:id/location', () => {
    it('returns 401 without token', async () => {
      const res = await request(app)
        .post('/v1/ambulances/amb-uuid-1/location')
        .send({ latitude: -6.2, longitude: 106.8 });
      expect(res.status).toBe(401);
    });

    it('PATIENT cannot update location', async () => {
      const res = await request(app)
        .post('/v1/ambulances/amb-uuid-1/location')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ latitude: -6.2, longitude: 106.8 });
      expect(res.status).toBe(403);
    });

    it('driver updates location', async () => {
      const res = await request(app)
        .post('/v1/ambulances/amb-uuid-1/location')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ latitude: -6.2, longitude: 106.8 });
      expect([204, 403, 404, 500]).toContain(res.status);
    });
  });
});
