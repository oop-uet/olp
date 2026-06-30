import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema.js";
import { getTestSqlite } from "../test/setup.js";
import {
  createSubmission,
  calculateScore,
  isSubmissionError,
} from "./submission.service.js";

// ─── Helper: create a test database instance with schema for DI ─────────────

function getDb() {
  return drizzle(getTestSqlite(), { schema });
}

// ─── Helper: seed DB for submission tests ────────────────────────────────────

function seedSubmissionTestData() {
  const sqlite = getTestSqlite();
  sqlite.exec(`PRAGMA foreign_keys = OFF;`);

  const studentId = randomUUID();
  const instructorId = randomUUID();
  const exerciseId = randomUUID();
  const sectionId = randomUUID();
  const testCaseId1 = randomUUID();
  const testCaseId2 = randomUUID();
  const testCaseId3 = randomUUID();
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

  // Insert exercise assignment with future deadline
  const futureDeadline = new Date(Date.now() + 86400000).toISOString(); // 1 day from now
  sqlite.prepare(
    `INSERT INTO exercise_assignments (id, exercise_id, section_id, deadline, is_assessment, assigned_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(randomUUID(), exerciseId, sectionId, futureDeadline, 0, now);

  // Insert test cases (point_value: 30, 40, 30 = total 100)
  sqlite.prepare(
    `INSERT INTO test_cases (id, exercise_id, input_data, expected_output, is_visible, point_value, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(testCaseId1, exerciseId, "push 1\npop", "1", 1, 30, now);

  sqlite.prepare(
    `INSERT INTO test_cases (id, exercise_id, input_data, expected_output, is_visible, point_value, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(testCaseId2, exerciseId, "push 1\npush 2\npop", "2", 1, 40, now);

  sqlite.prepare(
    `INSERT INTO test_cases (id, exercise_id, input_data, expected_output, is_visible, point_value, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(testCaseId3, exerciseId, "push 1\npush 2\npop\npop", "2\n1", 0, 30, now);

  return { studentId, instructorId, exerciseId, sectionId, testCaseId1, testCaseId2, testCaseId3 };
}

// ─── Unit tests for calculateScore ──────────────────────────────────────────

describe("calculateScore", () => {
  it("should return 100 when all test cases pass", () => {
    const testCases = [
      { id: "tc1", expectedOutput: "hello", pointValue: 50 },
      { id: "tc2", expectedOutput: "world", pointValue: 50 },
    ];
    const results = [
      { test_case_id: "tc1", actual_output: "hello", execution_time_ms: 10, status: "passed" as const },
      { test_case_id: "tc2", actual_output: "world", execution_time_ms: 10, status: "passed" as const },
    ];

    expect(calculateScore(testCases, results)).toBe(100);
  });

  it("should return 0 when all test cases fail", () => {
    const testCases = [
      { id: "tc1", expectedOutput: "hello", pointValue: 50 },
      { id: "tc2", expectedOutput: "world", pointValue: 50 },
    ];
    const results = [
      { test_case_id: "tc1", actual_output: "wrong", execution_time_ms: 10, status: "failed" as const },
      { test_case_id: "tc2", actual_output: "nope", execution_time_ms: 10, status: "failed" as const },
    ];

    expect(calculateScore(testCases, results)).toBe(0);
  });

  it("should calculate partial score with weighted test cases", () => {
    const testCases = [
      { id: "tc1", expectedOutput: "hello", pointValue: 30 },
      { id: "tc2", expectedOutput: "world", pointValue: 70 },
    ];
    const results = [
      { test_case_id: "tc1", actual_output: "hello", execution_time_ms: 10, status: "passed" as const },
      { test_case_id: "tc2", actual_output: "wrong", execution_time_ms: 10, status: "failed" as const },
    ];

    expect(calculateScore(testCases, results)).toBe(30);
  });

  it("should trim whitespace when comparing outputs", () => {
    const testCases = [
      { id: "tc1", expectedOutput: "  hello  ", pointValue: 100 },
    ];
    const results = [
      { test_case_id: "tc1", actual_output: "hello", execution_time_ms: 10, status: "passed" as const },
    ];

    expect(calculateScore(testCases, results)).toBe(100);
  });

  it("should return 0 for empty test cases", () => {
    expect(calculateScore([], [])).toBe(0);
  });

  it("should round to 2 decimal places", () => {
    const testCases = [
      { id: "tc1", expectedOutput: "a", pointValue: 1 },
      { id: "tc2", expectedOutput: "b", pointValue: 1 },
      { id: "tc3", expectedOutput: "c", pointValue: 1 },
    ];
    const results = [
      { test_case_id: "tc1", actual_output: "a", execution_time_ms: 10, status: "passed" as const },
      { test_case_id: "tc2", actual_output: "wrong", execution_time_ms: 10, status: "failed" as const },
      { test_case_id: "tc3", actual_output: "wrong", execution_time_ms: 10, status: "failed" as const },
    ];

    // 1/3 * 100 = 33.333... → rounded to 33.33
    expect(calculateScore(testCases, results)).toBe(33.33);
  });
});

// ─── Integration tests for createSubmission ──────────────────────────────────

describe("createSubmission", () => {
  beforeEach(() => {
    const sqlite = getTestSqlite();
    sqlite.exec(`PRAGMA foreign_keys = OFF;`);
  });

  it("should create a submission with correct score", async () => {
    const { studentId, exerciseId, sectionId, testCaseId1, testCaseId2, testCaseId3 } =
      seedSubmissionTestData();
    const db = getDb();

    const result = await createSubmission(
      {
        studentId,
        exerciseId,
        sectionId,
        code: "public class Stack { }",
        testResults: [
          { test_case_id: testCaseId1, actual_output: "1", execution_time_ms: 50, status: "passed" },
          { test_case_id: testCaseId2, actual_output: "2", execution_time_ms: 60, status: "passed" },
          { test_case_id: testCaseId3, actual_output: "wrong", execution_time_ms: 70, status: "failed" },
        ],
      },
      db
    );

    expect(isSubmissionError(result)).toBe(false);
    const submission = result as Record<string, unknown>;
    expect(submission.score).toBe(70); // (30+40) / 100 * 100 = 70
    expect(submission.attemptNumber).toBe(1);
    expect(submission.results).toHaveLength(3);
  });

  it("should reject when exercise is not assigned to section", async () => {
    seedSubmissionTestData();
    const db = getDb();

    const result = await createSubmission(
      {
        studentId: randomUUID(),
        exerciseId: randomUUID(), // non-existent exercise assignment
        sectionId: randomUUID(),
        code: "code",
        testResults: [],
      },
      db
    );

    expect(isSubmissionError(result)).toBe(true);
    expect((result as any).error.code).toBe("NOT_FOUND");
  });

  it("should reject when deadline has passed", async () => {
    const { studentId, sectionId } = seedSubmissionTestData();
    const db = getDb();
    const sqlite = getTestSqlite();

    // Create exercise with past deadline
    const exerciseId = randomUUID();
    const instructorId = randomUUID();
    const now = new Date().toISOString();

    sqlite.prepare(
      `INSERT INTO users (id, username, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(instructorId, `inst2_${instructorId.slice(0, 8)}`, `inst2_${instructorId.slice(0, 8)}@uet.vnu.edu.vn`, "hash", "instructor", now, now);

    sqlite.prepare(
      `INSERT INTO exercises (id, title, description, difficulty, oop_tags, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(exerciseId, "Past Exercise", "Desc", "easy", '["classes"]', instructorId, now, now);

    const pastDeadline = new Date(Date.now() - 86400000).toISOString(); // 1 day ago
    sqlite.prepare(
      `INSERT INTO exercise_assignments (id, exercise_id, section_id, deadline, is_assessment, assigned_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(randomUUID(), exerciseId, sectionId, pastDeadline, 0, now);

    const result = await createSubmission(
      {
        studentId,
        exerciseId,
        sectionId,
        code: "code",
        testResults: [],
      },
      db
    );

    expect(isSubmissionError(result)).toBe(true);
    expect((result as any).error.code).toBe("DEADLINE_PASSED");
  });

  it("should reject when max submissions limit reached", async () => {
    const { studentId, exerciseId, sectionId, testCaseId1, testCaseId2, testCaseId3 } =
      seedSubmissionTestData();
    const db = getDb();
    const sqlite = getTestSqlite();

    // Set max_submissions to 2
    sqlite.prepare(`UPDATE system_config SET value = '2' WHERE key = 'max_submissions'`).run();

    // Create 2 existing submissions
    const now = new Date().toISOString();
    for (let i = 0; i < 2; i++) {
      sqlite.prepare(
        `INSERT INTO submissions (id, student_id, exercise_id, section_id, code, score, attempt_number, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(randomUUID(), studentId, exerciseId, sectionId, "code", 50, i + 1, now);
    }

    const result = await createSubmission(
      {
        studentId,
        exerciseId,
        sectionId,
        code: "code",
        testResults: [
          { test_case_id: testCaseId1, actual_output: "1", execution_time_ms: 10, status: "passed" },
          { test_case_id: testCaseId2, actual_output: "2", execution_time_ms: 10, status: "passed" },
          { test_case_id: testCaseId3, actual_output: "2\n1", execution_time_ms: 10, status: "passed" },
        ],
      },
      db
    );

    expect(isSubmissionError(result)).toBe(true);
    expect((result as any).error.code).toBe("MAX_SUBMISSIONS_REACHED");
  });

  it("should increment attempt_number correctly", async () => {
    const { studentId, exerciseId, sectionId, testCaseId1, testCaseId2, testCaseId3 } =
      seedSubmissionTestData();
    const db = getDb();

    const testResults = [
      { test_case_id: testCaseId1, actual_output: "1", execution_time_ms: 10, status: "passed" as const },
      { test_case_id: testCaseId2, actual_output: "2", execution_time_ms: 10, status: "passed" as const },
      { test_case_id: testCaseId3, actual_output: "2\n1", execution_time_ms: 10, status: "passed" as const },
    ];

    const result1 = await createSubmission(
      { studentId, exerciseId, sectionId, code: "v1", testResults },
      db
    );
    expect((result1 as any).attemptNumber).toBe(1);

    const result2 = await createSubmission(
      { studentId, exerciseId, sectionId, code: "v2", testResults },
      db
    );
    expect((result2 as any).attemptNumber).toBe(2);
  });

  it("should calculate 100% score when all outputs match", async () => {
    const { studentId, exerciseId, sectionId, testCaseId1, testCaseId2, testCaseId3 } =
      seedSubmissionTestData();
    const db = getDb();

    const result = await createSubmission(
      {
        studentId,
        exerciseId,
        sectionId,
        code: "correct code",
        testResults: [
          { test_case_id: testCaseId1, actual_output: "1", execution_time_ms: 10, status: "passed" },
          { test_case_id: testCaseId2, actual_output: "2", execution_time_ms: 10, status: "passed" },
          { test_case_id: testCaseId3, actual_output: "2\n1", execution_time_ms: 10, status: "passed" },
        ],
      },
      db
    );

    expect(isSubmissionError(result)).toBe(false);
    expect((result as any).score).toBe(100);
  });

  it("should nullify assessment score when anti-cheat warning threshold is reached", async () => {
    const { studentId, exerciseId, sectionId, testCaseId1, testCaseId2, testCaseId3 } =
      seedSubmissionTestData();
    const db = getDb();
    const sqlite = getTestSqlite();
    const now = new Date().toISOString();

    sqlite.prepare(
      `UPDATE exercise_assignments SET is_assessment = 1 WHERE exercise_id = ? AND section_id = ?`
    ).run(exerciseId, sectionId);

    for (let i = 1; i <= 3; i++) {
      sqlite.prepare(
        `INSERT INTO anticheat_events (id, student_id, exercise_id, event_type, warning_count_at_event, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(randomUUID(), studentId, exerciseId, "window_blur", i, now);
    }

    const result = await createSubmission(
      {
        studentId,
        exerciseId,
        sectionId,
        code: "correct code",
        testResults: [
          { test_case_id: testCaseId1, actual_output: "1", execution_time_ms: 10, status: "passed" },
          { test_case_id: testCaseId2, actual_output: "2", execution_time_ms: 10, status: "passed" },
          { test_case_id: testCaseId3, actual_output: "2\n1", execution_time_ms: 10, status: "passed" },
        ],
      },
      db
    );

    expect(isSubmissionError(result)).toBe(false);
    expect((result as any).score).toBe(0);
    expect((result as any).feedback).toContain("vượt quá ngưỡng cảnh báo");
  });

  it("should nullify assessment score when client reports anti-cheat lock", async () => {
    const { studentId, exerciseId, sectionId, testCaseId1, testCaseId2, testCaseId3 } =
      seedSubmissionTestData();
    const db = getDb();
    const sqlite = getTestSqlite();

    sqlite.prepare(
      `UPDATE exercise_assignments SET is_assessment = 1 WHERE exercise_id = ? AND section_id = ?`
    ).run(exerciseId, sectionId);

    const result = await createSubmission(
      {
        studentId,
        exerciseId,
        sectionId,
        code: "correct code",
        antiCheatNullified: true,
        testResults: [
          { test_case_id: testCaseId1, actual_output: "1", execution_time_ms: 10, status: "passed" },
          { test_case_id: testCaseId2, actual_output: "2", execution_time_ms: 10, status: "passed" },
          { test_case_id: testCaseId3, actual_output: "2\n1", execution_time_ms: 10, status: "passed" },
        ],
      },
      db
    );

    expect(isSubmissionError(result)).toBe(false);
    expect((result as any).score).toBe(0);
  });

  it("should allow submission when no deadline is set", async () => {
    const sqlite = getTestSqlite();
    const db = getDb();

    const studentId = randomUUID();
    const exerciseId = randomUUID();
    const sectionId = randomUUID();
    const testCaseId = randomUUID();
    const now = new Date().toISOString();

    sqlite.prepare(
      `INSERT INTO users (id, username, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(studentId, `s_${studentId.slice(0, 8)}`, `s_${studentId.slice(0, 8)}@uet.vnu.edu.vn`, "hash", "student", now, now);

    sqlite.prepare(
      `INSERT INTO class_sections (id, name, semester, created_at) VALUES (?, ?, ?, ?)`
    ).run(sectionId, "Section B", "2024-2", now);

    sqlite.prepare(
      `INSERT INTO exercises (id, title, description, difficulty, oop_tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(exerciseId, "Ex", "Desc", "easy", '["classes"]', now, now);

    // No deadline (NULL)
    sqlite.prepare(
      `INSERT INTO exercise_assignments (id, exercise_id, section_id, deadline, is_assessment, assigned_at) VALUES (?, ?, ?, NULL, 0, ?)`
    ).run(randomUUID(), exerciseId, sectionId, now);

    sqlite.prepare(
      `INSERT INTO test_cases (id, exercise_id, input_data, expected_output, is_visible, point_value, created_at) VALUES (?, ?, ?, ?, 1, 100, ?)`
    ).run(testCaseId, exerciseId, "input", "output", now);

    const result = await createSubmission(
      {
        studentId,
        exerciseId,
        sectionId,
        code: "code",
        testResults: [
          { test_case_id: testCaseId, actual_output: "output", execution_time_ms: 10, status: "passed" },
        ],
      },
      db
    );

    expect(isSubmissionError(result)).toBe(false);
    expect((result as any).score).toBe(100);
  });
});
