import { Router, type Request, type Response } from "express";
import { getAssessmentOperationalStatus } from "../../services/assessment-operations.service.js";

const router = Router();

/**
 * GET /api/admin/assessment-operations
 *
 * Keeps operational state separate from the editable public system-config API;
 * queue configuration and secrets are never returned to the browser.
 */
router.get("/assessment-operations", async (_req: Request, res: Response) => {
  try {
    res.json({ data: await getAssessmentOperationalStatus() });
  } catch {
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Không thể tải trạng thái vận hành bài kiểm tra." },
    });
  }
});

export default router;
