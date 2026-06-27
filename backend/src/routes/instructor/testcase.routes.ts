import { Router, Request, Response } from "express";
import { z } from "zod";
import { validate } from "../../middleware/validate.js";
import {
  listTestCases,
  createTestCase,
  updateTestCase,
  deleteTestCase,
  isTestCaseError,
} from "../../services/testcase.service.js";

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

export const createTestCaseSchema = z.object({
  input_data: z
    .string()
    .min(1, "input_data is required")
    .max(10240, "input_data must be at most 10240 characters (10KB)"),
  expected_output: z
    .string()
    .min(1, "expected_output is required")
    .max(10240, "expected_output must be at most 10240 characters (10KB)"),
  is_visible: z.boolean().default(false),
  point_value: z
    .number()
    .int("point_value must be an integer")
    .min(1, "point_value must be at least 1")
    .max(100, "point_value must be at most 100"),
  time_limit_seconds: z
    .number()
    .int("time_limit_seconds must be an integer")
    .positive("time_limit_seconds must be positive")
    .optional(),
});

export const updateTestCaseSchema = z.object({
  input_data: z
    .string()
    .min(1, "input_data cannot be empty")
    .max(10240, "input_data must be at most 10240 characters (10KB)")
    .optional(),
  expected_output: z
    .string()
    .min(1, "expected_output cannot be empty")
    .max(10240, "expected_output must be at most 10240 characters (10KB)")
    .optional(),
  is_visible: z.boolean().optional(),
  point_value: z
    .number()
    .int("point_value must be an integer")
    .min(1, "point_value must be at least 1")
    .max(100, "point_value must be at most 100")
    .optional(),
  time_limit_seconds: z
    .number()
    .int("time_limit_seconds must be an integer")
    .positive("time_limit_seconds must be positive")
    .nullable()
    .optional(),
});

// ─── Exercise Test Cases Router ──────────────────────────────────────────────
// Mounted at /api/exercises/:exerciseId/testcases

export const exerciseTestCaseRouter = Router({ mergeParams: true });

/**
 * GET /api/exercises/:exerciseId/testcases
 * List all test cases for an exercise.
 */
exerciseTestCaseRouter.get("/", async (req: Request, res: Response) => {
  try {
    const { exerciseId } = req.params;
    const result = await listTestCases(exerciseId);

    if (isTestCaseError(result)) {
      const statusCode = getErrorStatusCode(result.error.code);
      res.status(statusCode).json({ error: result.error });
      return;
    }

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
      },
    });
  }
});

/**
 * POST /api/exercises/:exerciseId/testcases
 * Create a new test case for an exercise.
 * Validates max 50 test cases per exercise.
 */
exerciseTestCaseRouter.post(
  "/",
  validate(createTestCaseSchema),
  async (req: Request, res: Response) => {
    try {
      const { exerciseId } = req.params;
      const result = await createTestCase(exerciseId, req.body);

      if (isTestCaseError(result)) {
        const statusCode = getErrorStatusCode(result.error.code);
        res.status(statusCode).json({ error: result.error });
        return;
      }

      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred.",
        },
      });
    }
  }
);

// ─── Standalone Test Case Router ─────────────────────────────────────────────
// Mounted at /api/testcases/:id

export const testCaseRouter = Router();

/**
 * PUT /api/testcases/:id
 * Update an existing test case.
 * Does NOT retroactively change existing submission scores.
 */
testCaseRouter.put(
  "/:id",
  validate(updateTestCaseSchema),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const result = await updateTestCase(id, req.body);

      if (isTestCaseError(result)) {
        const statusCode = getErrorStatusCode(result.error.code);
        res.status(statusCode).json({ error: result.error });
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred.",
        },
      });
    }
  }
);

/**
 * DELETE /api/testcases/:id
 * Delete a test case.
 */
testCaseRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await deleteTestCase(id);

    if (isTestCaseError(result)) {
      const statusCode = getErrorStatusCode(result.error.code);
      res.status(statusCode).json({ error: result.error });
      return;
    }

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
      },
    });
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getErrorStatusCode(code: string): number {
  switch (code) {
    case "NOT_FOUND":
      return 404;
    case "LIMIT_EXCEEDED":
      return 409;
    case "VALIDATION_ERROR":
      return 400;
    default:
      return 400;
  }
}
