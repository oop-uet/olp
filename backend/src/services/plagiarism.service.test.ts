import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema.js";
import { getTestSqlite } from "../test/setup.js";
import {
  checkExercisePlagiarism,
  isPlagiarismError,
  normalizeCode,
  shingles,
} from "./plagiarism.service.js";

function getDb() {
  return drizzle(getTestSqlite(), { schema }) as any;
}

function seedUser(role: "student" | "instructor" = "student", fullName?: string) {
  const id = randomUUID();
  getTestSqlite()
    .prepare(
      `INSERT INTO users (id, username, email, password_hash, role, full_name, created_at, updated_at)
       VALUES (?, ?, ?, 'hash', ?, ?, datetime('now'), datetime('now'))`
    )
    .run(id, `user_${id.slice(0, 8)}`, `${id}@test.local`, role, fullName ?? null);
  return id;
}

function seedExerciseAndSection() {
  const instructorId = seedUser("instructor", "Instructor");
  const exerciseId = randomUUID();
  const sectionId = randomUUID();
  const sqlite = getTestSqlite();
  sqlite
    .prepare(
      `INSERT INTO exercises (id, title, description, difficulty, is_library, oop_tags, created_by, created_at, updated_at)
       VALUES (?, 'Similarity Lab', 'Compare submissions', 'easy', 1, '[]', ?, datetime('now'), datetime('now'))`
    )
    .run(exerciseId, instructorId);
  sqlite
    .prepare(
      `INSERT INTO class_sections (id, name, semester, instructor_id, created_at)
       VALUES (?, 'INT2204', '2026-1', ?, datetime('now'))`
    )
    .run(sectionId, instructorId);
  return { exerciseId, sectionId };
}

function seedSubmission(input: {
  studentId: string;
  exerciseId: string;
  sectionId: string;
  code: string;
  score?: number;
  submittedAt?: string;
}) {
  const id = randomUUID();
  getTestSqlite()
    .prepare(
      `INSERT INTO submissions (id, student_id, exercise_id, section_id, code, score, attempt_number, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
    )
    .run(
      id,
      input.studentId,
      input.exerciseId,
      input.sectionId,
      input.code,
      input.score ?? 100,
      input.submittedAt ?? new Date().toISOString()
    );
  return id;
}

describe("plagiarism.service", () => {
  it("normalizes comments and whitespace before token comparison", () => {
    expect(normalizeCode("int a = 1; // comment\n  int b = 2;")).toBe("int a = 1; int b = 2;");
    expect([...shingles(["a", "b", "c"], 5)]).toEqual(["a b c"]);
  });

  it("detects suspiciously similar submissions for the same exercise", async () => {
    const db = getDb();
    const { exerciseId, sectionId } = seedExerciseAndSection();
    const studentA = seedUser("student", "Student A");
    const studentB = seedUser("student", "Student B");
    const studentC = seedUser("student", "Student C");

    const similarCodeA = `
public class Main {
    public static int sum(int n) {
        int total = 0;
        for (int i = 1; i <= n; i++) {
            total += i;
        }
        return total;
    }
}
`;
    const similarCodeB = `
public class Main {
    public static int sum(int n) {
        int total = 0;
        for (int i = 1; i <= n; i++) {
            total += i;
        }
        return total;
    }
}
`;
    const differentCode = `
public class Main {
    public static String reverse(String text) {
        return new StringBuilder(text).reverse().toString();
    }
}
`;

    seedSubmission({ studentId: studentA, exerciseId, sectionId, code: similarCodeA });
    seedSubmission({ studentId: studentB, exerciseId, sectionId, code: similarCodeB });
    seedSubmission({ studentId: studentC, exerciseId, sectionId, code: differentCode });

    const report = await checkExercisePlagiarism(exerciseId, { sectionId }, db);

    expect(isPlagiarismError(report)).toBe(false);
    expect((report as any).totalSubmissions).toBe(3);
    expect((report as any).comparedPairs).toBe(3);
    expect((report as any).pairs).toHaveLength(1);
    expect(new Set([(report as any).pairs[0].studentAName, (report as any).pairs[0].studentBName])).toEqual(
      new Set(["Student A", "Student B"])
    );
    expect((report as any).pairs[0].similarity).toBe(1);
  });

  it("respects instructor-provided similarity threshold", async () => {
    const db = getDb();
    const { exerciseId, sectionId } = seedExerciseAndSection();
    const studentA = seedUser("student", "Student A");
    const studentB = seedUser("student", "Student B");

    seedSubmission({
      studentId: studentA,
      exerciseId,
      sectionId,
      code: "public class Main { int a = 1; int b = 2; int c = 3; }",
    });
    seedSubmission({
      studentId: studentB,
      exerciseId,
      sectionId,
      code: "public class Main { int a = 1; int b = 2; int d = 4; }",
    });

    const lowThreshold = await checkExercisePlagiarism(exerciseId, { sectionId, threshold: 40 }, db);
    const highThreshold = await checkExercisePlagiarism(exerciseId, { sectionId, threshold: 95 }, db);

    expect(isPlagiarismError(lowThreshold)).toBe(false);
    expect(isPlagiarismError(highThreshold)).toBe(false);
    expect((lowThreshold as any).pairs).toHaveLength(1);
    expect((highThreshold as any).pairs).toHaveLength(0);
  });

  it("returns not found for missing exercise", async () => {
    const result = await checkExercisePlagiarism("missing", {}, getDb());

    expect(isPlagiarismError(result)).toBe(true);
    expect((result as any).error.code).toBe("NOT_FOUND");
  });
});
