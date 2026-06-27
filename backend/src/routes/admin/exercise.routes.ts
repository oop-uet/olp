import { Router, Request, Response } from "express";
import { listExercises, getExerciseById, deleteExercise, isExerciseError } from "../../services/exercise.service.js";

const router = Router();

/**
 * GET /api/admin/exercises
 * List all exercises in the system (admin view).
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const result = await listExercises(userId, "admin");
    res.status(200).json(result);
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  }
});

/**
 * GET /api/admin/exercises/:id
 * Get a single exercise with test cases.
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const result = await getExerciseById(req.params.id);
    if (isExerciseError(result)) {
      res.status(404).json({ error: result.error });
      return;
    }
    res.status(200).json(result);
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  }
});

/**
 * DELETE /api/admin/exercises/:id
 * Delete an exercise (admin can delete any).
 */
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const result = await deleteExercise(req.params.id, userId, "admin");
    if (isExerciseError(result)) {
      const status = result.error.code === "NOT_FOUND" ? 404 : 400;
      res.status(status).json({ error: result.error });
      return;
    }
    res.status(200).json(result);
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  }
});

export default router;
