-- Failed upload bytes live in R2; this flag says they were stored.
ALTER TABLE deploy_failures ADD COLUMN has_payload INTEGER NOT NULL DEFAULT 0;

-- Product client on successful deploys (mcp / web / curl / …).
ALTER TABLE deploys ADD COLUMN client TEXT NOT NULL DEFAULT 'other';
