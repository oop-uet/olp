import { Router, Request, Response } from "express";
import { getAnticheatLog, isAnticheatError } from "../../services/anticheat.service.js";

// ─── Router ──────────────────────────────────────────────────────────────────

const router = Router({ mergeParams: true });

/**
 * GET /api/submissions/:id/anticheat-log
 * Get the anti-cheat event log for a submission. Instructor only.
 * Returns all anticheat events for the submission's student+exercise combo,
 * sorted by occurredAt ascending.
 */
router.get("/:id/anticheat-log", async (req: Request, res: Response) => {
  try {
    const result = await getAnticheatLog(req.params.id);

    if (isAnticheatError(result)) {
      res.status(404).json({ error: result.error });
      return;
    }

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    });
  }
});

export default router;
