/**
 * Section 7. Reply handling.
 *
 * Poll the warm transport. For each enrollment with a thread and a non-terminal
 * status, look at inbound messages. An opt-out suppresses, sets
 * do_not_contact, and stops the sequence (INV-4). Anything else moves the
 * enrollment to `replied` and lands in the operator action queue.
 *
 * A deleted or inaccessible thread is not an error state.
 */

import { domainOf, scanOptOut } from "@depinfin/compliance";
import { transition } from "@depinfin/core";
import type { EnrollmentStatus } from "@depinfin/compliance";
import type { LogEntryInput } from "./dispatch-runner.js";

export interface ThreadMessage {
  readonly id: string;
  readonly from: string;
  readonly body: string;
  readonly receivedAt: Date;
}

export interface PollableEnrollment {
  readonly enrollmentId: string;
  readonly contactId: string;
  readonly email: string;
  readonly threadId: string;
  readonly status: EnrollmentStatus;
}

export interface ReplyPorts {
  pollable(): Promise<PollableEnrollment[]>;
  /** Returns inbound messages only. A missing thread returns an empty list. */
  inboundMessages(threadId: string): Promise<ThreadMessage[]>;
  setStatus(enrollmentId: string, status: EnrollmentStatus, repliedAt?: Date): Promise<void>;
  markDoNotContact(contactId: string): Promise<void>;
  addSuppression(input: {
    value: string;
    matchType: "email" | "domain";
    reason: string;
    actor: string;
  }): Promise<void>;
  writeLog(
    entry: Omit<LogEntryInput, "action"> & { action: "reply" | "opt_out" | "error" },
  ): Promise<void>;
}

export interface ReplySummary {
  readonly polled: number;
  readonly replies: number;
  readonly optOuts: number;
  readonly errors: number;
}

export async function runReplyPolling(
  ports: ReplyPorts,
  options: { readonly actor: string },
): Promise<ReplySummary> {
  const enrollments = await ports.pollable();
  let replies = 0;
  let optOuts = 0;
  let errors = 0;

  for (const enrollment of enrollments) {
    try {
      const inbound = await ports.inboundMessages(enrollment.threadId);
      if (inbound.length === 0) continue;

      const latest = inbound.reduce((newest, message) =>
        message.receivedAt > newest.receivedAt ? message : newest,
      );

      const scan = scanOptOut(latest.body);

      if (scan.source === "reply" && scan.phrase !== null) {
        const phrase = scan.phrase;
        // INV-4. Suppress the address, and the whole firm domain with it: a
        // "take me off" from one person at a family office is not an invitation
        // to keep mailing the desk next to them.
        await ports.addSuppression({
          value: enrollment.email,
          matchType: "email",
          reason: `Inbound opt-out: "${phrase}"`,
          actor: options.actor,
        });
        await ports.markDoNotContact(enrollment.contactId);

        const result = transition(enrollment.status, { type: "opt_out_reply", phrase });
        await ports.setStatus(enrollment.enrollmentId, result.status);
        await ports.writeLog({
          actor: options.actor,
          contactId: enrollment.contactId,
          enrollmentId: enrollment.enrollmentId,
          action: "opt_out",
          templateKey: null,
          detail: {
            phrase,
            messageId: latest.id,
            suppressedDomain: domainOf(enrollment.email),
            reason: `Opted out with "${phrase}"`,
          },
        });
        optOuts += 1;
        continue;
      }

      const result = transition(enrollment.status, { type: "inbound_reply" });
      await ports.setStatus(enrollment.enrollmentId, result.status, latest.receivedAt);
      await ports.writeLog({
        actor: options.actor,
        contactId: enrollment.contactId,
        enrollmentId: enrollment.enrollmentId,
        action: "reply",
        templateKey: null,
        detail: {
          messageId: latest.id,
          from: latest.from,
          receivedAt: latest.receivedAt.toISOString(),
          // A phrase found only in quoted history is usually our own footer
          // coming back. It is flagged for the operator rather than acted on.
          ...(scan.source === "quoted" && scan.phrase !== null
            ? { possibleOptOutInQuotedText: scan.phrase }
            : {}),
          reason:
            scan.source === "quoted"
              ? `Prospect replied, check for an opt-out: "${scan.phrase}" appears in quoted text`
              : "Prospect replied",
        },
      });
      replies += 1;
    } catch (error: unknown) {
      errors += 1;
      await ports.writeLog({
        actor: options.actor,
        contactId: enrollment.contactId,
        enrollmentId: enrollment.enrollmentId,
        action: "error",
        templateKey: null,
        detail: {
          reason: error instanceof Error ? error.message : String(error),
          threadId: enrollment.threadId,
        },
      });
    }
  }

  return { polled: enrollments.length, replies, optOuts, errors };
}
