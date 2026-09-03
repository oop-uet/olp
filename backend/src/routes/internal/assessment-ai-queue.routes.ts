import { Router, type Request, type Response } from "express";
import { assessmentAiQueueMessageSchema } from "../../services/assessment-ai-queue-delivery.service.js";
import { processAssessmentAiRunGroup } from "../../services/assessment.service.js";
import { requireAssessmentQueueHmac } from "../../middleware/internal-hmac.middleware.js";

const CONSUMER_AUDIENCE = "assessment-ai-queue-consumer-v1";
const router = Router();

/**
 * This private callback receives ID-only Queue batches. It performs no user
 * authorization and is intentionally mounted outside public JWT routes.
 */
router.post(
  "/assessment-ai/process-group",
  requireAssessmentQueueHmac(CONSUMER_AUDIENCE),
  async (req: Request, res: Response) => {
    const parsed = assessmentAiQueueMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "INVALID_QUEUE_MESSAGE", message: "Queue message không hợp lệ." } });
      return;
    }
    try {
      const result = await processAssessmentAiRunGroup(parsed.data.runIds);
      res.status(202).json({ data: { correlationId: parsed.data.correlationId, ...result } });
    } catch {
      // A 5xx makes the Queue retry and eventually use its DLQ. Raw grading
      // content is never added to this response or Worker log.
      res.status(503).json({ error: { code: "AI_PROCESSING_UNAVAILABLE", message: "Chưa thể nhận xử lý chấm AI." } });
    }
  }
);

export const assessmentAiConsumerAudience = CONSUMER_AUDIENCE;
export default router;
