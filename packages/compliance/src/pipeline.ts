/**
 * Section 6, gates 1 through 11, as one pure function.
 *
 * No I/O, no clock read, no config lookup. `now` and the suppression list are
 * passed in. The live dispatcher and dry-run mode both call this and get the
 * same decision, which is the point.
 *
 * Gate 12 (daily cap, counted from activity_log), gate 13 (dispatch), and
 * gate 14 (write the log row) are impure and live in apps/worker.
 */

import {
  DEFAULT_EXCLUDED_JURISDICTIONS,
  hasStepsRemaining,
  isAutomationEligibleStatus,
  isAutomationEligibleTier,
  isDispatchableStatus,
  isExcludedJurisdiction,
  isStepDue,
  isTerminalForAutomation,
} from "./eligibility.js";
import { describeFindings, lint } from "./linter.js";
import { fieldsFromProspect, humanizeField, merge } from "./merge.js";
import { findSuppression } from "./suppression.js";
import type {
  EnrollmentView,
  GateId,
  Jurisdiction,
  ProspectView,
  SendDecision,
  SuppressionEntry,
  TemplateView,
  TransportKind,
} from "./types.js";

export interface SendEvaluationInput {
  /** The transport the adapter about to be used actually is. */
  readonly transportKind: TransportKind;
  /** The transport the campaign is configured for. INV-9. */
  readonly campaignTransport: TransportKind;
  readonly prospect: ProspectView;
  readonly enrollment: EnrollmentView;
  readonly template: TemplateView;
  readonly suppressions: readonly SuppressionEntry[];
  readonly now: Date;
  readonly excludedJurisdictions?: readonly Jurisdiction[];
}

const JURISDICTION_LABEL: Record<Jurisdiction, string> = {
  us: "US",
  non_us: "Non-US",
  eu: "EU",
  uk: "UK",
  eea: "EEA",
};

/**
 * Runs every gate in the order given in section 6. The first failure aborts.
 * There is no argument that skips a gate.
 */
export function evaluateSend(input: SendEvaluationInput): SendDecision {
  const { prospect, enrollment, template, now } = input;
  const excluded = input.excludedJurisdictions ?? DEFAULT_EXCLUDED_JURISDICTIONS;

  // Gate 1. Transport matches campaign transport (INV-9).
  if (input.transportKind !== input.campaignTransport) {
    return refuse("transport_match", "skipped", "Wrong transport for this campaign", {
      campaignTransport: input.campaignTransport,
      transportKind: input.transportKind,
    });
  }

  // Section 5. A contact who has written back is never mailed by automation.
  if (isTerminalForAutomation(enrollment.status)) {
    return refuse("terminal_status", "skipped", labelTerminal(enrollment.status), {
      status: enrollment.status,
    });
  }
  if (!isDispatchableStatus(enrollment.status) && enrollment.status !== "manual_only") {
    return refuse("terminal_status", "skipped", `Sequence is ${enrollment.status.replace("_", " ")}`, {
      status: enrollment.status,
    });
  }

  // Gate 2. Suppression, by email and by domain (INV-4).
  const suppression = findSuppression(prospect.email, input.suppressions);
  if (suppression !== null) {
    return refuse(
      "suppression",
      "skipped",
      suppression.matchType === "domain"
        ? `Domain suppressed: ${suppression.value}`
        : `Address suppressed: ${suppression.value}`,
      { matchType: suppression.matchType, value: suppression.value },
    );
  }

  // Gate 3. do_not_contact.
  if (prospect.doNotContact) {
    return refuse("do_not_contact", "skipped", "Marked do not contact", {});
  }

  // Gate 4. Tier is not 1, status is not manual_only (INV-1).
  if (!isAutomationEligibleTier(prospect.tier)) {
    return refuse("tier_or_manual_only", "skipped", "Tier 1, human-written mail only", {
      tier: prospect.tier,
    });
  }
  if (!isAutomationEligibleStatus(enrollment.status)) {
    return refuse("tier_or_manual_only", "skipped", "Manual only, human-written mail only", {
      status: enrollment.status,
    });
  }

  // Gate 5. Jurisdiction (INV-7).
  if (isExcludedJurisdiction(prospect.jurisdiction, excluded)) {
    return refuse(
      "jurisdiction",
      "skipped",
      `${JURISDICTION_LABEL[prospect.jurisdiction]} jurisdiction, warm contact only`,
      { jurisdiction: prospect.jurisdiction },
    );
  }

  // Gate 6. Step is due.
  if (!isStepDue(enrollment.lastSentAt, enrollment.delayDays, now)) {
    return refuse("step_due", "skipped", `Not due yet, waits ${enrollment.delayDays} days`, {
      lastSentAt: enrollment.lastSentAt?.toISOString() ?? null,
      delayDays: enrollment.delayDays,
    });
  }

  // Gate 7. Steps remaining.
  if (!hasStepsRemaining(enrollment.currentStep, enrollment.maxSteps)) {
    return refuse("max_steps", "skipped", "Sequence finished, no steps left", {
      currentStep: enrollment.currentStep,
      maxSteps: enrollment.maxSteps,
    });
  }

  // Gate 8. Template is corporate content (INV-6).
  if (template.contentTier !== "corporate") {
    return refuse("content_tier", "skipped", "Template is not corporate content", {
      contentTier: template.contentTier,
      templateKey: template.key,
    });
  }

  // Gates 9 and 10. Merge and personalization (INV-3).
  const merged = merge(template, fieldsFromProspect(prospect));
  if (merged.emptyFields.length > 0) {
    const names = merged.emptyFields.map(humanizeField);
    return refuse("personal_reason", "skipped", `${names.join(", ")} empty`, {
      emptyFields: merged.emptyFields,
      templateKey: template.key,
    });
  }
  if (merged.unresolved.length > 0) {
    const names = merged.unresolved.map(humanizeField);
    return refuse("merge_resolved", "skipped", `Unresolved placeholder: ${names.join(", ")}`, {
      unresolved: merged.unresolved,
      templateKey: template.key,
    });
  }

  // Gate 11. Linter on merged subject and body (INV-2).
  const findings = lint(merged.subject, merged.body);
  if (findings.length > 0) {
    return refuse("linter", "blocked", describeFindings(findings), {
      findings: findings.map((f) => ({
        rule: f.rule,
        match: f.match,
        field: f.field,
        index: f.index,
      })),
      templateKey: template.key,
    });
  }

  return { allowed: true, merged: { subject: merged.subject, body: merged.body } };
}

function labelTerminal(status: string): string {
  if (status === "replied") return "Prospect replied, waiting on an operator";
  if (status === "stopped") return "Sequence stopped";
  return "Sequence completed";
}

function refuse(
  gate: GateId,
  outcome: "skipped" | "blocked",
  reason: string,
  detail: Record<string, unknown>,
): SendDecision {
  return { allowed: false, outcome, gate, reason, detail };
}
