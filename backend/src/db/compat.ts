import { db as defaultDb } from "./index.js";
import { eq } from "drizzle-orm";
import { classSections } from "./schema.js";
import { normalizeSectionNameForSemester } from "../utils/semester.js";

type Database = typeof defaultDb;

async function executeRaw(database: Database, statement: string) {
  const client = (database as any).session?.client;
  if (!client) return;

  if (typeof client.execute === "function") {
    await client.execute(statement);
    return;
  }

  if (typeof client.exec === "function") {
    client.exec(statement);
  }
}

async function addColumnIfMissing(database: Database, statement: string) {
  try {
    await executeRaw(database, statement);
  } catch (error: any) {
    const message = String(error?.message ?? error).toLowerCase();
    if (!message.includes("duplicate column") && !message.includes("no such table")) {
      throw error;
    }
  }
}

export async function ensureDatabaseCompatibility(database: Database = defaultDb) {
  await executeRaw(
    database,
    `CREATE TABLE IF NOT EXISTS source_check_reports (
      id TEXT PRIMARY KEY,
      exercise_id TEXT NOT NULL REFERENCES exercises(id),
      section_id TEXT REFERENCES class_sections(id),
      semester TEXT,
      provider TEXT NOT NULL,
      threshold REAL NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('completed', 'failed')),
      total_submissions INTEGER NOT NULL DEFAULT 0,
      compared_pairs INTEGER NOT NULL DEFAULT 0,
      pair_count INTEGER NOT NULL DEFAULT 0,
      report_json TEXT NOT NULL,
      artifact_url TEXT,
      workflow_run_id TEXT,
      triggered_by TEXT,
      started_at TEXT,
      finished_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`
  );

  await executeRaw(
    database,
    "CREATE INDEX IF NOT EXISTS source_check_reports_exercise_idx ON source_check_reports(exercise_id)"
  );

  await executeRaw(
    database,
    "CREATE INDEX IF NOT EXISTS source_check_reports_section_idx ON source_check_reports(section_id)"
  );

  await executeRaw(
    database,
    "CREATE INDEX IF NOT EXISTS source_check_reports_finished_idx ON source_check_reports(finished_at)"
  );

  await addColumnIfMissing(
    database,
    "ALTER TABLE test_cases ADD COLUMN time_limit_seconds INTEGER"
  );

  await executeRaw(
    database,
    `UPDATE exercise_assignments
     SET is_visible = 0
     WHERE is_visible = 1
       AND NOT EXISTS (
         SELECT 1
         FROM submissions
         WHERE submissions.exercise_id = exercise_assignments.exercise_id
           AND submissions.section_id = exercise_assignments.section_id
       )
       AND NOT EXISTS (
         SELECT 1
         FROM system_config
         WHERE key = 'compat_default_assignments_hidden_20260706'
           AND value = '1'
       )`
  );

  await executeRaw(
    database,
    `INSERT INTO system_config (key, value, valid_range, updated_at, updated_by)
     SELECT 'compat_default_assignments_hidden_20260706', '1', '0-1', datetime('now'), NULL
     WHERE NOT EXISTS (
       SELECT 1
       FROM system_config
       WHERE key = 'compat_default_assignments_hidden_20260706'
     )`
  );

  await normalizeExistingSectionNames(database);
}

async function normalizeExistingSectionNames(database: Database) {
  const rows = await database
    .select({
      id: classSections.id,
      name: classSections.name,
      semester: classSections.semester,
    })
    .from(classSections);

  for (const row of rows) {
    const normalizedName = normalizeSectionNameForSemester(row.name, row.semester);
    if (normalizedName !== row.name) {
      await database
        .update(classSections)
        .set({ name: normalizedName })
        .where(eq(classSections.id, row.id));
    }
  }
}
