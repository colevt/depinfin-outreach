/**
 * INV-9 warm transport. Gmail API over OAuth.
 *
 * One to one, human composed or human reviewed, sent from a real operator
 * inbox on the primary domain, and replies land in that inbox. This adapter
 * is typed `Transport<"warm">`, so a cold campaign cannot be handed to it.
 *
 * Section 12 build order: this ships before the cold transport, and the cold
 * transport ships last.
 */

import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";
import type { OutboundMessage, SendResult, Transport } from "@depinfin/transport-contract";

export interface GmailConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly refreshToken: string;
  /** The operator inbox. Replies land here, and section 7 polls it. */
  readonly operatorAddress: string;
  readonly operatorName?: string;
}

export interface GmailThreadMessage {
  readonly id: string;
  readonly from: string;
  readonly body: string;
  readonly receivedAt: Date;
}

export class GmailTransport implements Transport<"warm"> {
  readonly kind = "warm" as const;
  readonly sendingDomain: string;
  private readonly client: gmail_v1.Gmail;

  constructor(private readonly config: GmailConfig) {
    const domain = config.operatorAddress.split("@")[1];
    if (domain === undefined || domain === "") {
      throw new Error("GMAIL_OPERATOR_ADDRESS must be a full address on the primary domain");
    }
    this.sendingDomain = domain.toLowerCase();

    const auth = new google.auth.OAuth2(config.clientId, config.clientSecret);
    auth.setCredentials({ refresh_token: config.refreshToken });
    this.client = google.gmail({ version: "v1", auth });
  }

  async send(message: OutboundMessage<"warm">): Promise<SendResult> {
    const threadId = message.inReplyToThreadId ?? undefined;

    const response = await this.client.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodeMessage({
          from: this.fromHeader(),
          to: message.to,
          subject: message.subject,
          body: message.body,
        }),
        ...(threadId ? { threadId } : {}),
      },
    });

    const data = response.data;
    if (!data.id) throw new Error("Gmail accepted the send but returned no message id");

    return {
      providerMessageId: data.id,
      threadId: data.threadId ?? null,
      sentAt: new Date(),
    };
  }

  /**
   * Section 7. Returns inbound messages on a thread, that is, every message
   * not from the operator address. A deleted or inaccessible thread returns an
   * empty list rather than throwing: a missing thread is not an error state.
   */
  async inboundMessages(threadId: string): Promise<GmailThreadMessage[]> {
    let thread: gmail_v1.Schema$Thread;
    try {
      const response = await this.client.users.threads.get({
        userId: "me",
        id: threadId,
        format: "full",
      });
      thread = response.data;
    } catch (error: unknown) {
      if (isMissingThread(error)) return [];
      throw error;
    }

    const operator = this.config.operatorAddress.toLowerCase();

    return (thread.messages ?? [])
      .map(toThreadMessage)
      .filter((message): message is GmailThreadMessage => message !== null)
      .filter((message) => !message.from.toLowerCase().includes(operator));
  }

  private fromHeader(): string {
    return this.config.operatorName
      ? `${this.config.operatorName} <${this.config.operatorAddress}>`
      : this.config.operatorAddress;
  }
}

function isMissingThread(error: unknown): boolean {
  const status = (error as { code?: number; status?: number } | null)?.code
    ?? (error as { status?: number } | null)?.status;
  return status === 404 || status === 403 || status === 410;
}

function toThreadMessage(message: gmail_v1.Schema$Message): GmailThreadMessage | null {
  if (!message.id) return null;
  const headers = message.payload?.headers ?? [];
  const from = headers.find((h) => h.name?.toLowerCase() === "from")?.value ?? "";
  return {
    id: message.id,
    from,
    body: extractPlainText(message.payload) || (message.snippet ?? ""),
    receivedAt: new Date(Number(message.internalDate ?? Date.now())),
  };
}

function extractPlainText(part: gmail_v1.Schema$MessagePart | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) {
    return Buffer.from(part.body.data, "base64url").toString("utf8");
  }
  for (const child of part.parts ?? []) {
    const text = extractPlainText(child);
    if (text !== "") return text;
  }
  return "";
}

export function encodeMessage(input: {
  from: string;
  to: string;
  subject: string;
  body: string;
}): string {
  const headers = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ];
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${input.body}`, "utf8").toString("base64url");
}

/** RFC 2047 for non-ASCII subjects. A prospect's name is often non-ASCII. */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}
