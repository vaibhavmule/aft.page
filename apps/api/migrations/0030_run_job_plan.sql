-- Build plan JSON for Run jobs (install/build/outputDirs from detect).
ALTER TABLE run_jobs ADD COLUMN plan_json TEXT;
