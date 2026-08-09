-- Full upload listing on failed deploys (paths + sizes, never contents).

ALTER TABLE deploy_failures ADD COLUMN upload_json TEXT;
