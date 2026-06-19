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
  // plain local Postgres. Default ON; set PGSSL=disable for local/CI Postgres.
  const sslDisabled = process.env.PGSSL === 'disable';
  const sql = postgres(DATABASE_URL, sslDisabled ? { ssl: false } : { ssl: { rejectUnauthorized: false } });

  try {
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

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
