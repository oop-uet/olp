import { Router, Request, Response } from "express";
import { z } from "zod";
import { validate } from "../../middleware/validate.js";
import {
  approveAllPredictedScores,
  assignAssessment,
  createAssessment,
  deleteAssessment,
  getAssessmentReview,
  getInstructorAssessment,
  isAssessmentError,
  listAssessmentSubmissions,
  listInstructorAssessments,
  publishAssessment,
  regradeAssessmentAssignment,
  retryAssessmentAiGrade,
  reviewAssessmentAnswer,
  updateAssessment,
  updateAssessmentAssignmentWindow,
} from "../../services/assessment.service.js";
import {
  AssessmentTemplateImportError,
  createUetMidtermAssessmentTemplate,
  parseAssessmentTemplate,
} from "../../services/assessment-template.service.js";
import {
  createAssessmentAnswerPdf,
  type AssessmentPdfData,
} from "../../services/assessment-pdf.service.js";
import { createAssessmentAnswerDocx } from "../../services/assessment-docx.service.js";

const rubricCriterionSchema = z.object({
  id: z.string().max(100).optional(),
  criterion: z.string().min(1).max(1000),
  points: z.number().positive().max(1000),
});

const questionSchema = z.object({
  type: z.enum(["true_false", "single_choice", "short_text", "essay", "code_analysis"]),
  prompt: z.string().min(1).max(20_000),
  points: z.number().positive().max(1000),
  gradingMode: z.enum(["auto", "llm_assisted", "manual"]),
  options: z.array(z.string().max(5000)).max(20).optional(),
  answerKey: z.union([z.boolean(), z.number().int()]).optional(),
  referenceAnswer: z.string().max(20_000).optional(),
  gradingPrompt: z.string().max(5000).optional(),
  rubric: z.array(rubricCriterionSchema).max(30).optional(),
});

export const assessmentDraftSchema = z.object({
  title: z.string().min(1).max(200),
  instructions: z.string().max(10_000).optional().default(""),
  durationMinutes: z.number().int().min(1).max(600),
  totalPoints: z.number().positive().max(1000),
  shuffleQuestions: z.boolean().optional().default(true),
  sections: z
    .array(
      z.object({
        title: z.string().min(1).max(300),
        introContent: z.string().max(30_000).optional(),
        questions: z.array(questionSchema).min(1).max(200),
      })
    )
    .min(1)
    .max(30),
});

const assignSchema = z.object({
  sectionId: z.string().min(1),
  opensAt: z.string().datetime(),
  closesAt: z.string().datetime(),
  durationMinutes: z.number().int().min(1).max(600).optional(),
  requireFullscreen: z.boolean().optional().default(true),
  warningThreshold: z.number().int().min(1).max(20).optional().default(3),
  showPredictedScore: z.boolean().optional().default(true),
  maxAttempts: z.number().int().min(1).max(20).optional().default(1),
  password: z.string().trim().min(4).max(100).optional(),
});

const assignmentWindowSchema = z
  .object({
    opensAt: z.string().datetime(),
    closesAt: z.string().datetime(),
    durationMinutes: z.number().int().min(1).max(600).optional(),
    maxAttempts: z.number().int().min(1).max(20).optional(),
    password: z.string().trim().min(4).max(100).optional(),
    clearPassword: z.boolean().optional(),
  })
  .refine((input) => !(input.clearPassword && input.password !== undefined), {
    message: "Không thể đồng thời đặt và xóa mật khẩu bài kiểm tra.",
    path: ["password"],
  });

const reviewSchema = z.object({
  decision: z.enum(["accept", "adjust", "manual"]),
  points: z.number().min(0).optional(),
  feedback: z.string().max(5000).optional(),
  adjustmentReason: z.string().max(2000).optional(),
});

