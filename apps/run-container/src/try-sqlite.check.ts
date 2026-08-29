import assert from "node:assert/strict";
import { classifySqliteTry, NEED_PG_FAIL, TRY_SQLITE_URL, wantsPostgres } from "./try-sqlite.ts";

assert.equal(wantsPostgres("ENGINE: django.db.backends.postgresql"), true);
assert.equal(wantsPostgres("sqlite3"), false);
assert.match(TRY_SQLITE_URL, /^sqlite:\/\//);
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
    tree: `"pg": "^8.20.0"\nconst { Pool } = require('pg')`,
    stack: "Vite + Express",
    hasDatabaseUrl: false,
  }),
  "need-pg",
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
