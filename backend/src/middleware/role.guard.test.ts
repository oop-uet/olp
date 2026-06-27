import { describe, it, expect, vi } from 'vitest';
import { Request, Response } from 'express';
import { requireRole } from './role.guard.js';

function createMockReq(user?: { userId: string; role: string }): Partial<Request> {
  return { user };
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

describe('requireRole', () => {
  it('should return 401 when req.user is not set', () => {
    const middleware = requireRole('student');
    const req = createMockReq(undefined) as Request;
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

  it('should return 403 with INSUFFICIENT_PERMISSIONS when role is not allowed', () => {
    const middleware = requireRole('admin');
    const req = createMockReq({ userId: 'user-1', role: 'student' }) as Request;
    const res = createMockRes() as Response;
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'INSUFFICIENT_PERMISSIONS',
        message: expect.any(String),
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() when user role matches allowed roles', () => {
    const middleware = requireRole('student', 'instructor');
    const req = createMockReq({ userId: 'user-1', role: 'student' }) as Request;
    const res = createMockRes() as Response;
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should allow admin access to student-only endpoints', () => {
    const middleware = requireRole('student');
    const req = createMockReq({ userId: 'admin-1', role: 'admin' }) as Request;
    const res = createMockRes() as Response;
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should allow admin access to instructor-only endpoints', () => {
    const middleware = requireRole('instructor');
    const req = createMockReq({ userId: 'admin-1', role: 'admin' }) as Request;
    const res = createMockRes() as Response;
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should allow admin access to mixed role endpoints', () => {
    const middleware = requireRole('student', 'instructor');
    const req = createMockReq({ userId: 'admin-1', role: 'admin' }) as Request;
    const res = createMockRes() as Response;
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should deny student access to instructor-only endpoints', () => {
    const middleware = requireRole('instructor');
    const req = createMockReq({ userId: 'user-1', role: 'student' }) as Request;
    const res = createMockRes() as Response;
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'INSUFFICIENT_PERMISSIONS',
        message: expect.any(String),
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should deny instructor access to admin-only endpoints', () => {
    const middleware = requireRole('admin');
    const req = createMockReq({ userId: 'user-1', role: 'instructor' }) as Request;
    const res = createMockRes() as Response;
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should allow instructor access when instructor is in allowed roles', () => {
    const middleware = requireRole('instructor');
    const req = createMockReq({ userId: 'user-1', role: 'instructor' }) as Request;
    const res = createMockRes() as Response;
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should handle multiple allowed roles correctly', () => {
    const middleware = requireRole('student', 'instructor', 'admin');
    const req = createMockReq({ userId: 'user-1', role: 'instructor' }) as Request;
    const res = createMockRes() as Response;
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
