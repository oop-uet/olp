import { describe, expect, it } from "vitest";
import { ensureDatabaseCompatibility } from "./compat.js";
import { getTestDb, getTestSqlite } from "../test/setup.js";

const ASSESSMENT_TABLES = [
  "assessment_ai_grading_runs",
  "assessment_answer_keys",
  "assessment_answers",
  "assessment_assignments",
  "assessment_audit_logs",
  "assessment_grading_guides",
  "assessment_integrity_events",
  "assessment_options",
  "assessment_questions",
  "assessment_sections",
  "assessment_sessions",
  "assessments",
];

describe("database compatibility", () => {
  it("bootstraps assessment tables on a legacy database and retires old KT flags", async () => {
    const sqlite = getTestSqlite();
    sqlite.exec(`
      DROP TABLE assessment_audit_logs;
      DROP TABLE assessment_integrity_events;
      DROP TABLE assessment_ai_grading_runs;
      DROP TABLE assessment_answers;
      DROP TABLE assessment_sessions;
      DROP TABLE assessment_assignments;
      DROP TABLE assessment_answer_keys;
      DROP TABLE assessment_grading_guides;
      DROP TABLE assessment_options;
      DROP TABLE assessment_questions;
      DROP TABLE assessment_sections;
      DROP TABLE assessments;

      INSERT INTO users (id, username, email, password_hash, role)
      VALUES ('legacy-instructor', 'legacy-instructor', 'legacy@example.com', 'hash', 'instructor');
      INSERT INTO class_sections (id, name, semester, instructor_id)
      VALUES ('legacy-section', 'INT2204 1', '2025-2026-2', 'legacy-instructor');
      INSERT INTO exercises (id, title, description, difficulty, oop_tags, created_by)
      VALUES ('legacy-exercise', 'Bài tập cũ', 'Mô tả', 'easy', '[]', 'legacy-instructor');
      INSERT INTO exercise_assignments (
        id, exercise_id, section_id, is_assessment, is_visible, allow_submission
      ) VALUES (
        'legacy-assignment', 'legacy-exercise', 'legacy-section', 1, 1, 1
      );
    `);

    await ensureDatabaseCompatibility(getTestDb() as never);

    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'assessment%'")
      .all()
      .map((row) => (row as { name: string }).name)
      .sort();
    const assignment = sqlite
      .prepare("SELECT is_assessment AS isAssessment FROM exercise_assignments WHERE id = ?")
      .get("legacy-assignment") as { isAssessment: number };
    const assessmentColumns = sqlite
      .prepare("PRAGMA table_info(assessments)")
      .all()
      .map((row) => (row as { name: string }).name);
    const sessionColumns = sqlite
      .prepare("PRAGMA table_info(assessment_sessions)")
      .all()
      .map((row) => (row as { name: string }).name);
    const assessmentAssignmentColumns = sqlite
      .prepare("PRAGMA table_info(assessment_assignments)")
      .all()
      .map((row) => (row as { name: string }).name);
    const aiRunColumns = sqlite
      .prepare("PRAGMA table_info(assessment_ai_grading_runs)")
      .all()
      .map((row) => (row as { name: string }).name);
    const assessmentIndexes = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'assessment_%'"
      )
      .all()
      .map((row) => (row as { name: string }).name);

    expect(tables).toEqual(ASSESSMENT_TABLES);
    expect(assignment.isAssessment).toBe(0);
    expect(assessmentColumns).toContain("shuffle_questions");
    expect(sessionColumns).toContain("question_order_json");
    expect(sessionColumns).toContain("attempt_number");
    expect(assessmentAssignmentColumns).toEqual(
      expect.arrayContaining(["week", "max_attempts"])
    );
    expect(aiRunColumns).toEqual(expect.arrayContaining(["next_attempt_at", "locked_until"]));
    expect(assessmentIndexes).toEqual(
      expect.arrayContaining([
        "assessment_ai_grading_runs_queue_idx",
        "assessment_integrity_events_session_occurred_idx",
        "assessment_sessions_assignment_student_attempt_unique",
      ])
    );

    sqlite.exec(`
      DROP INDEX assessment_sessions_assignment_student_attempt_unique;
      CREATE UNIQUE INDEX assessment_sessions_assignment_student_unique
        ON assessment_sessions(assignment_id, student_id);
    `);
    await ensureDatabaseCompatibility(getTestDb() as never);
    const upgradedSessionIndexes = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'assessment_sessions_%'"
      )
      .all()
      .map((row) => (row as { name: string }).name);
    expect(upgradedSessionIndexes).toContain(
      "assessment_sessions_assignment_student_attempt_unique"
    );
    expect(upgradedSessionIndexes).not.toContain("assessment_sessions_assignment_student_unique");
  });
});
