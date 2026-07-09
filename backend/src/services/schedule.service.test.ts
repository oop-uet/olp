import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema.js";
import { getTestSqlite } from "../test/setup.js";
import { createExercise } from "./exercise.service.js";
import { getSectionSchedule, isScheduleError } from "./schedule.service.js";

function getDb() {
  return drizzle(getTestSqlite(), { schema }) as any;
}

function seedUser(username: string, role: "instructor" | "admin" = "instructor") {
  const id = randomUUID();
  getTestSqlite()
    .prepare(
      `INSERT INTO users (id, username, email, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, 'hash', ?, datetime('now'), datetime('now'))`
    )
    .run(id, username, `${username}@test.local`, role);
  return id;
}

function seedSection(instructorId: string) {
  const id = randomUUID();
  getTestSqlite()
    .prepare(
      `INSERT INTO class_sections (id, name, semester, instructor_id, created_at)
       VALUES (?, 'INT2204 80', '2025-2', ?, datetime('now'))`
    )
    .run(id, instructorId);
  return id;
}

function exerciseInput(title: string, isLibrary = false) {
  return {
    title,
    description: "Bài tập kiểm thử lịch phân bài.",
    difficulty: "easy" as const,
    oop_tags: ["classes"],
    starter_code: "",
    is_library: isLibrary,
    test_cases: [
      {
        input_data: "input",
        expected_output: "output",
        is_visible: true,
        point_value: 100,
      },
    ],
  };
}

describe("Schedule Service", () => {
  it("separates system exercises from private instructor exercises with creator labels", async () => {
    const db = getDb();
    const instructorA = seedUser("gv_a");
    const instructorB = seedUser("gv_b");
    const sectionId = seedSection(instructorA);

    await createExercise(exerciseInput("Tuần 1 - Hello World", true), instructorA, db);
    await createExercise(exerciseInput("Bài riêng GV A"), instructorA, db);
    await createExercise(exerciseInput("Bài riêng GV B"), instructorB, db);

    const result = await getSectionSchedule(sectionId, instructorA, "instructor", db);

    expect(isScheduleError(result)).toBe(false);
    if (isScheduleError(result)) return;

    expect(result.pool.map((exercise) => exercise.title)).toEqual(["Tuần 1 - Hello World"]);
    expect(result.otherPool.map((exercise) => exercise.title).sort()).toEqual([
      "Bài riêng GV A",
      "Bài riêng GV B",
    ]);
    expect(result.otherPool).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Bài riêng GV A", creatorUsername: "gv_a" }),
        expect.objectContaining({ title: "Bài riêng GV B", creatorUsername: "gv_b" }),
      ])
    );
  });
});
