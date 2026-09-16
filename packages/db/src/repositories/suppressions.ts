/**
 * INV-4. Suppressions are created and deactivated. They are never deleted.
 * The application role has no DELETE on this table and a trigger refuses one.
 */

import { and, eq, or } from "drizzle-orm";
import type { Database } from "../client.js";
import { suppressions } from "../schema.js";
import { domainOf, normalizeDomain, normalizeEmail } from "@depinfin/compliance";
import type { SuppressionEntry } from "@depinfin/compliance";

export interface AddSuppressionInput {
  readonly value: string;
  readonly matchType: "email" | "domain";
  readonly reason: string;
  readonly actor: string;
}

export async function addSuppression(db: Database, input: AddSuppressionInput): Promise<void> {
  const value =
    input.matchType === "email" ? normalizeEmail(input.value) : normalizeDomain(input.value);

  await db
    .insert(suppressions)
    .values({ value, matchType: input.matchType, reason: input.reason, actor: input.actor })
    .onConflictDoNothing();
}

/**
 * Loads the entries relevant to one address: the address itself and its bare
 * domain. The full table is never pulled into memory for a send.
 */
export async function suppressionsFor(
  db: Database,
  email: string,
): Promise<SuppressionEntry[]> {
  const address = normalizeEmail(email);
  const domain = domainOf(address);

  const rows = await db
    .select()
    .from(suppressions)
    .where(
      and(
        eq(suppressions.active, true),
        or(
          and(eq(suppressions.matchType, "email"), eq(suppressions.value, address)),
          and(eq(suppressions.matchType, "domain"), eq(suppressions.value, domain)),
        ),
      ),
    );

  return rows.map((row) => ({
    value: row.value,
    matchType: row.matchType,
    active: row.active,
  }));
}

/** Marked inactive with a reason and an actor. Never deleted. */
export async function deactivateSuppression(
  db: Database,
  id: string,
  actor: string,
  reason: string,
): Promise<void> {
  await db
    .update(suppressions)
    .set({ active: false, deactivatedBy: actor, deactivationReason: reason })
    .where(eq(suppressions.id, id));
}
