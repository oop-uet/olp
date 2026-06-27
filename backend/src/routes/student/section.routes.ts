import { Router, Request, Response } from "express";
import { listStudentSections } from "../../services/student.service.js";

// ─── Router ──────────────────────────────────────────────────────────────────

const router = Router();

/**
 * GET /api/students/sections
 * List the class sections the current student is enrolled in.
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const studentId = req.user!.userId;
    const result = await listStudentSections(studentId);
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
