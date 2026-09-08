-- Retire founder smoke/audit scoreboards and ops checklist/snapshot tables.
-- Product tables (sites, deploys, deploy_failures, …) stay.

DROP TABLE IF EXISTS smoke_cases;
DROP TABLE IF EXISTS smoke_runs;
DROP TABLE IF EXISTS audit_cases;
DROP TABLE IF EXISTS audit_runs;
DROP TABLE IF EXISTS ops_checklist;
DROP TABLE IF EXISTS ops_daily_snapshot;
