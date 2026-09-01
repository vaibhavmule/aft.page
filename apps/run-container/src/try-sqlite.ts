/** Try-URL sqlite file on the box. Not D1 — that is a Worker binding (Code). */

export const TRY_SQLITE_PATH = "/tmp/aft-try.db";
export const TRY_SQLITE_URL = "sqlite:////tmp/aft-try.db";
/** Rails ActiveRecord sqlite3 URL form. */
export const TRY_SQLITE_RAILS_URL = "sqlite3:/tmp/aft-try.db";

export type SqliteTryKind = "secret" | "orm" | "need-pg" | "none";

export function trySqliteEnv(stack?: string): Record<string, string> {
  const rails = /\brails\b/i.test(stack || "");
  return {
    DATABASE_URL: rails ? TRY_SQLITE_RAILS_URL : TRY_SQLITE_URL,
    SQLALCHEMY_DATABASE_URI: TRY_SQLITE_URL,
  };
}

export function wantsPostgres(text: string): boolean {
  return /postgresql|postgres:\/\/|psycopg|postgis/i.test(text);
}

function gemQuoted(text: string, name: string): boolean {
  return new RegExp(`gem\\s+['"]${name}['"]`, "i").test(text);
}

/** ORM engine switch is a settings patch. pg/mysql2/prisma/Ecto wire protocol is a rewrite. */
export function classifySqliteTry(opts: {
  tree: string;
  stack?: string;
  hasDatabaseUrl: boolean;
}): SqliteTryKind {
  if (opts.hasDatabaseUrl) return "secret";
  const stack = (opts.stack || "").toLowerCase();
  const t = `${stack}\n${opts.tree}`.toLowerCase();
  if (
    /django|sqlalchemy|sqlalchemy_database_uri/.test(t) ||
    /engine:\s*['"]django\.db\.backends/.test(t)
  ) {
    return "orm";
  }
  // Rails: sqlite3 gem → orm (DATABASE_URL / database.yml). pg-only → need-pg.
  if (/\brails\b/.test(stack) || gemQuoted(opts.tree, "rails") || /gem\s+['"]rails['"]/.test(t)) {
    if (gemQuoted(opts.tree, "sqlite3") || /gem\s+['"]sqlite3['"]/.test(t)) {
      return "orm";
    }
    if (
      gemQuoted(opts.tree, "pg") ||
      /gem\s+['"]pg['"]/.test(t) ||
      /adapter:\s*postgresql/.test(t) ||
      /\brails\b/.test(stack)
    ) {
      return "need-pg";
    }
  }
  // ecto_sqlite3 already switches — do not force need-pg on leftover postgres mentions.
  if (!/ecto_sqlite3/.test(t)) {
    if (
      /postgrex|ecto\.adapters\.postgres|phoenix_ecto/.test(t) ||
      (/ecto_sql/.test(t) && /postgres/.test(t)) ||
      /\bphoenix\b/.test(stack)
    ) {
      return "need-pg";
    }
  }
  if (
    /['"]pg['"]|require\(\s*['"]pg['"]\)|from ['"]pg['"]/.test(t) ||
    /mysql2|prisma[^]*postgresql|postgres:\/\/|psycopg/.test(t) ||
    /gem\s+['"]pg['"]/.test(t)
  ) {
    return "need-pg";
  }
  return "none";
}

export const NEED_PG_FAIL =
  "This API uses Postgres. Try URLs have no Postgres. Claim, add DATABASE_URL, then re-run. https://aft.page/docs/env/#try-db";

/** Append Django DATABASES when settings still point at Postgres. */
export const DJANGO_SQLITE_OVERRIDE_PY = `from pathlib import Path
ov = """
# aft try url: sqlite (no postgres)
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": "/tmp/aft-try.db"}}
"""
need = ("postgresql", "postgres://", "psycopg", "postgis")
for p in Path(".").rglob("settings.py"):
    t = p.read_text(encoding="utf-8")
    low = t.lower()
    if "aft try url: sqlite" in t:
        continue
    if not any(s in low for s in need):
        continue
    p.write_text(t + ov, encoding="utf-8")
`;

/** Force config/database.yml default adapter to sqlite3 when still on postgres. */
export const RAILS_SQLITE_OVERRIDE_PY = `from pathlib import Path
p = Path("config/database.yml")
if not p.is_file():
    raise SystemExit(0)
t = p.read_text(encoding="utf-8")
if "aft try url: sqlite" in t:
    raise SystemExit(0)
low = t.lower()
if "postgresql" not in low and "postgres" not in low:
    raise SystemExit(0)
ov = """
# aft try url: sqlite (no postgres)
development:
  adapter: sqlite3
  database: /tmp/aft-try.db
  pool: 5
test:
  adapter: sqlite3
  database: /tmp/aft-try-test.db
  pool: 5
production:
  adapter: sqlite3
  database: /tmp/aft-try.db
  pool: 5
"""
p.write_text(t + "\\n" + ov, encoding="utf-8")
`;
