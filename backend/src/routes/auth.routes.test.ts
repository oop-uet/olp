import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { TEST_JWT_SECRET, generateTestToken } from '../test/helpers.js';

// Set the JWT_SECRET before any module imports that depend on it
process.env.JWT_SECRET = TEST_JWT_SECRET;

// Mock the auth service
vi.mock('../services/auth.service.js', () => ({
  login: vi.fn(),
  refreshToken: vi.fn(),
  logout: vi.fn(),
  isAuthError: (value: unknown): boolean => {
    return (
      typeof value === 'object' &&
      value !== null &&
      'error' in value &&
      typeof (value as any).error?.code === 'string'
    );
  },
  AuthErrorCode: {
    INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
    ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
    TOKEN_EXPIRED: 'TOKEN_EXPIRED',
    TOKEN_INVALID: 'TOKEN_INVALID',
  },
}));

import { login, refreshToken, logout } from '../services/auth.service.js';
import authRoutes from './auth.routes.js';

const mockedLogin = vi.mocked(login);
const mockedRefreshToken = vi.mocked(refreshToken);
const mockedLogout = vi.mocked(logout);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  return app;
}

describe('Auth Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    app = createApp();
    vi.clearAllMocks();
  });

  describe('POST /api/auth/login', () => {
    it('should return 200 with tokens and user on successful login', async () => {
      const loginResult = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
        user: {
          id: 'user-1',
          username: 'student1',
          email: 'student1@uet.vnu.edu.vn',
          role: 'student',
        },
      };
      mockedLogin.mockResolvedValue(loginResult);

      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'student1', password: 'password123' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(loginResult);
      expect(mockedLogin).toHaveBeenCalledWith('student1', 'password123');
    });

    it('should return 401 for invalid credentials', async () => {
      mockedLogin.mockResolvedValue({
        error: {
          code: 'INVALID_CREDENTIALS' as const,
          message: 'Invalid username or password',
        },
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'baduser', password: 'wrongpass' });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(response.body.error.message).toBe('Invalid username or password');
    });

    it('should return 423 for locked account', async () => {
      mockedLogin.mockResolvedValue({
        error: {
          code: 'ACCOUNT_LOCKED' as const,
          message: 'Account is temporarily locked. Please try again later.',
        },
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'lockeduser', password: 'password123' });

      expect(response.status).toBe(423);
      expect(response.body.error.code).toBe('ACCOUNT_LOCKED');
    });

    it('should return 400 if username is missing', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ password: 'password123' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'username' }),
        ])
      );
    });

    it('should return 400 if password is missing', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'student1' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'password' }),
        ])
      );
    });

    it('should return 400 if both fields are empty strings', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: '', password: '' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details.length).toBe(2);
    });

    it('should return 400 if body is empty', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 500 on unexpected service error', async () => {
      mockedLogin.mockRejectedValue(new Error('DB connection failed'));

      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'student1', password: 'password123' });

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should return 200 with new access token on valid refresh', async () => {
      mockedRefreshToken.mockResolvedValue({ accessToken: 'new-access-token' });

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'valid-refresh-token' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ accessToken: 'new-access-token' });
      expect(mockedRefreshToken).toHaveBeenCalledWith('valid-refresh-token');
    });

    it('should return 401 for expired refresh token', async () => {
      mockedRefreshToken.mockResolvedValue({
        error: {
          code: 'TOKEN_EXPIRED' as const,
          message: 'Refresh token has expired',
        },
      });

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'expired-token' });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_EXPIRED');
    });

    it('should return 401 for invalid refresh token', async () => {
      mockedRefreshToken.mockResolvedValue({
        error: {
          code: 'TOKEN_INVALID' as const,
          message: 'Refresh token is invalid',
        },
      });

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-token' });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_INVALID');
    });

    it('should return 400 if refreshToken is missing', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'refreshToken' }),
        ])
      );
    });

    it('should return 400 if refreshToken is empty', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: '' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 500 on unexpected service error', async () => {
      mockedRefreshToken.mockRejectedValue(new Error('Unexpected error'));

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'some-token' });

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should return 200 with success on authenticated logout', async () => {
      mockedLogout.mockResolvedValue({ success: true });
      const token = generateTestToken('user-1', 'student');

      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
      expect(mockedLogout).toHaveBeenCalledWith('user-1');
    });

    it('should return 401 if no token is provided', async () => {
      const response = await request(app)
        .post('/api/auth/logout');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_MISSING');
    });

    it('should return 401 if token is invalid', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_INVALID');
    });

    it('should return 500 on unexpected service error', async () => {
      mockedLogout.mockRejectedValue(new Error('Unexpected error'));
      const token = generateTestToken('user-1', 'student');

      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
