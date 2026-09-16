import postgres from "postgres";

/**
 * These tests need a real Postgres. They assert grants, triggers, check
 * constraints, and the candidate view, none of which can be faked in memory.
 *
 * Set both URLs and run `pnpm db:migrate` first:
 *   TEST_MIGRATION_DATABASE_URL  owner role, used to seed fixtures
 *   TEST_DATABASE_URL            application role, used to assert refusals
 *
 * Without them the suite skips rather than passes, so a green run on a laptop
 * with no database is never mistaken for INV-4 and INV-5 being verified.
 */
export const OWNER_URL = process.env["TEST_MIGRATION_DATABASE_URL"];
export const APP_URL = process.env["TEST_DATABASE_URL"];
export const HAS_DB = Boolean(OWNER_URL && APP_URL);

export function ownerSql() {
  if (!OWNER_URL) throw new Error("TEST_MIGRATION_DATABASE_URL is not set");
  return postgres(OWNER_URL, { max: 2, onnotice: () => {} });
}

export function appSql() {
  if (!APP_URL) throw new Error("TEST_DATABASE_URL is not set");
  return postgres(APP_URL, { max: 2, onnotice: () => {} });
}

export async function expectRefused(fn: () => Promise<unknown>, matcher: RegExp): Promise<void> {
  let message = "";
  try {
    await fn();
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  if (message === "") throw new Error("expected the statement to be refused, it succeeded");
  if (!matcher.test(message)) {
    throw new Error(`refusal message did not match ${matcher}: ${message}`);
  }
}
