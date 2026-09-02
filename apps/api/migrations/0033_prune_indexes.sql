-- Prune-friendly index: the 7-day site_logs retention DELETE scans by created_at alone.

CREATE INDEX IF NOT EXISTS idx_site_logs_created_at
  ON site_logs (created_at);
