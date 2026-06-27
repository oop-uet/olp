import { Router, Request, Response } from "express";
import {
  getSectionSchedule,
  assignExerciseToWeek,
  removeAssignment,
  setWeekDeadline,
  isScheduleError,
} from "../services/schedule.service.js";

function statusFor(code: string): number {
  switch (code) {
    case "NOT_FOUND":
      return 404;
    case "FORBIDDEN":
      return 403;
    case "VALIDATION_ERROR":
      return 400;
    default:
      return 400;
  }
}

/**
 * Register the week-based schedule endpoints on the given router. Used by both
 * the admin and instructor section routers (role/ownership enforced in service).
 *
 *   GET    /:id/schedule
 *   POST   /:id/schedule/assign      { exercise_id, week }
 *   POST   /:id/schedule/unassign    { exercise_id }
 *   PUT    /:id/schedule/deadline    { week, deadline }
 */
export function registerScheduleRoutes(router: Router): void {
  router.get("/:id/schedule", async (req: Request, res: Response) => {
    try {
      const { userId, role } = req.user!;
      const result = await getSectionSchedule(req.params.id, userId, role);
      if (isScheduleError(result)) {
        res.status(statusFor(result.error.code)).json({ error: result.error });
        return;
      }
      res.status(200).json(result);
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
    }
  });

  router.post("/:id/schedule/assign", async (req: Request, res: Response) => {
    try {
      const { userId, role } = req.user!;
      const { exercise_id, week } = req.body;
      if (!exercise_id) {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "exercise_id là bắt buộc." } });
        return;
      }
      const result = await assignExerciseToWeek(req.params.id, exercise_id, Number(week), userId, role);
      if (isScheduleError(result)) {
        res.status(statusFor(result.error.code)).json({ error: result.error });
        return;
      }
      res.status(200).json(result);
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
    }
  });

  router.post("/:id/schedule/unassign", async (req: Request, res: Response) => {
    try {
      const { userId, role } = req.user!;
      const { exercise_id } = req.body;
      if (!exercise_id) {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "exercise_id là bắt buộc." } });
        return;
      }
      const result = await removeAssignment(req.params.id, exercise_id, userId, role);
      if (isScheduleError(result)) {
        res.status(statusFor(result.error.code)).json({ error: result.error });
        return;
      }
      res.status(200).json(result);
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
    }
  });

  router.put("/:id/schedule/deadline", async (req: Request, res: Response) => {
    try {
      const { userId, role } = req.user!;
      const { week, deadline } = req.body;
      const result = await setWeekDeadline(
        req.params.id,
        Number(week),
        deadline ?? null,
        userId,
        role
      );
      if (isScheduleError(result)) {
        res.status(statusFor(result.error.code)).json({ error: result.error });
        return;
      }
      res.status(200).json(result);
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
    }
  });
}
