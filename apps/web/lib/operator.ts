import { cookies } from "next/headers";

/**
 * Who is at the desk.
 *
 * This is not authentication and does not pretend to be. Section 10 rules out
 * multi-tenancy, SSO, and role hierarchies for three trusted users on an
 * internal system. What it is for is attribution: every row in activity_log
 * carries an actor, and "web" tells a future reader nothing about who made a
 * decision.
 *
 * If this ever faces anyone outside the three, it needs real authentication
 * first, and that is a different piece of work rather than a bigger cookie.
 */
const COOKIE = "depinfin_operator";

export const OPERATORS: readonly string[] = (
  process.env["OPERATORS"] ?? "cole,eliot,steve"
)
  .split(",")
  .map((name) => name.trim())
  .filter((name) => name.length > 0);

export async function currentOperator(): Promise<string> {
  const store = await cookies();
  const value = store.get(COOKIE)?.value;
  if (value !== undefined && OPERATORS.includes(value)) return value;
  return OPERATORS[0] ?? "operator";
}

/** The actor string written to activity_log. */
export async function actor(): Promise<string> {
  return `desk:${await currentOperator()}`;
}

export async function setOperator(name: string): Promise<void> {
  if (!OPERATORS.includes(name)) return;
  const store = await cookies();
  store.set(COOKIE, name, { httpOnly: true, sameSite: "lax", path: "/" });
}
