import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Database = ReturnType<typeof createDatabase>["db"];

/**
 * Connects as the application role. That role has no UPDATE or DELETE on
 * activity_log and no DELETE on suppressions (migration 0003), so INV-4 and
 * INV-5 hold even against a bug in this codebase.
 *
 * Migrations connect with a different URL and a different role.
 */
export function createDatabase(url: string) {
  const sql = postgres(url, { max: 10, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  return { sql, db, close: () => sql.end({ timeout: 5 }) };
}
