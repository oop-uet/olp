import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema.js";
import { getTestSqlite } from "../test/setup.js";
import { isProjectError, saveStudentProjectGroup } from "./project.service.js";

function getDb() {
  return drizzle(getTestSqlite(), { schema }) as any;
}

describe("Project Service", () => {
  it("rejects student project submission when assignment submissions are disabled", async () => {
    const db = getDb();
    const sqlite = getTestSqlite();
    const studentId = randomUUID();
    const sectionId = randomUUID();
    const exerciseId = randomUUID();

    sqlite.exec(`
      INSERT INTO users (id, username, email, password_hash, role, full_name, created_at, updated_at)
      VALUES ('${studentId}', 'student_${studentId.slice(0, 8)}', 'student_${studentId.slice(0, 8)}@test.com', 'hash', 'student', 'Student One', datetime('now'), datetime('now'));

      INSERT INTO class_sections (id, name, semester, created_at)
      VALUES ('${sectionId}', 'OOP Project', '2024-1', datetime('now'));

      INSERT INTO section_enrollments (id, section_id, student_id, student_external_id, enrolled_at)
      VALUES ('${randomUUID()}', '${sectionId}', '${studentId}', '24000001', datetime('now'));

      INSERT INTO exercises (id, title, description, difficulty, oop_tags, created_at, updated_at)
      VALUES ('${exerciseId}', 'Bài tập lớn - Demo', 'Project description', 'hard', '["project"]', datetime('now'), datetime('now'));

      INSERT INTO exercise_assignments (id, exercise_id, section_id, is_visible, allow_submission, assigned_at)
      VALUES ('${randomUUID()}', '${exerciseId}', '${sectionId}', 1, 0, datetime('now'));
    `);

    const result = await saveStudentProjectGroup(
      studentId,
      sectionId,
      exerciseId,
      {
        name: "Nhóm 1",
        repository_url: "https://github.com/student/project",
        members: [{ student_external_id: "24000001", is_leader: true, contribution_percent: 100 }],
      },
      db
    );

    expect(isProjectError(result)).toBe(true);
    if (isProjectError(result)) {
      expect(result.error.code).toBe("SUBMISSION_CLOSED");
    }

    const projectGroups = sqlite.prepare("SELECT * FROM project_groups WHERE exercise_id = ?").all(exerciseId);
    expect(projectGroups).toHaveLength(0);
  });
});
