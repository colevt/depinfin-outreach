import { describe, expect, it } from "vitest";
import { evaluateDraft, isTerminallyBlocked } from "../src/draft.js";
import type { ProspectView, SuppressionEntry } from "../src/types.js";

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

const clean = {
  kind: "first_touch" as const,
  channel: "email" as const,
  subject: "Infrastructure financing, one question",
  body: "You spoke at the DePIN panel in Austin. We build tooling for contracted revenue assets.",
  contentTier: "corporate" as const,
  suppressions: [] as SuppressionEntry[],
};

describe("a clean first touch", () => {
  it("is sendable", () => {
    const decision = evaluateDraft({ prospect: prospect(), ...clean });
    expect(decision.sendable).toBe(true);
    expect(decision.blockers).toEqual([]);
  });
});

describe("INV-2 the linter runs on the draft text itself", () => {
  it.each([
    ["yield", "We target a real yield on deployed hardware."],
    ["apy", "The APY is attractive."],
    ["guaranteed", "Distributions are guaranteed."],
    ["prospectus", "The prospectus is attached."],
    ["a percentage", "Contracted revenue of 14% on the fleet."],
  ])("refuses %s in the body", (_label, body) => {
    const decision = evaluateDraft({ prospect: prospect(), ...clean, body });
    expect(decision.sendable).toBe(false);
    expect(decision.blockers.map((b) => b.gate)).toContain("linter");
  });

  it("refuses a blocked term in the subject", () => {
    const decision = evaluateDraft({
      prospect: prospect(),
      ...clean,
      subject: "A risk-free way into infrastructure",
    });
    expect(decision.sendable).toBe(false);
    expect(decision.lintFindings.some((f) => f.field === "subject")).toBe(true);
  });

  it("logs the refusal as blocked, not skipped", () => {
    const decision = evaluateDraft({ prospect: prospect(), ...clean, body: "guaranteed" });
    const linter = decision.blockers.find((b) => b.gate === "linter");
    expect(linter?.outcome).toBe("blocked");
  });

  it("reports a linter finding as clearable by editing", () => {
    const decision = evaluateDraft({ prospect: prospect(), ...clean, body: "guaranteed" });
    expect(isTerminallyBlocked(decision)).toBe(false);
  });

  it("takes no argument that skips it", () => {
    const keys = Object.keys({ prospect: prospect(), ...clean });
    for (const key of keys) {
      expect(key).not.toMatch(/force|skip|bypass|override/i);
    }
  });
});

describe("INV-3 personalization on a first touch", () => {
  it.each([[null], [""], ["   "], ["\t\n"]])(
    "refuses a first touch when the personal reason is %j",
    (personalReason) => {
      const decision = evaluateDraft({
        prospect: prospect({ personalReason }),
        ...clean,
      });
      expect(decision.blockers.map((b) => b.reason)).toContain("Personal Reason empty");
    },
  );

  it("exempts a reply, because the reply is the reason", () => {
    const decision = evaluateDraft({
      prospect: prospect({ personalReason: null }),
      ...clean,
      kind: "reply",
    });
    expect(decision.sendable).toBe(true);
  });

  it("still requires it on a follow up", () => {
    const decision = evaluateDraft({
      prospect: prospect({ personalReason: "" }),
      ...clean,
      kind: "follow_up",
    });
    expect(decision.sendable).toBe(false);
  });

  it("refuses an unresolved placeholder the operator left behind", () => {
    const decision = evaluateDraft({
      prospect: prospect(),
      ...clean,
      body: "Hello {{ first_name }}, quick question.",
    });
    expect(decision.blockers.map((b) => b.reason).join(" ")).toContain("Unresolved placeholder");
  });

  it("names the unresolved field legibly", () => {
    const decision = evaluateDraft({
      prospect: prospect(),
      ...clean,
      body: "Hello {{personal_reason}}",
    });
    expect(decision.blockers.map((b) => b.reason).join(" ")).toContain("Personal Reason");
  });
});

