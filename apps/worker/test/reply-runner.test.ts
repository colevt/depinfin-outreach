import { describe, expect, it } from "vitest";
import { OPT_OUT_PHRASES } from "@depinfin/compliance";
import { runReplyPolling, type PollableEnrollment, type ReplyPorts, type ThreadMessage } from "../src/reply-runner.js";

const enrollment: PollableEnrollment = {
  enrollmentId: "enr-1",
  contactId: "con-1",
  email: "dana@northarc.com",
  threadId: "thread-1",
  status: "active",
};

function fakeReplyPorts(messages: ThreadMessage[] | (() => never)) {
  const state = {
    statuses: [] as { id: string; status: string }[],
    dnc: [] as string[],
    suppressions: [] as { value: string; matchType: string; reason: string }[],
    logs: [] as { action: string; detail: Record<string, unknown> }[],
  };

  const ports: ReplyPorts = {
    pollable: async () => [enrollment],
    inboundMessages: async () => (typeof messages === "function" ? messages() : messages),
    setStatus: async (id, status) => {
      state.statuses.push({ id, status });
    },
    markDoNotContact: async (contactId) => {
      state.dnc.push(contactId);
    },
    addSuppression: async (input) => {
      state.suppressions.push({
        value: input.value,
        matchType: input.matchType,
        reason: input.reason,
      });
    },
    writeLog: async (entry) => {
      state.logs.push({ action: entry.action, detail: entry.detail });
    },
  };

  return { ports, state };
}

function message(body: string, overrides: Partial<ThreadMessage> = {}): ThreadMessage {
  return {
    id: "m-1",
    from: "Dana Okafor <dana@northarc.com>",
    body,
    receivedAt: new Date("2026-03-11T09:00:00.000Z"),
    ...overrides,
  };
}

describe("reply handling, section 7", () => {
  it("moves an ordinary reply to replied and logs it", async () => {
    const { ports, state } = fakeReplyPorts([message("Thanks Cole, let us take a look.")]);
    const summary = await runReplyPolling(ports, { actor: "worker:test" });

    expect(summary.replies).toBe(1);
    expect(state.statuses).toEqual([{ id: "enr-1", status: "replied" }]);
    expect(state.logs[0]?.action).toBe("reply");
    expect(state.suppressions).toEqual([]);
    expect(state.dnc).toEqual([]);
  });

  describe("INV-4 opt-out handling", () => {
    for (const phrase of OPT_OUT_PHRASES) {
      it(`suppresses, flags, and stops on "${phrase}"`, async () => {
        const { ports, state } = fakeReplyPorts([message(`Please ${phrase}.`)]);
        const summary = await runReplyPolling(ports, { actor: "worker:test" });

        expect(summary.optOuts).toBe(1);
        expect(state.suppressions[0]).toMatchObject({
          value: "dana@northarc.com",
          matchType: "email",
        });
        expect(state.dnc).toEqual(["con-1"]);
        expect(state.statuses).toEqual([{ id: "enr-1", status: "stopped" }]);
        expect(state.logs[0]?.action).toBe("opt_out");
      });
    }

    it("acts on the latest inbound message, not the first", async () => {
      const { ports, state } = fakeReplyPorts([
        message("Interesting, tell me more.", { id: "m-1" }),
        message("Actually, please remove me.", {
          id: "m-2",
          receivedAt: new Date("2026-03-12T09:00:00.000Z"),
        }),
      ]);
      await runReplyPolling(ports, { actor: "worker:test" });
      expect(state.statuses).toEqual([{ id: "enr-1", status: "stopped" }]);
    });

    it("records the phrase and the domain in the audit detail", async () => {
      const { ports, state } = fakeReplyPorts([message("unsubscribe")]);
      await runReplyPolling(ports, { actor: "worker:test" });
      expect(state.logs[0]?.detail).toMatchObject({
        phrase: "unsubscribe",
        suppressedDomain: "northarc.com",
      });
    });
  });

  it("does nothing when the thread has no inbound messages", async () => {
    const { ports, state } = fakeReplyPorts([]);
    const summary = await runReplyPolling(ports, { actor: "worker:test" });

    expect(summary.replies).toBe(0);
    expect(summary.optOuts).toBe(0);
    expect(state.logs).toEqual([]);
    expect(state.statuses).toEqual([]);
  });

  it("handles a thrown transport error without stopping the run", async () => {
    const { ports, state } = fakeReplyPorts(() => {
      throw new Error("thread fetch failed");
    });
    const summary = await runReplyPolling(ports, { actor: "worker:test" });

    expect(summary.errors).toBe(1);
    expect(state.logs[0]?.action).toBe("error");
    expect(state.statuses).toEqual([]);
  });

  it("flags a quoted-only opt-out phrase for the operator", async () => {
    const { ports, state } = fakeReplyPorts([
      message(
        [
          "Sounds good, Thursday works.",
          "",
          "On Tue, Mar 3, 2026 at 9:02 AM Cole wrote:",
          "> Reply stop and we will take you off the list.",
        ].join("\n"),
      ),
    ]);
    await runReplyPolling(ports, { actor: "worker:test" });

    expect(state.logs[0]?.action).toBe("reply");
    expect(state.logs[0]?.detail).toMatchObject({ possibleOptOutInQuotedText: "stop" });
    expect(state.suppressions).toEqual([]);
  });

  it("does not treat our own quoted footer as an opt-out", async () => {
    const { ports, state } = fakeReplyPorts([
      message(
        [
          "Sounds good, Thursday works.",
          "",
          "On Tue, Mar 3, 2026 at 9:02 AM Cole wrote:",
          "> Reply stop and we will take you off the list.",
        ].join("\n"),
      ),
    ]);
    await runReplyPolling(ports, { actor: "worker:test" });
    expect(state.statuses).toEqual([{ id: "enr-1", status: "replied" }]);
  });
});
