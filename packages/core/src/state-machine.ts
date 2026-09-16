/**
 * Section 5. The sequence state machine.
 *
 * `replied` and `stopped` are terminal for automation. Resuming from `replied`
 * requires an explicit operator action and writes a log row, which is why
 * `resume_from_replied` carries an actor and the transition result carries the
 * audit entry the caller must persist.
 */

import type { EnrollmentStatus } from "@depinfin/compliance";

export type SequenceEvent =
  | { readonly type: "enroll" }
  | { readonly type: "send" }
  | { readonly type: "max_steps_reached" }
  | { readonly type: "inbound_reply" }
  | { readonly type: "opt_out_reply"; readonly phrase: string }
  | { readonly type: "operator_pause"; readonly actor: string }
  | { readonly type: "operator_resume"; readonly actor: string }
  | { readonly type: "operator_stop"; readonly actor: string; readonly reason: string };

export type LogAction =
  | "sent"
  | "skipped"
  | "blocked"
  | "error"
  | "reply"
  | "opt_out"
  | "stage_change"
  | "enrolled"
  | "unenrolled"
  | "rescored";

export interface TransitionResult {
  readonly status: EnrollmentStatus;
  readonly action: LogAction;
  readonly detail: Record<string, unknown>;
}

export class IllegalTransitionError extends Error {
  constructor(
    readonly from: EnrollmentStatus,
    readonly event: SequenceEvent["type"],
  ) {
    super(`Cannot ${event.replace(/_/g, " ")} from ${from.replace(/_/g, " ")}`);
    this.name = "IllegalTransitionError";
  }
}

const AUTOMATION_TERMINAL: readonly EnrollmentStatus[] = ["replied", "stopped", "completed"];

export function isTerminal(status: EnrollmentStatus): boolean {
  return AUTOMATION_TERMINAL.includes(status);
}

/**
 * Pure. Returns the next status plus the audit row to write. Throws on an
 * illegal transition rather than silently coercing, so a caller that tries to
 * resume a stopped sequence fails loudly.
 */
export function transition(from: EnrollmentStatus, event: SequenceEvent): TransitionResult {
  switch (event.type) {
    case "enroll":
      if (from !== "not_started") throw new IllegalTransitionError(from, event.type);
      return { status: "active", action: "enrolled", detail: {} };

    case "send":
      // manual_only never reaches here: INV-1 excludes it at the query layer
      // and again at gate 4.
      if (from !== "active") throw new IllegalTransitionError(from, event.type);
      return { status: "active", action: "sent", detail: {} };

    case "max_steps_reached":
      if (from !== "active") throw new IllegalTransitionError(from, event.type);
      return { status: "completed", action: "stage_change", detail: { to: "completed" } };

    case "inbound_reply":
      // A reply always wins, including one that lands while paused.
      if (from === "stopped") throw new IllegalTransitionError(from, event.type);
      return { status: "replied", action: "reply", detail: { from } };

    case "opt_out_reply":
      return {
        status: "stopped",
        action: "opt_out",
        detail: { phrase: event.phrase, from },
      };

    case "operator_pause":
      if (from !== "active") throw new IllegalTransitionError(from, event.type);
      return {
        status: "paused",
        action: "stage_change",
        detail: { to: "paused", actor: event.actor },
      };

    case "operator_resume":
      // Section 5: resuming from `replied` is an explicit operator action and
      // is logged. Resuming a stopped sequence is not a thing; a stop after an
      // opt-out is permanent.
      if (from !== "paused" && from !== "replied") {
        throw new IllegalTransitionError(from, event.type);
      }
      return {
        status: "active",
        action: "stage_change",
        detail: { to: "active", from, actor: event.actor, explicitOperatorAction: true },
      };

    case "operator_stop":
      return {
        status: "stopped",
        action: "stage_change",
        detail: { to: "stopped", actor: event.actor, reason: event.reason },
      };
  }
}

export function canTransition(from: EnrollmentStatus, event: SequenceEvent): boolean {
  try {
    transition(from, event);
    return true;
  } catch {
    return false;
  }
}
