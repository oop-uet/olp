import { Router, Request, Response } from "express";
import { z } from "zod";
import { validate } from "../../middleware/validate.js";
import { requireRole } from "../../middleware/role.guard.js";
import {
  createSubmission,
  isSubmissionError,
} from "../../services/submission.service.js";

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const testResultSchema = z.object({
  test_case_id: z.string().min(1, "Test case ID is required"),
  actual_output: z.string(),
  execution_time_ms: z.number().int().min(0),
  status: z.enum(["passed", "failed", "timeout", "error"]),
});

export const createSubmissionSchema = z.object({
  exercise_id: z.string().min(1, "Exercise ID is required"),
  section_id: z.string().min(1, "Section ID is required"),
  code: z.string().min(1, "Code is required"),
  test_results: z
    .array(testResultSchema)
    .min(1, "At least one test result is required"),
  anti_cheat_nullified: z.boolean().optional(),
  exit_attempt: z.boolean().optional(),
});

// ─── Router ──────────────────────────────────────────────────────────────────

const router = Router();

/**
 * POST /api/submissions
 * Submit a solution for an exercise. Student only.
 */
router.post(
  "/",
  requireRole('student'),
  validate(createSubmissionSchema),
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.user!;
      const { exercise_id, section_id, code, test_results, anti_cheat_nullified, exit_attempt } = req.body;

      const result = await createSubmission({
        studentId: userId,
        exerciseId: exercise_id,
        sectionId: section_id,
        code,
        testResults: test_results,
        antiCheatNullified: anti_cheat_nullified,
        exitAttempt: exit_attempt,
      });

      if (isSubmissionError(result)) {
        const statusCode = getErrorStatusCode(result.error.code);
        res.status(statusCode).json({ error: result.error });
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getErrorStatusCode(code: string): number {
  switch (code) {
    case "NOT_FOUND":
      return 404;
    case "DEADLINE_PASSED":
      return 403;
    case "MAX_SUBMISSIONS_REACHED":
      return 403;
    default:
      return 400;
  }
}

export default router;
