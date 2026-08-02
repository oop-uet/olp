import { Router, Request, Response } from "express";
import { z } from "zod";
import { validate } from "../../middleware/validate.js";
import {
  approveAllPredictedScores,
  assignAssessment,
  createAssessment,
  getAssessmentReview,
  getInstructorAssessment,
  isAssessmentError,
  listAssessmentSubmissions,
  listInstructorAssessments,
  processPendingAssessmentAiRuns,
  publishAssessment,
  retryAssessmentAiGrade,
  reviewAssessmentAnswer,
  updateAssessment,
} from "../../services/assessment.service.js";
import {
  AssessmentTemplateImportError,
  createUetMidtermAssessmentTemplate,
  parseAssessmentTemplate,
} from "../../services/assessment-template.service.js";

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
  requireFullscreen: z.boolean().optional().default(false),
  warningThreshold: z.number().int().min(1).max(20).optional().default(3),
  showPredictedScore: z.boolean().optional().default(true),
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
          : result.error.code === "ASSESSMENT_LOCKED" || result.error.code === "NOT_PUBLISHED"
            ? 409
            : 400;
    res.status(status).json({ error: result.error });
    return;
  }
  res.status(successStatus).json(result);
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
    if (!isAssessmentError(result)) {
      void processPendingAssessmentAiRuns(1).catch(() => undefined);
    }
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể xếp hàng chấm AI." } });
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
