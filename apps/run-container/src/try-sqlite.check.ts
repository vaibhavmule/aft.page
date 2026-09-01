import assert from "node:assert/strict";
import { classifySqliteTry, NEED_PG_FAIL, TRY_SQLITE_URL, TRY_SQLITE_RAILS_URL, trySqliteEnv, wantsPostgres } from "./try-sqlite.ts";

assert.equal(wantsPostgres("ENGINE: django.db.backends.postgresql"), true);
assert.equal(wantsPostgres("sqlite3"), false);
assert.match(TRY_SQLITE_URL, /^sqlite:\/\//);
assert.match(TRY_SQLITE_RAILS_URL, /^sqlite3:/);
assert.equal(trySqliteEnv("Rails").DATABASE_URL, TRY_SQLITE_RAILS_URL);
assert.equal(trySqliteEnv("Django").DATABASE_URL, TRY_SQLITE_URL);
assert.equal(
  classifySqliteTry({
    tree: "ENGINE: django.db.backends.postgresql\npsycopg2",
    stack: "Django",
    hasDatabaseUrl: false,
  }),
  "orm",
);
assert.equal(
  classifySqliteTry({
    tree: "from sqlalchemy import create_engine\nSQLALCHEMY_DATABASE_URI",
    stack: "Flask",
    hasDatabaseUrl: false,
  }),
  "orm",
);
assert.equal(
  classifySqliteTry({
    tree: `gem 'rails', '~> 7.1'\ngem 'sqlite3'\n`,
    stack: "Rails",
    hasDatabaseUrl: false,
  }),
  "orm",
);
assert.equal(
  classifySqliteTry({
    tree: `gem 'rails', '~> 7.1'\ngem 'pg'\n`,
    stack: "Rails",
    hasDatabaseUrl: false,
  }),
  "need-pg",
);
assert.equal(
  classifySqliteTry({
    tree: "find . lists files only",
    stack: "Rails",
    hasDatabaseUrl: false,
  }),
  "need-pg",
);
assert.equal(
  classifySqliteTry({
    tree: `"pg": "^8.20.0"\nconst { Pool } = require('pg')`,
    stack: "Vite + Express",
    hasDatabaseUrl: false,
  }),
  "need-pg",
);
assert.equal(
  classifySqliteTry({
    tree: "## mix.exs\n{:postgrex, \">= 0.0.0\"}\nuse Ecto.Repo, adapter: Ecto.Adapters.Postgres",
    stack: "Phoenix",
    hasDatabaseUrl: false,
  }),
  "need-pg",
);
assert.equal(
  classifySqliteTry({
    tree: "## mix.exs\n{:ecto_sqlite3, \"~> 0.12\"}\n{:postgrex, \">= 0.0.0\"}",
    stack: "Phoenix",
    hasDatabaseUrl: false,
  }),
  "none",
);
assert.equal(
  classifySqliteTry({
    tree: `"pg": "^8.20.0"`,
    stack: "Express",
    hasDatabaseUrl: true,
  }),
  "secret",
);
assert.equal(
  classifySqliteTry({ tree: "express\nnpm start", stack: "Express", hasDatabaseUrl: false }),
  "none",
);
assert.match(NEED_PG_FAIL, /DATABASE_URL/);
assert.match(NEED_PG_FAIL, /docs\/env\/#try-db/);
console.log("ok");
