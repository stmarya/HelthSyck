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
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
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

function getMockRedis(): { get: jest.Mock; set: jest.Mock; setex: jest.Mock; incr: jest.Mock; expire: jest.Mock; del: jest.Mock; ping: jest.Mock } {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Ctor = require('ioredis') as { __redis: { get: jest.Mock; set: jest.Mock; setex: jest.Mock; incr: jest.Mock; expire: jest.Mock; del: jest.Mock; ping: jest.Mock } };
  return Ctor.__redis;
}

function makeToken(sub: string, role: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');
  const secret = process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production';
  return jwt.sign({ sub, role }, secret, { expiresIn: '15m' });
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

  it('returns 503 when a dependency is degraded', async () => {
    const mockRedis = getMockRedis();
    mockRedis.ping.mockRejectedValueOnce(new Error('redis down'));

    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.redis).toBe(false);
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
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [{ id: 'uuid-1', email: 'test@example.com', role: 'PATIENT' }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

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
      .set('Authorization', 'Bearer ' + 'malformed-token');
    expect(res.status).toBe(401);
  });

  it('returns 200 on /v1/auth/me with valid JWT', async () => {
    const token = makeToken('user-uuid-1', 'PATIENT');

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
    });

    const res = await request(app)
      .get('/v1/auth/me')
      .set('Authorization', 'Bearer ' + token);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('userId');
  });
});

describe('Admin endpoints', () => {
  it('lists users with status filtering support', async () => {
    const mockPool = getMockPool();
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{
          id: 'user-1',
          email: 'active@example.com',
          phone: null,
          role: 'PATIENT',
          status: 'ACTIVE',
          created_at: new Date('2026-01-01T00:00:00Z').toISOString(),
          last_login_at: null,
          email_verified: true,
          phone_verified: false,
          name: 'Active User',
        }],
        rowCount: 1,
      });

    const res = await request(app)
      .get('/v1/auth/admin/users?status=ACTIVE&page=1&limit=20')
      .set('Authorization', 'Bearer ' + makeToken('admin-uuid', 'ADMIN'));

    expect(res.status).toBe(200);
    expect(mockPool.query.mock.calls[0]?.[1]).toContain('ACTIVE');
    expect(res.body.data[0]).toMatchObject({
      email: 'active@example.com',
      status: 'ACTIVE',
      lastLoginAt: null,
      emailVerified: true,
    });
  });

  it('creates admin users through the admin endpoint', async () => {
    const mockPool = getMockPool();
    mockPool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [{
          id: 'user-2',
          email: 'operator@example.com',
          phone: '081234567890',
          role: 'ADMIN',
          status: 'ACTIVE',
          created_at: new Date('2026-02-02T00:00:00Z').toISOString(),
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .post('/v1/auth/admin/users')
      .set('Authorization', 'Bearer ' + makeToken('admin-uuid', 'ADMIN'))
      .send({
        email: 'operator@example.com',
        password: 'Admin@1234',
        role: 'ADMIN',
        phone: '081234567890',
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      email: 'operator@example.com',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
  });

  it('prevents admins from suspending their own account', async () => {
    const adminId = '11111111-1111-1111-1111-111111111111';
    const res = await request(app)
      .patch('/v1/auth/admin/users/' + adminId)
      .set('Authorization', 'Bearer ' + makeToken(adminId, 'ADMIN'))
      .send({ status: 'SUSPENDED' });

    expect(res.status).toBe(409);
  });

  it('returns paginated admin audit logs', async () => {
    const mockPool = getMockPool();
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{
          id: '99',
          created_at: new Date('2026-03-03T10:00:00Z').toISOString(),
          event: 'ADMIN_USER_STATUS_UPDATE',
          ip_address: '127.0.0.1',
          user_email: 'admin@healthsync.id',
          status: 'SUCCESS',
          detail: '{"targetUserId":"user-1"}',
        }],
        rowCount: 1,
      });

    const res = await request(app)
      .get('/v1/auth/admin/logs?status=SUCCESS&limit=10')
      .set('Authorization', 'Bearer ' + makeToken('admin-uuid', 'ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      action: 'ADMIN_USER_STATUS_UPDATE',
      status: 'SUCCESS',
      userEmail: 'admin@healthsync.id',
    });
    expect(res.body.meta.total).toBe(1);
  });
});
