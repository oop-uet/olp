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

// ─── Change Password ─────────────────────────────────────────────────────────

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

/**
 * POST /api/auth/change-password
 * Authenticated endpoint - changes user password.
 * If mustChangePassword was set, clears the flag after successful change.
 */
router.post('/change-password', authMiddleware(), validate(changePasswordSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { currentPassword, newPassword } = req.body;

    // Import dynamically to avoid circular deps
    const { comparePassword, hashPassword } = await import('../services/auth.service.js');
    const { db } = await import('../db/index.js');
    const { users } = await import('../db/schema.js');
    const { eq } = await import('drizzle-orm');

    // Get user
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
      return;
    }

    // Verify current password
    const isValid = await comparePassword(currentPassword, user.passwordHash);
    if (!isValid) {
      res.status(400).json({ error: { code: 'INVALID_PASSWORD', message: 'Current password is incorrect' } });
      return;
    }

    // Hash new password and update
    const newHash = await hashPassword(newPassword);
    await db.update(users).set({
      passwordHash: newHash,
      mustChangePassword: 0,
      updatedAt: new Date().toISOString(),
    }).where(eq(users.id, userId));

    res.status(200).json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
  }
});

export default router;
