import { Router, Request, Response } from "express";
import { z } from "zod";
import { validate } from "../../middleware/validate.js";
import {
  getStudentAssessmentPreflight,
  getStudentAssessmentResult,
  getStudentAssessmentSession,
  isAssessmentError,
  listStudentAssessments,
  processPendingAssessmentAiRuns,
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

const integrityEventSchema = z.object({
  eventType: z.enum([
    "fullscreen_exit",
    "visibility_hidden",
    "window_blur",
    "devtools_open",
    "copy_attempt",
    "paste_attempt",
    "context_menu",
  ]),
  metadata: z.record(z.unknown()).optional().default({}),
});

function sendResult(res: Response, result: unknown, successStatus = 200) {
  if (isAssessmentError(result)) {
    const status =
      result.error.code === "NOT_FOUND"
        ? 404
        : ["NOT_OPEN", "CLOSED", "SESSION_CLOSED", "SESSION_EXPIRED", "NOT_SUBMITTED"].includes(
              result.error.code
            )
          ? 409
          : 400;
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

router.post("/:assignmentId/start", async (req: Request, res: Response) => {
  try {
    sendResult(res, await startAssessmentSession(req.params.assignmentId, req.user!.userId), 201);
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể bắt đầu bài kiểm tra." } });
  }
});

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
      if (!isAssessmentError(result) && result.data.autoSubmitted) {
        void processPendingAssessmentAiRuns(3).catch(() => undefined);
      }
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
      "student"
    );
    sendResult(res, result);
    if (!isAssessmentError(result)) {
      void processPendingAssessmentAiRuns(3).catch(() => undefined);
    }
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

export default router;
