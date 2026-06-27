import { Router, Request, Response } from "express";
import {
  listSubmissions,
  getSubmissionById,
  isSubmissionError,
} from "../../services/submission.service.js";

// ─── Router ──────────────────────────────────────────────────────────────────

const router = Router();

/**
 * GET /api/submissions
 * List submissions filtered by exercise_id, section_id, student_id.
 * Instructors see all matching submissions.
 * Students are restricted to their own submissions only (auto-filtered by userId).
 *
 * For students, results are grouped by exercise and sorted by most recent first.
 *
 * Validates: Requirements 5.5, 8.1
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { exercise_id, section_id, student_id } = req.query;

    const filters: {
      exerciseId?: string;
      sectionId?: string;
      studentId?: string;
    } = {};

    if (typeof exercise_id === "string" && exercise_id) {
      filters.exerciseId = exercise_id;
    }
    if (typeof section_id === "string" && section_id) {
      filters.sectionId = section_id;
    }
    if (typeof student_id === "string" && student_id) {
      filters.studentId = student_id;
    }

    // Students can only see their own submissions
    if (req.user?.role === "student") {
      filters.studentId = req.user.userId;
    }

    const result = await listSubmissions(filters);

    // For students, group submissions by exercise
    if (req.user?.role === "student") {
      const grouped: Record<string, typeof result> = {};
      for (const submission of result) {
        const exerciseId = submission.exerciseId;
        if (!grouped[exerciseId]) {
          grouped[exerciseId] = [];
        }
        grouped[exerciseId].push(submission);
      }
      res.status(200).json({ grouped, submissions: result });
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

/**
 * GET /api/submissions/:id
 * Get full submission detail with per-test-case results.
 * Instructors see all test case details.
 * Students can only view their own submissions and see only visible test case results.
 *
 * Validates: Requirements 5.1, 8.2
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const result = await getSubmissionById(req.params.id);

    if (isSubmissionError(result)) {
      res.status(404).json({ error: result.error });
      return;
    }

    // Students can only view their own submissions
    if (req.user?.role === "student") {
      if ((result as any).studentId !== req.user.userId) {
        res.status(403).json({
          error: {
            code: "INSUFFICIENT_PERMISSIONS",
            message: "You can only view your own submissions.",
          },
        });
        return;
      }

      // Filter test case results to only show visible test cases
      const submission = result as any;
      if (submission.results) {
        submission.results = submission.results.filter(
          (r: any) => r.testCase && r.testCase.isVisible === 1
        );
      }
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
