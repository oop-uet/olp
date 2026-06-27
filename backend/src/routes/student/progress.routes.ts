import { Router, Request, Response } from "express";
import { getStudentProgress } from "../../services/submission.service.js";

// ─── Router ──────────────────────────────────────────────────────────────────

const router = Router();

/**
 * GET /api/students/progress
 * Returns the progress summary for the current authenticated student.
 * Requires query param: section_id
 *
 * Response:
 * - completedExercises: count of exercises with at least one submission scoring 100%
 * - averageScore: average score across all assigned exercises (0 for unsubmitted)
 * - rank: student's rank among students in the class section
 *
 * Validates: Requirements 8.3
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { section_id } = req.query;

    if (!section_id || typeof section_id !== "string") {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "section_id query parameter is required.",
        },
      });
      return;
    }

    const studentId = req.user!.userId;
    const result = await getStudentProgress(studentId, section_id);

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
