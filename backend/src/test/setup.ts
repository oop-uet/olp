import { beforeAll, afterAll, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

let sqlite: Database.Database;
let testDb: BetterSQLite3Database;

/**
 * Creates an in-memory SQLite database for testing.
 * This avoids hitting the real Turso database during tests.
 */
export function getTestDb(): BetterSQLite3Database {
  return testDb;
}

export function getTestSqlite(): Database.Database {
  return sqlite;
}

beforeAll(() => {
  sqlite = new Database(':memory:');
  testDb = drizzle(sqlite);

  // Create tables matching the schema
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student', 'instructor', 'admin')),
      full_name TEXT,
      must_change_password INTEGER DEFAULT 0,
      failed_login_attempts INTEGER DEFAULT 0,
      locked_until TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS class_sections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      semester TEXT NOT NULL,
      instructor_id TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS section_instructors (
      id TEXT PRIMARY KEY,
      section_id TEXT NOT NULL REFERENCES class_sections(id),
      instructor_id TEXT NOT NULL REFERENCES users(id),
      is_primary INTEGER NOT NULL DEFAULT 0,
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(section_id, instructor_id)
    );

    CREATE TABLE IF NOT EXISTS section_enrollments (
      id TEXT PRIMARY KEY,
      section_id TEXT NOT NULL REFERENCES class_sections(id),
      student_id TEXT NOT NULL REFERENCES users(id),
      student_external_id TEXT,
      enrolled_at TEXT DEFAULT (datetime('now')),
      UNIQUE(section_id, student_id),
      UNIQUE(student_id)
    );

    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      difficulty TEXT NOT NULL CHECK(difficulty IN ('easy', 'medium', 'hard')),
      starter_code TEXT,
      is_library INTEGER DEFAULT 0,
      oop_tags TEXT,
      style_check_enabled INTEGER NOT NULL DEFAULT 1,
      style_policy TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS exercise_assignments (
      id TEXT PRIMARY KEY,
      exercise_id TEXT NOT NULL REFERENCES exercises(id),
      section_id TEXT NOT NULL REFERENCES class_sections(id),
      deadline TEXT,
      is_assessment INTEGER DEFAULT 0,
      is_visible INTEGER DEFAULT 0,
      allow_submission INTEGER DEFAULT 1,
      max_submissions INTEGER,
      week INTEGER,
      assigned_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS test_cases (
      id TEXT PRIMARY KEY,
      exercise_id TEXT NOT NULL REFERENCES exercises(id),
      input_data TEXT,
      expected_output TEXT,
      is_visible INTEGER DEFAULT 1,
      point_value INTEGER NOT NULL CHECK(point_value BETWEEN 1 AND 100),
      time_limit_seconds INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES users(id),
      exercise_id TEXT NOT NULL REFERENCES exercises(id),
      section_id TEXT NOT NULL REFERENCES class_sections(id),
      code TEXT NOT NULL,
      functional_score REAL,
      score REAL,
      manual_score REAL,
      style_score REAL,
      style_status TEXT CHECK(style_status IN ('passed', 'failed', 'unavailable', 'skipped')),
      style_feedback TEXT,
      style_report TEXT,
      feedback TEXT,
      attempt_number INTEGER,
      submitted_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS project_groups (
      id TEXT PRIMARY KEY,
      section_id TEXT NOT NULL REFERENCES class_sections(id),
      exercise_id TEXT NOT NULL REFERENCES exercises(id),
      name TEXT NOT NULL,
      repository_url TEXT,
      score REAL,
      feedback TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      graded_at TEXT,
      graded_by TEXT REFERENCES users(id),
      UNIQUE(section_id, exercise_id, name)
    );

    CREATE TABLE IF NOT EXISTS project_group_members (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES project_groups(id),
      student_id TEXT REFERENCES users(id),
      student_external_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      is_leader INTEGER NOT NULL DEFAULT 0,
      contribution_percent INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(group_id, student_external_id)
    );

    CREATE TABLE IF NOT EXISTS submission_results (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES submissions(id),
      test_case_id TEXT NOT NULL REFERENCES test_cases(id),
      passed INTEGER NOT NULL,
      actual_output TEXT,
      status TEXT NOT NULL CHECK(status IN ('passed', 'failed', 'timeout', 'error')),
      execution_time_ms INTEGER
    );

    CREATE TABLE IF NOT EXISTS anticheat_events (
      id TEXT PRIMARY KEY,
      submission_id TEXT REFERENCES submissions(id),
      student_id TEXT NOT NULL REFERENCES users(id),
      exercise_id TEXT NOT NULL REFERENCES exercises(id),
      event_type TEXT NOT NULL,
      warning_count_at_event INTEGER NOT NULL,
      occurred_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      valid_range TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      updated_by TEXT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS source_check_reports (
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
    );
  `);

  // Seed default system configuration
  sqlite.exec(`
    INSERT OR IGNORE INTO system_config (key, value, valid_range)
    VALUES
      ('warning_threshold', '3', '1-10'),
      ('time_limit_minutes', '60', '1-180'),
      ('max_submissions', '10', '1-100'),
      ('source_check_enabled', '0', '0-1'),
      ('source_check_weekly_enabled', '0', '0-1'),
      ('source_check_similarity_threshold', '70', '40-95'),
      ('source_check_max_runtime_minutes', '20', '5-120'),
      ('source_check_provider', 'jplag', 'enum:jplag,pmd_cpd,dolos'),
      ('source_check_weekly_day', '6', '0-6'),
      ('source_check_weekly_hour', '22', '0-23'),
      ('source_check_weekly_minute', '0', '0-59'),
      ('style_check_enabled', '0', '0-1'),
      ('style_check_weight_percent', '10', '0-50'),
      ('style_check_penalty_per_violation', '5', '1-20'),
      ('style_check_max_penalized_violations', '20', '1-100');
  `);
});

afterEach(() => {
  // Clean user-created data between tests but preserve system_config defaults
  sqlite.exec(`
    DELETE FROM anticheat_events;
    DELETE FROM source_check_reports;
    DELETE FROM submission_results;
    DELETE FROM project_group_members;
    DELETE FROM project_groups;
    DELETE FROM submissions;
    DELETE FROM test_cases;
    DELETE FROM exercise_assignments;
    DELETE FROM exercises;
    DELETE FROM section_instructors;
    DELETE FROM section_enrollments;
    DELETE FROM class_sections;
    DELETE FROM users;
  `);
});

afterAll(() => {
  sqlite.close();
});