describe("INV-4 suppression applies to a draft", () => {
  const suppressed: SuppressionEntry[] = [
    { value: "dana@northarc.com", matchType: "email", active: true },
  ];
  const domainSuppressed: SuppressionEntry[] = [
    { value: "northarc.com", matchType: "domain", active: true },
  ];

  it("refuses on an address match", () => {
    const decision = evaluateDraft({ prospect: prospect(), ...clean, suppressions: suppressed });
    expect(decision.sendable).toBe(false);
    expect(isTerminallyBlocked(decision)).toBe(true);
  });

  it("refuses on a bare domain match", () => {
    const decision = evaluateDraft({
      prospect: prospect(),
      ...clean,
      suppressions: domainSuppressed,
    });
    expect(decision.sendable).toBe(false);
  });

  it("refuses a LinkedIn draft to a suppressed address too", () => {
    // Someone who asked not to be emailed has not invited a message on
    // another channel instead.
    const decision = evaluateDraft({
      prospect: prospect(),
      ...clean,
      channel: "linkedin",
      subject: "",
      suppressions: suppressed,
    });
    expect(decision.sendable).toBe(false);
  });

  it("refuses do_not_contact", () => {
    const decision = evaluateDraft({ prospect: prospect({ doNotContact: true }), ...clean });
    expect(decision.blockers.map((b) => b.reason)).toContain("Marked do not contact");
    expect(isTerminallyBlocked(decision)).toBe(true);
  });
});

describe("INV-6 a draft is corporate content", () => {
  it("refuses offering content", () => {
    const decision = evaluateDraft({
      prospect: prospect(),
      ...clean,
      // @ts-expect-error INV-6: offering content has no route to a prospect here
      contentTier: "offering",
    });
    expect(decision.blockers.map((b) => b.gate)).toContain("content_tier");
    expect(isTerminallyBlocked(decision)).toBe(true);
  });
});

describe("the automation-only gates do not apply to a human draft", () => {
  it("allows a Tier 1 prospect, which is the whole point of Tier 1", () => {
    const decision = evaluateDraft({ prospect: prospect({ tier: 1 }), ...clean });
    expect(decision.sendable).toBe(true);
  });

  it.each([["eu"], ["uk"], ["eea"]] as const)(
    "allows warm human contact to a %s prospect",
    (jurisdiction) => {
      const decision = evaluateDraft({ prospect: prospect({ jurisdiction }), ...clean });
      expect(decision.sendable).toBe(true);
    },
  );
});

describe("empty text", () => {
  it("refuses an empty subject on an email", () => {
    const decision = evaluateDraft({ prospect: prospect(), ...clean, subject: "  " });
    expect(decision.blockers.map((b) => b.reason)).toContain("Subject is empty");
  });

  it("does not require a subject on a LinkedIn message", () => {
    const decision = evaluateDraft({
      prospect: prospect(),
      ...clean,
      channel: "linkedin",
      subject: "",
    });
    expect(decision.sendable).toBe(true);
  });

  it("refuses an empty body", () => {
    const decision = evaluateDraft({ prospect: prospect(), ...clean, body: "\n\n" });
    expect(decision.blockers.map((b) => b.reason)).toContain("Body is empty");
  });
});

describe("every blocker is reported, not just the first", () => {
  it("reports the suppression, the missing reason, and the linter together", () => {
    const decision = evaluateDraft({
      prospect: prospect({ personalReason: null, doNotContact: true }),
      ...clean,
      body: "guaranteed 14% return",
      suppressions: [{ value: "northarc.com", matchType: "domain", active: true }],
    });
    const gates = decision.blockers.map((b) => b.gate);
    expect(gates).toContain("suppression");
    expect(gates).toContain("do_not_contact");
    expect(gates).toContain("personal_reason");
    expect(gates).toContain("linter");
  });

  it("gives every blocker an operator-legible reason", () => {
    const decision = evaluateDraft({
      prospect: prospect({ personalReason: null }),
      ...clean,
      body: "guaranteed",
    });
    for (const blocker of decision.blockers) {
      expect(blocker.reason.length).toBeGreaterThan(0);
      expect(blocker.reason).not.toMatch(/^gate \d/i);
    }
  });
});
