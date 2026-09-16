import { describe, expect, it } from "vitest";
import type { ProspectView, SuppressionEntry } from "@depinfin/compliance";
import {
  type ProspectContext,
  type TemplateRecord,
  composeDraft,
  guidanceFor,
  matchTemplates,
} from "../src/index.js";

const prospect = (overrides: Partial<ProspectView> = {}): ProspectView => ({
  contactId: "11111111-1111-4111-8111-111111111111",
  email: "dana@northarc.com",
  firstName: "Dana",
  lastName: "Reyes",
  title: "CIO",
  firmName: "North Arc Capital",
  personalReason: "spoke at the DePIN panel in Austin",
  doNotContact: false,
  tier: 2,
  jurisdiction: "us",
  ...overrides,
});

const buyContext = (overrides: Partial<ProspectContext> = {}): ProspectContext => ({
  prospect: prospect(),
  side: "buy",
  firmType: "crypto_fund",
  operatorCategory: null,
  ...overrides,
});

const template = (overrides: Partial<TemplateRecord> = {}): TemplateRecord => ({
  id: "t-1",
  key: "corporate_intro_1",
  subject: "{{ first_name }}, a question about {{ firm_name }}",
  body: "You {{ personal_reason }}. We build tooling for contracted revenue assets.",
  contentTier: "corporate",
  side: "buy",
  stage: "first_touch",
  audienceFirmTypes: [],
  audienceOperatorCategories: [],
  ...overrides,
});

const noSuppressions: SuppressionEntry[] = [];

describe("template matching", () => {
  it("ranks a template written for this firm type above a general one", () => {
    const general = template({ id: "general", key: "general" });
    const targeted = template({
      id: "targeted",
      key: "targeted",
      audienceFirmTypes: ["crypto_fund"],
    });
    const matches = matchTemplates([general, targeted], buyContext(), "first_touch");
    expect(matches.map((m) => m.template.id)).toEqual(["targeted", "general"]);
    expect(matches[0]?.why).toContain("crypto fund");
  });

  it("does not offer a template written for another firm type", () => {
    const other = template({ audienceFirmTypes: ["ria"] });
    expect(matchTemplates([other], buyContext(), "first_touch")).toEqual([]);
  });

  it("does not offer a targeted template when the firm type is unknown", () => {
    const targeted = template({ audienceFirmTypes: ["crypto_fund"] });
    const matches = matchTemplates([targeted], buyContext({ firmType: null }), "first_touch");
    expect(matches).toEqual([]);
  });

  it("does not cross the sides", () => {
    const sellSide = template({ side: "sell" });
    expect(matchTemplates([sellSide], buyContext(), "first_touch")).toEqual([]);
  });

  it("does not cross the stages", () => {
    const reply = template({ stage: "reply" });
    expect(matchTemplates([reply], buyContext(), "first_touch")).toEqual([]);
  });

  it("matches sell-side templates on operator category", () => {
    const sellContext: ProspectContext = {
      prospect: prospect(),
      side: "sell",
      firmType: null,
      operatorCategory: "telecom",
    };
    const targeted = template({
      side: "sell",
      audienceFirmTypes: [],
      audienceOperatorCategories: ["telecom"],
    });
    const wrong = template({
      id: "wrong",
      side: "sell",
      audienceOperatorCategories: ["energy"],
    });
    const matches = matchTemplates([targeted, wrong], sellContext, "first_touch");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.why).toContain("telecom");
  });

  it("does not treat a template targeting the other side's dimension as general", () => {
    // A buy-side prospect must not be offered a template whose only targeting
    // is a list of operator categories.
    const odd = template({ side: "buy", audienceOperatorCategories: ["telecom"] });
    expect(matchTemplates([odd], buyContext(), "first_touch")).toEqual([]);
  });

  it("skips anything that is not corporate content", () => {
    // @ts-expect-error INV-6: the type forbids it, this is the runtime backstop
    const offering = template({ contentTier: "offering" });
    expect(matchTemplates([offering], buyContext(), "first_touch")).toEqual([]);
  });
});

