import { Router, Request, Response } from "express";
import { z } from "zod";
import { validate } from "../../middleware/validate.js";
import { logEvent, isAnticheatError } from "../../services/anticheat.service.js";

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

export const logEventSchema = z.object({
  exercise_id: z.string().min(1, "Exercise ID is required"),
  event_type: z.enum(["fullscreen_exit", "visibility_hidden", "window_blur"], {
    errorMap: () => ({
      message:
        "Event type must be one of: fullscreen_exit, visibility_hidden, window_blur",
    }),
  }),
  warning_count: z.number().int().min(0, "Warning count must be a non-negative integer"),
  submission_id: z.string().optional(),
});

// ─── Router ──────────────────────────────────────────────────────────────────

const router = Router();

/**
 * POST /api/anticheat/events
 * Log an anti-cheat event. Student only.
 * Called by the frontend Anti-Cheat Monitor when a violation is detected.
 */
router.post(
  "/events",
  validate(logEventSchema),
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.user!;
      const { exercise_id, event_type, warning_count, submission_id } = req.body;

      const result = await logEvent({
        studentId: userId,
        exerciseId: exercise_id,
        eventType: event_type,
        warningCount: warning_count,
        submissionId: submission_id,
      });

      if (isAnticheatError(result)) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred",
        },
      });
    }
  }
);

export default router;
