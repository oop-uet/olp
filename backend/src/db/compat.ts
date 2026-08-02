import { db as defaultDb } from "./index.js";
import { eq } from "drizzle-orm";
import { classSections, exercises } from "./schema.js";
import { normalizeSectionNameForSemester } from "../utils/semester.js";
import {
  EXPENSE_PROJECT_DESCRIPTION,
  EXPENSE_PROJECT_ID,
  EXPENSE_PROJECT_TAGS,
  EXPENSE_PROJECT_TITLE,
} from "./library-projects.js";

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

  await ensureAssessmentTablesReady(database);

  // The former exercise-level KT flag is retired. Real exams now use assessment_assignments.
  await executeRaw(database, "UPDATE exercise_assignments SET is_assessment = 0 WHERE is_assessment <> 0");

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
  await ensureExpenseProjectInLibrary(database);
  await ensureProjectTablesReady(database);
  await releaseUnstartedProjectAssignments(database);
}

async function ensureAssessmentTablesReady(database: Database) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS assessments (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      instructions TEXT NOT NULL DEFAULT '',
      duration_minutes INTEGER NOT NULL DEFAULT 60,
      total_points REAL NOT NULL DEFAULT 10,
      shuffle_questions INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'draft',
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      published_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS assessment_sections (
      id TEXT PRIMARY KEY NOT NULL,
      assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      intro_content TEXT,
      points REAL NOT NULL,
      order_index INTEGER NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS assessment_sections_assessment_order_unique
      ON assessment_sections(assessment_id, order_index)`,
    `CREATE TABLE IF NOT EXISTS assessment_questions (
      id TEXT PRIMARY KEY NOT NULL,
      section_id TEXT NOT NULL REFERENCES assessment_sections(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      prompt TEXT NOT NULL,
      points REAL NOT NULL,
      order_index INTEGER NOT NULL,
      grading_mode TEXT NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS assessment_questions_section_order_unique
      ON assessment_questions(section_id, order_index)`,
    `CREATE TABLE IF NOT EXISTS assessment_options (
      id TEXT PRIMARY KEY NOT NULL,
      question_id TEXT NOT NULL REFERENCES assessment_questions(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      order_index INTEGER NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS assessment_options_question_order_unique
      ON assessment_options(question_id, order_index)`,
    `CREATE TABLE IF NOT EXISTS assessment_answer_keys (
      question_id TEXT PRIMARY KEY NOT NULL REFERENCES assessment_questions(id) ON DELETE CASCADE,
      answer_json TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS assessment_grading_guides (
      question_id TEXT PRIMARY KEY NOT NULL REFERENCES assessment_questions(id) ON DELETE CASCADE,
      reference_answer TEXT NOT NULL,
      rubric_json TEXT NOT NULL,
      prompt_template TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS assessment_assignments (
      id TEXT PRIMARY KEY NOT NULL,
      assessment_id TEXT NOT NULL REFERENCES assessments(id),
      section_id TEXT NOT NULL REFERENCES class_sections(id),
      opens_at TEXT NOT NULL,
      closes_at TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      is_visible INTEGER NOT NULL DEFAULT 1,
      require_fullscreen INTEGER NOT NULL DEFAULT 0,
      warning_threshold INTEGER NOT NULL DEFAULT 3,
      show_predicted_score INTEGER NOT NULL DEFAULT 1,
      assigned_by TEXT NOT NULL REFERENCES users(id),
      assigned_at TEXT NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS assessment_assignments_assessment_section_unique
      ON assessment_assignments(assessment_id, section_id)`,
    `CREATE TABLE IF NOT EXISTS assessment_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      assignment_id TEXT NOT NULL REFERENCES assessment_assignments(id),
      student_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'in_progress',
      started_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      question_order_json TEXT,
      submitted_at TEXT,
      submit_reason TEXT,
      auto_score REAL NOT NULL DEFAULT 0,
      predicted_score REAL,
      official_score REAL,
      review_status TEXT NOT NULL DEFAULT 'not_ready',
      official_at TEXT,
      official_by TEXT REFERENCES users(id)
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS assessment_sessions_assignment_student_unique
      ON assessment_sessions(assignment_id, student_id)`,
    `CREATE TABLE IF NOT EXISTS assessment_answers (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL REFERENCES assessment_questions(id),
      answer_json TEXT NOT NULL,
      client_revision INTEGER NOT NULL DEFAULT 1,
      saved_at TEXT NOT NULL,
      auto_points REAL,
      ai_suggested_points REAL,
      final_points REAL,
      ai_feedback TEXT,
      final_feedback TEXT,
      ai_confidence TEXT,
      grading_state TEXT NOT NULL DEFAULT 'ungraded',
      reviewed_by TEXT REFERENCES users(id),
      reviewed_at TEXT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS assessment_answers_session_question_unique
      ON assessment_answers(session_id, question_id)`,
    `CREATE TABLE IF NOT EXISTS assessment_ai_grading_runs (
      id TEXT PRIMARY KEY NOT NULL,
      answer_id TEXT NOT NULL REFERENCES assessment_answers(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'queued',
      provider TEXT,
      model TEXT,
      prompt_version TEXT NOT NULL DEFAULT 'assessment-grading-v1',
      suggested_points REAL,
      result_json TEXT,
      confidence TEXT,
      needs_human_attention INTEGER NOT NULL DEFAULT 0,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      error_code TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS assessment_ai_grading_runs_answer_idx
      ON assessment_ai_grading_runs(answer_id, created_at)`,
    `CREATE TABLE IF NOT EXISTS assessment_integrity_events (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      metadata_json TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS assessment_audit_logs (
      id TEXT PRIMARY KEY NOT NULL,
      actor_id TEXT NOT NULL REFERENCES users(id),
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS assessment_audit_logs_target_idx
      ON assessment_audit_logs(target_type, target_id, created_at)`,
  ];

  for (const statement of statements) {
    await executeRaw(database, statement);
  }

  await addColumnIfMissing(
    database,
    "ALTER TABLE assessments ADD COLUMN shuffle_questions INTEGER NOT NULL DEFAULT 1"
  );
  await addColumnIfMissing(
    database,
    "ALTER TABLE assessment_sessions ADD COLUMN question_order_json TEXT"
  );
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

async function ensureExpenseProjectInLibrary(database: Database) {
  const now = new Date().toISOString();
  await database
    .insert(exercises)
    .values({
      id: EXPENSE_PROJECT_ID,
      title: EXPENSE_PROJECT_TITLE,
      description: EXPENSE_PROJECT_DESCRIPTION,
      difficulty: "hard",
      starterCode: "",
      isLibrary: 1,
      oopTags: JSON.stringify(EXPENSE_PROJECT_TAGS),
      createdBy: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: exercises.id,
      set: {
        title: EXPENSE_PROJECT_TITLE,
        description: EXPENSE_PROJECT_DESCRIPTION,
        difficulty: "hard",
        starterCode: "",
        isLibrary: 1,
        oopTags: JSON.stringify(EXPENSE_PROJECT_TAGS),
        updatedAt: now,
      },
    });
}

async function ensureProjectTablesReady(database: Database) {
  await executeRaw(
    database,
    `CREATE TABLE IF NOT EXISTS project_groups (
      id TEXT PRIMARY KEY NOT NULL,
      section_id TEXT NOT NULL REFERENCES class_sections(id),
      exercise_id TEXT NOT NULL REFERENCES exercises(id),
      name TEXT NOT NULL,
      github_url TEXT,
      score REAL,
      feedback TEXT,
      graded_by TEXT REFERENCES users(id),
      graded_at TEXT,
      submitted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
  );

  await executeRaw(
    database,
    `CREATE UNIQUE INDEX IF NOT EXISTS project_groups_section_exercise_name_unique
      ON project_groups(section_id, exercise_id, name)`
  );

  await executeRaw(
    database,
    `CREATE TABLE IF NOT EXISTS project_group_members (
      id TEXT PRIMARY KEY NOT NULL,
      group_id TEXT NOT NULL REFERENCES project_groups(id),
      student_id TEXT REFERENCES users(id),
      student_external_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      is_leader INTEGER NOT NULL DEFAULT 0,
      contribution_percent INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`
  );

  await executeRaw(
    database,
    `CREATE UNIQUE INDEX IF NOT EXISTS project_group_members_group_student_unique
      ON project_group_members(group_id, student_external_id)`
  );
}

async function releaseUnstartedProjectAssignments(database: Database) {
  await executeRaw(
    database,
    `DELETE FROM exercise_assignments
     WHERE exercise_id = '${EXPENSE_PROJECT_ID}'
       AND week IS NULL
       AND NOT EXISTS (
         SELECT 1
         FROM submissions
         WHERE submissions.exercise_id = exercise_assignments.exercise_id
           AND submissions.section_id = exercise_assignments.section_id
       )
       AND NOT EXISTS (
         SELECT 1
         FROM project_groups
         WHERE project_groups.exercise_id = exercise_assignments.exercise_id
           AND project_groups.section_id = exercise_assignments.section_id
       )`
  );
}
