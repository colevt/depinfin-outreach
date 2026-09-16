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

/**
 * Scans the whole inbound body and returns the phrase that matched, or null.
 *
 * The whole body, quoted history included. INV-4 reads on the reply, not on
 * the part of the reply we judge the prospect to have typed, and a missed
 * opt-out is the worse failure of the two.
 *
 * One consequence to know about before writing outbound copy: a message of
 * ours that says "reply stop and we will take you off" comes back inside the
 * quoted history of every ordinary reply, and every one of those replies then
 * reads as an opt-out. Warm one-to-one mail carries no such footer, so this is
 * not a live problem today. It becomes one the moment a cold sequence adds an
 * unsubscribe line, which is a section 12 step 9 concern.
 */
export function detectOptOut(body: string): string | null {
  for (const { phrase, pattern } of OPT_OUT_PATTERNS) {
    if (pattern.test(body)) return phrase;
  }
  return null;
}
