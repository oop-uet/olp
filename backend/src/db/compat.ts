import { db as defaultDb } from "./index.js";

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
}
