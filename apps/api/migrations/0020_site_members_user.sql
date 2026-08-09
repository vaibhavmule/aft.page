-- Lookup memberships by user for /v1/me/sites shared inventory.
CREATE INDEX IF NOT EXISTS idx_site_members_user_id ON site_members(user_id);
