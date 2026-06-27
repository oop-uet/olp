import { Router, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { classSections } from "../../db/schema.js";
import { getSectionDetail, unassignExercise, isSectionError } from "../../services/section.service.js";

const router = Router();

/**
 * GET /api/instructor/sections
 * List sections assigned to the current instructor (admins see all).
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;
    const sections =
      role === "admin"
        ? await db.query.classSections.findMany({ with: { instructor: true } })
        : await db.query.classSections.findMany({
            where: eq(classSections.instructorId, userId),
            with: { instructor: true },
          });
    res.status(200).json(sections);
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  }
});

/**
 * GET /api/instructor/sections/:id/detail
 * Section detail (students + assigned exercises). Instructor must own the section.
 */
router.get("/:id/detail", async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;
    const result = await getSectionDetail(req.params.id);
    if (isSectionError(result)) {
      res.status(404).json({ error: result.error });
      return;
    }
    // Ownership check (admins bypass)
    if (role !== "admin" && result.section.instructorId !== userId) {
      res.status(403).json({
        error: { code: "FORBIDDEN", message: "Bạn không phụ trách lớp này." },
      });
      return;
    }
    res.status(200).json(result);
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  }
});

/**
 * DELETE /api/instructor/sections/:id/exercises/:exerciseId
 * Unassign an exercise from a section the instructor owns.
 */
router.delete("/:id/exercises/:exerciseId", async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;
    const detail = await getSectionDetail(req.params.id);
    if (isSectionError(detail)) {
      res.status(404).json({ error: detail.error });
      return;
    }
    if (role !== "admin" && detail.section.instructorId !== userId) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Bạn không phụ trách lớp này." } });
      return;
    }
    const result = await unassignExercise(req.params.id, req.params.exerciseId);
    res.status(200).json(result);
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  }
});

export default router;
