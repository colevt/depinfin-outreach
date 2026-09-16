import { describe, expect, it } from "vitest";
import type { SuppressionEntry } from "@depinfin/compliance";
import {
  type CalendarItem,
  type SendPreviewInput,
  buildCalendarDays,
  evaluatePreviewRow,
  groupHeldReasons,
  localDayKey,
  splitPreview,
} from "../src/index.js";

const now = new Date("2026-09-16T14:00:00Z");

function row(overrides: Partial<SendPreviewInput> = {}): SendPreviewInput {
  return {
    enrollmentId: "e-1",
    sequenceId: "s-1",
    sequenceName: "Buy side warm intro",
    sequenceTransport: "warm",
    stepNumber: 1,
    nextDueAt: now,
    prospect: {
      contactId: "c-1",
      email: "dana@northarc.com",
      firstName: "Dana",
      lastName: "Reyes",
      title: "CIO",
      firmName: "North Arc Capital",
      personalReason: "spoke at the DePIN panel",
      doNotContact: false,
      tier: 2,
      jurisdiction: "us",
    },
    template: {
      key: "buy_crypto_native_intro",
      subject: "{{first_name}}, a question",
      body: "You {{personal_reason}}. We build tooling for contracted revenue assets.",
      contentTier: "corporate",
    },
    enrollment: {
      status: "active",
      currentStep: 0,
      maxSteps: 3,
      lastSentAt: null,
      delayDays: 0,
    },
    ...overrides,
  };
}

describe("the preview agrees with the dispatcher", () => {
  it("marks a clean row as ready, with the merged subject", () => {
    const decision = evaluatePreviewRow(row(), [], now);
    expect(decision.willDispatch).toBe(true);
    expect(decision.reason).toBe("Ready to send");
    expect(decision.subject).toBe("Dana, a question");
    expect(decision.gate).toBeNull();
  });

  it("holds a Tier 1 prospect and says why in the pipeline's own words", () => {
    const decision = evaluatePreviewRow(
      row({ prospect: { ...row().prospect, tier: 1 } }),
      [],
      now,
    );
    expect(decision.willDispatch).toBe(false);
    expect(decision.reason).toBe("Tier 1, human-written mail only");
    expect(decision.gate).toBe("tier_or_manual_only");
  });

  it.each([
    ["eu", "EU jurisdiction, warm contact only"],
    ["uk", "UK jurisdiction, warm contact only"],
    ["eea", "EEA jurisdiction, warm contact only"],
  ] as const)("holds a %s prospect", (jurisdiction, reason) => {
    const decision = evaluatePreviewRow(
      row({ prospect: { ...row().prospect, jurisdiction } }),
      [],
      now,
    );
    expect(decision.reason).toBe(reason);
  });

  it("holds a suppressed address and names the suppression", () => {
    const suppressions: SuppressionEntry[] = [
      { value: "northarc.com", matchType: "domain", active: true },
    ];
    const decision = evaluatePreviewRow(row(), suppressions, now);
    expect(decision.willDispatch).toBe(false);
    expect(decision.reason).toBe("Domain suppressed: northarc.com");
  });

  it("holds a row with no reason for contact", () => {
    const decision = evaluatePreviewRow(
      row({ prospect: { ...row().prospect, personalReason: "  " } }),
      [],
      now,
    );
    expect(decision.reason).toBe("Personal Reason empty");
  });

  it("holds a row whose merged copy trips the linter, and shows no subject", () => {
    const decision = evaluatePreviewRow(
      row({ prospect: { ...row().prospect, personalReason: "asked about guaranteed returns" } }),
      [],
      now,
    );
    expect(decision.willDispatch).toBe(false);
    expect(decision.gate).toBe("linter");
    expect(decision.subject).toBeNull();
  });

  it("never returns a subject for a row that will not dispatch", () => {
    const held = [
      evaluatePreviewRow(row({ prospect: { ...row().prospect, tier: 1 } }), [], now),
      evaluatePreviewRow(row({ prospect: { ...row().prospect, doNotContact: true } }), [], now),
    ];
    for (const decision of held) {
      expect(decision.willDispatch).toBe(false);
      expect(decision.subject).toBeNull();
    }
  });
});

