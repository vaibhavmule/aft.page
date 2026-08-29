/** Try-URL sqlite file on the box. Not D1 — that is a Worker binding (Code). */

export const TRY_SQLITE_PATH = "/tmp/aft-try.db";
export const TRY_SQLITE_URL = "sqlite:////tmp/aft-try.db";

export type SqliteTryKind = "secret" | "orm" | "need-pg" | "none";

export function trySqliteEnv(): Record<string, string> {
  return {
    DATABASE_URL: TRY_SQLITE_URL,
    SQLALCHEMY_DATABASE_URI: TRY_SQLITE_URL,
  };
}

export function wantsPostgres(text: string): boolean {
  return /postgresql|postgres:\/\/|psycopg|postgis/i.test(text);
}

/** ORM engine switch is a settings patch. pg/mysql2/prisma wire protocol is a rewrite. */
export function classifySqliteTry(opts: {
  tree: string;
  stack?: string;
  hasDatabaseUrl: boolean;
}): SqliteTryKind {
  if (opts.hasDatabaseUrl) return "secret";
  const t = `${opts.stack || ""}\n${opts.tree}`.toLowerCase();
  if (
    /django|sqlalchemy|sqlalchemy_database_uri/.test(t) ||
    /engine:\s*['"]django\.db\.backends/.test(t)
  ) {
    return "orm";
  }
  if (
    /['"]pg['"]|require\(\s*['"]pg['"]\)|from ['"]pg['"]/.test(t) ||
    /mysql2|prisma[^]*postgresql|postgres:\/\/|psycopg/.test(t)
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
