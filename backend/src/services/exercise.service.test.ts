import { describe, it, expect, beforeEach } from "vitest";
import { getTestSqlite } from "../test/setup.js";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema.js";
import {
  createExercise,
  listExercises,
  getExerciseById,
  updateExercise,
  deleteExercise,
  browseLibrary,
  assignToSection,
  isExerciseError,
} from "./exercise.service.js";
import { randomUUID } from "crypto";

function getDb() {
  return drizzle(getTestSqlite(), { schema }) as any;
}

// Helper to seed a user
function seedUser(role: "instructor" | "admin" | "student" = "instructor") {
  const id = randomUUID();
  const sqlite = getTestSqlite();
  sqlite.exec(`
    INSERT INTO users (id, username, email, password_hash, role, created_at, updated_at)
    VALUES ('${id}', 'user_${id.slice(0, 8)}', 'user_${id.slice(0, 8)}@test.com', 'hash', '${role}', datetime('now'), datetime('now'))
  `);
  return id;
}

// Helper to seed a class section
function seedSection(instructorId: string) {
  const id = randomUUID();
  const sqlite = getTestSqlite();
  sqlite.exec(`
    INSERT INTO class_sections (id, name, semester, instructor_id, created_at)
    VALUES ('${id}', 'OOP Section', '2024-1', '${instructorId}', datetime('now'))
  `);
  return id;
}

const validInput = () => ({
  title: "Implement a Stack class",
  description: "Create a generic Stack class using OOP principles.",
  difficulty: "medium" as const,
  oop_tags: ["classes", "encapsulation"],
  starter_code: "public class Stack<T> { }",
  is_library: false,
  test_cases: [
    {
      input_data: "push 1\npush 2\npop",
      expected_output: "2",
      is_visible: true,
      point_value: 10,
    },
  ],
});

