import { Router, Request, Response } from "express";
import { z } from "zod";
import { validate } from "../../middleware/validate.js";
import {
  getStudentAssessmentPreflight,
  getStudentAssessmentReview,
  getStudentAssessmentResult,
  getStudentAssessmentSession,
  isAssessmentError,
  listStudentAssessments,
  recordAssessmentIntegrityEvent,
  saveAssessmentAnswers,
  setAssessmentQuestionFlag,
  startAssessmentSession,
  submitAssessmentSession,
} from "../../services/assessment.service.js";

const saveAnswersSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        answer: z.unknown(),
        clientRevision: z.number().int().min(0),
      })
    )
    .min(1)
    .max(200),
});

const questionFlagSchema = z.object({
  questionId: z.string().min(1),
  flagged: z.boolean(),
});

const startAssessmentSchema = z
  .object({
    password: z.string().max(100).optional(),
  })
  .default({});

const integrityEventSchema = z.object({
  eventType: z.enum([
    "fullscreen_exit",
    "visibility_hidden",
    "window_blur",
    "devtools_open",
    "copy_attempt",
    "paste_attempt",
    "context_menu",
    "dom_tampering",
  ]),
  metadata: z.record(z.unknown()).optional().default({}),
});

function sendResult(res: Response, result: unknown, successStatus = 200) {
  if (isAssessmentError(result)) {
    const forbiddenCodes = ["ASSESSMENT_PASSWORD_REQUIRED", "ASSESSMENT_PASSWORD_INVALID"];
    const conflictCodes = [
      "NOT_OPEN",
      "CLOSED",
      "SESSION_CLOSED",
      "SESSION_EXPIRED",
      "NOT_SUBMITTED",
      "REVIEW_NOT_READY",
      "ATTEMPT_LIMIT_REACHED",
    ];
    let status = 400;
    if (result.error.code === "NOT_FOUND") status = 404;
    else if (result.error.code === "ASSESSMENT_PASSWORD_RATE_LIMITED") status = 429;
    else if (forbiddenCodes.includes(result.error.code)) status = 403;
    else if (conflictCodes.includes(result.error.code)) status = 409;
    res.status(status).json({ error: result.error });
    return;
  }
  res.status(successStatus).json(result);
}

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    sendResult(res, await listStudentAssessments(req.user!.userId));
  } catch (error) {
    console.error("[assessment] Failed to list student assessments", error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể tải bài kiểm tra." } });
  }
});

router.get("/:assignmentId/preflight", async (req: Request, res: Response) => {
  try {
    sendResult(res, await getStudentAssessmentPreflight(req.params.assignmentId, req.user!.userId));
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể tải thông tin bài kiểm tra." } });
  }
});

router.post(
  "/:assignmentId/start",
  validate(startAssessmentSchema),
  async (req: Request, res: Response) => {
    try {
      sendResult(
        res,
        await startAssessmentSession(
          req.params.assignmentId,
          req.user!.userId,
          undefined,
          req.body
        ),
        201
      );
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể bắt đầu bài kiểm tra." } });
    }
  }
);

router.get("/sessions/:sessionId", async (req: Request, res: Response) => {
  try {
    sendResult(res, await getStudentAssessmentSession(req.params.sessionId, req.user!.userId));
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể tải phiên làm bài." } });
  }
});

router.put(
  "/sessions/:sessionId/answers",
  validate(saveAnswersSchema),
  async (req: Request, res: Response) => {
    try {
      sendResult(
        res,
        await saveAssessmentAnswers(
          req.params.sessionId,
          req.user!.userId,
          req.body.answers
        )
      );
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể tự lưu câu trả lời." } });
    }
  }
);

router.put(
  "/sessions/:sessionId/question-flag",
  validate(questionFlagSchema),
  async (req: Request, res: Response) => {
    try {
      sendResult(
        res,
        await setAssessmentQuestionFlag(
          req.params.sessionId,
          req.user!.userId,
          req.body.questionId,
          req.body.flagged
        )
      );
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể lưu cờ câu hỏi." } });
    }
  }
);

router.post(
  "/sessions/:sessionId/integrity-events",
  validate(integrityEventSchema),
  async (req: Request, res: Response) => {
    try {
      const result = await recordAssessmentIntegrityEvent(
        req.params.sessionId,
        req.user!.userId,
        req.body.eventType,
        req.body.metadata
      );
      sendResult(res, result, 201);
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể ghi nhận sự kiện giám sát." } });
    }
  }
);

router.post("/sessions/:sessionId/submit", async (req: Request, res: Response) => {
  try {
    const result = await submitAssessmentSession(
      req.params.sessionId,
      req.user!.userId,
      "student",
      undefined,
      req.requestId
    );
    sendResult(res, result);
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể nộp bài kiểm tra." } });
  }
});

router.get("/sessions/:sessionId/result", async (req: Request, res: Response) => {
  try {
    sendResult(res, await getStudentAssessmentResult(req.params.sessionId, req.user!.userId));
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể tải kết quả." } });
  }
});

router.get("/sessions/:sessionId/review", async (req: Request, res: Response) => {
  try {
    sendResult(res, await getStudentAssessmentReview(req.params.sessionId, req.user!.userId));
  } catch (error) {
    console.error("[assessment] Failed to load student assessment review", error);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Không thể tải bài nộp đã chấm." },
    });
  }
});

export default router;
