/**
 * Section 6, gates 12 through 14, plus the orchestration around the pure
 * gates in packages/compliance.
 *
 * Gates 1 through 11 are not reimplemented here. They are one call to
 * evaluateSend. If eligibility or linting logic ever appears in this file,
 * that is a defect per section 3.
 *
 * Dry-run mode is a first-class feature: it runs the full pipeline and writes
 * to the log without dispatching. The only branch between dry run and live is
 * the dispatch call itself and the enrollment write, so a dry run exercises
 * every gate the live run does.
 */

import { evaluateSend, type SuppressionEntry, type TransportKind } from "@depinfin/compliance";
import type { DispatchCandidate } from "@depinfin/db";
import type { OutboundMessage, SendResult } from "@depinfin/transport-contract";

export interface LogEntryInput {
  readonly actor: string;
  readonly contactId: string | null;
  readonly enrollmentId: string | null;
  readonly action: "sent" | "skipped" | "blocked" | "error";
  readonly templateKey: string | null;
  readonly detail: Record<string, unknown>;
}

export interface DispatchPorts<K extends TransportKind> {
  loadCandidates(transport: K, limit: number): Promise<DispatchCandidate[]>;
  suppressionsFor(email: string): Promise<SuppressionEntry[]>;
  /** Counted from activity_log, never from memory. */
  countSentToday(now: Date): Promise<number>;
  writeLog(entry: LogEntryInput): Promise<void>;
  recordSend(input: {
    enrollmentId: string;
    threadId: string | null;
    sentAt: Date;
    nextDueAt: Date | null;
  }): Promise<void>;
  send(message: OutboundMessage<K>): Promise<SendResult>;
}

export interface DispatchOptions<K extends TransportKind> {
  readonly transport: K;
  readonly now: Date;
  readonly dailyCap: number;
  readonly dryRun: boolean;
  readonly actor: string;
  readonly limit?: number;
}

export interface DispatchOutcome {
  readonly contactId: string;
  readonly email: string;
  readonly enrollmentId: string;
  readonly action: "sent" | "skipped" | "blocked" | "error";
  /** Operator-legible. Section 9: "Personal Reason empty", not a code. */
  readonly reason: string;
}

export interface DispatchSummary {
  readonly considered: number;
  readonly sent: number;
  readonly skipped: number;
  readonly blocked: number;
  readonly errored: number;
  readonly dryRun: boolean;
  readonly outcomes: readonly DispatchOutcome[];
}

export async function runDispatch<K extends TransportKind>(
  ports: DispatchPorts<K>,
  options: DispatchOptions<K>,
): Promise<DispatchSummary> {
  const limit = options.limit ?? options.dailyCap;
  const candidates = await ports.loadCandidates(options.transport, limit);

  // Gate 12. Read once at the start, then tracked locally for this run. The
  // authoritative number always comes from the log, never from a counter that
  // survives a restart.
  let sentToday = await ports.countSentToday(options.now);

  const outcomes: DispatchOutcome[] = [];

  for (const candidate of candidates) {
    const base = {
      contactId: candidate.prospect.contactId,
      email: candidate.prospect.email,
      enrollmentId: candidate.enrollmentId,
    };

    // Gates 1 through 11. One call, no local reimplementation.
    const decision = evaluateSend({
      transportKind: options.transport,
      campaignTransport: candidate.sequenceTransport,
      prospect: candidate.prospect,
      enrollment: candidate.enrollment,
      template: candidate.template,
      suppressions: await ports.suppressionsFor(candidate.prospect.email),
      now: options.now,
    });

    if (!decision.allowed) {
      await ports.writeLog({
        actor: options.actor,
        contactId: base.contactId,
        enrollmentId: base.enrollmentId,
        action: decision.outcome,
        templateKey: candidate.template.key,
        detail: { gate: decision.gate, reason: decision.reason, ...decision.detail },
      });
      outcomes.push({ ...base, action: decision.outcome, reason: decision.reason });
      // The prospect is untouched. No enrollment write on a refusal, which is
      // what INV-2 means by "the prospect is untouched".
      continue;
    }

    // Gate 12. Daily cap.
    if (sentToday >= options.dailyCap) {
      const reason = `Daily cap reached, ${options.dailyCap} sends today`;
      await ports.writeLog({
        actor: options.actor,
        contactId: base.contactId,
        enrollmentId: base.enrollmentId,
        action: "skipped",
        templateKey: candidate.template.key,
        detail: { gate: "daily_cap", reason, dailyCap: options.dailyCap, sentToday },
      });
      outcomes.push({ ...base, action: "skipped", reason });
      continue;
    }

    if (options.dryRun) {
      const reason = "Dry run, would send";
      await ports.writeLog({
        actor: options.actor,
        contactId: base.contactId,
        enrollmentId: base.enrollmentId,
        action: "skipped",
        templateKey: candidate.template.key,
        detail: {
          gate: "dry_run",
          reason,
          subject: decision.merged.subject,
          body: decision.merged.body,
        },
      });
      outcomes.push({ ...base, action: "skipped", reason });
      continue;
    }

    // Gate 13. Dispatch, then persist.
    try {
      const message = {
        transport: options.transport,
        to: candidate.prospect.email,
        subject: decision.merged.subject,
        body: decision.merged.body,
        ...(options.transport === "warm" && candidate.replyInThread
          ? { inReplyToThreadId: candidate.threadId }
          : {}),
      } as OutboundMessage<K>;

      const result = await ports.send(message);

      await ports.recordSend({
        enrollmentId: candidate.enrollmentId,
        threadId: result.threadId,
        sentAt: result.sentAt,
        nextDueAt: nextDueAt(result.sentAt, candidate.enrollment.delayDays),
      });

      // Gate 14.
      await ports.writeLog({
        actor: options.actor,
        contactId: base.contactId,
        enrollmentId: base.enrollmentId,
        action: "sent",
        templateKey: candidate.template.key,
        detail: {
          subject: decision.merged.subject,
          stepNumber: candidate.stepNumber,
          providerMessageId: result.providerMessageId,
          threadId: result.threadId,
        },
      });

      sentToday += 1;
      outcomes.push({ ...base, action: "sent", reason: `Step ${candidate.stepNumber} sent` });
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      await ports.writeLog({
        actor: options.actor,
        contactId: base.contactId,
        enrollmentId: base.enrollmentId,
        action: "error",
        templateKey: candidate.template.key,
        detail: { reason, stepNumber: candidate.stepNumber },
      });
      outcomes.push({ ...base, action: "error", reason: `Send failed: ${reason}` });
    }
  }

  return {
    considered: candidates.length,
    sent: outcomes.filter((o) => o.action === "sent").length,
    skipped: outcomes.filter((o) => o.action === "skipped").length,
    blocked: outcomes.filter((o) => o.action === "blocked").length,
    errored: outcomes.filter((o) => o.action === "error").length,
    dryRun: options.dryRun,
    outcomes,
  };
}

function nextDueAt(sentAt: Date, delayDays: number): Date {
  return new Date(sentAt.getTime() + delayDays * 24 * 60 * 60 * 1000);
}
