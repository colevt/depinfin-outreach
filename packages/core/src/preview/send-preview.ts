/**
 * Today's send desk. What the dispatcher will do, and what it will refuse.
 *
 * Eligibility is not decided here. Every row goes through `evaluateSend` in
 * packages/compliance, which is the same function the worker calls, so the
 * reason an operator reads on this screen is the exact string that will be
 * written to the audit log if the send is refused. If the preview and the
 * dispatcher ever disagreed, the preview would be worse than not having one.
 *
 * Nothing in this module dispatches, and nothing may be added to it that does.
 */

import {
  type EnrollmentView,
  type ProspectView,
  type SendDecision,
  type SuppressionEntry,
  type TemplateView,
  type TransportKind,
  evaluateSend,
} from "@depinfin/compliance";

/**
 * The row shape this module evaluates, described in terms of the compliance
 * types rather than imported from packages/db. The domain does not depend on
 * persistence, so `SendPreviewRow` over in the db package is structurally the
 * same type rather than the same declaration, and a drift check in
 * apps/web/test asserts the two stay assignable.
 */
export interface SendPreviewInput {
  readonly enrollmentId: string;
  readonly sequenceId: string;
  readonly sequenceName: string;
  readonly sequenceTransport: TransportKind;
  readonly stepNumber: number;
  readonly nextDueAt: Date | null;
  readonly prospect: ProspectView;
  readonly template: TemplateView;
  readonly enrollment: EnrollmentView;
}

export interface PreviewDecision {
  readonly enrollmentId: string;
  readonly contactId: string;
  readonly email: string;
  readonly name: string;
  readonly firmName: string;
  readonly tier: 1 | 2 | 3 | null;
  readonly sequenceName: string;
  readonly transport: "warm" | "cold";
  readonly stepNumber: number;
  readonly nextDueAt: Date | null;
  readonly willDispatch: boolean;
  /** Straight from the pipeline. Do not map it back to a gate id in the UI. */
  readonly reason: string;
  /** The gate that refused, for grouping. Null when nothing refused. */
  readonly gate: string | null;
  /** The merged subject, so an operator can see what would actually go out. */
  readonly subject: string | null;
}

export function evaluatePreviewRow(
  row: SendPreviewInput,
  suppressions: readonly SuppressionEntry[],
  now: Date,
): PreviewDecision {
  const decision: SendDecision = evaluateSend({
    transportKind: row.sequenceTransport,
    campaignTransport: row.sequenceTransport,
    prospect: row.prospect,
    enrollment: row.enrollment,
    template: row.template,
    suppressions,
    now,
  });

  const base = {
    enrollmentId: row.enrollmentId,
    contactId: row.prospect.contactId,
    email: row.prospect.email,
    name: `${row.prospect.firstName} ${row.prospect.lastName ?? ""}`.trim(),
    firmName: row.prospect.firmName,
    tier: row.prospect.tier,
    sequenceName: row.sequenceName,
    transport: row.sequenceTransport,
    stepNumber: row.stepNumber,
    nextDueAt: row.nextDueAt,
  };

  if (decision.allowed) {
    return {
      ...base,
      willDispatch: true,
      reason: "Ready to send",
      gate: null,
      subject: decision.merged.subject,
    };
  }

  return {
    ...base,
    willDispatch: false,
    reason: decision.reason,
    gate: decision.gate,
    subject: null,
  };
}

export interface SplitPreview {
  readonly ready: readonly PreviewDecision[];
  readonly held: readonly PreviewDecision[];
}

export function splitPreview(decisions: readonly PreviewDecision[]): SplitPreview {
  return {
    ready: decisions.filter((d) => d.willDispatch),
    held: decisions.filter((d) => !d.willDispatch),
  };
}

/**
 * Held rows grouped by reason, commonest first. One prospect missing a reason
 * for contact is a task. Forty of them is a process problem, and the grouping
 * is what makes the difference visible.
 */
export function groupHeldReasons(
  decisions: readonly PreviewDecision[],
): { readonly reason: string; readonly count: number }[] {
  const counts = new Map<string, number>();
  for (const decision of decisions) {
    if (decision.willDispatch) continue;
    counts.set(decision.reason, (counts.get(decision.reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}
