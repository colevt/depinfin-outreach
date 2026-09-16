/**
 * Section 4, scoring. Weighted, deterministic, recomputable.
 *
 *   score = mandate_fit * 3
 *         + ticket_fit * 2
 *         + category_literacy * 2
 *         + warm_path * 3
 *         + decision_speed * 1
 *
 * Each factor is 1 to 5, so the range is 11 to 55.
 * Tier 1 is 40+, Tier 2 is 28 to 39, Tier 3 is below 28.
 */

import type { EnrollmentStatus, Tier } from "@depinfin/compliance";

export type Factor = 1 | 2 | 3 | 4 | 5;

export interface ScoringFactors {
  readonly mandateFit: Factor;
  readonly ticketFit: Factor;
  readonly categoryLiteracy: Factor;
  readonly warmPath: Factor;
  readonly decisionSpeed: Factor;
}

export const WEIGHTS = Object.freeze({
  mandateFit: 3,
  ticketFit: 2,
  categoryLiteracy: 2,
  warmPath: 3,
  decisionSpeed: 1,
});

export const MIN_SCORE = 11;
export const MAX_SCORE = 55;
export const TIER_1_FLOOR = 40;
export const TIER_2_FLOOR = 28;

export function score(factors: ScoringFactors): number {
  return (
    factors.mandateFit * WEIGHTS.mandateFit +
    factors.ticketFit * WEIGHTS.ticketFit +
    factors.categoryLiteracy * WEIGHTS.categoryLiteracy +
    factors.warmPath * WEIGHTS.warmPath +
    factors.decisionSpeed * WEIGHTS.decisionSpeed
  );
}

export function tierForScore(value: number): Tier {
  if (value >= TIER_1_FLOOR) return 1;
  if (value >= TIER_2_FLOOR) return 2;
  return 3;
}

export interface RescoreInput {
  readonly factors: ScoringFactors;
  readonly currentTier: Tier | null;
  readonly enrollmentStatus: EnrollmentStatus | null;
  /**
   * Set only when an operator has explicitly authorized moving this contact
   * out of Tier 1. Section 4 requires that action to be deliberate and logged.
   */
  readonly operatorDemotion?: { readonly actor: string; readonly reason: string };
}

export interface RescoreResult {
  readonly score: number;
  readonly computedTier: Tier;
  /** What to persist. May differ from computedTier, see below. */
  readonly tier: Tier;
  readonly enrollmentStatus: EnrollmentStatus | null;
  readonly tierHeld: boolean;
  readonly requiresOperatorAction: boolean;
  readonly detail: Record<string, unknown>;
}

/**
 * Section 4, two guardrails:
 *   - Rescoring never overwrites a `manual_only` enrollment status.
 *   - Rescoring never moves a contact out of Tier 1 without an explicit
 *     operator action logged to activity_log.
 *
 * A rescore that would demote a Tier 1 contact holds the tier and raises
 * `requiresOperatorAction`, which the operator UI surfaces as a review item.
 */
export function rescore(input: RescoreInput): RescoreResult {
  const value = score(input.factors);
  const computedTier = tierForScore(value);

  const wouldDemoteTier1 = input.currentTier === 1 && computedTier !== 1;
  const demotionAuthorized = input.operatorDemotion !== undefined;
  const tierHeld = wouldDemoteTier1 && !demotionAuthorized;

  return {
    score: value,
    computedTier,
    tier: tierHeld ? 1 : computedTier,
    // manual_only survives every rescore.
    enrollmentStatus: input.enrollmentStatus,
    tierHeld,
    requiresOperatorAction: tierHeld,
    detail: {
      score: value,
      computedTier,
      previousTier: input.currentTier,
      factors: input.factors,
      ...(tierHeld ? { tierHeldAtOne: true } : {}),
      ...(demotionAuthorized
        ? {
            demotedBy: input.operatorDemotion?.actor,
            demotionReason: input.operatorDemotion?.reason,
          }
        : {}),
    },
  };
}
