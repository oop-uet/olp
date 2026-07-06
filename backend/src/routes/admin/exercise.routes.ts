import { Router, Request, Response } from "express";
import { z } from "zod";
import { validate } from "../../middleware/validate.js";
import {
  listExercises,
  getExerciseById,
  createExercise,
  updateExercise,
  deleteExercise,
  isExerciseError,
} from "../../services/exercise.service.js";

const router = Router();

const testCaseSchema = z.object({
  input_data: z.string().min(1, "Input data is required"),
  expected_output: z.string().min(1, "Expected output is required"),
  is_visible: z.boolean().optional(),
  point_value: z.number().int().min(1).max(100).optional(),
  time_limit_seconds: z.number().int().min(1).optional(),
});

const createExerciseSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  difficulty: z.enum(["easy", "medium", "hard"]),
  oop_tags: z.array(z.string().min(1)).min(1).max(5),
  starter_code: z.string().optional(),
  is_library: z.boolean().optional().default(false),
  test_cases: z.array(testCaseSchema).min(1, "At least one test case is required"),
});

const updateExerciseSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(5000).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  oop_tags: z.array(z.string().min(1)).min(1).max(5).optional(),
  starter_code: z.string().optional(),
  is_library: z.boolean().optional(),
  test_cases: z.array(testCaseSchema).min(1, "At least one test case is required").optional(),
});

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
 * POST /api/admin/exercises
 * Create a new exercise with test cases (admin authoring).
 */
router.post("/", validate(createExerciseSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const result = await createExercise(req.body, userId);
    if (isExerciseError(result)) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(201).json(result);
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
 * PUT /api/admin/exercises/:id
 * Update an exercise (admin can edit any).
 */
router.put("/:id", validate(updateExerciseSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const result = await updateExercise(req.params.id, req.body, userId, "admin");
    if (isExerciseError(result)) {
      const status = result.error.code === "NOT_FOUND" ? 404 : result.error.code === "FORBIDDEN" ? 403 : 400;
      res.status(status).json({ error: result.error });
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
