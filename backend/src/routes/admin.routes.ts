import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.guard.js';
import { getQuotaStatus } from '../services/quota.service.js';
import { getAdminStats } from '../services/stats.service.js';

// ─── Router ──────────────────────────────────────────────────────────────────

const router = Router();

/**
 * GET /api/admin/stats
 * Admin dashboard aggregate statistics.
 */
router.get(
  '/stats',
  authMiddleware(),
  requireRole('admin'),
  async (_req: Request, res: Response) => {
    try {
      const stats = await getAdminStats();
      res.status(200).json(stats);
    } catch {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve stats' } });
    }
  }
);

/**
 * GET /api/admin/quota-status
 * Admin-only endpoint — returns free-tier quota usage for all monitored services.
 * Validates: Requirements 11.5, 11.7
 */
router.get(
  '/quota-status',
  authMiddleware(),
  requireRole('admin'),
  async (_req: Request, res: Response) => {
    try {
      const quotaStatus = await getQuotaStatus();
      res.status(200).json(quotaStatus);
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve quota status',
        },
      });
    }
  }
);

export default router;
