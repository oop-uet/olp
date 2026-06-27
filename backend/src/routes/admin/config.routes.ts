import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getConfig, updateConfig, isConfigError } from '../../services/config.service.js';
import { validate } from '../../middleware/validate.js';

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

export const updateConfigSchema = z.object({
  key: z.string().min(1, 'Configuration key is required'),
  value: z.string().min(1, 'Configuration value is required'),
});

// ─── Router ──────────────────────────────────────────────────────────────────

const router = Router();

/**
 * GET /api/admin/config
 * Admin-only endpoint - returns all system configuration values.
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const configs = await getConfig();
    res.status(200).json({ data: configs });
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
 * PUT /api/admin/config
 * Admin-only endpoint - updates a system configuration parameter.
 * Body: { key: string, value: string }
 */
router.put('/', validate(updateConfigSchema), async (req: Request, res: Response) => {
  try {
    const { key, value } = req.body;
    const updatedBy = req.user!.userId;

    const result = await updateConfig(key, value, updatedBy);

    if (isConfigError(result)) {
      const statusCode = result.error.code === 'NOT_FOUND' ? 404 : 400;
      res.status(statusCode).json({
        error: {
          code: result.error.code,
          message: result.error.message,
        },
      });
      return;
    }

    res.status(200).json({ data: result });
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

export default router;
