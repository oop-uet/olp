UPDATE `assessments`
SET
  `status` = 'published',
  `published_at` = COALESCE(`published_at`, `created_at`)
WHERE `status` <> 'published';
