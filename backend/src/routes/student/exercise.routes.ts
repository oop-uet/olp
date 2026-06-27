import { Router, Request, Response } from "express";
import {
  listStudentExercises,
  getStudentExercise,
  isStudentError,
} from "../../services/student.service.js";

// ─── Router ──────────────────────────────────────────────────────────────────

const router = Router();

/**
 * GET /api/students/exercises
 * List all exercises assigned to the sections the current student is enrolled in.
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.userId;
    const result = await listStudentExercises(studentId);
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
 * GET /api/students/exercises/:id
 * Get a single assigned exercise detail (visible test cases only) for the
 * current student.
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.userId;
    const result = await getStudentExercise(studentId, req.params.id);

    if (isStudentError(result)) {
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
