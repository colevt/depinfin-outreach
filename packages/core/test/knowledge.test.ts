import { describe, expect, it } from "vitest";
import { lint } from "@depinfin/compliance";
import {
  APPROVED_POSITIONING,
  BUY_SIDE_PROFILES,
  COMPANY_FACTS,
  COPY_RULES,
  CORE_THESIS,
  DO_NOT_CLAIM,
  FACTOR_GUIDE,
  FIRM_TYPES,
  OPERATOR_CATEGORIES,
  POSITIONING_POINTS,
  SELL_SIDE_PROFILES,
  WEIGHTS,
  buySideProfile,
  sellSideProfile,
} from "../src/index.js";

/**
 * The knowledge layer is where prospect-facing language is kept, so it has to
 * hold to the same rules the pipeline enforces on a send. A positioning line
 * that trips the linter would be found by an operator at the moment they tried
 * to mail it, which is the wrong moment.
 */
describe("approved copy passes its own rules", () => {
  const prospectFacing: [string, string][] = [
    ["APPROVED_POSITIONING", APPROVED_POSITIONING],
    ["CORE_THESIS", CORE_THESIS],
    ...POSITIONING_POINTS.flatMap<[string, string]>((p) => [
      [`POSITIONING_POINTS.${p.id}.claim`, p.claim],
      [`POSITIONING_POINTS.${p.id}.support`, p.support],
    ]),
    ...COMPANY_FACTS.map<[string, string]>((f, i) => [`COMPANY_FACTS[${i}]`, f]),
    ...BUY_SIDE_PROFILES.flatMap<[string, string]>((p) => [
      [`${p.firmType}.thesis`, p.thesis],
      [`${p.firmType}.leadWith`, p.leadWith],
      [`${p.firmType}.objection`, p.objection],
    ]),
    ...SELL_SIDE_PROFILES.map<[string, string]>((p) => [
      `${p.category}.qualifyingQuestion`,
      p.qualifyingQuestion,
    ]),
  ];

  it.each(prospectFacing)("%s carries no return-implying language", (_name, text) => {
    expect(lint("", text)).toEqual([]);
  });

  it.each(prospectFacing)("%s uses no em dash", (_name, text) => {
    expect(text).not.toContain("—");
  });

  it("does not leak the internal shorthand into the approved line", () => {
    // Section 13 forbids describing DePINfin as a compliance platform, and
    // "compliance and capital-formation layer" is exactly how the company
    // describes itself internally. The two must not be the same string.
    expect(APPROVED_POSITIONING.toLowerCase()).not.toContain("compliance");
    expect(APPROVED_POSITIONING.toLowerCase()).not.toContain("broker");
    expect(APPROVED_POSITIONING.toLowerCase()).not.toContain("structurer");
  });

  it("leads with software and names the SPV as issuer", () => {
    expect(APPROVED_POSITIONING.toLowerCase()).toContain("software");
    expect(APPROVED_POSITIONING.toLowerCase()).toContain("issuer of record");
    expect(APPROVED_POSITIONING.toLowerCase()).toContain("non-custodial");
  });
});

describe("the copy rules the linter claims to enforce, it enforces", () => {
  it("refuses return-implying language", () => {
    expect(lint("", "a guaranteed 14% annual return").length).toBeGreaterThan(0);
  });

  it("refuses prospectus", () => {
    expect(lint("", "the prospectus is attached").length).toBeGreaterThan(0);
  });

  it("marks exactly the enforceable rules as enforced", () => {
    const enforced = COPY_RULES.filter((r) => r.enforcedByLinter).map((r) => r.id);
    expect(enforced).toEqual(["no_return_language", "prospectus"]);
  });

  it("gives every rule an alternative to use instead", () => {
    for (const rule of COPY_RULES) {
      expect(rule.instead).not.toBeNull();
      expect(rule.rule.length).toBeGreaterThan(0);
    }
  });
});

describe("the ICP covers every type the schema allows", () => {
  it("has a buy-side profile for every firm type", () => {
    for (const firmType of FIRM_TYPES) {
      expect(buySideProfile(firmType), firmType).not.toBeNull();
    }
    expect(BUY_SIDE_PROFILES).toHaveLength(FIRM_TYPES.length);
  });

  it("has a sell-side profile for every operator category", () => {
    for (const category of OPERATOR_CATEGORIES) {
      expect(sellSideProfile(category), category).not.toBeNull();
    }
    expect(SELL_SIDE_PROFILES).toHaveLength(OPERATOR_CATEGORIES.length);
  });

  it("gives every buy-side profile something that disqualifies it", () => {
    // A profile with no disqualifier is a profile that never says no, which
    // makes the whole rubric decorative.
    for (const profile of BUY_SIDE_PROFILES) {
      expect(profile.disqualifiers.length, profile.firmType).toBeGreaterThan(0);
      expect(profile.qualifiers.length, profile.firmType).toBeGreaterThan(0);
    }
  });

  it("gives every sell-side profile a red flag", () => {
    for (const profile of SELL_SIDE_PROFILES) {
      expect(profile.redFlags.length, profile.category).toBeGreaterThan(0);
    }
  });

  it("names things that must never be claimed", () => {
    expect(DO_NOT_CLAIM.length).toBeGreaterThan(0);
  });
});

describe("the factor guide matches the scoring rubric", () => {
  it("covers all five factors with the section 4 weights", () => {
    const byFactor = Object.fromEntries(FACTOR_GUIDE.map((g) => [g.factor, g.weight]));
    expect(byFactor).toEqual(WEIGHTS);
  });

  it("gives five anchors per factor, one per point on the scale", () => {
    for (const guide of FACTOR_GUIDE) {
      expect(guide.anchors, guide.factor).toHaveLength(5);
      for (const anchor of guide.anchors) expect(anchor.length).toBeGreaterThan(0);
    }
  });
});
