/**
 * integration-service tests
 * NOTE: Uses inline JWT — set JWT_SECRET before module load.
 */

// Must be set before module import so the inline JWT_SECRET constant picks it up
process.env['JWT_SECRET'] = 'test-secret';

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../index';

const makeToken = (role: string, sub = `${role}-uuid-1`) =>
  jwt.sign({ sub, role }, 'test-secret', { expiresIn: '1h' });

const adminToken  = makeToken('ADMIN',  'admin-uuid-1');
const doctorToken = makeToken('DOCTOR', 'doctor-uuid-1');

describe('integration-service', () => {

  describe('GET /health', () => {
    it('returns 200 with service name', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.service).toBe('integration-service');
    });
  });

  describe('Auth guards', () => {
    it('POST /v1/satusehat/sync → 401 without token', async () => {
      const res = await request(app).post('/v1/satusehat/sync').send({});
      expect(res.status).toBe(401);
    });

    it('POST /v1/bpjs/eligibility → 401 without token', async () => {
      const res = await request(app).post('/v1/bpjs/eligibility').send({});
      expect(res.status).toBe(401);
    });

    it('POST /v1/bpjs/sep → 401 without token', async () => {
      const res = await request(app).post('/v1/bpjs/sep').send({});
      expect(res.status).toBe(401);
    });
  });

  describe('POST /v1/satusehat/sync', () => {
    it('returns 422 when resourceType is invalid', async () => {
      const res = await request(app)
        .post('/v1/satusehat/sync')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ resourceType: 'INVALID', resourceId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', action: 'CREATE' });
      expect(res.status).toBe(422);
    });

    it('returns 422 when resourceId is not UUID', async () => {
      const res = await request(app)
        .post('/v1/satusehat/sync')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ resourceType: 'Patient', resourceId: 'not-uuid', action: 'CREATE' });
      expect(res.status).toBe(422);
    });

    it('syncs Patient resource successfully', async () => {
      const res = await request(app)
        .post('/v1/satusehat/sync')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ resourceType: 'Patient', resourceId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', action: 'CREATE' });
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('syncId');
      expect(res.body.data.status).toBe('SYNCED');
    });

    it('syncs Encounter resource', async () => {
      const res = await request(app)
        .post('/v1/satusehat/sync')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ resourceType: 'Encounter', resourceId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', action: 'UPDATE' });
      expect(res.status).toBe(200);
    });
  });

  describe('GET /v1/satusehat/status', () => {
    it('returns connection status', async () => {
      const res = await request(app)
        .get('/v1/satusehat/status')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('provider', 'SATUSEHAT');
      expect(res.body.data).toHaveProperty('status');
    });
  });

  describe('POST /v1/bpjs/eligibility', () => {
    it('returns 422 when NIK is not 16 digits', async () => {
      const res = await request(app)
        .post('/v1/bpjs/eligibility')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ nik: '12345' });
      expect(res.status).toBe(422);
    });

    it('checks eligibility for valid NIK', async () => {
      const res = await request(app)
        .post('/v1/bpjs/eligibility')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ nik: '3271234567890001' });
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('isActive');
    });
  });

  describe('POST /v1/bpjs/sep', () => {
    it('returns 422 on invalid visitType', async () => {
      const res = await request(app)
        .post('/v1/bpjs/sep')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          patientId:     'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
          bpjsNumber:    '0001234567890',
          visitType:     'UNKNOWN',
          diagnosisCode: 'I25.1',
        });
      expect(res.status).toBe(422);
    });

    it('creates SEP successfully', async () => {
      const res = await request(app)
        .post('/v1/bpjs/sep')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          patientId:     'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
          bpjsNumber:    '0001234567890',
          visitType:     'RAWAT_JALAN',
          diagnosisCode: 'I25.1',
        });
      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('sepId');
      expect(res.body.data).toHaveProperty('sepNumber');
    });
  });
});
