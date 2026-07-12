import { Router, Response } from "express";
import { getConfig } from "../services/config.service.js";

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

export default router;
