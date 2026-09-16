/**
 * Today's send desk. Eligibility is decided by packages/compliance, not here.
 *
 * This module never dispatches. It runs evaluateSend so the operator reads
 * the same reasons the worker will write to the log.
 */

import { evaluateSend, type SuppressionEntry } from "@depinfin/compliance";
import type { SendPreviewRow } from "@depinfin/db";

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
  readonly willDispatch: boolean;
  /** Pipeline reason, verbatim. Do not map this back to a gate id in the UI. */
  readonly reason: string;
  readonly subject: string | null;
}

export function evaluatePreviewRow(
  row: SendPreviewRow,
  suppressions: readonly SuppressionEntry[],
  now: Date,
): PreviewDecision {
  const decision = evaluateSend({
    transportKind: row.sequenceTransport,
    campaignTransport: row.sequenceTransport,
    prospect: row.prospect,
    enrollment: row.enrollment,
    template: row.template,
    suppressions,
    now,
  });

  const name = `${row.prospect.firstName}${row.prospect.lastName ? ` ${row.prospect.lastName}` : ""}`;

  if (decision.allowed) {
    return {
      enrollmentId: row.enrollmentId,
      contactId: row.prospect.contactId,
      email: row.prospect.email,
      name,
      firmName: row.prospect.firmName,
      tier: row.prospect.tier,
      sequenceName: row.sequenceName,
      transport: row.sequenceTransport,
      stepNumber: row.stepNumber,
      willDispatch: true,
      reason: "Ready to send",
      subject: decision.merged.subject,
    };
  }

  return {
    enrollmentId: row.enrollmentId,
    contactId: row.prospect.contactId,
    email: row.prospect.email,
    name,
    firmName: row.prospect.firmName,
    tier: row.prospect.tier,
    sequenceName: row.sequenceName,
    transport: row.sequenceTransport,
    stepNumber: row.stepNumber,
    willDispatch: false,
    reason: decision.reason,
    subject: null,
  };
}

export function splitPreview(decisions: readonly PreviewDecision[]): {
  readonly ready: PreviewDecision[];
  readonly held: PreviewDecision[];
} {
  return {
    ready: decisions.filter((d) => d.willDispatch),
    held: decisions.filter((d) => !d.willDispatch),
  };
}
