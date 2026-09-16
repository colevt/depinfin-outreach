/**
 * Shared vocabulary for the compliance gates.
 *
 * Everything in this package is a pure function over these types. No I/O, no
 * clock reads, no database access. Section 6 of CLAUDE.md requires gates 1
 * through 11 to be callable without side effects so dry-run mode and the live
 * dispatcher run identical code.
 */

export type Tier = 1 | 2 | 3;

export type Jurisdiction = "us" | "non_us" | "eu" | "uk" | "eea";

export type TransportKind = "warm" | "cold";

export type EnrollmentStatus =
  | "not_started"
  | "active"
  | "paused"
  | "replied"
  | "stopped"
  | "completed"
  | "manual_only";

/** INV-6. The only tier an automated sequence may reference. */
export type ContentTier = "corporate";

export type SuppressionMatchType = "email" | "domain";

export interface SuppressionEntry {
  readonly value: string;
  readonly matchType: SuppressionMatchType;
  readonly active: boolean;
}

/** Flattened contact plus firm data. Exactly what the gates need, nothing more. */
export interface ProspectView {
  readonly contactId: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string | null;
  readonly title: string | null;
  readonly firmName: string;
  readonly personalReason: string | null;
  readonly doNotContact: boolean;
  readonly tier: Tier | null;
  readonly jurisdiction: Jurisdiction;
}

export interface TemplateView {
  readonly key: string;
  readonly subject: string;
  readonly body: string;
  /** Typed as the literal so a Tier 2 template cannot be passed in (INV-6). */
  readonly contentTier: ContentTier;
}

export interface EnrollmentView {
  readonly status: EnrollmentStatus;
  readonly currentStep: number;
  readonly maxSteps: number;
  readonly lastSentAt: Date | null;
  readonly delayDays: number;
}

/**
 * Every gate that can refuse a send. The id is stable and goes in the audit
 * detail; the reason text is what an operator reads (section 9).
 */
export type GateId =
  | "transport_match"
  | "suppression"
  | "do_not_contact"
  | "tier_or_manual_only"
  | "jurisdiction"
  | "step_due"
  | "max_steps"
  | "content_tier"
  | "merge_resolved"
  | "personal_reason"
  | "linter"
  | "terminal_status";

/** Audit action written when a gate refuses. Mirrors activity_log.action. */
export type RefusalOutcome = "skipped" | "blocked";

export interface MergedMessage {
  readonly subject: string;
  readonly body: string;
}

export type SendDecision =
  | { readonly allowed: true; readonly merged: MergedMessage }
  | {
      readonly allowed: false;
      readonly outcome: RefusalOutcome;
      readonly gate: GateId;
      /** Operator-legible. "Personal Reason empty", not "gate 10 failed". */
      readonly reason: string;
      readonly detail: Record<string, unknown>;
    };