describe("splitting and grouping", () => {
  const decisions = [
    evaluatePreviewRow(row(), [], now),
    evaluatePreviewRow(row({ prospect: { ...row().prospect, tier: 1 } }), [], now),
    evaluatePreviewRow(
      row({ prospect: { ...row().prospect, contactId: "c-3", tier: 1 } }),
      [],
      now,
    ),
    evaluatePreviewRow(
      row({ prospect: { ...row().prospect, personalReason: null } }),
      [],
      now,
    ),
  ];

  it("splits ready from held", () => {
    const { ready, held } = splitPreview(decisions);
    expect(ready).toHaveLength(1);
    expect(held).toHaveLength(3);
  });

  it("groups held reasons commonest first", () => {
    const grouped = groupHeldReasons(decisions);
    expect(grouped[0]).toEqual({ reason: "Tier 1, human-written mail only", count: 2 });
    expect(grouped.map((g) => g.count).reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("returns nothing to group when everything is ready", () => {
    expect(groupHeldReasons([evaluatePreviewRow(row(), [], now)])).toEqual([]);
  });
});

describe("the calendar strip is local, not UTC", () => {
  const item = (dueAt: Date, id = "e-1"): CalendarItem => ({
    enrollmentId: id,
    contactId: "c-1",
    name: "Dana Reyes",
    firmName: "North Arc Capital",
    tier: 2,
    dueAt,
    sequenceName: "Buy side warm intro",
    nextStepNumber: 1,
  });

  it("files a late New York evening under that evening, not the next day", () => {
    // 01:00 UTC on the 17th is 21:00 on the 16th in New York. A strip built in
    // UTC files this under tomorrow, and tomorrow is the word that stops
    // someone acting on it today.
    const evening = new Date("2026-09-17T01:00:00Z");
    const days = buildCalendarDays(new Date("2026-09-16T20:00:00Z"), [item(evening)], {
      timeZone: "America/New_York",
    });
    expect(days[0]?.key).toBe("2026-09-16");
    expect(days[0]?.items).toHaveLength(1);
    expect(days[1]?.items).toHaveLength(0);
  });

  it("buckets the same instant differently in a different timezone", () => {
    const at = new Date("2026-09-17T01:00:00Z");
    expect(localDayKey(at, "America/New_York")).toBe("2026-09-16");
    expect(localDayKey(at, "UTC")).toBe("2026-09-17");
  });

  it("returns the number of days asked for, consecutively", () => {
    const days = buildCalendarDays(now, [], { timeZone: "America/New_York", days: 7 });
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.key)).toEqual([
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
      "2026-09-21",
      "2026-09-22",
    ]);
  });

  it("does not skip or repeat a day across a DST change", () => {
    // 1 November 2026 is the US fall-back, when the local day is 25 hours.
    // Adding 24 hours to local midnight lands back in the same day.
    const days = buildCalendarDays(new Date("2026-10-30T16:00:00Z"), [], {
      timeZone: "America/New_York",
      days: 5,
    });
    expect(days.map((d) => d.key)).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
    ]);
    expect(new Set(days.map((d) => d.key)).size).toBe(5);
  });

  it("marks only the first day as today", () => {
    const days = buildCalendarDays(now, [], { timeZone: "America/New_York" });
    expect(days.filter((d) => d.isToday)).toHaveLength(1);
    expect(days[0]?.isToday).toBe(true);
  });

  it("puts anything already overdue on today, flagged, rather than hiding it", () => {
    const late = new Date("2026-09-10T12:00:00Z");
    const days = buildCalendarDays(now, [item(late)], { timeZone: "America/New_York" });
    expect(days[0]?.overdue).toHaveLength(1);
    expect(days[0]?.items).toHaveLength(0);
    expect(days.slice(1).every((d) => d.overdue.length === 0)).toBe(true);
  });

  it("does not call a step due now overdue", () => {
    // The regression this covers rendered every never-scheduled enrollment as
    // overdue, because the due date it was given was a UTC day boundary that
    // falls in the previous local day in New York.
    const days = buildCalendarDays(now, [item(now)], { timeZone: "America/New_York" });
    expect(days[0]?.overdue).toHaveLength(0);
    expect(days[0]?.items).toHaveLength(1);
  });

  it("carries weekday labels from the same timezone", () => {
    const days = buildCalendarDays(now, [], { timeZone: "America/New_York", days: 3 });
    expect(days.map((d) => d.weekday)).toEqual(["Wed", "Thu", "Fri"]);
    expect(days.map((d) => d.label)).toEqual(["16", "17", "18"]);
  });
});
