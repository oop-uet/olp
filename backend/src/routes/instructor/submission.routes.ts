import { Router, Request, Response } from "express";
import { z } from "zod";
import {
  listSubmissions,
  getSubmissionById,
  gradeSubmission,
  isSubmissionError,
} from "../../services/submission.service.js";
import { requireRole } from "../../middleware/role.guard.js";
import { validate } from "../../middleware/validate.js";
import { db } from "../../db/index.js";
import { eq } from "drizzle-orm";
import { sectionEnrollments } from "../../db/schema.js";
import { listSectionsForInstructor, userCanAccessSection } from "../../services/section.service.js";

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
      sectionIds?: string[];
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

    // Students can see submissions from classes they are enrolled in
    if (req.user?.role === "student") {
      const enrollments = await db
        .select({ sectionId: sectionEnrollments.sectionId })
        .from(sectionEnrollments)
        .where(eq(sectionEnrollments.studentId, req.user.userId));

      const enrolledSectionIds = enrollments.map((e) => e.sectionId);

      if (enrolledSectionIds.length === 0) {
        res.status(200).json({ grouped: {}, submissions: [] });
        return;
      }

      if (typeof section_id === "string" && section_id) {
        if (!enrolledSectionIds.includes(section_id)) {
          res.status(403).json({ error: { code: "FORBIDDEN", message: "Bạn không tham gia lớp học này." } });
          return;
        }
        filters.sectionId = section_id;
      } else {
        filters.sectionIds = enrolledSectionIds;
      }
    }

    if (req.user?.role === "instructor") {
      const sections = await listSectionsForInstructor(req.user.userId, req.user.role);
      const accessibleSectionIds = sections.map((section: any) => section.id);

      if (accessibleSectionIds.length === 0) {
        res.status(200).json([]);
        return;
      }

      if (typeof section_id === "string" && section_id) {
        if (!accessibleSectionIds.includes(section_id)) {
          res.status(403).json({
            error: {
              code: "INSUFFICIENT_PERMISSIONS",
              message: "Bạn chỉ có thể xem bài nộp trong lớp học phần mình phụ trách.",
            },
          });
          return;
        }
        filters.sectionId = section_id;
      } else {
        filters.sectionIds = accessibleSectionIds;
      }
    }

    const result = await listSubmissions(filters);

    // For students, group submissions by exercise as fallback
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

    if (req.user?.role === "instructor") {
      const canAccess = await userCanAccessSection(
        (result as any).sectionId,
        req.user.userId,
        req.user.role
      );

      if (!canAccess) {
        res.status(403).json({
          error: {
            code: "INSUFFICIENT_PERMISSIONS",
            message: "Bạn chỉ có thể xem bài nộp trong lớp học phần mình phụ trách.",
          },
        });
        return;
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

/**
 * PATCH /api/submissions/:id/grade
 * Manually grade a submission (instructors only).
 * Sets manual score (0..100) and/or feedback, then returns the updated submission.
 */
const gradeSchema = z.object({
  score: z.number().min(0).max(100).optional(),
  feedback: z.string().max(5000).optional(),
});

router.patch(
  "/:id/grade",
  requireRole("instructor"),
  validate(gradeSchema),
  async (req: Request, res: Response) => {
    try {
      if (req.user?.role === "instructor") {
        const existing = await getSubmissionById(req.params.id);

        if (isSubmissionError(existing)) {
          res.status(404).json({ error: existing.error });
          return;
        }

        const canAccess = await userCanAccessSection(
          (existing as any).sectionId,
          req.user.userId,
          req.user.role
        );

        if (!canAccess) {
          res.status(403).json({
            error: {
              code: "INSUFFICIENT_PERMISSIONS",
              message: "Bạn chỉ có thể chấm bài nộp trong lớp học phần mình phụ trách.",
            },
          });
          return;
        }
      }

      const result = await gradeSubmission(req.params.id, req.body);

      if (isSubmissionError(result)) {
        const status = result.error.code === "NOT_FOUND" ? 404 : 400;
        res.status(status).json({ error: result.error });
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
  }
);

export default router;