describe("composing from a template", () => {
  it("merges the prospect fields", () => {
    const composed = composeDraft({
      context: buyContext(),
      kind: "first_touch",
      channel: "email",
      template: template(),
      suppressions: noSuppressions,
    });
    expect(composed.subject).toBe("Dana, a question about North Arc Capital");
    expect(composed.body).toContain("spoke at the DePIN panel in Austin");
    expect(composed.decision.sendable).toBe(true);
  });

  it("refuses when a merge field is empty, rather than mailing a gap", () => {
    const composed = composeDraft({
      context: buyContext({ prospect: prospect({ personalReason: "  " }) }),
      kind: "first_touch",
      channel: "email",
      template: template(),
      suppressions: noSuppressions,
    });
    expect(composed.decision.sendable).toBe(false);
    const reasons = composed.decision.blockers.map((b) => b.reason).join(" ");
    expect(reasons).toContain("Personal Reason");
  });

  it("lints the merged output, not the template", () => {
    // The template is clean. The blocked term arrives through a merge field,
    // which is exactly the case INV-2 calls out.
    const composed = composeDraft({
      context: buyContext({
        prospect: prospect({ personalReason: "asked about our guaranteed distributions" }),
      }),
      kind: "first_touch",
      channel: "email",
      template: template(),
      suppressions: noSuppressions,
    });
    expect(composed.decision.sendable).toBe(false);
    expect(composed.decision.lintFindings.map((f) => f.rule)).toContain("guaranteed");
  });

  it("applies operator edits over the merged text", () => {
    const composed = composeDraft({
      context: buyContext(),
      kind: "first_touch",
      channel: "email",
      template: template(),
      overrides: { subject: "Rewritten subject", body: "Rewritten body, one specific question." },
      suppressions: noSuppressions,
    });
    expect(composed.subject).toBe("Rewritten subject");
    expect(composed.body).toBe("Rewritten body, one specific question.");
  });

  it("lints operator edits too", () => {
    const composed = composeDraft({
      context: buyContext(),
      kind: "first_touch",
      channel: "email",
      template: template(),
      overrides: { body: "We are targeting 12% annually." },
      suppressions: noSuppressions,
    });
    expect(composed.decision.sendable).toBe(false);
  });

  it("composes from scratch with no template", () => {
    const composed = composeDraft({
      context: buyContext(),
      kind: "reply",
      channel: "email",
      overrides: { subject: "Re: your question", body: "The SPV is the issuer of record." },
      suppressions: noSuppressions,
    });
    expect(composed.templateId).toBeNull();
    expect(composed.decision.sendable).toBe(true);
  });

  it("drops the subject on a LinkedIn draft", () => {
    const composed = composeDraft({
      context: buyContext(),
      kind: "first_touch",
      channel: "linkedin",
      template: template(),
      suppressions: noSuppressions,
    });
    expect(composed.subject).toBe("");
    expect(composed.decision.sendable).toBe(true);
  });

  it("is always corporate content", () => {
    const composed = composeDraft({
      context: buyContext(),
      kind: "first_touch",
      channel: "email",
      template: template(),
      suppressions: noSuppressions,
    });
    expect(composed.contentTier).toBe("corporate");
  });
});

describe("guidance beside the editor", () => {
  it("tells an operator that a Tier 1 draft is the whole of the outreach", () => {
    const guidance = guidanceFor(
      buyContext({ prospect: prospect({ tier: 1 }) }),
      "first_touch",
      "email",
    );
    expect(guidance.notes.join(" ")).toContain("Tier 1");
  });

  it("says to find a reason before writing when there is none", () => {
    const guidance = guidanceFor(
      buyContext({ prospect: prospect({ personalReason: null }) }),
      "first_touch",
      "email",
    );
    expect(guidance.notes.join(" ")).toContain("Find one before writing");
  });

  it("surfaces the reason when there is one", () => {
    const guidance = guidanceFor(buyContext(), "first_touch", "email");
    expect(guidance.notes.join(" ")).toContain("DePIN panel in Austin");
  });

  it("explains why an EU prospect is here rather than in a sequence", () => {
    const guidance = guidanceFor(
      buyContext({ prospect: prospect({ jurisdiction: "eu" }) }),
      "first_touch",
      "email",
    );
    expect(guidance.notes.join(" ")).toContain("only route");
  });

  it("carries the firm-type angle, lead, and objection", () => {
    const guidance = guidanceFor(buyContext({ firmType: "infra_fund" }), "first_touch", "email");
    expect(guidance.angle).toContain("underwrite physical infrastructure");
    expect(guidance.leadWith).not.toBeNull();
    expect(guidance.objection).not.toBeNull();
  });

  it("carries the qualifying question for a sell-side prospect", () => {
    const guidance = guidanceFor(
      { prospect: prospect(), side: "sell", firmType: null, operatorCategory: "compute" },
      "first_touch",
      "email",
    );
    expect(guidance.notes.join(" ")).toContain("under contract versus sold spot");
  });

  it("reminds the operator that a LinkedIn message is theirs to send", () => {
    const guidance = guidanceFor(buyContext(), "first_touch", "linkedin");
    expect(guidance.notes.join(" ")).toContain("your own account");
  });

  it("always carries the copy rules and the do-not-claim list", () => {
    const guidance = guidanceFor(buyContext(), "reply", "email");
    expect(guidance.copyRules.length).toBeGreaterThan(0);
    expect(guidance.doNotClaim.length).toBeGreaterThan(0);
    expect(guidance.positioning.length).toBeGreaterThan(0);
  });
});
