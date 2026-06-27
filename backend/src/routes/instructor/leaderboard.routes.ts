import { Router, Request, Response } from "express";
import { getLeaderboard, isLeaderboardError } from "../../services/leaderboard.service.js";

// ─── Router ──────────────────────────────────────────────────────────────────

const router = Router({ mergeParams: true });

/**
 * GET /api/sections/:id/leaderboard
 * Get leaderboard for a class section.
 * Accessible by Instructor and Student roles.
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const sectionId = req.params.id;

    if (!sectionId) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Section ID is required.",
        },
      });
      return;
    }

    const result = await getLeaderboard(sectionId);

    if (isLeaderboardError(result)) {
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
