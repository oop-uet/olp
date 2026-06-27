import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { login, refreshToken, logout, isAuthError, AuthErrorCode } from '../services/auth.service.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// ─── Router ──────────────────────────────────────────────────────────────────

const router = Router();

/**
 * POST /api/auth/login
 * Public endpoint - authenticates user with username and password.
 */
router.post('/login', validate(loginSchema), async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    const result = await login(username, password);

    if (isAuthError(result)) {
      const statusCode = getAuthErrorStatus(result.error.code);
      res.status(statusCode).json({
        error: {
          code: result.error.code,
          message: result.error.message,
        },
      });
      return;
    }

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

/**
 * POST /api/auth/refresh
 * Refreshes the access token using a valid refresh token.
 */
router.post('/refresh', validate(refreshSchema), async (req: Request, res: Response) => {
  try {
    const { refreshToken: token } = req.body;
    const result = await refreshToken(token);

    if (isAuthError(result)) {
      res.status(401).json({
        error: {
          code: result.error.code,
          message: result.error.message,
        },
      });
      return;
    }

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

/**
 * POST /api/auth/logout
 * Authenticated endpoint - invalidates user session.
 */
router.post('/logout', authMiddleware(), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const result = await logout(userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAuthErrorStatus(code: string): number {
  switch (code) {
    case AuthErrorCode.ACCOUNT_LOCKED:
      return 423;
    case AuthErrorCode.INVALID_CREDENTIALS:
      return 401;
    case AuthErrorCode.TOKEN_EXPIRED:
    case AuthErrorCode.TOKEN_INVALID:
      return 401;
    default:
      return 401;
  }
}

export default router;
