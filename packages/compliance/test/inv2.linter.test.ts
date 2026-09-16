import { describe, expect, it } from "vitest";
import { BLOCKED_TERMS, isClean, lint } from "../src/linter.js";
import { evaluateSend } from "../src/pipeline.js";
import { evaluation, prospect, refusal, template } from "./fixtures.js";

describe("INV-2 return-implying language blocks the send", () => {
  describe("every blocked term, in isolation", () => {
    for (const term of BLOCKED_TERMS) {
      it(`refuses "${term}" in the subject`, () => {
        const findings = lint(`A note on ${term} for you`, "Clean body.");
        expect(findings.length).toBeGreaterThan(0);
        expect(findings[0]?.field).toBe("subject");
      });

      it(`refuses "${term}" in the body`, () => {
        const findings = lint("Clean subject", `Hi there.\n\nOn ${term}, briefly.\n\nCole`);
        expect(findings.length).toBeGreaterThan(0);
        expect(findings.some((f) => f.field === "body")).toBe(true);
      });
    }
  });

  describe("numeric percentage figures", () => {
    for (const figure of ["14%", "14 %", "7.5%", "0.5%", "100%", "3   %"]) {
      it(`refuses "${figure}"`, () => {
        expect(isClean("Clean subject", `Distributions ran ${figure} last quarter.`)).toBe(false);
        expect(isClean(`Up ${figure}`, "Clean body")).toBe(false);
      });
    }

    it("reports the percentage rule, not a term rule", () => {
      const findings = lint("Clean subject", "Around 14 % of the fleet.");
      expect(findings.map((f) => f.rule)).toContain("percentage");
    });
  });

  describe("case insensitivity", () => {
    for (const variant of ["APY", "apy", "Apy", "aPy"]) {
      it(`refuses "${variant}"`, () => {
        expect(isClean("Clean subject", `The ${variant} question comes up.`)).toBe(false);
      });
    }

    it("refuses mixed case multi-word terms", () => {
      expect(isClean("Clean subject", "A Principal Protected structure.")).toBe(false);
      expect(isClean("Clean subject", "An Annual   Return figure.")).toBe(false);
    });
  });

  describe("word-boundary correctness", () => {
    const mustPass: readonly [string, string][] = [
      ["royalty", "does not trip roi"],
      ["royalties on the hardware", "does not trip roi"],
      ["yielded", "does not trip yield"],
      ["shipyard", "does not trip yield"],
      ["Shipyard District", "does not trip yield"],
      ["reassured the operator", "does not trip assured"],
      ["noteworthy", "does not trip secured note"],
      ["guaranteeing nothing here", "guaranteeing is not guarantee"],
      ["Rossi", "does not trip roi"],
      ["prospect list", "does not trip prospectus"],
    ];

    for (const [text, why] of mustPass) {
      it(`"${text}" ${why}`, () => {
        expect(lint("Clean subject", `A line about ${text}.`)).toEqual([]);
      });
    }

    it("still catches the term when hyphenated or adjacent to punctuation", () => {
      expect(isClean("Clean subject", "A high-yield framing.")).toBe(false);
      expect(isClean("Clean subject", "ROI-based targeting.")).toBe(false);
      expect(isClean("Clean subject", "Is it guaranteed?")).toBe(false);
      expect(isClean("Clean subject", "(apy)")).toBe(false);
    });
  });

  describe("evasion", () => {
    it("catches a zero-width character inserted into a term", () => {
      expect(isClean("Clean subject", "The a​py question.")).toBe(false);
    });

    it("catches a unicode hyphen in risk-free", () => {
      expect(isClean("Clean subject", "A risk‑free structure.")).toBe(false);
    });

    it("catches a fullwidth percent sign", () => {
      expect(isClean("Clean subject", "Around 14％ of the fleet.")).toBe(false);
    });
  });

  describe("the linter runs on merged output, not the raw template", () => {
    it("refuses when a merge field injects a blocked term into a clean template", () => {
      const clean = template({
        subject: "{{first_name}}, a note on DePIN infrastructure",
        body: "Hi {{first_name}},\n\nI read {{personal_reason}}.\n\nCole",
      });
      expect(lint(clean.subject, clean.body)).toEqual([]);

      const decision = evaluateSend(
        evaluation({
          template: clean,
          prospect: prospect({ personalReason: "your post about real yield on DePIN hardware" }),
        }),
      );

      const refused = refusal(decision);
      expect(refused.gate).toBe("linter");
      expect(refused.outcome).toBe("blocked");
      expect(refused.reason).toContain("yield");
    });

    it("refuses when a merge field injects a percentage", () => {
      const decision = evaluateSend(
        evaluation({
          prospect: prospect({ personalReason: "your 14% note on metered infrastructure" }),
        }),
      );
      expect(refusal(decision).gate).toBe("linter");
    });
  });

  it("blocks rather than skips, so the audit row is BLOCKED", () => {
    const decision = evaluateSend(
      evaluation({ template: template({ subject: "A guaranteed introduction" }) }),
    );
    const refused = refusal(decision);
    expect(refused.outcome).toBe("blocked");
    expect(refused.gate).toBe("linter");
  });

  it("reports every finding, so a rewrite is one pass", () => {
    const findings = lint("APY and ROI", "A guaranteed 14% annual return.");
    const rules = new Set(findings.map((f) => f.rule));
    expect(rules).toContain("apy");
    expect(rules).toContain("roi");
    expect(rules).toContain("guaranteed");
    expect(rules).toContain("annual return");
    expect(rules).toContain("percentage");
  });

  it("passes house-approved copy from section 13", () => {
    expect(
      isClean(
        "Dana, a note on DePIN infrastructure",
        "Hi Dana,\n\nWe build software for cash-flow-producing infrastructure with contracted revenue, and the SPV is the issuer of record.\n\nCole",
      ),
    ).toBe(true);
  });
});
