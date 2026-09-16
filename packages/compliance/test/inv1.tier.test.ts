import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateSend } from "../src/pipeline.js";
import { isAutomationEligibleStatus, isAutomationEligibleTier } from "../src/eligibility.js";
import { enrollment, evaluation, prospect, refusal } from "./fixtures.js";

/** Comments discuss bypasses. Code must not contain one. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("INV-1 Tier 1 prospects are never sent automated mail", () => {
  it("refuses a Tier 1 prospect whose step is due", () => {
    const decision = evaluateSend(evaluation({ prospect: prospect({ tier: 1 }) }));
    const refused = refusal(decision);
    expect(refused.gate).toBe("tier_or_manual_only");
    expect(refused.outcome).toBe("skipped");
    expect(refused.reason).toBe("Tier 1, human-written mail only");
  });

  it("refuses a manual_only enrollment whose step is due", () => {
    const decision = evaluateSend(
      evaluation({ enrollment: enrollment({ status: "manual_only" }) }),
    );
    const refused = refusal(decision);
    expect(refused.gate).toBe("tier_or_manual_only");
    expect(refused.reason).toBe("Manual only, human-written mail only");
  });

  it("treats every other tier as eligible", () => {
    expect(isAutomationEligibleTier(1)).toBe(false);
    expect(isAutomationEligibleTier(2)).toBe(true);
    expect(isAutomationEligibleTier(3)).toBe(true);
    expect(isAutomationEligibleTier(null)).toBe(true);
    expect(isAutomationEligibleStatus("manual_only")).toBe(false);
    expect(isAutomationEligibleStatus("active")).toBe(true);
  });

  it("exposes no public parameter that includes Tier 1 or bypasses a gate", () => {
    const srcDir = new URL("../src/", import.meta.url).pathname;
    const sources = readdirSync(srcDir)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => stripComments(readFileSync(join(srcDir, f), "utf8")));

    // Identifiers that would constitute a bypass if they ever appeared as an
    // argument, option, or flag anywhere in this package.
    const forbidden = [
      /\bskip_?[Ll]int\b/,
      /\bforce\s*[?:]/,
      /\bbypass/i,
      /\ballow_?[Tt]ier_?1\b/i,
      /\binclude_?[Tt]ier_?1\b/i,
      /\bignore_?[Ss]uppression/i,
      /\boverride\s*[?:]/,
      /process\.env/,
    ];
    for (const source of sources) {
      for (const pattern of forbidden) {
        expect(source).not.toMatch(pattern);
      }
    }
  });
});
