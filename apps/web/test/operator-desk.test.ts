import { describe, expect, it } from "vitest";
import { evaluateSend } from "@depinfin/compliance";
import { draftLinkedInMessage, transition } from "@depinfin/core";
import { createFixtureStore, FIXTURE_NOW } from "../src/server/fixtures.js";
import { buildCalendarDays } from "../src/server/calendar.js";
import { evaluatePreviewRow, splitPreview } from "../src/server/preview.js";

describe("action queue", () => {
  it("returns only replied enrollments, newest first", async () => {
    const store = createFixtureStore();
    const queue = await store.listActionQueue();
    expect(queue.every((row) => row.enrollmentId.startsWith("enr-"))).toBe(true);
    expect(queue.map((row) => row.firstName)).toEqual(["Dana", "Marcus", "Priya"]);
    expect(queue.map((row) => row.repliedAt?.toISOString())).toEqual([
      new Date(FIXTURE_NOW.getTime() - 2 * 3600_000).toISOString(),
      new Date(FIXTURE_NOW.getTime() - 5 * 3600_000).toISOString(),
      new Date(FIXTURE_NOW.getTime() - 26 * 3600_000).toISOString(),
    ]);
  });
});

describe("today's send preview", () => {
  it("uses evaluateSend and keeps the pipeline reason verbatim", async () => {
    const store = createFixtureStore();
    const rows = await store.listSendPreviewRows(FIXTURE_NOW);
    const suppressions = await store.listActiveSuppressions();
    const decisions = rows.map((row) => evaluatePreviewRow(row, suppressions, FIXTURE_NOW));
    const { ready, held } = splitPreview(decisions);

    expect(ready.map((row) => row.name)).toEqual(["Elena Voss"]);
    expect(ready[0]?.reason).toBe("Ready to send");

    const james = held.find((row) => row.name === "James Whitaker");
    expect(james?.reason).toBe("Tier 1, human-written mail only");

    const sophie = held.find((row) => row.name === "Sophie Laurent");
    expect(sophie?.reason).toBe("EU jurisdiction, warm contact only");

    const tom = held.find((row) => row.name === "Tom Reed");
    expect(tom?.reason).toBe("Personal Reason empty");

    for (const row of rows) {
      const fromPipeline = evaluateSend({
        transportKind: row.sequenceTransport,
        campaignTransport: row.sequenceTransport,
        prospect: row.prospect,
        enrollment: row.enrollment,
        template: row.template,
        suppressions,
        now: FIXTURE_NOW,
      });
      const preview = evaluatePreviewRow(row, suppressions, FIXTURE_NOW);
      if (fromPipeline.allowed) {
        expect(preview.willDispatch).toBe(true);
      } else {
        expect(preview.reason).toBe(fromPipeline.reason);
      }
    }
  });

  it("does not hand a transport a preview row", async () => {
    const store = createFixtureStore();
    const rows = await store.listSendPreviewRows(FIXTURE_NOW);
    expect(rows.some((row) => row.prospect.tier === 1)).toBe(true);
    expect(typeof (store as { send?: unknown }).send).toBe("undefined");
  });
});

describe("calendar strip", () => {
  it("groups the next seven days and parks overdue work on today", async () => {
    const store = createFixtureStore();
    const items = await store.listCalendarWindow(FIXTURE_NOW, 7);
    const days = buildCalendarDays(FIXTURE_NOW, items, 7);
    expect(days).toHaveLength(7);
    expect(days[0]?.isToday).toBe(true);
    expect(days[0]?.items.map((item) => item.firstName).sort()).toEqual(["Elena", "James", "Tom"]);
    expect(days[1]?.items.map((item) => item.firstName)).toEqual(["Sophie"]);
  });
});

describe("operator resume from replied", () => {
  it("requires the state machine and writes an explicit operator action", async () => {
    const store = createFixtureStore();
    const enrollment = await store.getEnrollment("enr-dana");
    expect(enrollment?.status).toBe("replied");
    const result = transition("replied", { type: "operator_resume", actor: "cole" });
    expect(result.detail).toMatchObject({ explicitOperatorAction: true, actor: "cole", from: "replied" });
    await store.setEnrollmentStatus("enr-dana", result.status);
    await store.writeActivity({
      actor: "cole",
      contactId: "contact-dana",
      enrollmentId: "enr-dana",
      action: result.action,
      detail: result.detail,
    });
    expect((await store.getEnrollment("enr-dana"))?.status).toBe("active");
    const history = await store.listActivityForContact("contact-dana");
    expect(history[history.length - 1]?.detail).toMatchObject({ explicitOperatorAction: true });
    expect((await store.listActionQueue()).map((row) => row.firstName)).not.toContain("Dana");
  });
});

describe("prospect LinkedIn draft", () => {
  it("is copy-ready and has no send hook", async () => {
    const store = createFixtureStore();
    const prospect = await store.getProspect("contact-dana");
    const draft = draftLinkedInMessage({
      prospect: {
        contactId: prospect!.contactId,
        email: prospect!.email ?? "",
        firstName: prospect!.firstName,
        lastName: prospect!.lastName,
        title: prospect!.title,
        firmName: prospect!.firmName,
        personalReason: prospect!.personalReason,
        doNotContact: prospect!.doNotContact,
        tier: prospect!.tier,
        jurisdiction: prospect!.jurisdiction,
      },
      linkedinUrl: prospect!.linkedinUrl,
    });
    expect(draft.available).toBe(true);
    if (draft.available) {
      expect(draft.text).toContain("Dana, I am reaching out because");
    }
  });
});
