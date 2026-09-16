/**
 * INV-9 cold transport. Dedicated sending infrastructure on a separate domain.
 *
 * Section 12 puts this last, after deliverability groundwork, which is why no
 * vendor is wired in here. The adapter takes an injected client, so choosing
 * an ESP is a later decision that does not reopen this file.
 *
 * Two guarantees hold regardless of which ESP is chosen:
 *   1. The type is Transport<"cold">, so a warm campaign cannot use it.
 *   2. Construction fails if the sending domain is the primary domain or a
 *      subdomain of it.
 *
 * Section 10: no open-tracking pixels and no link wrapping on cold sends.
 * This adapter does not accept a tracking option, so there is nothing to turn on.
 */

import {
  assertNotPrimaryDomain,
  type OutboundMessage,
  type SendResult,
  type Transport,
} from "@depinfin/transport-contract";

/** The narrow surface a cold ESP has to provide. Nothing about tracking. */
export interface EspClient {
  readonly name: string;
  sendRaw(input: {
    from: string;
    to: string;
    subject: string;
    body: string;
  }): Promise<{ providerMessageId: string }>;
}

export interface ColdTransportConfig {
  /** Must not be the primary domain, or a subdomain of it. */
  readonly sendingDomain: string;
  readonly primaryDomain: string;
  readonly fromAddress: string;
  readonly client: EspClient;
}

export class ColdTransport implements Transport<"cold"> {
  readonly kind = "cold" as const;
  readonly sendingDomain: string;

  constructor(private readonly config: ColdTransportConfig) {
    // INV-9. Refused at construction, so a misconfigured deploy fails at
    // startup rather than on the first send.
    assertNotPrimaryDomain(config.sendingDomain, config.primaryDomain);

    const fromDomain = config.fromAddress.split("@")[1]?.toLowerCase() ?? "";
    if (fromDomain !== config.sendingDomain.trim().toLowerCase()) {
      throw new Error(
        `INV-9: cold from-address ${config.fromAddress} is not on the cold sending domain ${config.sendingDomain}`,
      );
    }

    this.sendingDomain = config.sendingDomain.toLowerCase();
  }

  async send(message: OutboundMessage<"cold">): Promise<SendResult> {
    const result = await this.config.client.sendRaw({
      from: this.config.fromAddress,
      to: message.to,
      subject: message.subject,
      body: message.body,
    });

    return {
      providerMessageId: result.providerMessageId,
      // Cold sends do not thread. Replies are handled by the warm inbox after
      // a human takes the conversation over.
      threadId: null,
      sentAt: new Date(),
    };
  }
}

export { assertNotPrimaryDomain };
