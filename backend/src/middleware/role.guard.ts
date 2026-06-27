import { Request, Response, NextFunction } from 'express';

/**
 * Middleware factory that checks if the authenticated user has one of the allowed roles.
 * Admin role always has access to all endpoints.
 *
 * Must be used AFTER authMiddleware, as it relies on req.user being set.
 *
 * @param roles - Allowed roles for the endpoint
 * @returns Express middleware function
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        error: {
          code: 'TOKEN_MISSING',
          message: 'Authentication is required to access this resource.',
        },
      });
      return;
    }

    // Admin has access to all endpoints
    if (user.role === 'admin') {
      next();
      return;
    }

    // Check if user's role is in the allowed roles
    if (roles.includes(user.role)) {
      next();
      return;
    }

    res.status(403).json({
      error: {
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'You do not have permission to access this resource.',
      },
    });
  };
}
