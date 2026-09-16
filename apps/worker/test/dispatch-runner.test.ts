import { describe, expect, it } from "vitest";
import { runDispatch } from "../src/dispatch-runner.js";
import { NOW, candidate, fakePorts } from "./fakes.js";

const options = {
  transport: "warm" as const,
  now: NOW,
  dailyCap: 40,
  dryRun: false,
  actor: "worker:test",
};

describe("dispatch runner, section 6 gates 12 to 14", () => {
  it("sends a clean candidate and persists the thread", async () => {
    const { ports, state } = fakePorts([candidate()]);
    const summary = await runDispatch(ports, options);

    expect(summary.sent).toBe(1);
    expect(state.sends[0]?.subject).toBe("Dana, a note on DePIN infrastructure");
    expect(state.recordedSends[0]).toEqual({ enrollmentId: "enr-1", threadId: "thread-1" });
    expect(state.logs.filter((l) => l.action === "sent")).toHaveLength(1);
  });

  describe("INV-2 a blocked send is logged and the prospect is untouched", () => {
    it("writes blocked and does not dispatch", async () => {
      const blocked = candidate({
        template: {
          key: "bad_copy",
          subject: "{{first_name}}, a guaranteed introduction",
          body: "Hi {{first_name}}, about {{personal_reason}}.",
          contentTier: "corporate",
        },
      });
      const { ports, state } = fakePorts([blocked]);
      const summary = await runDispatch(ports, options);

      expect(summary.blocked).toBe(1);
      expect(summary.sent).toBe(0);
      expect(state.sends).toEqual([]);
      expect(state.recordedSends).toEqual([]);

      const entry = state.logs[0];
      expect(entry?.action).toBe("blocked");
      expect(entry?.detail["gate"]).toBe("linter");
      expect(String(entry?.detail["reason"])).toContain("guaranteed");
    });

    it("leaves enrollment state unchanged, so the step is retried after a rewrite", async () => {
      const { ports, state } = fakePorts([
        candidate({ template: { key: "k", subject: "APY note", body: "Hi {{first_name}}", contentTier: "corporate" } }),
      ]);
      await runDispatch(ports, options);
      expect(state.recordedSends).toEqual([]);
    });
  });

  describe("INV-5 every outcome produces exactly one log row", () => {
    it("logs one row per candidate, whatever the outcome", async () => {
      const candidates = [
        candidate({ enrollmentId: "e1" }),
        candidate({
          enrollmentId: "e2",
          prospect: { ...candidate().prospect, contactId: "c2", personalReason: "  " },
        }),
        candidate({
          enrollmentId: "e3",
          prospect: { ...candidate().prospect, contactId: "c3", tier: 1 },
        }),
        candidate({
          enrollmentId: "e4",
          prospect: { ...candidate().prospect, contactId: "c4", jurisdiction: "uk" },
        }),
        candidate({
          enrollmentId: "e5",
          template: { key: "k5", subject: "A 14% note", body: "Hi {{first_name}}", contentTier: "corporate" },
          prospect: { ...candidate().prospect, contactId: "c5" },
        }),
      ];
      const { ports, state } = fakePorts(candidates);
      const summary = await runDispatch(ports, options);

      expect(state.logs).toHaveLength(candidates.length);
      expect(summary.considered).toBe(5);
      expect(summary.sent).toBe(1);
      expect(summary.skipped).toBe(3);
      expect(summary.blocked).toBe(1);

      const byEnrollment = new Map(state.logs.map((l) => [l.enrollmentId, l]));
      expect(byEnrollment.get("e1")?.action).toBe("sent");
      expect(byEnrollment.get("e2")?.action).toBe("skipped");
      expect(byEnrollment.get("e3")?.action).toBe("skipped");
      expect(byEnrollment.get("e4")?.action).toBe("skipped");
      expect(byEnrollment.get("e5")?.action).toBe("blocked");
    });

    it("logs an error row when the transport throws, without touching the enrollment", async () => {
      const { ports, state } = fakePorts([candidate()], { sendFails: true });
      const summary = await runDispatch(ports, options);

      expect(summary.errored).toBe(1);
      expect(state.logs[0]?.action).toBe("error");
      expect(state.recordedSends).toEqual([]);
    });

    it("carries a legible reason on every skip, section 9", async () => {
      const { ports, state } = fakePorts([
        candidate({ prospect: { ...candidate().prospect, personalReason: null } }),
      ]);
      await runDispatch(ports, options);
      expect(state.logs[0]?.detail["reason"]).toBe("Personal Reason empty");
    });
  });

  describe("gate 12, daily cap", () => {
    it("counts from the log, not from memory", async () => {
      const { ports, state } = fakePorts([candidate()], { sentToday: 40 });
      const summary = await runDispatch(ports, options);

      expect(summary.sent).toBe(0);
      expect(state.sends).toEqual([]);
      expect(state.logs[0]?.detail["gate"]).toBe("daily_cap");
    });

    it("stops mid-run once the cap is reached", async () => {
      const candidates = [1, 2, 3].map((n) =>
        candidate({
          enrollmentId: `e${n}`,
          prospect: { ...candidate().prospect, contactId: `c${n}`, email: `p${n}@northarc.com` },
        }),
      );
      const { ports, state } = fakePorts(candidates, { sentToday: 38 });
      const summary = await runDispatch(ports, { ...options, dailyCap: 40 });

      expect(summary.sent).toBe(2);
      expect(summary.skipped).toBe(1);
      expect(state.sends).toHaveLength(2);
    });
  });

  describe("dry-run mode is a first-class feature", () => {
    it("runs every gate and writes the log without dispatching", async () => {
      const { ports, state } = fakePorts([candidate()]);
      const summary = await runDispatch(ports, { ...options, dryRun: true });

      expect(summary.dryRun).toBe(true);
      expect(state.sends).toEqual([]);
      expect(state.recordedSends).toEqual([]);
      expect(state.logs).toHaveLength(1);
      expect(state.logs[0]?.detail["gate"]).toBe("dry_run");
      expect(state.logs[0]?.detail["subject"]).toBe("Dana, a note on DePIN infrastructure");
    });

    it("still blocks what a live run would block", async () => {
      const { ports, state } = fakePorts([
        candidate({ template: { key: "k", subject: "Risk-free intro", body: "Hi {{first_name}}", contentTier: "corporate" } }),
      ]);
      const summary = await runDispatch(ports, { ...options, dryRun: true });
      expect(summary.blocked).toBe(1);
      expect(state.logs[0]?.action).toBe("blocked");
    });
  });

  describe("INV-4 suppression is re-checked on every step", () => {
    it("blocks step 2 when a suppression arrives after step 1", async () => {
      const step2 = candidate({
        stepNumber: 2,
        enrollment: {
          status: "active",
          currentStep: 1,
          maxSteps: 5,
          lastSentAt: new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000),
          delayDays: 3,
        },
      });
      const { ports, state } = fakePorts([step2], {
        suppressions: {
          "dana@northarc.com": [{ value: "northarc.com", matchType: "domain", active: true }],
        },
      });
      const summary = await runDispatch(ports, options);

      expect(summary.skipped).toBe(1);
      expect(state.sends).toEqual([]);
      expect(state.logs[0]?.detail["reason"]).toBe("Domain suppressed: northarc.com");
    });
  });

  describe("INV-9 transport routing", () => {
    it("refuses a cold campaign that surfaces in the warm dispatcher", async () => {
      const { ports, state } = fakePorts([candidate({ sequenceTransport: "cold" })]);
      const summary = await runDispatch(ports, options);

      expect(summary.sent).toBe(0);
      expect(state.sends).toEqual([]);
      expect(state.logs[0]?.detail["gate"]).toBe("transport_match");
    });
  });
});
