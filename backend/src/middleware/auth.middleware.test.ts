import { describe, it, expect, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authMiddleware } from './auth.middleware.js';

const TEST_SECRET = 'test-secret-key';

function createMockReq(authHeader?: string): Partial<Request> {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
  };
}

function createMockRes(): Partial<Response> & { statusCode?: number; body?: unknown } {
  const res: Partial<Response> & { statusCode?: number; body?: unknown } = {};
  res.status = vi.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn().mockImplementation((data: unknown) => {
    res.body = data;
    return res;
  });
  return res;
}

describe('authMiddleware', () => {
  const middleware = authMiddleware({ secret: TEST_SECRET });

  it('should return 401 with TOKEN_MISSING when no Authorization header is present', () => {
    const req = createMockReq() as Request;
    const res = createMockRes() as Response;
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'TOKEN_MISSING',
        message: expect.any(String),
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 with TOKEN_MISSING when Authorization header does not start with Bearer', () => {
    const req = createMockReq('Basic some-token') as Request;
    const res = createMockRes() as Response;
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'TOKEN_MISSING',
        message: expect.any(String),
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 with TOKEN_INVALID when token is malformed', () => {
    const req = createMockReq('Bearer invalid-token') as Request;
    const res = createMockRes() as Response;
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'TOKEN_INVALID',
        message: expect.any(String),
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 with TOKEN_EXPIRED when token is expired', () => {
    const expiredToken = jwt.sign(
      { sub: 'user-123', role: 'student' },
      TEST_SECRET,
      { expiresIn: '0s' }
    );

    const req = createMockReq(`Bearer ${expiredToken}`) as Request;
    const res = createMockRes() as Response;
    const next = vi.fn();

    // Small delay to ensure token is expired
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'TOKEN_EXPIRED',
        message: expect.any(String),
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 with TOKEN_INVALID when token is signed with wrong secret', () => {
    const token = jwt.sign(
      { sub: 'user-123', role: 'student' },
      'wrong-secret',
      { expiresIn: '1h' }
    );

    const req = createMockReq(`Bearer ${token}`) as Request;
    const res = createMockRes() as Response;
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'TOKEN_INVALID',
        message: expect.any(String),
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should attach user info to req.user and call next() on valid token', () => {
    const token = jwt.sign(
      { sub: 'user-456', role: 'instructor' },
      TEST_SECRET,
      { expiresIn: '1h' }
    );

    const req = createMockReq(`Bearer ${token}`) as Request;
    const res = createMockRes() as Response;
    const next = vi.fn();

    middleware(req, res, next);

    expect(req.user).toEqual({
      userId: 'user-456',
      role: 'instructor',
    });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should correctly decode admin role from token', () => {
    const token = jwt.sign(
      { sub: 'admin-001', role: 'admin' },
      TEST_SECRET,
      { expiresIn: '1h' }
    );

    const req = createMockReq(`Bearer ${token}`) as Request;
    const res = createMockRes() as Response;
    const next = vi.fn();

    middleware(req, res, next);

    expect(req.user).toEqual({
      userId: 'admin-001',
      role: 'admin',
    });
    expect(next).toHaveBeenCalled();
  });

  it('should correctly decode student role from token', () => {
    const token = jwt.sign(
      { sub: 'student-789', role: 'student' },
      TEST_SECRET,
      { expiresIn: '1h' }
    );

    const req = createMockReq(`Bearer ${token}`) as Request;
    const res = createMockRes() as Response;
    const next = vi.fn();

    middleware(req, res, next);

    expect(req.user).toEqual({
      userId: 'student-789',
      role: 'student',
    });
    expect(next).toHaveBeenCalled();
  });
});
