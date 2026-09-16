/**
 * INV-4. Suppression is checked on every send, on every step.
 *
 * Matching is on the full address and on the bare domain. Only active entries
 * suppress; an entry is never deleted, it is marked inactive with a reason and
 * an actor, and that write happens in the db package, not here.
 */

import type { SuppressionEntry } from "./types.js";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function domainOf(email: string): string {
  const at = normalizeEmail(email).lastIndexOf("@");
  return at === -1 ? "" : normalizeEmail(email).slice(at + 1);
}

export function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^@/, "");
}

export interface SuppressionMatch {
  readonly value: string;
  readonly matchType: "email" | "domain";
}

/**
 * Returns the matching entry, or null. A domain entry suppresses every address
 * at that domain, including subdomain-free exact matches only. `sub.example.com`
 * is a different domain than `example.com` and needs its own entry.
 */
export function findSuppression(
  email: string,
  entries: readonly SuppressionEntry[],
): SuppressionMatch | null {
  const address = normalizeEmail(email);
  const domain = domainOf(address);

  for (const entry of entries) {
    if (!entry.active) continue;
    if (entry.matchType === "email" && normalizeEmail(entry.value) === address) {
      return { value: entry.value, matchType: "email" };
    }
    if (entry.matchType === "domain" && domain !== "" && normalizeDomain(entry.value) === domain) {
      return { value: entry.value, matchType: "domain" };
    }
  }
  return null;
}

export function isSuppressed(email: string, entries: readonly SuppressionEntry[]): boolean {
  return findSuppression(email, entries) !== null;
}
