-- Node flight (public TLS + MCP client + custom-domain HTTPS) attached after npm run smoke.
ALTER TABLE smoke_runs ADD COLUMN flight TEXT;
