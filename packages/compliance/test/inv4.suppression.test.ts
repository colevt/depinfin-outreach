import { describe, expect, it } from "vitest";
import { detectOptOut, OPT_OUT_PHRASES } from "../src/optout.js";
import { findSuppression, isSuppressed } from "../src/suppression.js";
import { evaluateSend } from "../src/pipeline.js";
import { allowed, enrollment, evaluation, prospect, refusal, NOW } from "./fixtures.js";

const emailEntry = { value: "dana@northarc.com", matchType: "email" as const, active: true };
const domainEntry = { value: "northarc.com", matchType: "domain" as const, active: true };

describe("INV-4 suppression is checked on every send, on every step", () => {
  it("suppresses on an exact email match", () => {
    const decision = evaluateSend(evaluation({ suppressions: [emailEntry] }));
    const refused = refusal(decision);
    expect(refused.gate).toBe("suppression");
    expect(refused.reason).toBe("Address suppressed: dana@northarc.com");
  });

  it("matches the address case-insensitively", () => {
    expect(isSuppressed("DANA@NorthArc.com", [emailEntry])).toBe(true);
  });

  it("suppresses every address at a suppressed bare domain", () => {
    expect(isSuppressed("dana@northarc.com", [domainEntry])).toBe(true);
    expect(isSuppressed("priya@northarc.com", [domainEntry])).toBe(true);
    expect(isSuppressed("anyone@northarc.com", [domainEntry])).toBe(true);
    expect(isSuppressed("dana@othershop.com", [domainEntry])).toBe(false);
  });

  it("tolerates a domain entry stored with a leading @", () => {
    expect(isSuppressed("dana@northarc.com", [{ ...domainEntry, value: "@northarc.com" }])).toBe(true);
  });

  it("ignores inactive entries", () => {
    expect(isSuppressed("dana@northarc.com", [{ ...emailEntry, active: false }])).toBe(false);
  });

  it("reports which rule matched", () => {
    expect(findSuppression("dana@northarc.com", [domainEntry])).toEqual({
      value: "northarc.com",
      matchType: "domain",
    });
  });

  it("blocks step 2 when the suppression is added between step 1 and step 2", () => {
    const midSequence = enrollment({
      currentStep: 1,
      lastSentAt: new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000),
      delayDays: 3,
    });

    // Step 2 is due and would otherwise send.
    expect(allowed(evaluateSend(evaluation({ enrollment: midSequence })))).toBeTruthy();

    // The entry arrives after step 1. Step 2 must refuse.
    const decision = evaluateSend(
      evaluation({ enrollment: midSequence, suppressions: [emailEntry] }),
    );
    expect(refusal(decision).gate).toBe("suppression");
  });

  it("refuses when do_not_contact is set even with no suppression row", () => {
    const decision = evaluateSend(evaluation({ prospect: prospect({ doNotContact: true }) }));
    const refused = refusal(decision);
    expect(refused.gate).toBe("do_not_contact");
    expect(refused.reason).toBe("Marked do not contact");
  });
});

describe("INV-4 inbound opt-out detection", () => {
  for (const phrase of OPT_OUT_PHRASES) {
    it(`detects "${phrase}"`, () => {
      expect(detectOptOut(`Please ${phrase}, thanks.`)).toBe(phrase);
    });

    it(`detects "${phrase}" regardless of case`, () => {
      expect(detectOptOut(phrase.toUpperCase())).toBe(phrase);
    });
  }

  it("returns null on an ordinary reply", () => {
    expect(detectOptOut("Thanks Cole, let us take a look and revert next week.")).toBeNull();
  });

  it("does not trip on a word that merely contains a phrase", () => {
    expect(detectOptOut("We use a stopgap vendor today.")).toBeNull();
    expect(detectOptOut("Our stoplight review is Thursday.")).toBeNull();
  });

  it("scans the whole body, quoted history included", () => {
    const reply = [
      "Happy to talk Thursday.",
      "",
      "On Tue, Mar 3, 2026 at 9:02 AM Cole wrote:",
      "> If you would rather not hear from us, reply stop and we will remove you.",
    ].join("\n");
    // INV-4 reads on the reply, not on the part of it we judge the prospect to
    // have typed. A missed opt-out is the worse failure. The cost is that an
    // unsubscribe footer of ours, quoted back, reads as an opt-out, so
    // outbound copy must not carry one.
    expect(detectOptOut(reply)).toBe("stop");
  });

  it("acts on a phrase the prospect typed", () => {
    expect(detectOptOut("Please take me off, thanks.")).toBe("take me off");
  });
});
