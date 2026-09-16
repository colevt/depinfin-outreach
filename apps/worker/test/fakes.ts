import type { DispatchCandidate } from "@depinfin/db";
import type { SuppressionEntry } from "@depinfin/compliance";
import type { DispatchPorts, LogEntryInput } from "../src/dispatch-runner.js";
import type { OutboundMessage, SendResult } from "@depinfin/transport-contract";

export const NOW = new Date("2026-03-10T14:00:00.000Z");

export function candidate(overrides: Partial<DispatchCandidate> = {}): DispatchCandidate {
  return {
    enrollmentId: "enr-1",
    sequenceId: "seq-1",
    sequenceName: "Warm intros",
    sequenceTransport: "warm",
    stepNumber: 1,
    replyInThread: true,
    threadId: null,
    prospect: {
      contactId: "con-1",
      email: "dana@northarc.com",
      firstName: "Dana",
      lastName: "Okafor",
      title: "CIO",
      firmName: "North Arc Family Office",
      personalReason: "your note on metered infrastructure at the Denver roundtable",
      doNotContact: false,
      tier: 2,
      jurisdiction: "us",
    },
    template: {
      key: "corporate_intro_1",
      subject: "{{first_name}}, a note on DePIN infrastructure",
      body: "Hi {{first_name}},\n\nI read {{personal_reason}}.\n\nCole",
      contentTier: "corporate",
    },
    enrollment: {
      status: "active",
      currentStep: 0,
      maxSteps: 5,
      lastSentAt: null,
      delayDays: 3,
    },
    ...overrides,
  };
}

export interface FakeState {
  readonly logs: LogEntryInput[];
  readonly sends: OutboundMessage<"warm">[];
  readonly recordedSends: { enrollmentId: string; threadId: string | null }[];
  sentToday: number;
}

export function fakePorts(
  candidates: DispatchCandidate[],
  options: {
    suppressions?: Record<string, SuppressionEntry[]>;
    sentToday?: number;
    sendFails?: boolean;
  } = {},
): { ports: DispatchPorts<"warm">; state: FakeState } {
  const state: FakeState = {
    logs: [],
    sends: [],
    recordedSends: [],
    sentToday: options.sentToday ?? 0,
  };

  const ports: DispatchPorts<"warm"> = {
    loadCandidates: async () => candidates,
    suppressionsFor: async (email) => options.suppressions?.[email] ?? [],
    countSentToday: async () => state.sentToday,
    writeLog: async (entry) => {
      state.logs.push(entry);
    },
    recordSend: async (input) => {
      state.recordedSends.push({ enrollmentId: input.enrollmentId, threadId: input.threadId });
    },
    send: async (message): Promise<SendResult> => {
      if (options.sendFails) throw new Error("gmail rate limit");
      state.sends.push(message);
      return {
        providerMessageId: `msg-${state.sends.length}`,
        threadId: `thread-${state.sends.length}`,
        sentAt: NOW,
      };
    },
  };

  return { ports, state };
}
