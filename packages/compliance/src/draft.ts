/**
 * Gates for a one-to-one message an operator wrote, as opposed to a sequence
 * step the dispatcher produced.
 *
 * This lives here and not in packages/core because CLAUDE.md is explicit that
 * eligibility and linting logic exist in exactly one package. A second
 * implementation of "may this go out" is a defect even when it agrees with
 * this one, because the two will not agree forever.
 *
 * Two deliberate differences from `evaluateSend`:
 *
 *   1. Every blocker is reported, not the first. The dispatcher wants an early
 *      abort. An operator mid-edit wants the whole rewrite job at once, which
 *      is the section 9 legibility requirement applied to composing.
 *
 *   2. The automation-only gates do not apply. INV-1 keeps Tier 1 out of
 *      automated mail precisely so a human writes to them, and INV-7 excludes
 *      EU, UK, and EEA from automated sending while allowing warm,
 *      human-initiated contact. A draft is that human. Neither exclusion is a
 *      reason to refuse here, and treating them as one would remove the only
 *      route those prospects have.
 *
 * What still applies, and is not negotiable: suppression on address and on
 * domain (INV-4), do_not_contact, corporate content only (INV-6),
 * personalization on a first touch (INV-3), and the linter on the final text
 * (INV-2). There is no argument to this function that skips any of them.
 */

import type { LintFinding } from "./linter.js";
import { describeFindings, lint } from "./linter.js";
import { extractPlaceholders, humanizeField } from "./merge.js";
import { findSuppression } from "./suppression.js";
import type {
  ContentTier,
  GateId,
  ProspectView,
  RefusalOutcome,
  SuppressionEntry,
} from "./types.js";

/** A first touch has to justify itself. A reply is justified by the reply. */
export type DraftKind = "first_touch" | "follow_up" | "reply";

/** INV-8. A LinkedIn draft is copied out and sent by a human, never by code. */
export type DraftChannel = "email" | "linkedin";

export interface DraftEvaluationInput {
  readonly prospect: ProspectView;
  readonly kind: DraftKind;
  readonly channel: DraftChannel;
  /** Empty for a LinkedIn message, which has no subject line. */
  readonly subject: string;
  readonly body: string;
  readonly contentTier: ContentTier;
  readonly suppressions: readonly SuppressionEntry[];
}

export interface DraftBlocker {
  readonly gate: GateId;
  /** Operator-legible. "Personal Reason empty", not "gate 10 failed". */
  readonly reason: string;
  /** What logging this refusal would write, if it were a send. */
  readonly outcome: RefusalOutcome;
  /**
   * True when no edit to the text can clear it. A suppression is not a
   * rewrite away, and the UI should stop offering a send button rather than
   * inviting an operator to try.
   */
  readonly terminal: boolean;
  readonly detail: Record<string, unknown>;
}

export interface DraftDecision {
  /** Every blocker clear. Sending is still subject to the transport's own checks. */
  readonly sendable: boolean;
  readonly blockers: readonly DraftBlocker[];
  readonly lintFindings: readonly LintFinding[];
}

/**
 * Evaluates a composed draft. Pure, like everything else in this package: no
 * database, no clock, no environment. The caller supplies the suppression list.
 */
export function evaluateDraft(input: DraftEvaluationInput): DraftDecision {
  const blockers: DraftBlocker[] = [];
  const { prospect } = input;

  // INV-4. Suppression is checked on the address and on the bare domain.
  // It applies to a LinkedIn draft too: someone who asked not to be emailed
  // has not invited a message on another channel instead.
  const suppression = findSuppression(prospect.email, input.suppressions);
  if (suppression !== null) {
    blockers.push({
      gate: "suppression",
      reason:
        suppression.matchType === "domain"
          ? `Domain suppressed: ${suppression.value}`
          : `Address suppressed: ${suppression.value}`,
      outcome: "skipped",
      terminal: true,
      detail: { matchType: suppression.matchType, value: suppression.value },
    });
  }

  if (prospect.doNotContact) {
    blockers.push({
      gate: "do_not_contact",
      reason: "Marked do not contact",
      outcome: "skipped",
      terminal: true,
      detail: {},
    });
  }

  // INV-6. A draft carries corporate content. Offering material reaches a
  // prospect through a path that verifies accreditation first, and that path
  // is out of scope for v1.
  if (input.contentTier !== "corporate") {
    blockers.push({
      gate: "content_tier",
      reason: "Draft is not corporate content",
      outcome: "skipped",
      terminal: true,
      detail: { contentTier: input.contentTier },
    });
  }

  if (input.channel === "email" && input.subject.trim().length === 0) {
    blockers.push({
      gate: "merge_resolved",
      reason: "Subject is empty",
      outcome: "skipped",
      terminal: false,
      detail: {},
    });
  }

  if (input.body.trim().length === 0) {
    blockers.push({
      gate: "merge_resolved",
      reason: "Body is empty",
      outcome: "skipped",
      terminal: false,
      detail: {},
    });
  }

  // INV-3. A record without a specific, verifiable reason for contact is a
  // name, not a prospect. A reply is exempt: they wrote to us.
  if (input.kind !== "reply" && isBlank(prospect.personalReason)) {
    blockers.push({
      gate: "personal_reason",
      reason: "Personal Reason empty",
      outcome: "skipped",
      terminal: false,
      detail: { kind: input.kind },
    });
  }

  // INV-3. Anything that still looks like a merge field is a field that did
  // not resolve, whether it came from a template or the operator typed it.
  const leftover = [
    ...extractPlaceholders(input.subject),
    ...extractPlaceholders(input.body),
  ];
  if (leftover.length > 0) {
    const names = [...new Set(leftover)].map(humanizeField);
    blockers.push({
      gate: "merge_resolved",
      reason: `Unresolved placeholder: ${names.join(", ")}`,
      outcome: "skipped",
      terminal: false,
      detail: { unresolved: [...new Set(leftover)] },
    });
  }

  // INV-2. On the final text, which for a draft is the text itself. There is
  // no raw template to lint instead and no way to ask this to look away.
  const lintFindings = lint(input.subject, input.body);
  if (lintFindings.length > 0) {
    blockers.push({
      gate: "linter",
      reason: describeFindings(lintFindings),
      outcome: "blocked",
      terminal: false,
      detail: {
        findings: lintFindings.map((f) => ({
          rule: f.rule,
          match: f.match,
          field: f.field,
          index: f.index,
        })),
      },
    });
  }

  return { sendable: blockers.length === 0, blockers, lintFindings };
}

/** True when nothing an operator types could clear the blockers. */
export function isTerminallyBlocked(decision: DraftDecision): boolean {
  return decision.blockers.some((blocker) => blocker.terminal);
}

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim().length === 0;
}
