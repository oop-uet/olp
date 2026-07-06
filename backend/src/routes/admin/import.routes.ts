import { Router, Request, Response } from "express";
import {
  parseFile,
  importStudents,
  exportStudents,
} from "../../services/import.service.js";
import { StorageService } from "../../services/storage.service.js";

// ─── R2 Storage Helper ───────────────────────────────────────────────────────

/**
 * Try to get a StorageService instance. Returns null if R2 is not configured.
 * This makes R2 optional for local development.
 */
function getStorageService(): StorageService | null {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    return null;
  }
  try {
    return StorageService.fromEnv();
  } catch {
    return null;
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────

const router = Router();

/**
 * POST /api/admin/sections/:id/import-students
 * Import students from a CSV or Excel file.
 * Accepts:
 *   - Raw body (Content-Type: application/octet-stream or text/csv)
 *   - JSON body with base64 encoded file: { data: "<base64>", filename: "students.csv" }
 */
router.post("/:id/import-students", async (req: Request, res: Response) => {
  try {
    const sectionId = req.params.id;
    let buffer: Buffer;
    let filename: string | undefined;
    let overwrite = false;

    // Determine how the file was sent
    if (req.is("application/json") || (req.body && req.body.data)) {
      // JSON body with base64-encoded file
      const { data, filename: fname, overwrite: ow } = req.body;
      if (!data || typeof data !== "string") {
        res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Request body must include a 'data' field with base64-encoded file content.",
          },
        });
        return;
      }
      buffer = Buffer.from(data, "base64");
      filename = fname;
      overwrite = Boolean(ow);
    } else if (Buffer.isBuffer(req.body)) {
      // Raw binary body
      buffer = req.body;
    } else if (typeof req.body === "string") {
      // String body (raw CSV text)
      buffer = Buffer.from(req.body, "utf-8");
    } else {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message:
            "No file data provided. Send base64-encoded file in JSON body { data, filename } or raw binary body.",
        },
      });
      return;
    }

    if (buffer.length === 0) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "File is empty.",
        },
      });
      return;
    }

    // Store uploaded file to R2 as backup (optional - skipped if R2 not configured)
    const storage = getStorageService();
    if (storage) {
      try {
        const timestamp = Date.now();
        const safeName = filename || "import-file";
        const r2Key = `imports/${sectionId}/${timestamp}-${safeName}`;
        const contentType = filename?.toLowerCase().endsWith(".xlsx")
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "text/csv";
        await storage.upload(r2Key, buffer, contentType);
      } catch {
        // R2 upload failure should not block the import process
        console.warn(`[import] Failed to backup file to R2 for section ${sectionId}`);
      }
    }

    // Parse the file
    const rows = parseFile(buffer, filename);

    if (rows.length === 0) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "No data rows found in the uploaded file.",
        },
      });
      return;
    }

    // Perform import
    const report = await importStudents(sectionId, rows, overwrite);

    // Check if section was not found
    if (report.imported === 0 && report.skipped.length === 1 && report.skipped[0].reason === "Section not found") {
      res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "Class section not found.",
        },
      });
      return;
    }

    res.status(200).json(report);
  } catch (error) {
    // Handle parsing errors
    if (error instanceof Error && error.message.includes("parse")) {
      res.status(400).json({
        error: {
          code: "PARSE_ERROR",
          message: `Failed to parse file: ${error.message}`,
        },
      });
      return;
    }

    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred during import.",
      },
    });
  }
});

/**
 * GET /api/admin/sections/:id/export-students
 * Export students from a section as CSV.
 * Returns CSV content as a downloadable file.
 * If R2 is configured, also stores the export and provides a presigned download URL.
 */
router.get("/:id/export-students", async (req: Request, res: Response) => {
  try {
    const sectionId = req.params.id;
    const result = await exportStudents(sectionId);

    if ("error" in result) {
      res.status(404).json({ error: result.error });
      return;
    }

    // Attempt to store export in R2 and generate presigned URL
    const storage = getStorageService();
    let downloadUrl: string | null = null;
    const expiresIn = 3600; // 1 hour

    if (storage) {
      try {
        const timestamp = Date.now();
        const r2Key = `exports/${sectionId}/${timestamp}-students.csv`;
        await storage.upload(r2Key, Buffer.from(result.csv, "utf-8"), "text/csv");
        downloadUrl = await storage.generatePresignedUrl(r2Key, expiresIn);
      } catch {
        // R2 failure should not block the export response
        console.warn(`[export] Failed to store export to R2 for section ${sectionId}`);
      }
    }

    // If client accepts JSON (or R2 URL was generated), return JSON with both CSV and URL
    const acceptsJson = req.accepts("json") && !req.accepts("text/csv");
    if (downloadUrl || acceptsJson) {
      res.status(200).json({
        csv: result.csv,
        ...(downloadUrl && { downloadUrl, expiresIn }),
      });
      return;
    }

    // Default: return raw CSV as downloadable file
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="students-section-${sectionId}.csv"`
    );
    res.status(200).send(result.csv);
  } catch (error) {
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred during export.",
      },
    });
  }
});

export default router;
