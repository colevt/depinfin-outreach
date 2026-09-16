import { describe, expect, it } from "vitest";
import { MAX_SCORE, MIN_SCORE, rescore, score, tierForScore } from "../src/scoring.js";
import type { ScoringFactors } from "../src/scoring.js";

const perfect: ScoringFactors = {
  mandateFit: 5,
  ticketFit: 5,
  categoryLiteracy: 5,
  warmPath: 5,
  decisionSpeed: 5,
};
const floor: ScoringFactors = {
  mandateFit: 1,
  ticketFit: 1,
  categoryLiteracy: 1,
  warmPath: 1,
  decisionSpeed: 1,
};

describe("scoring, section 4", () => {
  it("applies the weighted rubric", () => {
    expect(score(perfect)).toBe(MAX_SCORE);
    expect(score(floor)).toBe(MIN_SCORE);
    expect(
      score({ mandateFit: 4, ticketFit: 3, categoryLiteracy: 2, warmPath: 5, decisionSpeed: 1 }),
    ).toBe(4 * 3 + 3 * 2 + 2 * 2 + 5 * 3 + 1);
  });

  it("is deterministic", () => {
    expect(score(perfect)).toBe(score(perfect));
  });

  it("bands the tiers at 40 and 28", () => {
    expect(tierForScore(55)).toBe(1);
    expect(tierForScore(40)).toBe(1);
    expect(tierForScore(39)).toBe(2);
    expect(tierForScore(28)).toBe(2);
    expect(tierForScore(27)).toBe(3);
    expect(tierForScore(11)).toBe(3);
  });
});

describe("rescoring guardrails, section 4", () => {
  it("never overwrites a manual_only enrollment status", () => {
    const result = rescore({
      factors: floor,
      currentTier: 3,
      enrollmentStatus: "manual_only",
    });
    expect(result.enrollmentStatus).toBe("manual_only");
  });

  it("holds Tier 1 when a rescore would demote without an operator action", () => {
    const result = rescore({ factors: floor, currentTier: 1, enrollmentStatus: "active" });
    expect(result.computedTier).toBe(3);
    expect(result.tier).toBe(1);
    expect(result.tierHeld).toBe(true);
    expect(result.requiresOperatorAction).toBe(true);
    expect(result.detail).toMatchObject({ tierHeldAtOne: true });
  });

  it("demotes out of Tier 1 only with an explicit, attributed operator action", () => {
    const result = rescore({
      factors: floor,
      currentTier: 1,
      enrollmentStatus: "active",
      operatorDemotion: { actor: "cole", reason: "mandate changed, confirmed on the call" },
    });
    expect(result.tier).toBe(3);
    expect(result.tierHeld).toBe(false);
    expect(result.detail).toMatchObject({
      demotedBy: "cole",
      demotionReason: "mandate changed, confirmed on the call",
    });
  });

  it("promotes into Tier 1 without ceremony", () => {
    const result = rescore({ factors: perfect, currentTier: 3, enrollmentStatus: "active" });
    expect(result.tier).toBe(1);
    expect(result.requiresOperatorAction).toBe(false);
  });

  it("carries the score and factors into the audit detail", () => {
    const result = rescore({ factors: perfect, currentTier: 2, enrollmentStatus: "active" });
    expect(result.detail).toMatchObject({ score: MAX_SCORE, previousTier: 2, factors: perfect });
  });
});
