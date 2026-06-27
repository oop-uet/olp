import { Router, Request, Response } from "express";
import { getStudentProgress } from "../../services/submission.service.js";
import { listStudentSections } from "../../services/student.service.js";

// ─── Router ──────────────────────────────────────────────────────────────────

const router = Router();

/**
 * GET /api/students/progress
 * Returns the progress summary for the current authenticated student.
 * Optional query param: section_id. When omitted, the student's first enrolled
 * section is used. If the student has no enrolled sections, a zeroed summary is
 * returned with status 200.
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
    const studentId = req.user!.userId;
    const { section_id } = req.query;

    let sectionId: string | undefined;

    if (section_id && typeof section_id === "string") {
      sectionId = section_id;
    } else {
      // No section provided: fall back to the student's first enrolled section.
      const sections = await listStudentSections(studentId);
      if (sections.length === 0) {
        res.status(200).json({
          completedExercises: 0,
          averageScore: 0,
          rank: 0,
        });
        return;
      }
      sectionId = sections[0].id;
    }

    const result = await getStudentProgress(studentId, sectionId);

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
