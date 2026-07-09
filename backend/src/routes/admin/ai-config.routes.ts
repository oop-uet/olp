import { Router, Request, Response } from "express";
import { z } from "zod";
import { validate } from "../../middleware/validate.js";
import {
  getAiConfigStatus,
  isAiServiceError,
  testAiConfig,
  updateAiConfig,
} from "../../services/ai-exercise.service.js";

const router = Router();

const updateAiConfigSchema = z.object({
  provider: z.enum(["openai", "anthropic", "gemini", "groq", "openrouter"]).optional(),
  model: z.string().min(3).max(120).optional(),
  apiKey: z.string().max(300).optional(),
  enabled: z.boolean().optional(),
  clearApiKey: z.boolean().optional(),
});

router.get("/", async (_req: Request, res: Response) => {
  try {
    const status = await getAiConfigStatus();
    res.status(200).json({ data: status });
  } catch {
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    });
  }
});

router.put("/", validate(updateAiConfigSchema), async (req: Request, res: Response) => {
  try {
    const result = await updateAiConfig(req.body, req.user!.userId);

    if (isAiServiceError(result)) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(200).json({ data: result });
  } catch {
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    });
  }
});

router.post("/test", async (req: Request, res: Response) => {
  try {
    const result = await testAiConfig(req.user!.userId);

    if (isAiServiceError(result)) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(200).json({ data: result });
  } catch {
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    });
  }
});

export default router;
