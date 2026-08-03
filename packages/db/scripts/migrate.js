#!/usr/bin/env node
/**
 * Simple migration runner for Organic Posts.
 * Applies migration files in order using postgres.js (direct Postgres, not Supabase client).
 * Usage: node scripts/migrate.js [--down]
 */
const fs = require('fs');
const path = require('path');
const postgres = require('postgres');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is not set.');
  process.exit(1);
}

const isDown = process.argv.includes('--down');
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const MIGRATION_TABLE = 'schema_migrations';

async function main() {
  // SSL is required by managed Postgres (Supabase/Railway) but breaks against a
  // plain local Postgres (CI service container, docker-compose) which doesn't
  // speak TLS. Auto-disable SSL for localhost so CI/local work without anyone
  // setting PGSSL=disable; managed/remote hosts keep SSL on. PGSSL=disable is
  // still honoured as an explicit override.
  let dbHost = '';
  try { dbHost = new URL(DATABASE_URL).hostname; } catch { /* non-URL DSN — leave SSL on */ }
  const isLocalHost = dbHost === 'localhost' || dbHost === '127.0.0.1' || dbHost === '::1';
  const sslDisabled = process.env.PGSSL === 'disable' || isLocalHost;
  // max: 1 — a single session, so the advisory lock below lives on the same
  // connection as every statement, and there is no pool to leak it from.
  const baseOpts = { max: 1 };
  const sql = postgres(DATABASE_URL, sslDisabled ? { ...baseOpts, ssl: false } : { ...baseOpts, ssl: { rejectUnauthorized: false } });

  try {
    // Both api and worker run this at boot (start-api.sh / start-worker.sh),
    // and Railway deploys them in parallel on the same commit. Two concurrent
    // runners racing the same CREATE TABLE would corrupt the ledger, so the
    // second one blocks here until the first finishes; it then finds nothing
    // pending. Session-level lock: released on disconnect, even on crash.
    await sql`SELECT pg_advisory_lock(861204)`;

    // Ensure migration tracking table exists
    await sql`
      CREATE TABLE IF NOT EXISTS ${sql(MIGRATION_TABLE)} (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    const files = fs.readdirSync(MIGRATIONS_DIR).sort();

    if (isDown) {
      // Find and run the latest applied DOWN migration
      const [latest] = await sql`
        SELECT version FROM ${sql(MIGRATION_TABLE)}
        ORDER BY version DESC LIMIT 1
      `;
      if (!latest) {
        console.log('No migrations to roll back.');
        return;
      }
      const downFile = path.join(MIGRATIONS_DIR, `${latest.version}.down.sql`);
      if (!fs.existsSync(downFile)) {
        console.error(`DOWN migration not found: ${downFile}`);
        process.exit(1);
      }
      const downSql = fs.readFileSync(downFile, 'utf8');
      console.log(`Rolling back: ${latest.version}`);
      await sql.begin(async (tx) => {
        await tx.unsafe(downSql);
        await tx`DELETE FROM ${tx(MIGRATION_TABLE)} WHERE version = ${latest.version}`;
      });
      console.log(`Rolled back: ${latest.version}`);
    } else {
      // Apply all pending UP migrations
      const applied = await sql`SELECT version FROM ${sql(MIGRATION_TABLE)}`;
      const appliedSet = new Set(applied.map((r) => r.version));

      const upFiles = files.filter((f) => f.endsWith('.up.sql'));
      let count = 0;

      for (const file of upFiles) {
        const version = file.replace('.up.sql', '');
        if (appliedSet.has(version)) {
          console.log(`Skipping (already applied): ${version}`);
          continue;
        }
        const upSql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        console.log(`Applying: ${version}`);
        await sql.begin(async (tx) => {
          await tx.unsafe(upSql);
          await tx`INSERT INTO ${tx(MIGRATION_TABLE)} (version) VALUES (${version})`;
        });
        console.log(`Applied: ${version}`);
        count++;
      }

      if (count === 0) {
        console.log('No pending migrations.');
      } else {
        console.log(`\nApplied ${count} migration(s) successfully.`);
      }
    }
  } finally {
    await sql.end();
  }
}

// Exit EXPLICITLY on success. This runs as the first half of the API's start
// command (`migrate && node dist/.../index.js`), so if this process merely
// finishes its work without exiting, the API never starts and the deploy dies
// on a healthcheck timeout with no error to read. That is exactly what happened
// on the first armed deploy (2026-07-30 23:14): every migration logged
// "Skipping (already applied)", then "No pending migrations.", then seven
// minutes of silence and "Stopping Container" — no api_started line, because
// the shell was still waiting on this process.
//
// postgres.js can keep the event loop alive after `sql.end()` (TLS socket and
// internal timers), and a migration runner has nothing left to do once its
// work is committed, so forcing the exit is correct rather than papering over
// a leak.
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err.message);
    process.exit(1);
  });
