import { describe, expect, it } from "vitest";
import type { DigestInput } from "@depinfin/core";
import type { OutboundMessage, SendResult } from "@depinfin/transport-contract";
import {
  type DigestLogEntry,
  type DigestPorts,
  ExternalDigestRecipientError,
  runDigest,
} from "../src/digest-runner.js";

const forDate = new Date("2026-09-16T11:00:00Z");

function emptyDigest(overrides: Partial<DigestInput> = {}): DigestInput {
  return {
    forDate,
    timezone: "America/New_York",
    newProspects: [],
    replies: [],
    openDrafts: [],
    dispatch: { sent: 0, skipped: 0, blocked: 0, topSkipReasons: [] },
    automation: { sequencesEnabled: false, dailySendCap: 40, coldOutreachEnabled: false },
    ...overrides,
  };
}

function ports(overrides: Partial<DigestPorts> = {}) {
  const sent: OutboundMessage<"warm">[] = [];
  const logs: DigestLogEntry[] = [];

  const base: DigestPorts = {
    loadRecipients: async () => ["cole@depinfin.com"],
    loadInternalDomains: async () => ["depinfin.com"],
    gatherDigest: async () => emptyDigest(),
    send: async (message): Promise<SendResult> => {
      sent.push(message);
      return { providerMessageId: "m-1", threadId: null, sentAt: forDate };
    },
    writeLog: async (entry) => {
      logs.push(entry);
    },
    ...overrides,
  };

  return { ports: base, sent, logs };
}

describe("the digest never reaches a prospect", () => {
  it("refuses the whole run when a recipient is not on an internal domain", async () => {
    const { ports: p, sent } = ports({
      loadRecipients: async () => ["cole@depinfin.com", "dana@northarc.com"],
    });

    await expect(
      runDigest(p, { now: forDate, actor: "worker:digest", dryRun: false }),
    ).rejects.toThrow(ExternalDigestRecipientError);

    // Not "sent to the good ones and skipped the bad one". Nothing went out.
    expect(sent).toEqual([]);
  });

  it("logs the refusal as an error with the offending address", async () => {
    const { ports: p, logs } = ports({
      loadRecipients: async () => ["dana@northarc.com"],
    });

    await expect(
      runDigest(p, { now: forDate, actor: "worker:digest", dryRun: false }),
    ).rejects.toThrow();

    expect(logs).toHaveLength(1);
    expect(logs[0]?.action).toBe("error");
    expect(logs[0]?.detail["external"]).toEqual(["dana@northarc.com"]);
  });

  it.each([["cole"], ["cole@"], ["cole@ depinfin.com"], ["cole@depinfin.com.evil.net"]])(
    "treats %j as external",
    async (address) => {
      const { ports: p } = ports({ loadRecipients: async () => [address] });
      await expect(
        runDigest(p, { now: forDate, actor: "worker:digest", dryRun: false }),
      ).rejects.toThrow(ExternalDigestRecipientError);
    },
  );

  it("accepts an internal address regardless of case", async () => {
    const { ports: p, sent } = ports({ loadRecipients: async () => ["Cole@DePINfin.com"] });
    await runDigest(p, { now: forDate, actor: "worker:digest", dryRun: false });
    expect(sent).toHaveLength(1);
  });
});

describe("the digest does not eat the daily send cap", () => {
  it("logs as digest, not as sent", async () => {
    const { ports: p, logs } = ports();
    await runDigest(p, { now: forDate, actor: "worker:digest", dryRun: false });
    expect(logs.map((l) => l.action)).toEqual(["digest"]);
  });

  it("carries no contact or enrollment id, because it is about no one prospect", async () => {
    const { ports: p, logs } = ports();
    await runDigest(p, { now: forDate, actor: "worker:digest", dryRun: false });
    expect(logs[0]?.contactId).toBeNull();
    expect(logs[0]?.enrollmentId).toBeNull();
  });
});

describe("dry run", () => {
  it("builds and logs without sending", async () => {
    const { ports: p, sent, logs } = ports();
    const summary = await runDigest(p, {
      now: forDate,
      actor: "worker:digest",
      dryRun: true,
    });
    expect(sent).toEqual([]);
    expect(summary.sentTo).toEqual([]);
    expect(logs[0]?.detail["dryRun"]).toBe(true);
    expect(summary.subject.length).toBeGreaterThan(0);
  });
});

describe("what goes out", () => {
  it("sends one message per recipient on the warm transport", async () => {
    const { ports: p, sent } = ports({
      loadRecipients: async () => ["cole@depinfin.com", "eliot@depinfin.com"],
    });
    const summary = await runDigest(p, {
      now: forDate,
      actor: "worker:digest",
      dryRun: false,
    });
    expect(sent).toHaveLength(2);
    expect(sent.every((m) => m.transport === "warm")).toBe(true);
    expect(summary.sentTo).toEqual(["cole@depinfin.com", "eliot@depinfin.com"]);
  });

  it("leads the subject with replies waiting", async () => {
    const { ports: p, sent } = ports({
      gatherDigest: async () =>
        emptyDigest({
          replies: [
            {
              contactId: "c-1",
              name: "Dana Reyes",
              firmName: "North Arc",
              repliedAt: forDate,
              snippet: "what does the structure look like",
            },
          ],
        }),
    });
    await runDigest(p, { now: forDate, actor: "worker:digest", dryRun: false });
    expect(sent[0]?.subject).toContain("1 reply");
    expect(sent[0]?.body).toContain("Dana Reyes");
  });

  it("says so plainly when there is nothing waiting", async () => {
    const { ports: p, sent } = ports();
    await runDigest(p, { now: forDate, actor: "worker:digest", dryRun: false });
    expect(sent[0]?.subject).toContain("nothing waiting");
  });

  it("puts the counts in the log detail so the digest is auditable unopened", async () => {
    const { ports: p, logs } = ports({
      gatherDigest: async () =>
        emptyDigest({
          newProspects: [
            {
              contactId: "c-2",
              name: "Sam Okafor",
              title: "Principal",
              firmName: "Southwind",
              firmType: "crypto_fund",
              side: "buy",
              tier: 2,
              score: 31,
              personalReason: "wrote about DePIN economics",
              addedAt: forDate,
            },
          ],
        }),
    });
    await runDigest(p, { now: forDate, actor: "worker:digest", dryRun: false });
    expect(logs[0]?.detail["newProspects"]).toBe(1);
  });
});
