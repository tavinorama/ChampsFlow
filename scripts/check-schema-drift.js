#!/usr/bin/env node
/**
 * check-schema-drift — does the database actually have what the code expects?
 *
 * Why this exists
 * ---------------
 * On 2026-07-29 the worker logged "migration 20260728000001 pending; using
 * legacy insert" and carried on. Two features had shipped, deployed green, and
 * were inert in production because their columns were never created. Nothing
 * failed. Nothing alerted. The founder found it by reading a number that looked
 * wrong.
 *
 * The state at that moment:
 *
 *     repo migration files ................................ 55
 *     public.schema_migrations (our migrate.js) ........... 23   (stopped 06-25)
 *     supabase_migrations.schema_migrations (applied by MCP) 36   (up to 07-29)
 *
 * Two ledgers, neither true, no deploy step that reconciles them. So this
 * script does NOT trust either ledger. It reads the migration files, extracts
 * the tables and columns they promise to create, and asks the live database
 * whether those objects are actually there. A ledger can lie about what ran;
 * information_schema cannot lie about what exists.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/check-schema-drift.js
 *
 * Exit codes:
 *   0  every expected object exists
 *   1  objects are missing — the deployed code is running against a database
 *      that cannot store what it produces
 *   2  could not check (no DATABASE_URL, connection refused, unreadable dir)
 *
 * Exit 2 is deliberately distinct from 0: "I could not look" must never be
 * reported as "everything is fine". That conflation is the whole bug class this
 * script was written to end.
 */
const fs = require("fs");
const path = require("path");
const postgres = require("postgres");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("check-schema-drift: DATABASE_URL is not set — cannot check.");
  process.exit(2);
}

const MIGRATIONS_DIR = path.join(__dirname, "..", "packages", "db", "migrations");

/**
 * Pull the objects a migration promises out of its SQL.
 *
 * Deliberately conservative: it only recognises the plain, unambiguous forms we
 * actually write. A statement it does not understand is skipped rather than
 * guessed at, because a false "missing column" would train everyone to ignore
 * this script — and an ignored check is worse than no check.
 *
 * Skips anything inside a DROP, and skips IF EXISTS guards on drops.
 */
function expectedObjects(sqlText) {
  // Comments first: a CREATE TABLE inside an explanatory comment is not a promise.
  const sql = sqlText
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  const tables = new Set();
  const columns = new Set(); // "table.column"

  const createTable = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi;
  for (const m of sql.matchAll(createTable)) tables.add(m[1].toLowerCase());

  const addColumn =
    /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi;
  for (const m of sql.matchAll(addColumn)) {
    columns.add(`${m[1].toLowerCase()}.${m[2].toLowerCase()}`);
  }

  // Reported separately so the caller can apply them to the running union
  // across files, not just within one.
  const droppedTables = new Set();
  const dropTable = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi;
  for (const m of sql.matchAll(dropTable)) droppedTables.add(m[1].toLowerCase());

  const droppedColumns = new Set();
  const dropColumn =
    /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s+DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi;
  for (const m of sql.matchAll(dropColumn)) {
    droppedColumns.add(`${m[1].toLowerCase()}.${m[2].toLowerCase()}`);
  }

  // A file that creates and drops the same thing leaves nothing behind.
  for (const t of droppedTables) tables.delete(t);
  for (const c of droppedColumns) columns.delete(c);

  return { tables, columns, droppedTables, droppedColumns };
}

async function main() {
  let files;
  try {
    files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql") && !f.includes(".down."))
      .sort();
  } catch (err) {
    console.error(`check-schema-drift: cannot read ${MIGRATIONS_DIR}: ${err.message}`);
    process.exit(2);
  }

  if (files.length === 0) {
    console.error("check-schema-drift: no migration files found — refusing to report success.");
    process.exit(2);
  }

  // Union across every migration, applying drops in file order so a column
  // added in March and dropped in June is not reported as missing.
  const wantTables = new Set();
  const wantColumns = new Set();
  const origin = new Map(); // object -> first migration that promised it

  for (const f of files) {
    const text = fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
    const { tables, columns, droppedTables, droppedColumns } = expectedObjects(text);

    for (const t of tables) {
      if (!origin.has(t)) origin.set(t, f);
      wantTables.add(t);
    }
    for (const c of columns) {
      if (!origin.has(c)) origin.set(c, f);
      wantColumns.add(c);
    }
    // Drops in THIS file remove what earlier files promised, so a column added
    // in March and dropped in June is not reported as missing today.
    for (const t of droppedTables) wantTables.delete(t);
    for (const c of droppedColumns) wantColumns.delete(c);
  }

  const sql = postgres(DATABASE_URL, { max: 1, idle_timeout: 10, connect_timeout: 15 });

  let liveTables, liveColumns, ledgers;
  try {
    liveTables = new Set(
      (await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`)
        .map((r) => r.table_name.toLowerCase())
    );
    liveColumns = new Set(
      (await sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`)
        .map((r) => `${r.table_name.toLowerCase()}.${r.column_name.toLowerCase()}`)
    );
    // Reported for context only. The verdict never depends on these — that is
    // the point of the script.
    const ours = await sql`
      SELECT count(*)::int AS n FROM information_schema.tables
       WHERE table_schema='public' AND table_name='schema_migrations'`;
    ledgers = { hasOwnLedger: ours[0].n > 0 };
    if (ledgers.hasOwnLedger) {
      const rows = await sql`SELECT count(*)::int AS n, max(version) AS latest FROM schema_migrations`;
      ledgers.own = rows[0];
    }
  } catch (err) {
    console.error(`check-schema-drift: cannot query the database: ${err.message}`);
    await sql.end({ timeout: 5 }).catch(() => {});
    process.exit(2);
  }

  const missingTables = [...wantTables].filter((t) => !liveTables.has(t)).sort();
  // A column on a table that does not exist is already covered by the table
  // line — listing it again is noise that buries the real signal.
  const missingColumns = [...wantColumns]
    .filter((c) => {
      const [t] = c.split(".");
      return liveTables.has(t) && !liveColumns.has(c);
    })
    .sort();

  await sql.end({ timeout: 5 }).catch(() => {});

  console.log(`Migration files:      ${files.length}`);
  if (ledgers.hasOwnLedger && ledgers.own) {
    console.log(`Ledger says applied:  ${ledgers.own.n} (latest ${ledgers.own.latest})`);
  } else {
    console.log("Ledger says applied:  no schema_migrations table");
  }
  console.log(`Tables expected:      ${wantTables.size}  missing ${missingTables.length}`);
  console.log(`Columns expected:     ${wantColumns.size}  missing ${missingColumns.length}`);

  if (missingTables.length === 0 && missingColumns.length === 0) {
    console.log("\nOK — every object the migrations promise exists in this database.");
    process.exit(0);
  }

  console.error("\nSCHEMA DRIFT — the code can produce data this database cannot store.\n");
  for (const t of missingTables) {
    console.error(`  missing table   ${t}  (${origin.get(t) ?? "?"})`);
  }
  for (const c of missingColumns) {
    console.error(`  missing column  ${c}  (${origin.get(c) ?? "?"})`);
  }
  console.error(
    "\nRun the migrations against this database before trusting anything it reports.\n" +
      "A feature whose column is missing does not crash — it falls back and goes quiet."
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(`check-schema-drift: ${err.message}`);
  process.exit(2);
});
