/**
 * Applies migrations/*.sql in order, as the owner role.
 *
 * Deliberately not drizzle-kit: the invariants that matter here are grants,
 * triggers, check constraints, and a view, none of which a schema generator
 * expresses faithfully. The SQL files are the source of truth.
 *
 * Run with MIGRATION_DATABASE_URL, never with DATABASE_URL. The application
 * role must not own these tables (INV-5).
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const MIGRATIONS_DIR = new URL("../migrations/", import.meta.url).pathname;

async function main(): Promise<void> {
  const url = process.env["MIGRATION_DATABASE_URL"];
  if (!url) {
    throw new Error("MIGRATION_DATABASE_URL is required. Do not migrate as the application role.");
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });

  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const applied = new Set(
    (await sql<{ filename: string }[]>`SELECT filename FROM schema_migrations`).map(
      (row) => row.filename,
    ),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip  ${file}`);
      continue;
    }
    const statements = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(statements);
      await tx`INSERT INTO schema_migrations (filename) VALUES (${file})`;
    });
    console.log(`apply ${file}`);
  }

  await sql.end({ timeout: 5 });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
