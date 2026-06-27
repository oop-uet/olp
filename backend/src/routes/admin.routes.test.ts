import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.guard.js';
import { getQuotaStatus } from '../services/quota.service.js';
import { generateTestToken, TEST_JWT_SECRET } from '../test/helpers.js';

// Set up a minimal express app for testing
function createTestApp() {
  const app = express();
  app.use(express.json());

  app.get(
    '/api/admin/quota-status',
    authMiddleware({ secret: TEST_JWT_SECRET }),
    requireRole('admin'),
    async (_req, res) => {
      try {
        const quotaStatus = await getQuotaStatus();
        res.status(200).json(quotaStatus);
      } catch (error) {
        res.status(500).json({
          error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve quota status' },
        });
      }
    }
  );

  return app;
}

describe('GET /api/admin/quota-status', () => {
  const app = createTestApp();

  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/admin/quota-status');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_MISSING');
  });

  it('returns 403 when a student tries to access', async () => {
    const token = generateTestToken('student-1', 'student', { secret: TEST_JWT_SECRET });
    const res = await request(app)
      .get('/api/admin/quota-status')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
  });

  it('returns 403 when an instructor tries to access', async () => {
    const token = generateTestToken('instructor-1', 'instructor', { secret: TEST_JWT_SECRET });
    const res = await request(app)
      .get('/api/admin/quota-status')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
  });

  it('returns 200 with quota status for admin user', async () => {
    const token = generateTestToken('admin-1', 'admin', { secret: TEST_JWT_SECRET });
    const res = await request(app)
      .get('/api/admin/quota-status')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('services');
    expect(res.body).toHaveProperty('warnings');
    expect(res.body.services).toHaveLength(4);

    // Verify response structure
    const serviceNames = res.body.services.map((s: any) => s.name);
    expect(serviceNames).toContain('turso_reads');
    expect(serviceNames).toContain('turso_writes');
    expect(serviceNames).toContain('r2_storage');
    expect(serviceNames).toContain('render_compute');

    // Each service has the right shape
    for (const service of res.body.services) {
      expect(service).toHaveProperty('name');
      expect(service).toHaveProperty('current');
      expect(service).toHaveProperty('limit');
      expect(service).toHaveProperty('percentage');
      expect(service).toHaveProperty('status');
      expect(typeof service.current).toBe('number');
      expect(typeof service.limit).toBe('number');
      expect(typeof service.percentage).toBe('number');
      expect(['ok', 'warning']).toContain(service.status);
    }
  });

  it('returns correct status values based on percentage thresholds', async () => {
    const token = generateTestToken('admin-1', 'admin', { secret: TEST_JWT_SECRET });
    const res = await request(app)
      .get('/api/admin/quota-status')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    // With default mock values (all below 80%), all statuses should be 'ok'
    for (const service of res.body.services) {
      expect(service.status).toBe('ok');
    }
    expect(res.body.warnings).toEqual([]);
  });
});
