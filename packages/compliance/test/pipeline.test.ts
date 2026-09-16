import { describe, expect, it } from "vitest";
import { evaluateSend } from "../src/pipeline.js";
import { allowed, enrollment, evaluation, prospect, refusal, template, NOW } from "./fixtures.js";

describe("send pipeline, section 6", () => {
  it("allows a clean, due, personalized send", () => {
    const decision = allowed(evaluateSend(evaluation()));
    expect(decision.merged.subject).toBe("Dana, a note on DePIN infrastructure");
    expect(decision.merged.body).toContain("your note on metered infrastructure");
    expect(decision.merged.body).not.toContain("{{");
  });

  describe("INV-9 gate 1, transport match", () => {
    it("refuses a cold campaign dispatched through a warm transport", () => {
      const refused = refusal(
        evaluateSend(evaluation({ transportKind: "warm", campaignTransport: "cold" })),
      );
      expect(refused.gate).toBe("transport_match");
      expect(refused.reason).toBe("Wrong transport for this campaign");
    });

    it("refuses a warm campaign dispatched through a cold transport", () => {
      const refused = refusal(
        evaluateSend(evaluation({ transportKind: "cold", campaignTransport: "warm" })),
      );
      expect(refused.gate).toBe("transport_match");
    });
  });

  describe("gate 6, step due", () => {
    it("refuses before the delay has elapsed", () => {
      const refused = refusal(
        evaluateSend(
          evaluation({
            enrollment: enrollment({
              currentStep: 1,
              lastSentAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
              delayDays: 3,
            }),
          }),
        ),
      );
      expect(refused.gate).toBe("step_due");
      expect(refused.reason).toBe("Not due yet, waits 3 days");
    });

    it("allows exactly at the boundary", () => {
      const decision = evaluateSend(
        evaluation({
          enrollment: enrollment({
            currentStep: 1,
            lastSentAt: new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000),
            delayDays: 3,
          }),
        }),
      );
      expect(allowed(decision)).toBeTruthy();
    });
  });

  describe("gate 7, max steps", () => {
    it("refuses once the sequence is exhausted", () => {
      const refused = refusal(
        evaluateSend(evaluation({ enrollment: enrollment({ currentStep: 5, maxSteps: 5 }) })),
      );
      expect(refused.gate).toBe("max_steps");
      expect(refused.reason).toBe("Sequence finished, no steps left");
    });
  });

  describe("section 5, terminal statuses never dispatch", () => {
    for (const status of ["replied", "stopped", "completed"] as const) {
      it(`refuses a ${status} enrollment`, () => {
        const refused = refusal(
          evaluateSend(evaluation({ enrollment: enrollment({ status }) })),
        );
        expect(refused.gate).toBe("terminal_status");
      });
    }

    it("refuses a paused enrollment", () => {
      const refused = refusal(
        evaluateSend(evaluation({ enrollment: enrollment({ status: "paused" }) })),
      );
      expect(refused.reason).toBe("Sequence is paused");
    });
  });

  describe("gate ordering matches section 6", () => {
    it("reports suppression before tier when both apply", () => {
      const refused = refusal(
        evaluateSend(
          evaluation({
            prospect: prospect({ tier: 1 }),
            suppressions: [{ value: "dana@northarc.com", matchType: "email", active: true }],
          }),
        ),
      );
      expect(refused.gate).toBe("suppression");
    });

    it("reports the personalization gap before linting", () => {
      const refused = refusal(
        evaluateSend(
          evaluation({
            prospect: prospect({ personalReason: "  " }),
            template: template({ subject: "A guaranteed note for {{first_name}}" }),
          }),
        ),
      );
      expect(refused.gate).toBe("personal_reason");
    });
  });

  describe("every refusal is operator-legible, section 9", () => {
    it("never returns a bare error code", () => {
      const cases = [
        evaluation({ prospect: prospect({ tier: 1 }) }),
        evaluation({ prospect: prospect({ personalReason: null }) }),
        evaluation({ prospect: prospect({ jurisdiction: "uk" }) }),
        evaluation({ enrollment: enrollment({ status: "replied" }) }),
        evaluation({ template: template({ subject: "A guaranteed note" }) }),
      ];
      for (const input of cases) {
        const refused = refusal(evaluateSend(input));
        expect(refused.reason).toMatch(/[a-z]{3,}/i);
        expect(refused.reason).not.toMatch(/gate \d|check \d|E\d{3}/);
        expect(refused.reason.length).toBeGreaterThan(8);
      }
    });
  });

  it("is pure, so the same input yields the same decision", () => {
    const input = evaluation({ prospect: prospect({ personalReason: null }) });
    expect(evaluateSend(input)).toEqual(evaluateSend(input));
  });
});
