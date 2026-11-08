import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app';

describe('Health endpoints', () => {
  it('GET /api/health returns status', async () => {
    const res = await request(app).get('/api/health');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('database');
  });

  it('GET /api/ready returns ready status', async () => {
    const res = await request(app).get('/api/ready');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('ready');
  });

  it('GET /api/nonexistent returns 404', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
