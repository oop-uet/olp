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

CREATE INDEX IF NOT EXISTS source_check_reports_exercise_idx
  ON source_check_reports(exercise_id);

CREATE INDEX IF NOT EXISTS source_check_reports_section_idx
  ON source_check_reports(section_id);

CREATE INDEX IF NOT EXISTS source_check_reports_finished_idx
  ON source_check_reports(finished_at);
