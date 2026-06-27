import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema.js";
import { getTestSqlite } from "../test/setup.js";
import { logEvent, getAnticheatLog, isAnticheatError } from "./anticheat.service.js";

// ─── Helper: create a test database instance with schema for DI ─────────────

function getDb() {
  return drizzle(getTestSqlite(), { schema });
}

// ─── Helper: seed DB for anticheat tests ─────────────────────────────────────

function seedAnticheatTestData() {
  const sqlite = getTestSqlite();
  sqlite.exec(`PRAGMA foreign_keys = OFF;`);

  const studentId = randomUUID();
  const instructorId = randomUUID();
  const exerciseId = randomUUID();
  const sectionId = randomUUID();
  const submissionId = randomUUID();
  const now = new Date().toISOString();

  // Insert student user
  sqlite.prepare(
    `INSERT INTO users (id, username, email, password_hash, role, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(studentId, `student_${studentId.slice(0, 8)}`, `student_${studentId.slice(0, 8)}@uet.vnu.edu.vn`, "hash", "student", now, now);

  // Insert instructor user
  sqlite.prepare(
    `INSERT INTO users (id, username, email, password_hash, role, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(instructorId, `inst_${instructorId.slice(0, 8)}`, `inst_${instructorId.slice(0, 8)}@uet.vnu.edu.vn`, "hash", "instructor", now, now);

  // Insert class section
  sqlite.prepare(
    `INSERT INTO class_sections (id, name, semester, instructor_id, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(sectionId, "OOP 2024 Section A", "2024-1", instructorId, now);

  // Insert exercise
  sqlite.prepare(
    `INSERT INTO exercises (id, title, description, difficulty, oop_tags, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(exerciseId, "Stack Exercise", "Implement a stack", "medium", '["classes"]', instructorId, now, now);

  // Insert submission
  sqlite.prepare(
    `INSERT INTO submissions (id, student_id, exercise_id, section_id, code, score, attempt_number, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(submissionId, studentId, exerciseId, sectionId, "public class Stack {}", 80, 1, now);

  return { studentId, instructorId, exerciseId, sectionId, submissionId };
}

// ─── Tests for logEvent ──────────────────────────────────────────────────────

describe("logEvent", () => {
  beforeEach(() => {
    const sqlite = getTestSqlite();
    sqlite.exec(`PRAGMA foreign_keys = OFF;`);
  });

  it("should log a fullscreen_exit event successfully", async () => {
    const { studentId, exerciseId } = seedAnticheatTestData();
    const db = getDb();

    const result = await logEvent(
      {
        studentId,
        exerciseId,
        eventType: "fullscreen_exit",
        warningCount: 1,
      },
      db
    );

    expect(isAnticheatError(result)).toBe(false);
    const event = result as Record<string, unknown>;
    expect(event.studentId).toBe(studentId);
    expect(event.exerciseId).toBe(exerciseId);
    expect(event.eventType).toBe("fullscreen_exit");
    expect(event.warningCountAtEvent).toBe(1);
    expect(event.occurredAt).toBeDefined();
    expect(event.id).toBeDefined();
    expect(event.submissionId).toBeNull();
  });

  it("should log a visibility_hidden event with submission_id", async () => {
    const { studentId, exerciseId, submissionId } = seedAnticheatTestData();
    const db = getDb();

    const result = await logEvent(
      {
        studentId,
        exerciseId,
        eventType: "visibility_hidden",
        warningCount: 2,
        submissionId,
      },
      db
    );

    expect(isAnticheatError(result)).toBe(false);
    const event = result as Record<string, unknown>;
    expect(event.eventType).toBe("visibility_hidden");
    expect(event.warningCountAtEvent).toBe(2);
    expect(event.submissionId).toBe(submissionId);
  });

  it("should log a window_blur event", async () => {
    const { studentId, exerciseId } = seedAnticheatTestData();
    const db = getDb();

    const result = await logEvent(
      {
        studentId,
        exerciseId,
        eventType: "window_blur",
        warningCount: 3,
      },
      db
    );

    expect(isAnticheatError(result)).toBe(false);
    const event = result as Record<string, unknown>;
    expect(event.eventType).toBe("window_blur");
    expect(event.warningCountAtEvent).toBe(3);
  });
});

// ─── Tests for getAnticheatLog ───────────────────────────────────────────────

describe("getAnticheatLog", () => {
  beforeEach(() => {
    const sqlite = getTestSqlite();
    sqlite.exec(`PRAGMA foreign_keys = OFF;`);
  });

  it("should return NOT_FOUND for non-existent submission", async () => {
    const db = getDb();

    const result = await getAnticheatLog(randomUUID(), db);

    expect(isAnticheatError(result)).toBe(true);
    expect((result as any).error.code).toBe("NOT_FOUND");
  });

  it("should return empty array when no events exist", async () => {
    const { submissionId } = seedAnticheatTestData();
    const db = getDb();

    const result = await getAnticheatLog(submissionId, db);

    expect(isAnticheatError(result)).toBe(false);
    expect(result).toEqual([]);
  });

  it("should return events sorted by occurredAt ascending", async () => {
    const { studentId, exerciseId, submissionId } = seedAnticheatTestData();
    const db = getDb();
    const sqlite = getTestSqlite();

    // Insert events in reverse chronological order
    sqlite.prepare(
      `INSERT INTO anticheat_events (id, submission_id, student_id, exercise_id, event_type, warning_count_at_event, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(randomUUID(), null, studentId, exerciseId, "fullscreen_exit", 1, "2024-01-01T10:00:00.000Z");

    sqlite.prepare(
      `INSERT INTO anticheat_events (id, submission_id, student_id, exercise_id, event_type, warning_count_at_event, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(randomUUID(), null, studentId, exerciseId, "visibility_hidden", 2, "2024-01-01T10:01:00.000Z");

    sqlite.prepare(
      `INSERT INTO anticheat_events (id, submission_id, student_id, exercise_id, event_type, warning_count_at_event, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(randomUUID(), null, studentId, exerciseId, "window_blur", 3, "2024-01-01T10:02:00.000Z");

    const result = await getAnticheatLog(submissionId, db);

    expect(isAnticheatError(result)).toBe(false);
    const events = result as Record<string, unknown>[];
    expect(events).toHaveLength(3);
    expect(events[0].eventType).toBe("fullscreen_exit");
    expect(events[0].warningCountAtEvent).toBe(1);
    expect(events[1].eventType).toBe("visibility_hidden");
    expect(events[1].warningCountAtEvent).toBe(2);
    expect(events[2].eventType).toBe("window_blur");
    expect(events[2].warningCountAtEvent).toBe(3);
  });

  it("should only return events for the same student+exercise combination", async () => {
    const { studentId, exerciseId, submissionId } = seedAnticheatTestData();
    const db = getDb();
    const sqlite = getTestSqlite();

    const otherStudentId = randomUUID();
    const otherExerciseId = randomUUID();
    const now = new Date().toISOString();

    // Insert other student
    sqlite.prepare(
      `INSERT INTO users (id, username, email, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(otherStudentId, `other_${otherStudentId.slice(0, 8)}`, `other_${otherStudentId.slice(0, 8)}@uet.vnu.edu.vn`, "hash", "student", now, now);

    // Insert other exercise
    sqlite.prepare(
      `INSERT INTO exercises (id, title, description, difficulty, oop_tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(otherExerciseId, "Other", "Desc", "easy", '["classes"]', now, now);

    // Insert event for the target student+exercise
    sqlite.prepare(
      `INSERT INTO anticheat_events (id, submission_id, student_id, exercise_id, event_type, warning_count_at_event, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(randomUUID(), null, studentId, exerciseId, "fullscreen_exit", 1, now);

    // Insert event for a different student (same exercise)
    sqlite.prepare(
      `INSERT INTO anticheat_events (id, submission_id, student_id, exercise_id, event_type, warning_count_at_event, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(randomUUID(), null, otherStudentId, exerciseId, "window_blur", 1, now);

    // Insert event for same student but different exercise
    sqlite.prepare(
      `INSERT INTO anticheat_events (id, submission_id, student_id, exercise_id, event_type, warning_count_at_event, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(randomUUID(), null, studentId, otherExerciseId, "visibility_hidden", 1, now);

    const result = await getAnticheatLog(submissionId, db);

    expect(isAnticheatError(result)).toBe(false);
    const events = result as Record<string, unknown>[];
    expect(events).toHaveLength(1);
    expect(events[0].studentId).toBe(studentId);
    expect(events[0].exerciseId).toBe(exerciseId);
  });
});
