import { Router, Request, Response } from "express";
import { z } from "zod";
import { validate } from "../../middleware/validate.js";
import {
  getAiConfigStatus,
  isAiServiceError,
  testAiFallbackConfig,
  testAiConfig,
  updateAiFallbackConfig,
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

const updateAiFallbackSchema = z.object({
  model: z.string().min(3).max(120).optional(),
  apiKey: z.string().max(300).optional(),
  enabled: z.boolean().optional(),
  clearApiKey: z.boolean().optional(),
});
const fallbackProviderSchema = z.enum(["openai", "anthropic", "gemini", "groq", "openrouter"]);

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

router.put(
  "/fallback/:provider",
  validate(updateAiFallbackSchema),
  async (req: Request, res: Response) => {
    try {
      const parsedProvider = fallbackProviderSchema.safeParse(req.params.provider);
      if (!parsedProvider.success) {
        res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Provider fallback không được hỗ trợ." },
        });
        return;
      }
      const result = await updateAiFallbackConfig(
        parsedProvider.data,
        req.body,
        req.user!.userId
      );
      if (isAiServiceError(result)) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.status(200).json({ data: result });
    } catch {
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
      });
    }
  }
);

router.post("/fallback/:provider/test", async (req: Request, res: Response) => {
  try {
    const parsedProvider = fallbackProviderSchema.safeParse(req.params.provider);
    if (!parsedProvider.success) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Provider fallback không được hỗ trợ." },
      });
      return;
    }
    const result = await testAiFallbackConfig(parsedProvider.data, req.user!.userId);
    if (isAiServiceError(result)) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(200).json({ data: result });
  } catch {
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
    });
  }
});

export default router;
