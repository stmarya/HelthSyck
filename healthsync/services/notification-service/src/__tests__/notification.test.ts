/**
 * notification-service tests
 * NOTE: Uses inline JWT — set JWT_SECRET before module load.
 */

// Must be set before module import so the inline JWT_SECRET constant picks it up
process.env['JWT_SECRET'] = 'test-secret';

import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('pg', () => {
  const mockQuery = jest.fn(async (sql: string, params?: unknown[]) => {
    const s = sql.trim().toUpperCase();
    if (s.includes('COUNT(*)')) return { rows: [{ count: '3' }] };

    if (s.includes('FROM NOTIFICATIONS') && s.includes('USER_ID')) {
      return {
        rows: [
          { id: 'notif-uuid-1', channel: 'IN_APP', status: 'SENT', title: 'Test', body: 'Body', created_at: new Date() },
          { id: 'notif-uuid-2', channel: 'PUSH', status: 'SENT', title: 'Alert', body: 'Critical', created_at: new Date() },
        ],
      };
    }

    if (s.startsWith('UPDATE NOTIFICATIONS')) {
      return { rows: [{ id: 'notif-uuid-1' }], rowCount: 1 };
    }

    if (s.startsWith('INSERT INTO PUSH_TOKENS')) {
      return { rows: [{ id: 'push-uuid-1' }] };
    }

    if (s.startsWith('UPDATE PUSH_TOKENS')) {
      return { rows: [{ id: 'push-uuid-1' }], rowCount: 1 };
    }

    if (s.startsWith('INSERT INTO NOTIFICATIONS') || s.startsWith('INSERT INTO MEDICAL_AUDIT')) {
      return { rows: [{ id: 'notif-uuid-new', created_at: new Date() }] };
    }

    if (s.includes('FROM PUSH_TOKENS')) {
      return { rows: [{ id: 'push-uuid-1', token: 'test-fcm-token', platform: 'ANDROID', user_id: params?.[0] }] };
    }

    return { rows: [] };
  });
  return {
    Pool: jest.fn(() => ({
      query: mockQuery,
      end: jest.fn().mockResolvedValue(undefined),
    })),
  };
});

jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    lrange: jest.fn().mockResolvedValue([]),
    rpush: jest.fn().mockResolvedValue(1),
  }))
);

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: { applicationDefault: jest.fn() },
  messaging: jest.fn().mockReturnValue({
    send: jest.fn().mockResolvedValue('message-id-1'),
  }),
}));

import app from '../index';

const makeToken = (role: string, sub = `${role}-uuid-1`) =>
  jwt.sign({ sub, role }, 'test-secret', { expiresIn: '1h' });

const patientToken = makeToken('PATIENT', 'patient-uuid-1');

describe('notification-service', () => {

  describe('GET /health', () => {
    it('returns 200', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.service).toBe('notification-service');
    });
  });

  describe('Auth guards', () => {
    it('GET /v1/notifications → 401 without token', async () => {
      const res = await request(app).get('/v1/notifications');
      expect(res.status).toBe(401);
    });

    it('PUT /v1/notifications/read → 401 without token', async () => {
      const res = await request(app).put('/v1/notifications/read').send({});
      expect(res.status).toBe(401);
    });
  });

  describe('GET /v1/notifications', () => {
    it('returns notification list', async () => {
      const res = await request(app)
        .get('/v1/notifications')
        .set('Authorization', `Bearer ${patientToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('notifications');
    });

    it('supports unread filter', async () => {
      const res = await request(app)
        .get('/v1/notifications?unread=true')
        .set('Authorization', `Bearer ${patientToken}`);
      expect(res.status).toBe(200);
    });
  });

  describe('GET /v1/notifications/unread-count', () => {
    it('returns count', async () => {
      const res = await request(app)
        .get('/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${patientToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('count');
    });
  });

  describe('PUT /v1/notifications/read', () => {
    it('returns 422 when notificationIds is missing', async () => {
      const res = await request(app)
        .put('/v1/notifications/read')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({});
      expect(res.status).toBe(422);
    });

    it('marks notifications as read', async () => {
      const res = await request(app)
        .put('/v1/notifications/read')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ notificationIds: ['aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'] });
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('updated');
    });
  });

  describe('POST /v1/devices/push-token', () => {
    it('returns 422 when platform is invalid', async () => {
      const res = await request(app)
        .post('/v1/devices/push-token')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ token: 'fcm-token', platform: 'UNKNOWN' });
      expect(res.status).toBe(422);
    });

    it('registers push token', async () => {
      const res = await request(app)
        .post('/v1/devices/push-token')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ token: 'fcm-token-123', platform: 'ANDROID' });
      expect(res.status).toBe(201);
    });
  });

  describe('DELETE /v1/devices/push-token/:token', () => {
    it('deregisters push token', async () => {
      const res = await request(app)
        .delete('/v1/devices/push-token/fcm-token-123')
        .set('Authorization', `Bearer ${patientToken}`);
      expect(res.status).toBe(200);
    });
  });
});