const importTemplateSchema = z.object({
  filename: z.string().min(1).max(255).refine((value) => /\.xlsx?$/i.test(value), {
    message: "Chỉ hỗ trợ file Excel .xlsx hoặc .xls.",
  }),
  fileBase64: z.string().min(1).max(6_000_000),
});

function sendResult(res: Response, result: unknown, successStatus = 200) {
  if (isAssessmentError(result)) {
    const status =
      result.error.code === "NOT_FOUND"
        ? 404
        : result.error.code === "FORBIDDEN"
          ? 403
          : result.error.code === "ASSESSMENT_LOCKED" ||
              result.error.code === "NOT_PUBLISHED" ||
              result.error.code === "ASSESSMENT_IN_USE" ||
              result.error.code === "ASSESSMENT_STRUCTURE_LOCKED"
            ? 409
            : 400;
    res.status(status).json({ error: result.error });
    return;
  }
  res.status(successStatus).json(result);
}

function exportContentDisposition(title: string, extension: ".pdf" | ".docx"): string {
  const baseName = String(title ?? "")
    .normalize("NFC")
    .trim()
    .replace(/[<>:"/\\|?*;]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "") || "Bài kiểm tra";
  const fileName = `${baseName} - Đề và đáp án${extension}`;
  const asciiBaseName = baseName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._ -]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "") || "assessment";
  return `attachment; filename="${asciiBaseName} - De va dap an${extension}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

const router = Router();

router.get("/template", async (_req: Request, res: Response) => {
  try {
    const workbook = await createUetMidtermAssessmentTemplate();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="uet-oop-midterm-2020-2021-assessment-template.xlsx"'
    );
    res.send(workbook);
  } catch (error) {
    console.error("[assessment] Failed to create assessment template", error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể tạo file template." } });
  }
});

router.post("/import-template", validate(importTemplateSchema), (req: Request, res: Response) => {
  try {
    const encoded = req.body.fileBase64.includes(",")
      ? req.body.fileBase64.slice(req.body.fileBase64.indexOf(",") + 1)
      : req.body.fileBase64;
    const buffer = Buffer.from(encoded, "base64");
    if (buffer.length === 0 || buffer.length > 4_000_000) {
      res.status(413).json({
        error: { code: "FILE_TOO_LARGE", message: "File template phải nhỏ hơn 4 MB." },
      });
      return;
    }
    const result = parseAssessmentTemplate(buffer);
    res.json({ data: result.draft, warnings: result.warnings });
  } catch (error) {
    if (error instanceof AssessmentTemplateImportError) {
      res.status(400).json({
        error: { code: "INVALID_TEMPLATE", message: error.message, details: error.details },
      });
      return;
    }
    console.error("[assessment] Failed to import assessment template", error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể import file template." } });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    sendResult(res, await listInstructorAssessments(req.user!.userId));
  } catch (error) {
    console.error("[assessment] Failed to list instructor assessments", error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể tải bài kiểm tra." } });
  }
});

router.post("/", validate(assessmentDraftSchema), async (req: Request, res: Response) => {
  try {
    sendResult(res, await createAssessment(req.body, req.user!.userId), 201);
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể tạo bài kiểm tra." } });
  }
});

router.get("/assignments/:assignmentId/submissions", async (req: Request, res: Response) => {
  try {
    sendResult(res, await listAssessmentSubmissions(req.params.assignmentId, req.user!.userId));
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể tải danh sách bài nộp." } });
  }
});

router.post("/assignments/:assignmentId/approve-all", async (req: Request, res: Response) => {
  try {
    sendResult(res, await approveAllPredictedScores(req.params.assignmentId, req.user!.userId));
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể duyệt điểm dự kiến." } });
  }
});

router.post("/assignments/:assignmentId/regrade-all", async (req: Request, res: Response) => {
  try {
    sendResult(
      res,
      await regradeAssessmentAssignment(req.params.assignmentId, req.user!.userId),
      202
    );
  } catch (error) {
    console.error("[assessment] Failed to regrade assessment submissions", error);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Không thể xếp hàng chấm lại toàn bộ." },
    });
  }
});

router.put(
  "/assignments/:assignmentId/window",
  validate(assignmentWindowSchema),
  async (req: Request, res: Response) => {
    try {
      sendResult(
        res,
        await updateAssessmentAssignmentWindow(
          req.params.assignmentId,
          req.body,
          req.user!.userId
        )
      );
    } catch (error) {
      console.error("[assessment] Failed to update assessment assignment window", error);
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Không thể cập nhật thời gian bài kiểm tra." },
      });
    }
  }
);

router.get("/sessions/:sessionId/review", async (req: Request, res: Response) => {
  try {
    sendResult(res, await getAssessmentReview(req.params.sessionId, req.user!.userId));
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể tải bài để chấm." } });
  }
});

router.put("/answers/:answerId/review", validate(reviewSchema), async (req: Request, res: Response) => {
  try {
    sendResult(
      res,
      await reviewAssessmentAnswer(req.params.answerId, req.body, req.user!.userId)
    );
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể lưu điểm chính thức." } });
  }
});

router.post("/answers/:answerId/ai-grade", async (req: Request, res: Response) => {
  try {
    const result = await retryAssessmentAiGrade(req.params.answerId, req.user!.userId);
    sendResult(res, result, 202);
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể xếp hàng chấm AI." } });
  }
});

router.get("/:id/export-pdf", async (req: Request, res: Response) => {
  try {
    const result = await getInstructorAssessment(req.params.id, req.user!.userId);
    if (isAssessmentError(result)) {
      sendResult(res, result);
      return;
    }
    const assessment = result.data as AssessmentPdfData;
    const pdf = await createAssessmentAnswerPdf(assessment);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", exportContentDisposition(assessment.title, ".pdf"));
    res.send(pdf);
  } catch (error) {
    console.error("[assessment] Failed to export assessment PDF", error);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Không thể xuất PDF đề thi và đáp án." },
    });
  }
});

router.get("/:id/export-docx", async (req: Request, res: Response) => {
  try {
    const result = await getInstructorAssessment(req.params.id, req.user!.userId);
    if (isAssessmentError(result)) {
      sendResult(res, result);
      return;
    }
    const assessment = result.data as AssessmentPdfData;
    const document = await createAssessmentAnswerDocx(assessment);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader("Content-Disposition", exportContentDisposition(assessment.title, ".docx"));
    res.send(document);
  } catch (error) {
    console.error("[assessment] Failed to export assessment Word document", error);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Không thể xuất Word đề thi và đáp án." },
    });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    sendResult(res, await getInstructorAssessment(req.params.id, req.user!.userId));
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể tải bài kiểm tra." } });
  }
});

router.put("/:id", validate(assessmentDraftSchema), async (req: Request, res: Response) => {
  try {
    sendResult(res, await updateAssessment(req.params.id, req.body, req.user!.userId));
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể cập nhật bài kiểm tra." } });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    sendResult(res, await deleteAssessment(req.params.id, req.user!.userId));
  } catch (error) {
    console.error("[assessment] Failed to delete assessment", error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể xóa bài kiểm tra." } });
  }
});

router.post("/:id/publish", async (req: Request, res: Response) => {
  try {
    sendResult(res, await publishAssessment(req.params.id, req.user!.userId));
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể phát hành bài kiểm tra." } });
  }
});

router.post("/:id/assign", validate(assignSchema), async (req: Request, res: Response) => {
  try {
    sendResult(res, await assignAssessment(req.params.id, req.body, req.user!.userId), 201);
  } catch (error: any) {
    const message = String(error?.message ?? "");
    if (message.toLowerCase().includes("unique")) {
      res.status(409).json({
        error: { code: "ALREADY_ASSIGNED", message: "Đề đã được gán cho lớp này." },
      });
      return;
    }
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể gán bài kiểm tra." } });
  }
});

export default router;
