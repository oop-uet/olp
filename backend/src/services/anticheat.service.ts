import crypto from "node:crypto";
import { eq, and, asc } from "drizzle-orm";
import { db as defaultDb } from "../db/index.js";
import { anticheatEvents, submissions } from "../db/schema.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type AnticheatEventType = "fullscreen_exit" | "visibility_hidden" | "window_blur";

export interface LogEventInput {
  studentId: string;
  exerciseId: string;
  eventType: AnticheatEventType;
  warningCount: number;
  submissionId?: string;
}

export interface AnticheatError {
  error: { code: string; message: string };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isAnticheatError(value: unknown): value is AnticheatError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as any).error?.code === "string"
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = any;

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * Log an anti-cheat event (fullscreen_exit, visibility_hidden, window_blur).
 * Called by the frontend Anti-Cheat Monitor component when a violation is detected.
 *
 * Validates: Requirements 7.3, 7.4, 7.7
 */
export async function logEvent(
  input: LogEventInput,
  database: Database = defaultDb
): Promise<AnticheatError | Record<string, unknown>> {
  const { studentId, exerciseId, eventType, warningCount, submissionId } = input;

  const id = crypto.randomUUID();
  const occurredAt = new Date().toISOString();

  await database.insert(anticheatEvents).values({
    id,
    submissionId: submissionId || null,
    studentId,
    exerciseId,
    eventType,
    warningCountAtEvent: warningCount,
    occurredAt,
  });

  return {
    id,
    studentId,
    exerciseId,
    eventType,
    warningCountAtEvent: warningCount,
    occurredAt,
    submissionId: submissionId || null,
  };
}

/**
 * Get the anti-cheat event log for a given submission.
 * Returns all anticheat_events for the submission's student+exercise combo,
 * sorted by occurredAt ascending.
 *
 * Used by instructors on the submission detail page.
 *
 * Validates: Requirements 7.7
 */
export async function getAnticheatLog(
  submissionId: string,
  database: Database = defaultDb
): Promise<AnticheatError | Record<string, unknown>[]> {
  // First, get the submission to find the student and exercise
  const submission = await database.query.submissions.findFirst({
    where: eq(submissions.id, submissionId),
  });

  if (!submission) {
    return {
      error: {
        code: "NOT_FOUND",
        message: "Submission not found.",
      },
    };
  }

  // Get all anticheat events for this student+exercise combination
  const events = await database.query.anticheatEvents.findMany({
    where: and(
      eq(anticheatEvents.studentId, submission.studentId),
      eq(anticheatEvents.exerciseId, submission.exerciseId)
    ),
    orderBy: [asc(anticheatEvents.occurredAt)],
  });

  return events;
}
