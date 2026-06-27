import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema.js";
import { getTestSqlite } from "../test/setup.js";
import {
  listTestCases,
  createTestCase,
  updateTestCase,
  deleteTestCase,
  isTestCaseError,
} from "./testcase.service.js";

// ─── Helper ──────────────────────────────────────────────────────────────────

function getDb() {
  return drizzle(getTestSqlite(), { schema });
}

function seedExercise(exerciseId: string) {
  const sqlite = getTestSqlite();
  sqlite.exec(`PRAGMA foreign_keys = OFF;`);
  sqlite.exec(`
    INSERT INTO exercises (id, title, description, difficulty, oop_tags, created_at, updated_at)
    VALUES ('${exerciseId}', 'Test Exercise', 'Description', 'easy', '["classes"]', '${new Date().toISOString()}', '${new Date().toISOString()}');
  `);
}

function seedTestCase(exerciseId: string, testCaseId?: string) {
  const id = testCaseId ?? randomUUID();
  const sqlite = getTestSqlite();
  sqlite.exec(`
    INSERT INTO test_cases (id, exercise_id, input_data, expected_output, is_visible, point_value, time_limit_seconds, created_at)
    VALUES ('${id}', '${exerciseId}', 'input1', 'output1', 1, 10, 5, '${new Date().toISOString()}');
  `);
  return id;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("TestCase Service", () => {
  const exerciseId = randomUUID();

  beforeEach(() => {
    seedExercise(exerciseId);
  });

  describe("listTestCases", () => {
    it("should return empty array when no test cases exist", async () => {
      const db = getDb();
      const result = await listTestCases(exerciseId, db);

      expect(isTestCaseError(result)).toBe(false);
      expect(result).toEqual([]);
    });

    it("should return all test cases for an exercise", async () => {
      const db = getDb();
      seedTestCase(exerciseId);
      seedTestCase(exerciseId);

      const result = await listTestCases(exerciseId, db);

      expect(isTestCaseError(result)).toBe(false);
      expect(result).toHaveLength(2);
    });

    it("should return NOT_FOUND for non-existent exercise", async () => {
      const db = getDb();
      const result = await listTestCases("non-existent-id", db);

      expect(isTestCaseError(result)).toBe(true);
      if (isTestCaseError(result)) {
        expect(result.error.code).toBe("NOT_FOUND");
      }
    });
  });

  describe("createTestCase", () => {
    it("should create a test case with valid input", async () => {
      const db = getDb();
      const result = await createTestCase(
        exerciseId,
        {
          input_data: "1 2 3",
          expected_output: "6",
          is_visible: true,
          point_value: 10,
          time_limit_seconds: 5,
        },
        db
      );

      expect(isTestCaseError(result)).toBe(false);
      if (!isTestCaseError(result)) {
        expect(result.exerciseId).toBe(exerciseId);
        expect(result.inputData).toBe("1 2 3");
        expect(result.expectedOutput).toBe("6");
        expect(result.isVisible).toBe(1);
        expect(result.pointValue).toBe(10);
        expect(result.timeLimitSeconds).toBe(5);
      }
    });

    it("should default is_visible to false", async () => {
      const db = getDb();
      const result = await createTestCase(
        exerciseId,
        {
          input_data: "test",
          expected_output: "result",
          point_value: 5,
        },
        db
      );

      expect(isTestCaseError(result)).toBe(false);
      if (!isTestCaseError(result)) {
        expect(result.isVisible).toBe(0);
      }
    });

    it("should reject when exercise not found", async () => {
      const db = getDb();
      const result = await createTestCase(
        "non-existent",
        {
          input_data: "test",
          expected_output: "result",
          point_value: 5,
        },
        db
      );

      expect(isTestCaseError(result)).toBe(true);
      if (isTestCaseError(result)) {
        expect(result.error.code).toBe("NOT_FOUND");
      }
    });

    it("should reject input_data exceeding 10KB", async () => {
      const db = getDb();
      const largeInput = "x".repeat(10241);
      const result = await createTestCase(
        exerciseId,
        {
          input_data: largeInput,
          expected_output: "result",
          point_value: 5,
        },
        db
      );

      expect(isTestCaseError(result)).toBe(true);
      if (isTestCaseError(result)) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
        expect(result.error.details![0].field).toBe("input_data");
      }
    });

    it("should reject expected_output exceeding 10KB", async () => {
      const db = getDb();
      const largeOutput = "y".repeat(10241);
      const result = await createTestCase(
        exerciseId,
        {
          input_data: "test",
          expected_output: largeOutput,
          point_value: 5,
        },
        db
      );

      expect(isTestCaseError(result)).toBe(true);
      if (isTestCaseError(result)) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
        expect(result.error.details![0].field).toBe("expected_output");
      }
    });

    it("should reject point_value below 1", async () => {
      const db = getDb();
      const result = await createTestCase(
        exerciseId,
        {
          input_data: "test",
          expected_output: "result",
          point_value: 0,
        },
        db
      );

      expect(isTestCaseError(result)).toBe(true);
      if (isTestCaseError(result)) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
        expect(result.error.details![0].field).toBe("point_value");
      }
    });

    it("should reject point_value above 100", async () => {
      const db = getDb();
      const result = await createTestCase(
        exerciseId,
        {
          input_data: "test",
          expected_output: "result",
          point_value: 101,
        },
        db
      );

      expect(isTestCaseError(result)).toBe(true);
      if (isTestCaseError(result)) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
        expect(result.error.details![0].field).toBe("point_value");
      }
    });

    it("should enforce max 50 test cases per exercise", async () => {
      const db = getDb();
      const sqlite = getTestSqlite();

      // Seed 50 test cases directly
      for (let i = 0; i < 50; i++) {
        sqlite.exec(`
          INSERT INTO test_cases (id, exercise_id, input_data, expected_output, is_visible, point_value, created_at)
          VALUES ('${randomUUID()}', '${exerciseId}', 'input${i}', 'output${i}', 1, 10, '${new Date().toISOString()}');
        `);
      }

      const result = await createTestCase(
        exerciseId,
        {
          input_data: "test",
          expected_output: "result",
          point_value: 5,
        },
        db
      );

      expect(isTestCaseError(result)).toBe(true);
      if (isTestCaseError(result)) {
        expect(result.error.code).toBe("LIMIT_EXCEEDED");
      }
    });

    it("should accept input_data at exactly 10240 characters", async () => {
      const db = getDb();
      const exactInput = "a".repeat(10240);
      const result = await createTestCase(
        exerciseId,
        {
          input_data: exactInput,
          expected_output: "result",
          point_value: 50,
        },
        db
      );

      expect(isTestCaseError(result)).toBe(false);
    });
  });

  describe("updateTestCase", () => {
    it("should update test case fields", async () => {
      const db = getDb();
      const tcId = seedTestCase(exerciseId);

      const result = await updateTestCase(
        tcId,
        {
          input_data: "new input",
          expected_output: "new output",
          point_value: 20,
        },
        db
      );

      expect(isTestCaseError(result)).toBe(false);
      if (!isTestCaseError(result)) {
        expect(result.inputData).toBe("new input");
        expect(result.expectedOutput).toBe("new output");
        expect(result.pointValue).toBe(20);
      }
    });

    it("should return NOT_FOUND for non-existent test case", async () => {
      const db = getDb();
      const result = await updateTestCase(
        "non-existent-id",
        { point_value: 20 },
        db
      );

      expect(isTestCaseError(result)).toBe(true);
      if (isTestCaseError(result)) {
        expect(result.error.code).toBe("NOT_FOUND");
      }
    });

    it("should reject input_data exceeding 10KB on update", async () => {
      const db = getDb();
      const tcId = seedTestCase(exerciseId);

      const result = await updateTestCase(
        tcId,
        { input_data: "x".repeat(10241) },
        db
      );

      expect(isTestCaseError(result)).toBe(true);
      if (isTestCaseError(result)) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
      }
    });

    it("should reject point_value outside range on update", async () => {
      const db = getDb();
      const tcId = seedTestCase(exerciseId);

      const result = await updateTestCase(tcId, { point_value: 101 }, db);

      expect(isTestCaseError(result)).toBe(true);
      if (isTestCaseError(result)) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
      }
    });

    it("should return existing test case when no fields provided", async () => {
      const db = getDb();
      const tcId = seedTestCase(exerciseId);

      const result = await updateTestCase(tcId, {}, db);

      expect(isTestCaseError(result)).toBe(false);
      if (!isTestCaseError(result)) {
        expect(result.id).toBe(tcId);
      }
    });

    it("should NOT modify existing submission results when updating", async () => {
      const db = getDb();
      const sqlite = getTestSqlite();
      const tcId = seedTestCase(exerciseId);

      // Seed a submission and submission_result referencing this test case
      const submissionId = randomUUID();
      const studentId = randomUUID();
      const sectionId = randomUUID();
      sqlite.exec(`
        INSERT INTO class_sections (id, name, semester, created_at)
        VALUES ('${sectionId}', 'Section A', '2024-1', '${new Date().toISOString()}');
      `);
      sqlite.exec(`
        INSERT INTO users (id, username, email, password_hash, role, created_at, updated_at)
        VALUES ('${studentId}', 'student1', 'student1@test.com', 'hash', 'student', '${new Date().toISOString()}', '${new Date().toISOString()}');
      `);
      sqlite.exec(`
        INSERT INTO submissions (id, student_id, exercise_id, section_id, code, score, attempt_number, submitted_at)
        VALUES ('${submissionId}', '${studentId}', '${exerciseId}', '${sectionId}', 'code', 80.0, 1, '${new Date().toISOString()}');
      `);
      const resultId = randomUUID();
      sqlite.exec(`
        INSERT INTO submission_results (id, submission_id, test_case_id, passed, actual_output, status)
        VALUES ('${resultId}', '${submissionId}', '${tcId}', 1, 'output1', 'passed');
      `);

      // Update the test case
      await updateTestCase(
        tcId,
        { expected_output: "completely_different_output", point_value: 99 },
        db
      );

      // Verify submission results and submission score are unchanged
      const submissionResult = sqlite
        .prepare("SELECT * FROM submission_results WHERE id = ?")
        .get(resultId) as any;
      expect(submissionResult.passed).toBe(1);
      expect(submissionResult.status).toBe("passed");

      const submission = sqlite
        .prepare("SELECT * FROM submissions WHERE id = ?")
        .get(submissionId) as any;
      expect(submission.score).toBe(80.0);
    });
  });

  describe("deleteTestCase", () => {
    it("should delete an existing test case", async () => {
      const db = getDb();
      const tcId = seedTestCase(exerciseId);

      const result = await deleteTestCase(tcId, db);

      expect(isTestCaseError(result)).toBe(false);
      expect(result).toEqual({ success: true });

      // Verify it's gone
      const cases = await listTestCases(exerciseId, db);
      expect(cases).toHaveLength(0);
    });

    it("should return NOT_FOUND for non-existent test case", async () => {
      const db = getDb();
      const result = await deleteTestCase("non-existent-id", db);

      expect(isTestCaseError(result)).toBe(true);
      if (isTestCaseError(result)) {
        expect(result.error.code).toBe("NOT_FOUND");
      }
    });
  });
});