describe("Exercise Service", () => {
  describe("createExercise", () => {
    it("should create an exercise with valid input", async () => {
      const db = getDb();
      const userId = seedUser();
      const input = validInput();

      const result = await createExercise(input, userId, db);

      expect(isExerciseError(result)).toBe(false);
      expect(result).toHaveProperty("id");
      expect((result as any).title).toBe("Implement a Stack class");
      expect((result as any).difficulty).toBe("medium");
      expect((result as any).oopTags).toEqual(["classes", "encapsulation"]);
      expect((result as any).testCases).toHaveLength(1);
    });

    it("should reject title longer than 200 characters", async () => {
      const db = getDb();
      const userId = seedUser();
      const input = { ...validInput(), title: "a".repeat(201) };

      const result = await createExercise(input, userId, db);

      expect(isExerciseError(result)).toBe(true);
      expect((result as any).error.code).toBe("VALIDATION_ERROR");
      expect((result as any).error.message).toContain("200");
    });

    it("should reject description longer than 5000 characters", async () => {
      const db = getDb();
      const userId = seedUser();
      const input = { ...validInput(), description: "x".repeat(5001) };

      const result = await createExercise(input, userId, db);

      expect(isExerciseError(result)).toBe(true);
      expect((result as any).error.code).toBe("VALIDATION_ERROR");
      expect((result as any).error.message).toContain("5000");
    });

    it("should reject empty oop_tags", async () => {
      const db = getDb();
      const userId = seedUser();
      const input = { ...validInput(), oop_tags: [] };

      const result = await createExercise(input, userId, db);

      expect(isExerciseError(result)).toBe(true);
      expect((result as any).error.code).toBe("VALIDATION_ERROR");
    });

    it("should reject more than 5 oop_tags", async () => {
      const db = getDb();
      const userId = seedUser();
      const input = { ...validInput(), oop_tags: ["a", "b", "c", "d", "e", "f"] };

      const result = await createExercise(input, userId, db);

      expect(isExerciseError(result)).toBe(true);
      expect((result as any).error.code).toBe("VALIDATION_ERROR");
    });

    it("should reject if no test cases provided", async () => {
      const db = getDb();
      const userId = seedUser();
      const input = { ...validInput(), test_cases: [] };

      const result = await createExercise(input, userId, db);

      expect(isExerciseError(result)).toBe(true);
      expect((result as any).error.code).toBe("VALIDATION_ERROR");
      expect((result as any).error.message).toContain("test case");
    });
  });

  describe("listExercises", () => {
    it("should list only the instructor's own exercises", async () => {
      const db = getDb();
      const userId1 = seedUser();
      const userId2 = seedUser();

      await createExercise(validInput(), userId1, db);
      await createExercise({ ...validInput(), title: "Second" }, userId2, db);

      const result = await listExercises(userId1, "instructor", db);

      expect(result).toHaveLength(1);
      expect((result as any)[0].title).toBe("Implement a Stack class");
    });

    it("should list all exercises for admin", async () => {
      const db = getDb();
      const userId1 = seedUser();
      const userId2 = seedUser();
      const adminId = seedUser("admin");

      await createExercise(validInput(), userId1, db);
      await createExercise({ ...validInput(), title: "Second" }, userId2, db);

      const result = await listExercises(adminId, "admin", db);

      expect(result).toHaveLength(2);
    });
  });

  describe("getExerciseById", () => {
    it("should return exercise with test cases", async () => {
      const db = getDb();
      const userId = seedUser();
      const created = await createExercise(validInput(), userId, db);
      const exerciseId = (created as any).id;

      const result = await getExerciseById(exerciseId, db);

      expect(isExerciseError(result)).toBe(false);
      expect((result as any).title).toBe("Implement a Stack class");
      expect((result as any).testCases).toHaveLength(1);
    });

    it("should return NOT_FOUND for non-existent exercise", async () => {
      const db = getDb();

      const result = await getExerciseById("non-existent-id", db);

      expect(isExerciseError(result)).toBe(true);
      expect((result as any).error.code).toBe("NOT_FOUND");
    });
  });

  describe("updateExercise", () => {
    it("should update exercise fields", async () => {
      const db = getDb();
      const userId = seedUser();
      const created = await createExercise(validInput(), userId, db);
      const exerciseId = (created as any).id;

      const result = await updateExercise(
        exerciseId,
        { title: "Updated Title", difficulty: "hard" },
        userId,
        "instructor",
        db
      );

      expect(isExerciseError(result)).toBe(false);
      expect((result as any).title).toBe("Updated Title");
      expect((result as any).difficulty).toBe("hard");
    });

    it("should reject update from a different instructor", async () => {
      const db = getDb();
      const userId1 = seedUser();
      const userId2 = seedUser();
      const created = await createExercise(validInput(), userId1, db);
      const exerciseId = (created as any).id;

      const result = await updateExercise(
        exerciseId,
        { title: "Hacked" },
        userId2,
        "instructor",
        db
      );

      expect(isExerciseError(result)).toBe(true);
      expect((result as any).error.code).toBe("FORBIDDEN");
    });

    it("should allow an instructor to update an exercise assigned to their section", async () => {
      const db = getDb();
      const creatorId = seedUser();
      const instructorId = seedUser();
      const sectionId = seedSection(instructorId);
      const created = await createExercise(validInput(), creatorId, db);
      const exerciseId = (created as any).id;

      getTestSqlite().exec(`
        INSERT INTO exercise_assignments (id, exercise_id, section_id, assigned_at)
        VALUES ('${randomUUID()}', '${exerciseId}', '${sectionId}', datetime('now'))
      `);

      const result = await updateExercise(
        exerciseId,
        { title: "Updated By Section Instructor" },
        instructorId,
        "instructor",
        db
      );

      expect(isExerciseError(result)).toBe(false);
      expect((result as any).title).toBe("Updated By Section Instructor");
    });

    it("should allow admin to update any exercise", async () => {
      const db = getDb();
      const userId = seedUser();
      const adminId = seedUser("admin");
      const created = await createExercise(validInput(), userId, db);
      const exerciseId = (created as any).id;

      const result = await updateExercise(
        exerciseId,
        { title: "Admin Updated" },
        adminId,
        "admin",
        db
      );

      expect(isExerciseError(result)).toBe(false);
      expect((result as any).title).toBe("Admin Updated");
    });

    it("should replace test cases when admin updates an exercise", async () => {
      const db = getDb();
      const userId = seedUser();
      const adminId = seedUser("admin");
      const created = await createExercise(validInput(), userId, db);
      const exerciseId = (created as any).id;

      const result = await updateExercise(
        exerciseId,
        {
          test_cases: [
            {
              input_data: "",
              expected_output: "Hello World",
              is_visible: true,
              point_value: 40,
              time_limit_seconds: 5,
            },
            {
              input_data: "An",
              expected_output: "Hello World\nHello An",
              is_visible: true,
              point_value: 60,
              time_limit_seconds: 5,
            },
          ],
        },
        adminId,
        "admin",
        db
      );

      expect(isExerciseError(result)).toBe(false);
      expect((result as any).testCases).toHaveLength(2);
      expect((result as any).testCases[0].timeLimitSeconds).toBe(5);

      const loaded = await getExerciseById(exerciseId, db);
      expect((loaded as any).testCases).toHaveLength(2);
      expect((loaded as any).testCases.map((tc: any) => tc.pointValue)).toEqual([40, 60]);
    });

    it("should delete old submission results when replacing test cases after submissions exist", async () => {
      const db = getDb();
      const instructorId = seedUser();
      const studentId = seedUser("student");
      const sectionId = seedSection(instructorId);
      const created = await createExercise(validInput(), instructorId, db);
      const exerciseId = (created as any).id;
      const oldTestCaseId = (created as any).testCases[0].id;
      const submissionId = randomUUID();
      const resultId = randomUUID();

      getTestSqlite().exec(`
        INSERT INTO submissions (id, student_id, exercise_id, section_id, code, score, attempt_number, submitted_at)
        VALUES ('${submissionId}', '${studentId}', '${exerciseId}', '${sectionId}', 'code', 100, 1, datetime('now'));
        INSERT INTO submission_results (id, submission_id, test_case_id, passed, actual_output, status)
        VALUES ('${resultId}', '${submissionId}', '${oldTestCaseId}', 1, '2', 'passed');
      `);

      const result = await updateExercise(
        exerciseId,
        {
          test_cases: [
            {
              input_data: "__OOP_JAVA_TEST__\nNewTest.java",
              expected_output: "public class NewTest {}",
              is_visible: true,
              point_value: 100,
              time_limit_seconds: 10,
            },
          ],
        },
        instructorId,
        "instructor",
        db
      );

      expect(isExerciseError(result)).toBe(false);

      const oldResult = getTestSqlite()
        .prepare("SELECT * FROM submission_results WHERE id = ?")
        .get(resultId) as any;
      expect(oldResult).toBeUndefined();

      const oldTestCase = getTestSqlite()
        .prepare("SELECT * FROM test_cases WHERE id = ?")
        .get(oldTestCaseId) as any;
      expect(oldTestCase).toBeUndefined();

      const oldSubmission = getTestSqlite()
        .prepare("SELECT score FROM submissions WHERE id = ?")
        .get(submissionId) as any;
      expect(oldSubmission.score).toBe(100);

      const activeTestCases = getTestSqlite()
        .prepare("SELECT * FROM test_cases WHERE exercise_id = ?")
        .all(exerciseId) as any[];
      expect(activeTestCases).toHaveLength(1);
      expect(activeTestCases[0].expected_output).toBe("public class NewTest {}");
    });

    it("should return NOT_FOUND for non-existent exercise", async () => {
      const db = getDb();
      const userId = seedUser();

      const result = await updateExercise(
        "non-existent",
        { title: "New" },
        userId,
        "instructor",
        db
      );

      expect(isExerciseError(result)).toBe(true);
      expect((result as any).error.code).toBe("NOT_FOUND");
    });
  });

  describe("deleteExercise", () => {
    it("should delete an exercise and its test cases", async () => {
      const db = getDb();
      const userId = seedUser();
      const created = await createExercise(validInput(), userId, db);
      const exerciseId = (created as any).id;

      const result = await deleteExercise(exerciseId, userId, "instructor", db);

      expect(isExerciseError(result)).toBe(false);
      expect((result as any).success).toBe(true);

      // Verify it's gone
      const getResult = await getExerciseById(exerciseId, db);
      expect(isExerciseError(getResult)).toBe(true);
    });

    it("should reject delete from a different instructor", async () => {
      const db = getDb();
      const userId1 = seedUser();
      const userId2 = seedUser();
      const created = await createExercise(validInput(), userId1, db);
      const exerciseId = (created as any).id;

      const result = await deleteExercise(exerciseId, userId2, "instructor", db);

      expect(isExerciseError(result)).toBe(true);
      expect((result as any).error.code).toBe("FORBIDDEN");
    });

    it("should return NOT_FOUND for non-existent exercise", async () => {
      const db = getDb();
      const userId = seedUser();

      const result = await deleteExercise("non-existent", userId, "instructor", db);

      expect(isExerciseError(result)).toBe(true);
      expect((result as any).error.code).toBe("NOT_FOUND");
    });
  });

  describe("browseLibrary", () => {
    it("should return only library exercises", async () => {
      const db = getDb();
      const userId = seedUser();

      await createExercise(validInput(), userId, db);
      await createExercise({ ...validInput(), title: "Library Ex", is_library: true }, userId, db);

      const result = await browseLibrary(db);

      expect(result).toHaveLength(1);
      expect((result as any)[0].title).toBe("Library Ex");
    });
  });

  describe("assignToSection", () => {
    it("should assign an exercise to a section", async () => {
      const db = getDb();
      const userId = seedUser();
      const sectionId = seedSection(userId);
      const created = await createExercise(validInput(), userId, db);
      const exerciseId = (created as any).id;

      const result = await assignToSection(
        exerciseId,
        { section_id: sectionId, deadline: "2024-12-31T23:59:59Z", is_assessment: true },
        db
      );

      expect(isExerciseError(result)).toBe(false);
      expect((result as any).exerciseId).toBe(exerciseId);
      expect((result as any).sectionId).toBe(sectionId);
      expect((result as any).isAssessment).toBe(1);
    });

    it("should reject assignment if exercise doesn't exist", async () => {
      const db = getDb();
      const userId = seedUser();
      const sectionId = seedSection(userId);

      const result = await assignToSection(
        "non-existent",
        { section_id: sectionId },
        db
      );

      expect(isExerciseError(result)).toBe(true);
      expect((result as any).error.code).toBe("NOT_FOUND");
    });

    it("should reject assignment if section doesn't exist", async () => {
      const db = getDb();
      const userId = seedUser();
      const created = await createExercise(validInput(), userId, db);
      const exerciseId = (created as any).id;

      const result = await assignToSection(
        exerciseId,
        { section_id: "non-existent" },
        db
      );

      expect(isExerciseError(result)).toBe(true);
      expect((result as any).error.code).toBe("NOT_FOUND");
    });

    it("should reject duplicate assignment", async () => {
      const db = getDb();
      const userId = seedUser();
      const sectionId = seedSection(userId);
      const created = await createExercise(validInput(), userId, db);
      const exerciseId = (created as any).id;

      await assignToSection(exerciseId, { section_id: sectionId }, db);
      const result = await assignToSection(exerciseId, { section_id: sectionId }, db);

      expect(isExerciseError(result)).toBe(true);
      expect((result as any).error.code).toBe("ALREADY_ASSIGNED");
    });
  });
});
