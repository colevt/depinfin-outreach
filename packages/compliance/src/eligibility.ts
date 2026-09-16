/**
 * INV-1, INV-6, INV-7, plus the terminal-status rule from section 5.
 *
 * These checks are defense in depth. INV-1, INV-4, and INV-7 are enforced at
 * the query layer in packages/db, so no code path can reach a Tier 1,
 * suppressed, or excluded-jurisdiction prospect in the first place. Re-checking
 * here means a hand-built dispatch call cannot route around the view either.
 */

import type { EnrollmentStatus, Jurisdiction, ProspectView, Tier } from "./types.js";

/**
 * INV-7 default exclusion set. The db migration seeds excluded_jurisdictions
 * from this list and a test asserts the two stay in step.
 */
export const DEFAULT_EXCLUDED_JURISDICTIONS: readonly Jurisdiction[] = Object.freeze([
  "eu",
  "uk",
  "eea",
]);

/** INV-1. Tier 1 is human-written mail only. */
export function isAutomationEligibleTier(tier: Tier | null): boolean {
  return tier !== 1;
}

/** INV-1. `manual_only` is structurally out of automation. */
export function isAutomationEligibleStatus(status: EnrollmentStatus): boolean {
  return status !== "manual_only";
}

/** Section 5. `replied` and `stopped` are terminal for automation. */
export function isTerminalForAutomation(status: EnrollmentStatus): boolean {
  return status === "replied" || status === "stopped" || status === "completed";
}

/** Section 5. Only `active` dispatches. Paused and not_started do not. */
export function isDispatchableStatus(status: EnrollmentStatus): boolean {
  return status === "active";
}

export function isExcludedJurisdiction(
  jurisdiction: Jurisdiction,
  excluded: readonly Jurisdiction[] = DEFAULT_EXCLUDED_JURISDICTIONS,
): boolean {
  return excluded.includes(jurisdiction);
}

/** Section 6 gate 6. Due when the delay has elapsed since the previous send. */
export function isStepDue(
  lastSentAt: Date | null,
  delayDays: number,
  now: Date,
): boolean {
  if (lastSentAt === null) return true;
  const dueAt = new Date(lastSentAt.getTime() + delayDays * 24 * 60 * 60 * 1000);
  return now.getTime() >= dueAt.getTime();
}

/** Section 6 gate 7. */
export function hasStepsRemaining(currentStep: number, maxSteps: number): boolean {
  return currentStep < maxSteps;
}

export function describeProspect(prospect: ProspectView): string {
  return `${prospect.firstName}${prospect.lastName ? ` ${prospect.lastName}` : ""} at ${prospect.firmName}`;
}
