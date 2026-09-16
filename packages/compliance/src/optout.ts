/**
 * INV-4, inbound half. An opt-out reply creates a suppression entry, sets
 * do_not_contact, and terminates the sequence. CAN-SPAM allows 10 business
 * days. This honors it immediately.
 */

export const OPT_OUT_PHRASES: readonly string[] = Object.freeze([
  "stop",
  "unsubscribe",
  "remove me",
  "take me off",
  "do not contact",
  "opt out",
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const OPT_OUT_PATTERNS: readonly { phrase: string; pattern: RegExp }[] = OPT_OUT_PHRASES.map(
  (phrase) => ({
    phrase,
    // Whitespace-tolerant between words, word-boundary aware at the edges.
    pattern: new RegExp(`\\b${phrase.split(/\s+/).map(escapeRegExp).join("\\s+")}\\b`, "i"),
  }),
);

export interface OptOutScan {
  /** The phrase that matched, or null. */
  readonly phrase: string | null;
  /**
   * Where it matched. `reply` is what the human typed and is acted on
   * automatically. `quoted` means the phrase appears only in quoted history,
   * which is usually our own footer coming back, so it is surfaced to the
   * operator rather than acted on.
   */
  readonly source: "reply" | "quoted" | null;
}

/**
 * Scans an inbound body for an opt-out.
 *
 * Quoted history is separated first. Without that, our own "reply stop and we
 * will take you off" footer would come back on every ordinary reply and
 * suppress every prospect who answered. Matching on quoted text alone is
 * therefore not treated as an opt-out, but it is not discarded either: the
 * caller surfaces it to the operator queue so a real opt-out buried in a
 * quoted block is seen by a human the same morning.
 */
export function scanOptOut(body: string): OptOutScan {
  const reply = stripQuotedReply(body);
  for (const { phrase, pattern } of OPT_OUT_PATTERNS) {
    if (pattern.test(reply)) return { phrase, source: "reply" };
  }
  for (const { phrase, pattern } of OPT_OUT_PATTERNS) {
    if (pattern.test(body)) return { phrase, source: "quoted" };
  }
  return { phrase: null, source: null };
}

/**
 * The phrase to act on automatically, or null. INV-4: on a match, suppress,
 * set do_not_contact, and terminate the sequence.
 */
export function detectOptOut(body: string): string | null {
  const scan = scanOptOut(body);
  return scan.source === "reply" ? scan.phrase : null;
}

/** Trims the reply down to what the human actually typed, best effort. */
export function stripQuotedReply(body: string): string {
  const lines = body.split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) continue;
    if (/^\s*on .+ wrote:\s*$/i.test(line)) break;
    if (/^\s*-{2,}\s*original message\s*-{2,}\s*$/i.test(line)) break;
    if (/^\s*_{5,}\s*$/.test(line)) break;
    if (/^\s*from:\s*.+@/i.test(line)) break;
    kept.push(line);
  }
  return kept.join("\n");
}
