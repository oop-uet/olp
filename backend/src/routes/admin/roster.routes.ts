import { Router, Request, Response } from "express";
import { importClassRoster } from "../../services/roster-import.service.js";

const router = Router();

/**
 * POST /api/admin/import-roster
 * Import a class roster from an Excel file (.xls/.xlsx).
 * Creates class section + student accounts (username=password=MSSV).
 * Students will be required to change password on first login.
 *
 * Accepts JSON body: { data: "<base64>", filename: "DSL_int2204_80.xls" }
 */
router.post("/import-roster", async (req: Request, res: Response) => {
  try {
    const { data } = req.body;

    if (!data || typeof data !== "string") {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request body must include a 'data' field with base64-encoded file content.",
        },
      });
      return;
    }

    const buffer = Buffer.from(data, "base64");

    if (buffer.length === 0) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "File is empty." },
      });
      return;
    }

    const instructorId = req.user?.userId || null;
    const report = await importClassRoster(buffer, instructorId);

    res.status(200).json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({
      error: {
        code: "IMPORT_ERROR",
        message: `Failed to import roster: ${message}`,
      },
    });
  }
});

export default router;
