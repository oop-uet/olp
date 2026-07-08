import { Router, Request, Response } from "express";
import { z } from "zod";
import { validate } from "../../middleware/validate.js";
import {
  listExercises,
  getExerciseById,
  createExercise,
  updateExercise,
  deleteExercise,
  browseLibrary,
  assignToSection,
  getInstructorExerciseOverview,
  isExerciseError,
} from "../../services/exercise.service.js";
import {
  checkExercisePlagiarism,
  isPlagiarismError,
} from "../../services/plagiarism.service.js";

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const testCaseSchema = z.object({
  input_data: z.string(),
  expected_output: z.string().min(1, "Expected output is required"),
  is_visible: z.boolean().optional(),
  point_value: z.number().int().min(1).max(100).optional(),
  time_limit_seconds: z.number().int().min(1).optional(),
});

const stylePolicySchema = z.object({
  enabled: z.boolean().optional(),
  profile: z.string().optional(),
  disabledRules: z.array(z.string()).optional(),
  disabled_rules: z.array(z.string()).optional(),
  enabledRules: z.array(z.string()).optional(),
  enabled_rules: z.array(z.string()).optional(),
  weightPercent: z.number().min(0).max(50).optional(),
  weight_percent: z.number().min(0).max(50).optional(),
  penaltyPerViolation: z.number().min(1).max(100).optional(),
  penalty_per_violation: z.number().min(1).max(100).optional(),
  maxViolations: z.number().int().min(1).max(100).optional(),
  max_penalized_violations: z.number().int().min(1).max(100).optional(),
}).passthrough();

export const createExerciseSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title must be at most 200 characters"),
  description: z
    .string()
    .min(1, "Description is required")
    .max(5000, "Description must be at most 5000 characters"),
  difficulty: z.enum(["easy", "medium", "hard"], {
    errorMap: () => ({ message: "Difficulty must be one of: easy, medium, hard" }),
  }),
  oop_tags: z
    .array(z.string().min(1))
    .min(1, "At least 1 OOP tag is required")
    .max(5, "At most 5 OOP tags allowed"),
  starter_code: z.string().optional(),
  is_library: z.boolean().optional().default(false),
  style_check_enabled: z.boolean().optional().default(true),
  style_policy: stylePolicySchema.optional(),
  test_cases: z
    .array(testCaseSchema)
    .min(1, "At least one test case is required"),
});

export const updateExerciseSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title must be at most 200 characters")
    .optional(),
  description: z
    .string()
    .min(1, "Description is required")
    .max(5000, "Description must be at most 5000 characters")
    .optional(),
  difficulty: z
    .enum(["easy", "medium", "hard"], {
      errorMap: () => ({ message: "Difficulty must be one of: easy, medium, hard" }),
    })
    .optional(),
  oop_tags: z
    .array(z.string().min(1))
    .min(1, "At least 1 OOP tag is required")
    .max(5, "At most 5 OOP tags allowed")
    .optional(),
  starter_code: z.string().optional(),
  is_library: z.boolean().optional(),
  style_check_enabled: z.boolean().optional(),
  style_policy: stylePolicySchema.optional(),
  test_cases: z.array(testCaseSchema).min(1, "At least one test case is required").optional(),
});

export const assignExerciseSchema = z.object({
  section_id: z.string().min(1, "Section ID is required"),
  deadline: z.string().optional(),
  is_assessment: z.boolean().optional().default(false),
});

// ─── Router ──────────────────────────────────────────────────────────────────

const router = Router();

/**
 * GET /api/exercises
 * List exercises — instructors see their own; admins see all.
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;
    const result = await listExercises(userId, role);
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
 * GET /api/exercises/library
 * Browse the exercise library (isLibrary = true).
 */
router.get("/library", async (_req: Request, res: Response) => {
  try {
    const result = await browseLibrary();
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
 * GET /api/exercises/:id/instructor-overview
 * Instructor coding-page style view: prompt, test cases, submissions and stats.
 */
router.get("/:id/instructor-overview", async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;
    const result = await getInstructorExerciseOverview(req.params.id, userId, role);

    if (isExerciseError(result)) {
      const statusCode = getErrorStatusCode(result.error.code);
      res.status(statusCode).json({ error: result.error });
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
 * GET /api/exercises/:id/plagiarism
 * Detect students whose submitted code is suspiciously similar for an exercise.
 * Optional query `section_id` scopes the check to a single section.
 */
router.get("/:id/plagiarism", async (req: Request, res: Response) => {
  try {
    const sectionId =
      typeof req.query.section_id === "string" && req.query.section_id.length > 0
        ? req.query.section_id
        : undefined;

    const result = await checkExercisePlagiarism(req.params.id, sectionId);

    if (isPlagiarismError(result)) {
      const statusCode = result.error.code === "NOT_FOUND" ? 404 : 400;
      res.status(statusCode).json({ error: result.error });
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
 * GET /api/exercises/:id
 * Get a single exercise by ID.
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const result = await getExerciseById(req.params.id);

    if (isExerciseError(result)) {
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

/**
 * POST /api/exercises
 * Create a new exercise.
 */
router.post("/", validate(createExerciseSchema), async (req: Request, res: Response) => {
  try {
    const { userId } = req.user!;
    const result = await createExercise(req.body, userId);

    if (isExerciseError(result)) {
      res.status(400).json({ error: result.error });
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
});

/**
 * PUT /api/exercises/:id
 * Update an exercise.
 */
router.put("/:id", validate(updateExerciseSchema), async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;
    const result = await updateExercise(req.params.id, req.body, userId, role);

    if (isExerciseError(result)) {
      const statusCode = getErrorStatusCode(result.error.code);
      res.status(statusCode).json({ error: result.error });
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
 * DELETE /api/exercises/:id
 * Delete an exercise.
 */
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;
    const result = await deleteExercise(req.params.id, userId, role);

    if (isExerciseError(result)) {
      const statusCode = getErrorStatusCode(result.error.code);
      res.status(statusCode).json({ error: result.error });
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
 * POST /api/exercises/:id/assign
 * Assign an exercise to a class section.
 */
router.post("/:id/assign", validate(assignExerciseSchema), async (req: Request, res: Response) => {
  try {
    const result = await assignToSection(req.params.id, req.body);

    if (isExerciseError(result)) {
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
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getErrorStatusCode(code: string): number {
  switch (code) {
    case "NOT_FOUND":
      return 404;
    case "FORBIDDEN":
      return 403;
    case "ALREADY_ASSIGNED":
      return 409;
    case "VALIDATION_ERROR":
      return 400;
    default:
      return 400;
  }
}

export default router;
