// Mock pg Pool — factory must be self-contained (hoisted by jest)
jest.mock('pg', () => {
  const q = jest.fn();
  const pool = { query: q, end: jest.fn() };
  return { Pool: jest.fn(() => pool), __pool: pool };
});

// Mock ioredis — factory must be self-contained (hoisted by jest)
jest.mock('ioredis', () => {
  const redis = {
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    ping: jest.fn().mockResolvedValue('PONG'),
    disconnect: jest.fn(),
    quit: jest.fn(),
  };
  const Ctor = jest.fn(() => redis);
  (Ctor as unknown as Record<string, unknown>).__redis = redis;
  return Ctor;
});

import request from 'supertest';
import app from '../index';

// ─────────────────────────────────────────────
// Helpers — reach into the hoisted mock instances
// ─────────────────────────────────────────────

function getMockPool(): { query: jest.Mock } {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pg = require('pg') as { __pool: { query: jest.Mock } };
  return pg.__pool;
}

function makeJwt(sub = 'u1', role = 'PATIENT'): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');
  return jwt.sign({ sub, role }, 'dev-secret-change-in-production', { expiresIn: '1h' });
}

// ─────────────────────────────────────────────
// GET /health
// ─────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with service info', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('patient-service');
    expect(res.body).toHaveProperty('timestamp');
  });
});

// ─────────────────────────────────────────────
// POST /v1/patients — validation
// ─────────────────────────────────────────────

describe('POST /v1/patients — validation', () => {
  it('returns 401 when no auth token', async () => {
    const res = await request(app).post('/v1/patients').send({ name: 'Test' });
    expect(res.status).toBe(401);
  });

  it('returns 422 when NIK is not 16 digits', async () => {
    const token = makeJwt();
    const res = await request(app)
      .post('/v1/patients')
      .set('Authorization', `Bearer ${token}`)
      .send({
        userId: 'u1',
        nik: '12345', // too short
        name: 'Budi',
        dateOfBirth: '1990-01-01',
        gender: 'MALE',
        bloodType: 'O+',
        phone: '08123456789',
        address: 'Jl. Merdeka No. 1, Jakarta',
      });
    expect(res.status).toBe(422);
  });

  it('returns 422 when required fields missing', async () => {
    const token = makeJwt();
    const res = await request(app)
      .post('/v1/patients')
      .set('Authorization', `Bearer ${token}`)
      .send({
        // userId and nik intentionally omitted
        name: 'Budi',
        gender: 'MALE',
      });
    expect(res.status).toBe(422);
  });

  it('returns 422 when gender is invalid', async () => {
    const token = makeJwt();
    const res = await request(app)
      .post('/v1/patients')
      .set('Authorization', `Bearer ${token}`)
      .send({
        userId: 'u1',
        nik: '3201234567890001',
        name: 'Budi Santoso',
        dateOfBirth: '1990-01-01',
        gender: 'UNKNOWN_GENDER', // invalid enum
        bloodType: 'O+',
        phone: '08123456789',
        address: 'Jl. Merdeka No. 1, Jakarta',
      });
    expect(res.status).toBe(422);
  });
});

// ─────────────────────────────────────────────
// POST /v1/patients — success
// ─────────────────────────────────────────────

describe('POST /v1/patients — success', () => {
  it('creates patient and returns 201 with valid JWT', async () => {
    const userId = '550e8400-e29b-41d4-a716-446655440001';
    const patientId = '550e8400-e29b-41d4-a716-446655440002';
    const token = makeJwt(userId, 'PATIENT');

    const mockPool = getMockPool();
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: userId }], rowCount: 1 }) // user exists check
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // NIK uniqueness
      .mockResolvedValueOnce({
        rows: [
          {
            id: patientId,
            user_id: userId,
            nik: '***',
            name: 'Budi',
            date_of_birth: '1990-01-01',
            gender: 'MALE',
            blood_type: 'O+',
            phone: '08123456789',
            address: 'Jakarta',
            emergency_contact_name: null,
            emergency_contact_phone: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        rowCount: 1,
      }) // INSERT patient
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // audit log

    const res = await request(app)
      .post('/v1/patients')
      .set('Authorization', `Bearer ${token}`)
      .send({
        userId,
        nik: '3201234567890001',
        name: 'Budi Santoso',
        dateOfBirth: '1990-01-01',
        gender: 'MALE',
        bloodType: 'O+',
        phone: '08123456789',
        address: 'Jl. Merdeka No. 1, Jakarta',
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id');
  });
});

// ─────────────────────────────────────────────
// GET /v1/patients/:id/vitals — no auth
// ─────────────────────────────────────────────

describe('GET /v1/patients/:id/vitals', () => {
  it('returns 401 on vitals without auth', async () => {
    const res = await request(app).get('/v1/patients/some-uuid/vitals');
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────
// POST /v1/patients/:id/vitals — validation
// ─────────────────────────────────────────────

describe('POST /v1/patients/:id/vitals — validation', () => {
  it('returns 422 when heart_rate is out of range', async () => {
    const token = makeJwt('u1', 'PATIENT');

    const res = await request(app)
      .post('/v1/patients/some-uuid/vitals')
      .set('Authorization', `Bearer ${token}`)
      .send({ heartRate: 500, spo2: 98 }); // heart_rate > 300

    expect(res.status).toBe(422);
  });
});

// ─────────────────────────────────────────────
// GET /v1/patients — RBAC
// ─────────────────────────────────────────────

describe('GET /v1/patients — RBAC', () => {
  it('returns 403 when PATIENT tries to list all patients', async () => {
    const token = makeJwt('u1', 'PATIENT');

    const res = await request(app)
      .get('/v1/patients')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
