-- Settings page ships "Insights language" and "Weekly schedule day" controls with no backing
-- columns yet — add them so those fields actually persist instead of resetting on reload.

ALTER TABLE workspace_settings ADD COLUMN IF NOT EXISTS insights_language text NOT NULL DEFAULT 'auto'
  CHECK (insights_language IN ('auto', 'en', 'ru'));

ALTER TABLE workspace_settings ADD COLUMN IF NOT EXISTS insights_schedule_day text
  CHECK (insights_schedule_day IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'));
