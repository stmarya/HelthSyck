import request from 'supertest';
import jwt from 'jsonwebtoken';

const OWNER_USER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '22222222-2222-4222-8222-222222222222';
const OWNER_PATIENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_PATIENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DOCTOR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PHARMACY = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const RX = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

jest.mock('pg', () => {
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    const value = sql.replace(/\s+/g, ' ').trim().toUpperCase();
    if (value === 'SELECT 1') return { rows: [{ '?column?': 1 }], rowCount: 1 };
    if (value.includes('FROM PATIENTS WHERE USER_ID')) {
      const subject = params[0];
      return { rows: [{ id: subject === OWNER_USER ? OWNER_PATIENT : OTHER_PATIENT }], rowCount: 1 };
    }
    if (value.includes('FROM DOCTORS WHERE USER_ID')) return { rows: [{ id: DOCTOR }], rowCount: 1 };
    if (value.includes('FROM PHARMACY_STAFF')) return { rows: [{ pharmacy_id: PHARMACY }], rowCount: 1 };
    if (value.includes('COUNT(*) AS COUNT FROM PRESCRIPTIONS')) return { rows: [{ count: '1' }], rowCount: 1 };
    if (value.startsWith('SELECT P.* FROM PRESCRIPTIONS')) return { rows: [{ id: RX, patient_id: OWNER_PATIENT, doctor_id: DOCTOR, pharmacy_id: PHARMACY, status: 'CONFIRMED' }], rowCount: 1 };
    if (value.includes('FROM PRESCRIPTIONS P JOIN PATIENTS')) return { rows: [{ id: RX, patient_id: OWNER_PATIENT, doctor_id: DOCTOR, pharmacy_id: PHARMACY, status: 'READY', fulfillment_type: 'PICKUP' }], rowCount: 1 };
    if (value.includes('FROM PRESCRIPTION_ITEMS PI JOIN DRUGS')) return { rows: [], rowCount: 0 };
    if (value.startsWith('SELECT PATIENT_ID,DOCTOR_ID,PHARMACY_ID,STATUS,FULFILLMENT_TYPE FROM PRESCRIPTIONS')) {
      return { rows: [{ patient_id: OWNER_PATIENT, doctor_id: DOCTOR, pharmacy_id: PHARMACY, status: 'READY', fulfillment_type: 'PICKUP' }], rowCount: 1 };
    }
    if (value.startsWith('BEGIN') || value.startsWith('COMMIT') || value.startsWith('ROLLBACK')) return { rows: [], rowCount: 0 };
    return { rows: [], rowCount: 0 };
  });
  const client = { query, release: jest.fn() };
  return { Pool: jest.fn(() => ({ query, connect: jest.fn().mockResolvedValue(client), end: jest.fn() })) };
});

jest.mock('@healthsync/shared', () => {
  const token = require('jsonwebtoken');
  return {
    authenticate: (req: any, res: any, next: any) => { try { req.user = token.verify(req.headers.authorization?.slice(7), 'test-secret'); next(); } catch { res.status(401).json({ status: 401 }); } },
    requireRole: (...roles: string[]) => (req: any, res: any, next: any) => roles.includes(req.user?.role) ? next() : res.status(403).json({ status: 403 }),
    requestIdMiddleware: (req: any, _res: any, next: any) => { req.requestId = 'test-request'; next(); },
    errorHandler: () => (_error: any, _req: any, res: any, _next: any) => res.status(500).json({ status: 500 }),
    buildProblem: (status: number, title: string, detail: string) => ({ status, title, detail }),
    ok: (res: any, data: any, status = 200) => res.status(status).json({ data }),
    paginated: (res: any, data: any, page: number, limit: number, total: number) => res.status(200).json({ data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }),
  };
});

import app from '../index';
const sign = (role: string, sub: string) => jwt.sign({ role, sub }, 'test-secret');

describe('prescription security contracts', () => {
  it('reports database health', async () => { expect((await request(app).get('/health')).status).toBe(200); });
  it('rejects unauthenticated list access', async () => { expect((await request(app).get('/v1/prescriptions')).status).toBe(401); });
  it.each(['CONFIRMED', 'DELIVERING'])('accepts real database status filter %s', async (status) => {
    const response = await request(app).get(`/v1/prescriptions?status=${status}`).set('Authorization', `Bearer ${sign('ADMIN', OWNER_USER)}`);
    expect(response.status).toBe(200);
  });
  it('allows the owning patient to read detail', async () => {
    const response = await request(app).get(`/v1/prescriptions/${RX}`).set('Authorization', `Bearer ${sign('PATIENT', OWNER_USER)}`);
    expect(response.status).toBe(200);
  });
  it('blocks another patient from reading detail', async () => {
    const response = await request(app).get(`/v1/prescriptions/${RX}`).set('Authorization', `Bearer ${sign('PATIENT', OTHER_USER)}`);
    expect(response.status).toBe(403);
  });
  it('blocks another patient from completing a prescription', async () => {
    const response = await request(app).put(`/v1/prescriptions/${RX}/complete`).set('Authorization', `Bearer ${sign('PATIENT', OTHER_USER)}`);
    expect(response.status).toBe(403);
  });
});
