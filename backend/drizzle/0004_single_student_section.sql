DELETE FROM section_enrollments
WHERE id NOT IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY student_id
        ORDER BY enrolled_at ASC, id ASC
      ) AS rn
    FROM section_enrollments
  )
  WHERE rn = 1
);

CREATE UNIQUE INDEX IF NOT EXISTS enrollments_student_unique
ON section_enrollments(student_id);
