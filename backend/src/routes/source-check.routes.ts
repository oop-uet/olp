import { Router, Request, Response } from "express";
import { getConfig } from "../services/config.service.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.guard.js";
import {
  getSourceCheckReport,
  isSourceCheckReportError,
  listSourceCheckReports,
  runAndSaveSourceCheckReport,
} from "../services/source-check-report.service.js";

const router = Router();

const DAY_LABELS = [
  "Chủ nhật",
  "Thứ hai",
  "Thứ ba",
  "Thứ tư",
  "Thứ năm",
  "Thứ sáu",
  "Thứ bảy",
];

function parseConfigMap(rows: Awaited<ReturnType<typeof getConfig>>) {
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

function parseInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function formatTime(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function toGithubCron(localDay: number, localHour: number, localMinute: number) {
  const utcHour = (localHour + 17) % 24;
  const utcDay = localHour < 7 ? (localDay + 6) % 7 : localDay;
  return `${localMinute} ${utcHour} * * ${utcDay}`;
}

function hasValidSourceCheckToken(req: Request) {
  const expected = process.env.SOURCE_CHECK_API_TOKEN;
  const authHeader = req.headers.authorization;
  if (!expected || !authHeader?.startsWith("Bearer ")) return false;
  return authHeader.slice(7) === expected;
}

function parseOptionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

router.get("/settings", async (_req, res: Response) => {
  try {
    const config = parseConfigMap(await getConfig());
    const weeklyDay = parseInteger(config.source_check_weekly_day, 6, 0, 6);
    const weeklyHour = parseInteger(config.source_check_weekly_hour, 22, 0, 23);
    const weeklyMinute = parseInteger(config.source_check_weekly_minute, 0, 0, 59);
    const provider = config.source_check_provider || "jplag";
    const threshold = parseInteger(config.source_check_similarity_threshold, 70, 40, 95);
    const maxRuntimeMinutes = parseInteger(config.source_check_max_runtime_minutes, 20, 5, 120);

    res.status(200).json({
      enabled: config.source_check_enabled === "1",
      weeklyEnabled: config.source_check_weekly_enabled === "1",
      provider,
      threshold,
      maxRuntimeMinutes,
      schedule: {
        timezone: "Asia/Ho_Chi_Minh",
        day: weeklyDay,
        dayLabel: DAY_LABELS[weeklyDay],
        hour: weeklyHour,
        minute: weeklyMinute,
        timeLabel: formatTime(weeklyHour, weeklyMinute),
        cron: toGithubCron(weeklyDay, weeklyHour, weeklyMinute),
      },
    });
  } catch (error) {
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    });
  }
});

router.get(
  "/reports",
  authMiddleware(),
  requireRole("instructor", "admin"),
  async (req: Request, res: Response) => {
    try {
      const reports = await listSourceCheckReports({
        exerciseId: typeof req.query.exercise_id === "string" ? req.query.exercise_id : undefined,
        sectionId: typeof req.query.section_id === "string" ? req.query.section_id : undefined,
        semester: typeof req.query.semester === "string" ? req.query.semester : undefined,
        limit: parseOptionalNumber(req.query.limit),
      });

      res.status(200).json({ data: reports });
    } catch (error) {
      res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred",
        },
      });
    }
  }
);

router.get(
  "/reports/:id",
  authMiddleware(),
  requireRole("instructor", "admin"),
  async (req: Request, res: Response) => {
    try {
      const report = await getSourceCheckReport(req.params.id);

      if (isSourceCheckReportError(report)) {
        res.status(404).json({ error: report.error });
        return;
      }

      res.status(200).json(report);
    } catch (error) {
      res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred",
        },
      });
    }
  }
);

router.post("/run", async (req: Request, res: Response) => {
  try {
    if (!hasValidSourceCheckToken(req)) {
      res.status(401).json({
        error: {
          code: "TOKEN_INVALID",
          message: "Source check token is missing or invalid.",
        },
      });
      return;
    }

    const exerciseId = typeof req.body?.exercise_id === "string" ? req.body.exercise_id.trim() : "";
    if (!exerciseId) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "exercise_id is required.",
        },
      });
      return;
    }

    const result = await runAndSaveSourceCheckReport({
      exerciseId,
      sectionId: typeof req.body?.section_id === "string" && req.body.section_id.trim()
        ? req.body.section_id.trim()
        : undefined,
      semester: typeof req.body?.semester === "string" && req.body.semester.trim()
        ? req.body.semester.trim()
        : undefined,
      provider: typeof req.body?.provider === "string" ? req.body.provider : "jplag",
      threshold: parseOptionalNumber(req.body?.threshold),
      artifactUrl: typeof req.body?.artifact_url === "string" ? req.body.artifact_url : undefined,
      workflowRunId: typeof req.body?.workflow_run_id === "string" ? req.body.workflow_run_id : undefined,
      triggeredBy: typeof req.body?.triggered_by === "string" ? req.body.triggered_by : undefined,
      startedAt: typeof req.body?.started_at === "string" ? req.body.started_at : undefined,
    });

    if (isSourceCheckReportError(result)) {
      const statusCode = result.error.code === "NOT_FOUND" ? 404 : 400;
      res.status(statusCode).json({ error: result.error });
      return;
    }

    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    });
  }
});

export default router;
