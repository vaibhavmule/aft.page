-- Drop internal-ops FIX notes from public changelog (not customer-facing).
DELETE FROM changelog_entries WHERE id IN (
  'status-no-server-apps',
  'container-idle-touch'
);
