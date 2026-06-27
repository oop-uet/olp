/**
 * Access Control Integration Tests
 *
 * Validates: Requirements 1.3 (role-based access control), 1.5 (admin bypass)
 *
 * Tests that role guards correctly restrict endpoint access:
 * - Students cannot access instructor/admin endpoints (403)
 * - Instructors cannot access admin endpoints (403)
 * - Admins can access all endpoints (admin bypass)
 * - Unauthenticated requests are rejected (401)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Set JWT_SECRET before importing app so authMiddleware uses it
const TEST_SECRET = 'test-jwt-secret-do-not-use-in-production';
process.env.JWT_SECRET = TEST_SECRET;

// Import app after setting env
import app from '../index.js';

// ─── Token Helpers ───────────────────────────────────────────────────────────

function makeToken(role: 'student' | 'instructor' | 'admin', userId = 'test-user-id'): string {
  return jwt.sign({ sub: userId, role }, TEST_SECRET, { expiresIn: '1h' });
}

function authBearer(role: 'student' | 'instructor' | 'admin'): string {
  return `Bearer ${makeToken(role)}`;
}

// ─── Test Suites ─────────────────────────────────────────────────────────────

describe('Access Control Integration Tests', () => {
  // ─── Admin-only Endpoints ────────────────────────────────────────────────

  describe('Admin-only endpoints', () => {
    const adminEndpoints = [
      { method: 'get' as const, path: '/api/admin/sections' },
      { method: 'post' as const, path: '/api/admin/sections' },
      { method: 'get' as const, path: '/api/admin/config' },
      { method: 'get' as const, path: '/api/admin/quota-status' },
    ];

    describe('Students get 403 on admin endpoints', () => {
      it.each(adminEndpoints)(
        'GET/POST $path returns 403 for student',
        async ({ method, path }) => {
          const res = await request(app)
            [method](path)
            .set('Authorization', authBearer('student'))
            .send({});

          expect(res.status).toBe(403);
          expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
        }
      );
    });

    describe('Instructors get 403 on admin endpoints', () => {
      it.each(adminEndpoints)(
        'GET/POST $path returns 403 for instructor',
        async ({ method, path }) => {
          const res = await request(app)
            [method](path)
            .set('Authorization', authBearer('instructor'))
            .send({});

          expect(res.status).toBe(403);
          expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
        }
      );
    });

    describe('Admins can access admin endpoints', () => {
      it('GET /api/admin/sections returns non-403 for admin', async () => {
        const res = await request(app)
          .get('/api/admin/sections')
          .set('Authorization', authBearer('admin'));

        expect(res.status).not.toBe(403);
        expect(res.status).not.toBe(401);
      });

      it('GET /api/admin/config returns non-403 for admin', async () => {
        const res = await request(app)
          .get('/api/admin/config')
          .set('Authorization', authBearer('admin'));

        expect(res.status).not.toBe(403);
        expect(res.status).not.toBe(401);
      });

      it('GET /api/admin/quota-status returns non-403 for admin', async () => {
        const res = await request(app)
          .get('/api/admin/quota-status')
          .set('Authorization', authBearer('admin'));

        expect(res.status).not.toBe(403);
        expect(res.status).not.toBe(401);
      });
    });
  });

  // ─── Instructor-only Endpoints ──────────────────────────────────────────

  describe('Instructor-only endpoints', () => {
    const instructorEndpoints = [
      { method: 'get' as const, path: '/api/exercises' },
      { method: 'post' as const, path: '/api/exercises' },
      { method: 'get' as const, path: '/api/exercises/some-id' },
      { method: 'get' as const, path: '/api/exercises/some-id/testcases' },
      { method: 'put' as const, path: '/api/testcases/some-id' },
      { method: 'delete' as const, path: '/api/testcases/some-id' },
    ];

    describe('Students get 403 on instructor endpoints', () => {
      it.each(instructorEndpoints)(
        '$method $path returns 403 for student',
        async ({ method, path }) => {
          const res = await request(app)
            [method](path)
            .set('Authorization', authBearer('student'))
            .send({});

          expect(res.status).toBe(403);
          expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
        }
      );
    });

    describe('Admins can access instructor endpoints (admin bypass)', () => {
      it('GET /api/exercises returns non-403 for admin', async () => {
        const res = await request(app)
          .get('/api/exercises')
          .set('Authorization', authBearer('admin'));

        expect(res.status).not.toBe(403);
        expect(res.status).not.toBe(401);
      });

      it('GET /api/exercises/some-id/testcases returns non-403 for admin', async () => {
        const res = await request(app)
          .get('/api/exercises/some-id/testcases')
          .set('Authorization', authBearer('admin'));

        expect(res.status).not.toBe(403);
        expect(res.status).not.toBe(401);
      });
    });
  });

  // ─── Student-only Endpoints ─────────────────────────────────────────────

  describe('Student-only endpoints', () => {
    it('POST /api/submissions returns 403 for instructor', async () => {
      const res = await request(app)
        .post('/api/submissions')
        .set('Authorization', authBearer('instructor'))
        .send({
          exercise_id: 'ex-1',
          section_id: 'sec-1',
          code: 'class Foo {}',
          test_results: [{ test_case_id: 'tc-1', actual_output: 'ok', execution_time_ms: 100, status: 'passed' }],
        });

      // Instructor cannot POST submissions — should get 403
      // The student route has requireRole('student'), so instructor gets 403
      expect(res.status).toBe(403);
    });

    it('POST /api/anticheat/events returns 403 for instructor', async () => {
      const res = await request(app)
        .post('/api/anticheat/events')
        .set('Authorization', authBearer('instructor'))
        .send({
          exercise_id: 'ex-1',
          event_type: 'fullscreen_exit',
          warning_count: 1,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('GET /api/students/progress returns 403 for instructor', async () => {
      const res = await request(app)
        .get('/api/students/progress?section_id=sec-1')
        .set('Authorization', authBearer('instructor'));

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('Admin can POST /api/submissions (admin bypass)', async () => {
      const res = await request(app)
        .post('/api/submissions')
        .set('Authorization', authBearer('admin'))
        .send({
          exercise_id: 'ex-1',
          section_id: 'sec-1',
          code: 'class Foo {}',
          test_results: [{ test_case_id: 'tc-1', actual_output: 'ok', execution_time_ms: 100, status: 'passed' }],
        });

      // Admin bypass means role guard passes; may get a downstream error (not 403/401)
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(401);
    });

    it('Admin can POST /api/anticheat/events (admin bypass)', async () => {
      const res = await request(app)
        .post('/api/anticheat/events')
        .set('Authorization', authBearer('admin'))
        .send({
          exercise_id: 'ex-1',
          event_type: 'fullscreen_exit',
          warning_count: 1,
        });

      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(401);
    });
  });

  // ─── Mixed Endpoints (Instructor + Student) ─────────────────────────────

  describe('Mixed endpoints (instructor + student)', () => {
    it('GET /api/submissions accessible by student', async () => {
      const res = await request(app)
        .get('/api/submissions')
        .set('Authorization', authBearer('student'));

      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(401);
    });

    it('GET /api/submissions accessible by instructor', async () => {
      const res = await request(app)
        .get('/api/submissions')
        .set('Authorization', authBearer('instructor'));

      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(401);
    });

    it('GET /api/submissions/:id accessible by student', async () => {
      const res = await request(app)
        .get('/api/submissions/some-id')
        .set('Authorization', authBearer('student'));

      // May get 404 (submission not found) but not 403 or 401
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(401);
    });

    it('GET /api/sections/:id/leaderboard accessible by student', async () => {
      const res = await request(app)
        .get('/api/sections/some-section-id/leaderboard')
        .set('Authorization', authBearer('student'));

      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(401);
    });

    it('GET /api/sections/:id/leaderboard accessible by instructor', async () => {
      const res = await request(app)
        .get('/api/sections/some-section-id/leaderboard')
        .set('Authorization', authBearer('instructor'));

      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(401);
    });

    it('Admin can access mixed endpoints (admin bypass)', async () => {
      const res = await request(app)
        .get('/api/submissions')
        .set('Authorization', authBearer('admin'));

      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(401);
    });
  });

  // ─── Unauthenticated Requests ───────────────────────────────────────────

  describe('Unauthenticated requests get 401', () => {
    const protectedEndpoints = [
      { method: 'get' as const, path: '/api/admin/sections' },
      { method: 'get' as const, path: '/api/admin/config' },
      { method: 'get' as const, path: '/api/exercises' },
      { method: 'post' as const, path: '/api/submissions' },
      { method: 'get' as const, path: '/api/submissions' },
      { method: 'get' as const, path: '/api/sections/some-id/leaderboard' },
      { method: 'get' as const, path: '/api/students/progress' },
      { method: 'post' as const, path: '/api/anticheat/events' },
    ];

    it.each(protectedEndpoints)(
      '$method $path returns 401 without token',
      async ({ method, path }) => {
        const res = await request(app)
          [method](path)
          .send({});

        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('TOKEN_MISSING');
      }
    );

    it('returns 401 with invalid token', async () => {
      const res = await request(app)
        .get('/api/admin/sections')
        .set('Authorization', 'Bearer invalid-token-here');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_INVALID');
    });

    it('returns 401 with expired token', async () => {
      const expiredToken = jwt.sign(
        { sub: 'user-1', role: 'admin' },
        TEST_SECRET,
        { expiresIn: '0s' }
      );

      // Wait a tick for the token to expire
      await new Promise((resolve) => setTimeout(resolve, 10));

      const res = await request(app)
        .get('/api/admin/sections')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');
    });
  });

  // ─── Route Ordering: Student POST + Instructor GET on /api/submissions ──

  describe('Route ordering: /api/submissions', () => {
    it('Student can POST to /api/submissions (student submission route works)', async () => {
      const res = await request(app)
        .post('/api/submissions')
        .set('Authorization', authBearer('student'))
        .send({
          exercise_id: 'ex-1',
          section_id: 'sec-1',
          code: 'class Foo {}',
          test_results: [{ test_case_id: 'tc-1', actual_output: 'ok', execution_time_ms: 100, status: 'passed' }],
        });

      // Should not be blocked by role guard (student is allowed)
      // May fail downstream due to missing DB data, but NOT 403/401
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(401);
    });

    it('Student can GET /api/submissions (shared route works alongside POST)', async () => {
      const res = await request(app)
        .get('/api/submissions')
        .set('Authorization', authBearer('student'));

      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(401);
    });

    it('Instructor can GET /api/submissions but cannot POST', async () => {
      const getRes = await request(app)
        .get('/api/submissions')
        .set('Authorization', authBearer('instructor'));

      expect(getRes.status).not.toBe(403);
      expect(getRes.status).not.toBe(401);

      const postRes = await request(app)
        .post('/api/submissions')
        .set('Authorization', authBearer('instructor'))
        .send({
          exercise_id: 'ex-1',
          section_id: 'sec-1',
          code: 'class Foo {}',
          test_results: [{ test_case_id: 'tc-1', actual_output: 'ok', execution_time_ms: 100, status: 'passed' }],
        });

      expect(postRes.status).toBe(403);
    });
  });
});
