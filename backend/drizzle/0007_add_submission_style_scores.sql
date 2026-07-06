ALTER TABLE submissions ADD COLUMN functional_score REAL;
ALTER TABLE submissions ADD COLUMN style_score REAL;
ALTER TABLE submissions ADD COLUMN style_status TEXT;
ALTER TABLE submissions ADD COLUMN style_feedback TEXT;
ALTER TABLE submissions ADD COLUMN style_report TEXT;

INSERT INTO system_config (key, value, valid_range, updated_at, updated_by)
VALUES
  ('style_check_enabled', '1', '0-1', datetime('now'), NULL),
  ('style_check_weight_percent', '10', '0-50', datetime('now'), NULL),
  ('style_check_penalty_per_violation', '5', '1-20', datetime('now'), NULL),
  ('style_check_max_penalized_violations', '20', '1-100', datetime('now'), NULL)
ON CONFLICT(key) DO NOTHING;
