import { createDatabase } from "@depinfin/db";

/**
 * One connection pool for the whole app.
 *
 * Connects as the application role, which has no UPDATE or DELETE on
 * activity_log and no DELETE on suppressions. INV-4 and INV-5 hold against a
 * bug in this app, not only against a well-behaved one.
 *
 * Cached on globalThis because Next recreates modules on every hot reload in
 * development, and a new pool per reload exhausts the connection limit within
 * a few minutes of editing.
 */
const globalForDb = globalThis as unknown as {
  depinfinDb?: ReturnType<typeof createDatabase>;
};

function handle() {
  if (globalForDb.depinfinDb === undefined) {
    const url = process.env["DATABASE_URL"];
    if (url === undefined || url.trim() === "") {
      throw new Error(
        "DATABASE_URL is not set. Copy .env.example to .env and fill in the application role URL.",
      );
    }
    globalForDb.depinfinDb = createDatabase(url);
  }
  return globalForDb.depinfinDb;
}

export function db() {
  return handle().db;
}
