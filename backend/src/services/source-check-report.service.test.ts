import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema.js";
import { getTestSqlite } from "../test/setup.js";
import {
  getSourceCheckReport,
  isSourceCheckReportError,
  listSourceCheckReports,
  saveSourceCheckReport,
} from "./source-check-report.service.js";

function getDb() {
  return drizzle(getTestSqlite(), { schema }) as any;
}

function seedExerciseAndSection() {
  const instructorId = randomUUID();
  const exerciseId = randomUUID();
  const sectionId = randomUUID();
  const sqlite = getTestSqlite();

  sqlite
    .prepare(
      `INSERT INTO users (id, username, email, password_hash, role, full_name, created_at, updated_at)
       VALUES (?, ?, ?, 'hash', 'instructor', 'Instructor', datetime('now'), datetime('now'))`
    )
    .run(instructorId, `instructor_${instructorId.slice(0, 8)}`, `${instructorId}@test.local`);

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

describe("source-check-report.service", () => {
  it("saves and lists source check reports", async () => {
    const db = getDb();
    const { exerciseId, sectionId } = seedExerciseAndSection();

    const saved = await saveSourceCheckReport(
      {
        exerciseId,
        sectionId,
        provider: "jplag",
        threshold: 0.9,
        status: "completed",
        report: {
          exerciseId,
          totalSubmissions: 2,
          comparedPairs: 1,
          threshold: 0.9,
          pairs: [],
        },
        workflowRunId: "123",
        triggeredBy: "github-actions",
      },
      db
    );

    expect(isSourceCheckReportError(saved)).toBe(false);
    expect((saved as any).pairCount).toBe(0);
    expect((saved as any).report.totalSubmissions).toBe(2);

    const reports = await listSourceCheckReports({ exerciseId }, db);
    expect(reports).toHaveLength(1);
    expect(reports[0].exerciseTitle).toBe("Similarity Lab");

    const recentReports = await listSourceCheckReports({}, db);
    expect(recentReports).toHaveLength(1);

    const detail = await getSourceCheckReport((saved as any).id, db);
    expect(isSourceCheckReportError(detail)).toBe(false);
    expect((detail as any).workflowRunId).toBe("123");
  });
});
