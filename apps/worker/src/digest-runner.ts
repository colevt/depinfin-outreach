/**
 * Sends the daily internal digest.
 *
 * Deliberately not part of the send pipeline. The digest is internal mail
 * about prospects, not mail to prospects, and routing it through the
 * dispatcher would mean either weakening the gates it would trip or carving
 * an exemption into them. Both are worse than a separate path.
 *
 * Three things keep it from ever reaching a prospect:
 *
 *   1. migration 0006 constrains digest_recipients to internal domains with a
 *      trigger, so the row cannot exist
 *   2. this runner re-checks every address against the internal domain list
 *      before it sends anything, and refuses the whole run on a mismatch
 *      rather than skipping the bad address
 *   3. it logs as `digest`, not `sent`, so it never counts against the daily
 *      cap on prospect mail
 *
 * The second is redundant with the first on purpose. The trigger protects the
 * table; this protects against a recipient list that arrives from anywhere
 * else, including a future caller that reads it from config.
 */

import { type DigestInput, buildDigest } from "@depinfin/core";
import type { OutboundMessage, SendResult } from "@depinfin/transport-contract";

export interface DigestLogEntry {
  readonly actor: string;
  readonly contactId: null;
  readonly enrollmentId: null;
  readonly action: "digest" | "error";
  readonly templateKey: null;
  readonly detail: Record<string, unknown>;
}

export interface DigestPorts {
  /** Active rows from digest_recipients. */
  loadRecipients(): Promise<readonly string[]>;
  /** Rows from internal_domains. The authority on what counts as internal. */
  loadInternalDomains(): Promise<readonly string[]>;
  gatherDigest(forDate: Date): Promise<DigestInput>;
  send(message: OutboundMessage<"warm">): Promise<SendResult>;
  writeLog(entry: DigestLogEntry): Promise<void>;
}

export interface DigestOptions {
  readonly now: Date;
  readonly actor: string;
  /** Runs the whole build and logs it without sending, like dispatch dry run. */
  readonly dryRun: boolean;
}

export interface DigestSummary {
  readonly sentTo: readonly string[];
  readonly subject: string;
  readonly dryRun: boolean;
  readonly counts: { newProspects: number; replies: number; openDrafts: number };
}

export class ExternalDigestRecipientError extends Error {
  constructor(readonly addresses: readonly string[]) {
    super(
      `The daily digest carries prospect data and goes to internal addresses only. ` +
        `Refusing to send: ${addresses.join(", ")}`,
    );
    this.name = "ExternalDigestRecipientError";
  }
}

export async function runDigest(
  ports: DigestPorts,
  options: DigestOptions,
): Promise<DigestSummary> {
  const [recipients, internalDomains] = await Promise.all([
    ports.loadRecipients(),
    ports.loadInternalDomains(),
  ]);

  const external = recipients.filter((address) => !isInternal(address, internalDomains));
  if (external.length > 0) {
    // Refuse the run, do not send to the good addresses and skip the rest.
    // A recipient list holding a prospect address is a broken list, and the
    // correct response is to stop and be noticed.
    const error = new ExternalDigestRecipientError(external);
    await ports.writeLog({
      actor: options.actor,
      contactId: null,
      enrollmentId: null,
      action: "error",
      templateKey: null,
      detail: { reason: error.message, external: [...external] },
    });
    throw error;
  }

  const input = await ports.gatherDigest(options.now);
  const digest = buildDigest(input);

  const sentTo: string[] = [];
  if (!options.dryRun) {
    for (const address of recipients) {
      await ports.send({
        transport: "warm",
        to: address,
        subject: digest.subject,
        body: digest.body,
      });
      sentTo.push(address);
    }
  }

  await ports.writeLog({
    actor: options.actor,
    contactId: null,
    enrollmentId: null,
    action: "digest",
    templateKey: null,
    detail: {
      dryRun: options.dryRun,
      recipients: [...recipients],
      subject: digest.subject,
      ...digest.counts,
    },
  });

  return {
    sentTo,
    subject: digest.subject,
    dryRun: options.dryRun,
    counts: digest.counts,
  };
}

/**
 * Internal means a well-formed address whose domain is on the list, matched
 * whole. Anything malformed is external by default rather than repaired:
 * trimming whitespace out of "cole@ depinfin.com" and calling the result
 * internal would be this function deciding what someone meant to type.
 */
function isInternal(address: string, internalDomains: readonly string[]): boolean {
  const candidate = address.trim().toLowerCase();
  if (candidate === "" || /\s/.test(candidate)) return false;

  const at = candidate.lastIndexOf("@");
  if (at <= 0) return false;

  const domain = candidate.slice(at + 1);
  if (domain === "") return false;

  return internalDomains.some((internal) => internal.trim().toLowerCase() === domain);
}
