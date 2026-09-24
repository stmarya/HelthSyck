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

function getMockRedis(): { get: jest.Mock; set: jest.Mock; setex: jest.Mock; del: jest.Mock } {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Ctor = require('ioredis') as { __redis: { get: jest.Mock; set: jest.Mock; setex: jest.Mock; del: jest.Mock } };
  return Ctor.__redis;
}

// ─────────────────────────────────────────────
// GET /health
// ─────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with service info', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('auth-service');
    expect(res.body).toHaveProperty('timestamp');
  });
});

// ─────────────────────────────────────────────
// POST /v1/auth/register — validation
// ─────────────────────────────────────────────

describe('POST /v1/auth/register — validation', () => {
  it('returns 422 when email is invalid', async () => {
    const res = await request(app)
      .post('/v1/auth/register')
      .send({ email: 'not-an-email', password: 'Test@1234', name: 'Test', role: 'PATIENT' });
    expect(res.status).toBe(422);
    expect(res.body.status).toBe(422);
    expect(res.body).toHaveProperty('type');
    expect(res.body).toHaveProperty('requestId');
  });

  it('returns 422 when password is too weak', async () => {
    const res = await request(app)
      .post('/v1/auth/register')
      .send({ email: 'test@test.com', password: 'weak', name: 'Test', role: 'PATIENT' });
    expect(res.status).toBe(422);
  });

  it('returns 422 when name is too short', async () => {
    const res = await request(app)
      .post('/v1/auth/register')
      .send({ email: 'test@test.com', password: 'Test@1234', name: 'T', role: 'PATIENT' });
    expect(res.status).toBe(422);
  });
});

// ─────────────────────────────────────────────
// POST /v1/auth/register — success
// ─────────────────────────────────────────────

describe('POST /v1/auth/register — success', () => {
  it('returns 201 with tokens when registration succeeds', async () => {
    const mockPool = getMockPool();
    mockPool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // email uniqueness check
      .mockResolvedValueOnce({
        rows: [{ id: 'uuid-1', email: 'test@example.com', role: 'PATIENT' }],
        rowCount: 1,
      }) // INSERT user
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // audit log

    const res = await request(app).post('/v1/auth/register').send({
      email: 'test@example.com',
      password: 'Test@1234',
      name: 'Test User',
      role: 'PATIENT',
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
    expect(res.body.data).toHaveProperty('userId');
    expect(res.body.meta).toHaveProperty('timestamp');
  });
});

// ─────────────────────────────────────────────
// POST /v1/auth/register — duplicate email
// ─────────────────────────────────────────────

describe('POST /v1/auth/register — duplicate email', () => {
  it('returns 409 when email already exists', async () => {
    const mockPool = getMockPool();
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'existing-id' }],
      rowCount: 1,
    });

    const res = await request(app).post('/v1/auth/register').send({
      email: 'existing@example.com',
      password: 'Test@1234',
      name: 'Existing User',
      role: 'PATIENT',
    });

    expect(res.status).toBe(409);
    expect(res.body.status).toBe(409);
  });
});

// ─────────────────────────────────────────────
// POST /v1/auth/login — validation
// ─────────────────────────────────────────────

describe('POST /v1/auth/login — validation', () => {
  it('returns 422 when login body is invalid', async () => {
    const res = await request(app).post('/v1/auth/login').send({ email: 'bad' });
    expect(res.status).toBe(422);
  });
});

// ─────────────────────────────────────────────
// POST /v1/auth/login — user not found
// ─────────────────────────────────────────────

describe('POST /v1/auth/login — user not found', () => {
  it('returns 401 when user not found', async () => {
    const mockPool = getMockPool();
    mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'Test@1234' });
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────
// POST /v1/auth/refresh
// ─────────────────────────────────────────────

describe('POST /v1/auth/refresh', () => {
  it('returns 422 when refreshToken is missing', async () => {
    const res = await request(app).post('/v1/auth/refresh').send({});
    expect(res.status).toBe(422);
  });

  it('returns 401 when refreshToken is invalid', async () => {
    const mockRedis = getMockRedis();
    mockRedis.get.mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/v1/auth/refresh')
      .send({ refreshToken: 'invalid-token-xyz' });
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────
// GET /v1/auth/me — authentication
// ─────────────────────────────────────────────

describe('GET /v1/auth/me', () => {
  it('returns 401 when no Authorization header', async () => {
    const res = await request(app).get('/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 when token is malformed', async () => {
    const res = await request(app)
      .get('/v1/auth/me')
      .set('Authorization', 'Bearer bad.token.here');
    expect(res.status).toBe(401);
  });

  it('returns 200 on /v1/auth/me with valid JWT', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');
    const secret = process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production';
    const token = jwt.sign({ sub: 'user-uuid-1', role: 'PATIENT' }, secret, { expiresIn: '15m' });

    const mockPool = getMockPool();
    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'user-uuid-1',
          email: 'test@test.com',
          phone: null,
          role: 'PATIENT',
          status: 'ACTIVE',
          last_login_at: null,
          created_at: new Date(),
        },
      ],
      rowCount: 1,
    })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // patient profile
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // doctor profile

    const res = await request(app)
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('userId');
  });
});
