import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXCLUDED_JURISDICTIONS,
  isExcludedJurisdiction,
} from "../src/eligibility.js";
import { evaluateSend } from "../src/pipeline.js";
import { allowed, evaluation, prospect, refusal, template } from "./fixtures.js";
import type { Jurisdiction, TemplateView } from "../src/types.js";

describe("INV-6 corporate and offering content are separated", () => {
  it("refuses a template that is not corporate content", () => {
    // Cast is required precisely because the type system forbids constructing
    // this value. A Tier 2 row cannot reach here through the schema either:
    // templates.content_tier carries a check constraint, and offering_documents
    // has no foreign key to sequence_steps.
    const offering = template({ contentTier: "offering" as unknown as "corporate" }) as TemplateView;
    const refused = refusal(evaluateSend(evaluation({ template: offering })));
    expect(refused.gate).toBe("content_tier");
  });

  it("types TemplateView so only corporate content compiles", () => {
    const corporate: TemplateView["contentTier"] = "corporate";
    expect(corporate).toBe("corporate");
    // @ts-expect-error offering content cannot be assigned to a sequence template
    const offering: TemplateView["contentTier"] = "offering";
    expect(offering).toBe("offering");
  });
});

describe("INV-7 excluded jurisdictions are skipped", () => {
  const excluded: readonly Jurisdiction[] = ["eu", "uk", "eea"];

  for (const jurisdiction of excluded) {
    it(`refuses a ${jurisdiction.toUpperCase()} prospect`, () => {
      const refused = refusal(evaluateSend(evaluation({ prospect: prospect({ jurisdiction }) })));
      expect(refused.gate).toBe("jurisdiction");
      expect(refused.reason).toContain("warm contact only");
    });
  }

  for (const jurisdiction of ["us", "non_us"] as const) {
    it(`allows a ${jurisdiction} prospect through the jurisdiction gate`, () => {
      expect(allowed(evaluateSend(evaluation({ prospect: prospect({ jurisdiction }) })))).toBeTruthy();
    });
  }

  it("uses EU, UK, EEA as the default exclusion set", () => {
    expect([...DEFAULT_EXCLUDED_JURISDICTIONS].sort()).toEqual(["eea", "eu", "uk"]);
  });

  it("honors a configured exclusion set", () => {
    expect(isExcludedJurisdiction("non_us", ["non_us"])).toBe(true);
    expect(isExcludedJurisdiction("eu", ["non_us"])).toBe(false);
  });
});
