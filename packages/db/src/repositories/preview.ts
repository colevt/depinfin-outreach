/**
 * What the dispatcher is about to do, before it does it.
 *
 * Section 9 item 2 asks for "what will dispatch, and what was skipped with the
 * reason". The log answers the second half after the fact. This answers the
 * first half in advance, so an operator sees tomorrow's skips in time to fix
 * them rather than reading about them the next morning.
 *
 * `listSendPreviewRows` is deliberately BROADER than `dispatch_candidates`.
 * The view exists to make an ineligible prospect unreachable, so a Tier 1
 * contact, a suppressed address, and an excluded jurisdiction are simply not
 * in it. That is correct for dispatch and useless for a preview, which has to
 * show the held rows in order to explain why they are held.
 *
 * That difference makes this function the single most dangerous thing in this
 * package: it returns rows the dispatcher must never see. The worker does not
 * read it, `packages/db/test/preview-not-dispatch.test.ts` asserts that it
 * does not, and nothing here is used to send anything. Every row it returns is
 * handed to `evaluateSend` in packages/compliance for a verdict, and the
 * verdict is what the operator reads.
 *
 * Same conventions as the other repositories: type aliases for row shapes,
 * ISO strings with an explicit cast on the way in, `hydrateDates` on the way
 * out.
 */

import { sql } from "drizzle-orm";
import type {
  EnrollmentStatus,
  EnrollmentView,
  Jurisdiction,
  ProspectView,
  TemplateView,
  Tier,
  TransportKind,
} from "@depinfin/compliance";
import type { Database } from "../client.js";
import { hydrateDates } from "../rows.js";

export interface SendPreviewRow {
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

type PreviewSqlRow = {
  enrollment_id: string;
  enrollment_status: EnrollmentStatus;
  current_step: number;
  last_sent_at: Date | null;
  next_due_at: Date | null;
  sequence_id: string;
  sequence_name: string;
  sequence_transport: TransportKind;
  max_steps: number;
  step_number: number;
  delay_days: number;
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
 * Enrollments whose next step falls inside the window, whether or not they are
 * eligible. Eligibility is not decided here and must not be: that is what
 * `evaluateSend` is for.
 */
export async function listSendPreviewRows(
  db: Database,
  now: Date,
  windowHours = 24,
): Promise<SendPreviewRow[]> {
  const end = new Date(startOfDayUtc(now).getTime() + windowHours * 60 * 60 * 1000);

  const rows = await db.execute<PreviewSqlRow>(sql`
    SELECT
      e.id                AS enrollment_id,
      e.status            AS enrollment_status,
      e.current_step,
      e.last_sent_at,
      e.next_due_at,
      s.id                AS sequence_id,
      s.name              AS sequence_name,
      s.transport         AS sequence_transport,
      s.max_steps,
      st.step_number,
      st.delay_days,
      t.key               AS template_key,
      t.subject           AS template_subject,
      t.body              AS template_body,
      t.content_tier      AS template_content_tier,
      c.id                AS contact_id,
      c.email::text       AS email,
      c.first_name,
      c.last_name,
      c.title,
      c.personal_reason,
      c.do_not_contact,
      f.name              AS firm_name,
      f.tier,
      f.jurisdiction::text AS jurisdiction
    FROM enrollments e
    JOIN sequences s ON s.id = e.sequence_id AND s.active
    JOIN sequence_steps st
      ON st.sequence_id = s.id
     AND st.step_number = e.current_step + 1
    JOIN templates t ON t.id = st.template_id
    JOIN contacts c ON c.id = e.contact_id
    JOIN firms f ON f.id = c.firm_id
    WHERE e.status IN ('active', 'paused', 'manual_only')
      AND c.email IS NOT NULL
      AND (
        e.next_due_at IS NULL
        OR e.last_sent_at IS NULL
        OR e.next_due_at < ${end.toISOString()}::timestamptz
      )
    ORDER BY e.next_due_at NULLS FIRST, e.id
  `);

  return hydrateDates([...rows], ["last_sent_at", "next_due_at"]).map(toPreviewRow);
}

function toPreviewRow(row: PreviewSqlRow): SendPreviewRow {
  return {
    enrollmentId: row.enrollment_id,
    sequenceId: row.sequence_id,
    sequenceName: row.sequence_name,
    sequenceTransport: row.sequence_transport,
    stepNumber: row.step_number,
    nextDueAt: row.next_due_at,
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
      status: row.enrollment_status,
      currentStep: row.current_step,
      maxSteps: row.max_steps,
      lastSentAt: row.last_sent_at,
      delayDays: row.delay_days,
    },
  };
}

export type CalendarRow = {
  enrollment_id: string;
  contact_id: string;
  name: string;
  firm_name: string;
  tier: number | null;
  due_at: Date | null;
  sequence_name: string;
  next_step_number: number;
};

/**
 * Section 9 item 4. What is due over the next few days, for the strip beside
 * the queue. Anything already overdue is returned with its original due date
 * so the caller can decide where to show it, rather than being silently
 * folded into today.
 */
export async function listCalendarWindow(
  db: Database,
  now: Date,
  days = 7,
): Promise<CalendarRow[]> {
  const start = startOfDayUtc(now);
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);

  const rows = await db.execute<CalendarRow>(sql`
    SELECT
      e.id                                        AS enrollment_id,
      c.id                                        AS contact_id,
      btrim(c.first_name || ' ' || coalesce(c.last_name, '')) AS name,
      f.name                                      AS firm_name,
      f.tier,
      coalesce(e.next_due_at, e.last_sent_at)     AS due_at,
      s.name                                      AS sequence_name,
      st.step_number                              AS next_step_number
    FROM enrollments e
    JOIN contacts c ON c.id = e.contact_id
    JOIN firms f ON f.id = c.firm_id
    JOIN sequences s ON s.id = e.sequence_id
    JOIN sequence_steps st
      ON st.sequence_id = s.id
     AND st.step_number = e.current_step + 1
    WHERE e.status = 'active'
      AND (
        (e.next_due_at >= ${start.toISOString()}::timestamptz
         AND e.next_due_at < ${end.toISOString()}::timestamptz)
        OR (e.next_due_at IS NULL AND e.last_sent_at IS NULL)
        OR e.next_due_at < ${start.toISOString()}::timestamptz
      )
    ORDER BY e.next_due_at NULLS FIRST, c.first_name
  `);

  // `due_at` stays null for an enrollment that has never been sent and has no
  // next_due_at. It is tempting to substitute the start of the day here, but
  // that start is a UTC boundary and the strip buckets by local day: in New
  // York it lands four or five hours into the previous day, and every
  // never-scheduled enrollment renders as overdue. The caller knows what
  // "now" means for the operator, so it decides.
  return hydrateDates([...rows], ["due_at"]);
}

function startOfDayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Every active suppression, for evaluating a whole preview in one pass.
 *
 * The per-address lookup in `desk.ts` is the right call for a single draft.
 * Calling it once per preview row would be one query per prospect, and the
 * gates take the list anyway.
 */
export async function listActiveSuppressions(
  db: Database,
): Promise<{ value: string; matchType: "email" | "domain"; active: boolean }[]> {
  const rows = await db.execute<{ value: string; match_type: "email" | "domain" }>(sql`
    SELECT value::text AS value, match_type::text AS match_type
    FROM suppressions WHERE active
  `);
  return [...rows].map((row) => ({
    value: row.value,
    matchType: row.match_type,
    active: true,
  }));
}
