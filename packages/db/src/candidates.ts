/**
 * INV-1, INV-4, INV-7 at the query layer.
 *
 * This module reads from the dispatch_candidates view and from nothing else.
 * Assembling candidates from the base tables would put the invariants back
 * into application code, which is exactly what CLAUDE.md forbids.
 */

import { sql } from "drizzle-orm";
import type { Database } from "./client.js";
import type {
  EnrollmentView,
  Jurisdiction,
  ProspectView,
  TemplateView,
  Tier,
  TransportKind,
} from "@depinfin/compliance";

export interface DispatchCandidate {
  readonly enrollmentId: string;
  readonly sequenceId: string;
  readonly sequenceName: string;
  readonly sequenceTransport: TransportKind;
  readonly stepNumber: number;
  readonly replyInThread: boolean;
  readonly threadId: string | null;
  readonly prospect: ProspectView;
  readonly template: TemplateView;
  readonly enrollment: EnrollmentView;
}

/**
 * A type alias rather than an interface on purpose: drizzle's `execute<T>`
 * constrains T to Record<string, unknown>, and only an alias carries the
 * implicit index signature that satisfies it.
 */
type CandidateRow = {
  enrollment_id: string;
  enrollment_status: string;
  current_step: number;
  last_sent_at: Date | null;
  thread_id: string | null;
  sequence_id: string;
  sequence_name: string;
  sequence_transport: TransportKind;
  max_steps: number;
  step_number: number;
  delay_days: number;
  reply_in_thread: boolean;
  template_key: string;
  template_subject: string;
  template_body: string;
  template_content_tier: "corporate";
  contact_id: string;
  email: string;
  first_name: string;
  last_name: string | null;
  title: string | null;
  personal_reason: string | null;
  do_not_contact: boolean;
  firm_name: string;
  tier: number | null;
  jurisdiction: Jurisdiction;
};

/**
 * Candidates for one transport. The transport filter is part of the query, so
 * a cold campaign is never even fetched by the warm dispatcher (INV-9).
 */
export async function selectDispatchCandidates(
  db: Database,
  transport: TransportKind,
  limit: number,
): Promise<DispatchCandidate[]> {
  const rows = await db.execute<CandidateRow>(sql`
    SELECT * FROM dispatch_candidates
    WHERE sequence_transport = ${transport}
    ORDER BY next_due_at NULLS FIRST, enrollment_id
    LIMIT ${limit}
  `);

  return [...rows].map(toCandidate);
}

function toCandidate(row: CandidateRow): DispatchCandidate {
  return {
    enrollmentId: row.enrollment_id,
    sequenceId: row.sequence_id,
    sequenceName: row.sequence_name,
    sequenceTransport: row.sequence_transport,
    stepNumber: row.step_number,
    replyInThread: row.reply_in_thread,
    threadId: row.thread_id,
    prospect: {
      contactId: row.contact_id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      title: row.title,
      firmName: row.firm_name,
      personalReason: row.personal_reason,
      doNotContact: row.do_not_contact,
      tier: (row.tier as Tier | null) ?? null,
      jurisdiction: row.jurisdiction,
    },
    template: {
      key: row.template_key,
      subject: row.template_subject,
      body: row.template_body,
      contentTier: row.template_content_tier,
    },
    enrollment: {
      status: row.enrollment_status as EnrollmentView["status"],
      currentStep: row.current_step,
      maxSteps: row.max_steps,
      lastSentAt: row.last_sent_at,
      delayDays: row.delay_days,
    },
  };
}
