/**
 * INV-9. Sending paths are separate, and misrouting is a type error.
 *
 * Warm and cold are not two configurations of one sender. They are two types.
 * A message built for a cold campaign cannot be passed to the Gmail adapter,
 * and the compiler is what says so, not a runtime check that someone can
 * later decide to skip.
 *
 * Why this matters more than it looks: cold volume on the primary domain
 * destroys deliverability for all company mail, including live investor
 * correspondence, and in practice that is not recoverable.
 */

import type { TransportKind } from "@depinfin/compliance";

export type { TransportKind };

/**
 * The phantom `transport` field is what makes the types incompatible. Two
 * otherwise identical message shapes with different literal types cannot be
 * substituted for one another.
 */
export interface OutboundMessage<K extends TransportKind> {
  readonly transport: K;
  readonly to: string;
  readonly subject: string;
  readonly body: string;
  /** Warm replies thread. Cold sends never do, they have no thread to join. */
  readonly inReplyToThreadId?: K extends "warm" ? string | null : never;
}

export interface SendResult {
  readonly providerMessageId: string;
  readonly threadId: string | null;
  readonly sentAt: Date;
}

export interface Transport<K extends TransportKind> {
  readonly kind: K;
  /** The domain this transport sends from. Asserted against PRIMARY_DOMAIN. */
  readonly sendingDomain: string;
  send(message: OutboundMessage<K>): Promise<SendResult>;
}

export type WarmTransport = Transport<"warm">;
export type ColdTransport = Transport<"cold">;

/** A sequence, from the transport layer's point of view. */
export interface Campaign<K extends TransportKind> {
  readonly id: string;
  readonly name: string;
  readonly transport: K;
}

/**
 * The single dispatch entry point. `K` is fixed by the transport and the other
 * two arguments must match it, so a cold campaign with a warm transport does
 * not compile:
 *
 *   dispatch(gmail, coldCampaign, message)
 *   //              ^ Type '"cold"' is not assignable to type '"warm"'
 *
 * The `NoInfer` wrappers are load-bearing. Without them `K` infers from all
 * three arguments at once, TypeScript widens it to `"warm" | "cold"`, method
 * parameter bivariance lets the mismatched pair through, and the misroute this
 * whole module exists to prevent compiles cleanly.
 */
export async function dispatch<K extends TransportKind>(
  transport: Transport<K>,
  campaign: Campaign<NoInfer<K>>,
  message: OutboundMessage<NoInfer<K>>,
): Promise<SendResult> {
  // Belt and braces for a caller reaching this through an `any`.
  if (transport.kind !== campaign.transport || message.transport !== campaign.transport) {
    throw new TransportMismatchError(campaign.transport, transport.kind);
  }
  return transport.send(message);
}

export class TransportMismatchError extends Error {
  constructor(
    readonly campaignTransport: TransportKind,
    readonly transportKind: TransportKind,
  ) {
    super(
      `INV-9: a ${campaignTransport} campaign cannot dispatch through the ${transportKind} transport`,
    );
    this.name = "TransportMismatchError";
  }
}

export class PrimaryDomainError extends Error {
  constructor(domain: string) {
    super(
      `INV-9: cold sending infrastructure cannot use the primary domain ${domain}. ` +
        "Configure a separate sending domain.",
    );
    this.name = "PrimaryDomainError";
  }
}

/**
 * INV-9. Cold traffic never leaves the primary domain, and a subdomain of it
 * is still the primary domain's reputation.
 */
export function assertNotPrimaryDomain(sendingDomain: string, primaryDomain: string): void {
  const sending = sendingDomain.trim().toLowerCase().replace(/\.$/, "");
  const primary = primaryDomain.trim().toLowerCase().replace(/\.$/, "");
  if (sending === "" || primary === "") {
    throw new PrimaryDomainError(sendingDomain || "(empty)");
  }
  if (sending === primary || sending.endsWith(`.${primary}`)) {
    throw new PrimaryDomainError(sendingDomain);
  }
}
