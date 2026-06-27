import { Router, Request, Response } from "express";
import { z } from "zod";
import { validate } from "../../middleware/validate.js";
import {
  listSections,
  createSection,
  updateSection,
  deleteSection,
  assignInstructor,
  getSectionDetail,
  removeStudentFromSection,
  unassignExercise,
  isSectionError,
} from "../../services/section.service.js";
import { assignToSection, isExerciseError } from "../../services/exercise.service.js";

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

export const createSectionSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be at most 100 characters"),
  semester: z.string().min(1, "Semester is required").max(20, "Semester must be at most 20 characters"),
  instructor_id: z.string().uuid("instructor_id must be a valid UUID").optional().nullable(),
});

export const updateSectionSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be at most 100 characters").optional(),
  semester: z.string().min(1, "Semester is required").max(20, "Semester must be at most 20 characters").optional(),
  instructor_id: z.string().uuid("instructor_id must be a valid UUID").optional().nullable(),
});

export const assignInstructorSchema = z.object({
  instructor_id: z.string().uuid("instructor_id must be a valid UUID").min(1, "instructor_id is required"),
});

// ─── Router ──────────────────────────────────────────────────────────────────

const router = Router();

/**
 * GET /api/admin/sections
 * List all class sections.
 */
router.get("/", async (_req: Request, res: Response) => {
  try {
    const sections = await listSections();
    res.status(200).json(sections);
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
 * POST /api/admin/sections
 * Create a new class section.
 */
router.post("/", validate(createSectionSchema), async (req: Request, res: Response) => {
  try {
    const result = await createSection(req.body);

    if (isSectionError(result)) {
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

/**
 * PUT /api/admin/sections/:id
 * Update a class section.
 */
router.put("/:id", validate(updateSectionSchema), async (req: Request, res: Response) => {
  try {
    const result = await updateSection(req.params.id, req.body);

    if (isSectionError(result)) {
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
 * DELETE /api/admin/sections/:id
 * Delete a class section.
 */
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const result = await deleteSection(req.params.id);

    if (isSectionError(result)) {
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
 * PUT /api/admin/sections/:id/instructor
 * Assign an instructor to a class section.
 */
router.put("/:id/instructor", validate(assignInstructorSchema), async (req: Request, res: Response) => {
  try {
    const result = await assignInstructor(req.params.id, req.body);

    if (isSectionError(result)) {
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
 * GET /api/admin/sections/:id/detail
 * Full section detail: info, enrolled students, assigned exercises.
 */
router.get("/:id/detail", async (req: Request, res: Response) => {
  try {
    const result = await getSectionDetail(req.params.id);
    if (isSectionError(result)) {
      res.status(getErrorStatusCode(result.error.code)).json({ error: result.error });
      return;
    }
    res.status(200).json(result);
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  }
});

/**
 * DELETE /api/admin/sections/:id/students/:studentId
 * Remove a student enrollment from a section (does not delete the account).
 */
router.delete("/:id/students/:studentId", async (req: Request, res: Response) => {
  try {
    const result = await removeStudentFromSection(req.params.id, req.params.studentId);
    if (isSectionError(result)) {
      res.status(getErrorStatusCode(result.error.code)).json({ error: result.error });
      return;
    }
    res.status(200).json(result);
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  }
});

/**
 * DELETE /api/admin/sections/:id/exercises/:exerciseId
 * Unassign an exercise from a section.
 */
router.delete("/:id/exercises/:exerciseId", async (req: Request, res: Response) => {
  try {
    const result = await unassignExercise(req.params.id, req.params.exerciseId);
    res.status(200).json(result);
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  }
});

/**
 * POST /api/admin/sections/:id/assign-exercise
 * Assign an exercise to a section. Body: { exercise_id, deadline?, is_assessment? }
 */
router.post("/:id/assign-exercise", async (req: Request, res: Response) => {
  try {
    const { exercise_id, deadline, is_assessment } = req.body;
    if (!exercise_id) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "exercise_id là bắt buộc." } });
      return;
    }
    const result = await assignToSection(exercise_id, {
      section_id: req.params.id,
      deadline,
      is_assessment,
    });
    if (isExerciseError(result)) {
      const code = result.error.code;
      const status = code === "NOT_FOUND" ? 404 : code === "ALREADY_ASSIGNED" ? 409 : 400;
      res.status(status).json({ error: result.error });
      return;
    }
    res.status(201).json(result);
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getErrorStatusCode(code: string): number {
  switch (code) {
    case "NOT_FOUND":
      return 404;
    case "INVALID_INSTRUCTOR":
      return 400;
    default:
      return 400;
  }
}

export default router;
