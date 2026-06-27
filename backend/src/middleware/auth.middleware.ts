import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

declare global {
  namespace Express {
    interface Request {
      user?: { userId: string; role: string };
    }
  }
}

export interface AuthMiddlewareOptions {
  secret?: string;
}

/**
 * Authentication middleware that verifies JWT from the Authorization header.
 * On success, attaches decoded user info to req.user.
 * On failure, returns 401 with appropriate error code.
 */
export function authMiddleware(options?: AuthMiddlewareOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const secret = options?.secret || process.env.JWT_SECRET || '';
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: {
          code: 'TOKEN_MISSING',
          message: 'Authorization token is required. Provide a Bearer token in the Authorization header.',
        },
      });
      return;
    }

    const token = authHeader.slice(7); // Remove "Bearer " prefix

    try {
      const decoded = jwt.verify(token, secret) as jwt.JwtPayload;

      req.user = {
        userId: decoded.sub as string,
        role: decoded.role as string,
      };

      next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        res.status(401).json({
          error: {
            code: 'TOKEN_EXPIRED',
            message: 'Authentication token has expired. Please log in again.',
          },
        });
        return;
      }

      res.status(401).json({
        error: {
          code: 'TOKEN_INVALID',
          message: 'Authentication token is invalid.',
        },
      });
    }
  };
}
