import { describe, expect, it } from "vitest";
import { IllegalTransitionError, canTransition, isTerminal, transition } from "../src/state-machine.js";
import type { EnrollmentStatus } from "@depinfin/compliance";

describe("sequence state machine, section 5", () => {
  it("enrolls from not_started to active", () => {
    const result = transition("not_started", { type: "enroll" });
    expect(result.status).toBe("active");
    expect(result.action).toBe("enrolled");
  });

  it("stays active on send", () => {
    expect(transition("active", { type: "send" }).status).toBe("active");
  });

  it("completes at max steps", () => {
    expect(transition("active", { type: "max_steps_reached" }).status).toBe("completed");
  });

  it("moves to replied on an inbound reply", () => {
    const result = transition("active", { type: "inbound_reply" });
    expect(result.status).toBe("replied");
    expect(result.action).toBe("reply");
  });

  it("moves to stopped and logs opt_out on an opt-out reply", () => {
    const result = transition("active", { type: "opt_out_reply", phrase: "unsubscribe" });
    expect(result.status).toBe("stopped");
    expect(result.action).toBe("opt_out");
    expect(result.detail).toMatchObject({ phrase: "unsubscribe" });
  });

  it("pauses and resumes at operator request", () => {
    expect(transition("active", { type: "operator_pause", actor: "cole" }).status).toBe("paused");
    expect(transition("paused", { type: "operator_resume", actor: "cole" }).status).toBe("active");
  });

  it("stops from any status at operator request", () => {
    for (const from of ["not_started", "active", "paused", "replied"] as const) {
      expect(transition(from, { type: "operator_stop", actor: "cole", reason: "bad fit" }).status).toBe(
        "stopped",
      );
    }
  });

  describe("replied and stopped never dispatch", () => {
    for (const from of ["replied", "stopped", "completed"] as const) {
      it(`refuses a send from ${from}`, () => {
        expect(() => transition(from, { type: "send" })).toThrow(IllegalTransitionError);
        expect(canTransition(from, { type: "send" })).toBe(false);
      });
    }

    it("marks replied, stopped, and completed terminal for automation", () => {
      expect(isTerminal("replied")).toBe(true);
      expect(isTerminal("stopped")).toBe(true);
      expect(isTerminal("completed")).toBe(true);
      expect(isTerminal("active")).toBe(false);
      expect(isTerminal("paused")).toBe(false);
    });
  });

  describe("resuming from replied", () => {
    it("requires an explicit operator action and writes a log row", () => {
      const result = transition("replied", { type: "operator_resume", actor: "cole" });
      expect(result.status).toBe("active");
      expect(result.action).toBe("stage_change");
      expect(result.detail).toMatchObject({ explicitOperatorAction: true, actor: "cole", from: "replied" });
    });

    it("has no automated path back to active", () => {
      const automatedEvents = [
        { type: "send" },
        { type: "enroll" },
        { type: "max_steps_reached" },
      ] as const;
      for (const event of automatedEvents) {
        expect(canTransition("replied", event)).toBe(false);
      }
    });
  });

  it("refuses to resume a stopped sequence", () => {
    expect(canTransition("stopped", { type: "operator_resume", actor: "cole" })).toBe(false);
  });

  it("lets an opt-out land even after the sequence stopped for another reason", () => {
    expect(transition("paused", { type: "opt_out_reply", phrase: "stop" }).status).toBe("stopped");
  });

  it("gives a legible message on an illegal transition", () => {
    const from: EnrollmentStatus = "stopped";
    expect(() => transition(from, { type: "send" })).toThrow("Cannot send from stopped");
  });
});
