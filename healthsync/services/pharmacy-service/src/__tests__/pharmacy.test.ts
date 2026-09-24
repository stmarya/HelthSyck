import request from 'supertest';
import jwt from 'jsonwebtoken';

const PHARMACY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_PHARMACY = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PHARMACIST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ADMIN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

jest.mock('pg', () => {
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    const value = sql.replace(/\s+/g, ' ').trim().toUpperCase();
    if (value === 'SELECT 1') return { rows: [{ '?column?': 1 }], rowCount: 1 };
    if (value.includes('FROM PHARMACY_STAFF')) return { rows: params[1] === PHARMACY ? [{ one: 1 }] : [], rowCount: params[1] === PHARMACY ? 1 : 0 };
    if (value.includes('COUNT(*) AS COUNT FROM PHARMACIES')) return { rows: [{ count: '1' }], rowCount: 1 };
    if (value.includes('FROM PHARMACIES P LEFT JOIN PHARMACY_INVENTORY') && value.includes('GROUP BY P.ID')) {
      return { rows: [{ id: PHARMACY, name: 'Apotek Aman', license_number: 'SIA-001', is_active: true, drug_count: 1, low_stock_count: 0 }], rowCount: 1 };
    }
    if (value.includes('FROM PHARMACY_INVENTORY I JOIN DRUGS')) return { rows: [{ id: 'inv-1', drug_id: 'drug-1', stock_qty: 10 }], rowCount: 1 };
    if (value.includes('COUNT(DISTINCT P.ID)')) return { rows: [{ pharmacy_count: 1, drug_count: 1, total_units: 10, low_stock_count: 0, expired_count: 0, expiring_soon_count: 0, total_value: '10000' }], rowCount: 1 };
    if (value.includes('FROM PHARMACY_INVENTORY I JOIN DRUGS D')) return { rows: [], rowCount: 0 };
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

describe('pharmacy security and reporting contracts', () => {
  it('reports database health', async () => { expect((await request(app).get('/health')).status).toBe(200); });
  it('requires authentication for pharmacy list', async () => { expect((await request(app).get('/v1/pharmacies')).status).toBe(401); });
  it('supports server-side pharmacy search', async () => {
    const response = await request(app).get('/v1/pharmacies?q=Aman').set('Authorization', `Bearer ${sign('ADMIN', ADMIN)}`);
    expect(response.status).toBe(200);
  });
  it('allows assigned pharmacist to view inventory', async () => {
    const response = await request(app).get(`/v1/pharmacies/${PHARMACY}/inventory`).set('Authorization', `Bearer ${sign('PHARMACIST', PHARMACIST)}`);
    expect(response.status).toBe(200);
  });
  it('blocks pharmacist from another pharmacy', async () => {
    const response = await request(app).get(`/v1/pharmacies/${OTHER_PHARMACY}/inventory`).set('Authorization', `Bearer ${sign('PHARMACIST', PHARMACIST)}`);
    expect(response.status).toBe(403);
  });
  it('provides one aggregate report request for admin', async () => {
    const response = await request(app).get('/v1/pharmacies/reports/summary').set('Authorization', `Bearer ${sign('ADMIN', ADMIN)}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveProperty('pharmacies');
    expect(response.body.data).toHaveProperty('totals');
  });
  it('blocks non-admin report access', async () => {
    const response = await request(app).get('/v1/pharmacies/reports/summary').set('Authorization', `Bearer ${sign('PHARMACIST', PHARMACIST)}`);
    expect(response.status).toBe(403);
  });
});
