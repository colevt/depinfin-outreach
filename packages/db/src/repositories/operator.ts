/**
 * Operator reads and writes. These queries are for the UI, not for dispatch.
 *
 * Automated sending still goes through dispatch_candidates and nothing else.
 * A preview row that happens to include a Tier 1 prospect is shown so the
 * operator can see the skip reason. It is never handed to a transport.
 */

import { and, desc, eq, gte, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database } from "../client.js";
import {
  activityLog,
  contacts,
  enrollments,
  firms,
  sequenceSteps,
  sequences,
  suppressions,
} from "../schema.js";
import type {
  EnrollmentStatus,
  EnrollmentView,
  Jurisdiction,
  ProspectView,
  SuppressionEntry,
  TemplateView,
  Tier,
  TransportKind,
} from "@depinfin/compliance";

export interface ScoreFactors {
  readonly mandateFit: 1 | 2 | 3 | 4 | 5;
  readonly ticketFit: 1 | 2 | 3 | 4 | 5;
  readonly categoryLiteracy: 1 | 2 | 3 | 4 | 5;
  readonly warmPath: 1 | 2 | 3 | 4 | 5;
  readonly decisionSpeed: 1 | 2 | 3 | 4 | 5;
}

export interface ImportedProspect {
  readonly firmName: string;
  readonly jurisdiction: Jurisdiction;
  readonly firstName: string;
  readonly lastName: string | null;
  readonly title: string | null;
  readonly email: string | null;
  readonly linkedinUrl: string | null;
  readonly personalReason: string | null;
  readonly warmPathContact: string | null;
  readonly decisionRole: "principal" | "cio" | "analyst" | "gatekeeper" | null;
  readonly firmType:
    | "single_family_office"
    | "multi_family_office"
    | "ria"
    | "ocio"
    | "crypto_fund"
    | "rwa_fund"
    | "infra_fund"
    | "individual_hnw"
    | "ecosystem_principal"
    | null;
  readonly aumBand: "under_100m" | "100m_500m" | "500m_1b" | "over_1b" | null;
  readonly mandateTags: readonly string[];
  readonly typicalTicketUsd: string | null;
  readonly decisionSpeed: "fast" | "medium" | "slow" | null;
  readonly depinFamiliarity: "high" | "medium" | "none" | null;
  readonly source: string | null;
  readonly notes: string | null;
}

export interface QueueRow {
  readonly enrollmentId: string;
  readonly contactId: string;
  readonly firmId: string;
  readonly repliedAt: Date | null;
  readonly updatedAt: Date;
  readonly firstName: string;
  readonly lastName: string | null;
  readonly title: string | null;
  readonly email: string | null;
  readonly firmName: string;
  readonly tier: Tier | null;
  readonly jurisdiction: Jurisdiction;
  readonly sequenceName: string;
  readonly transport: TransportKind;
  readonly personalReason: string | null;
  readonly warmPathContact: string | null;
  readonly linkedinUrl: string | null;
  readonly replySnippet: string | null;
}

export interface CalendarRow {
  readonly enrollmentId: string;
  readonly contactId: string;
  readonly firstName: string;
  readonly lastName: string | null;
  readonly firmName: string;
  readonly tier: Tier | null;
  readonly dueAt: Date;
  readonly sequenceName: string;
  readonly nextStepNumber: number;
}

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

export interface DirectoryRow {
  readonly contactId: string;
  readonly firmId: string;
  readonly firstName: string;
  readonly lastName: string | null;
  readonly title: string | null;
  readonly email: string | null;
  readonly firmName: string;
  readonly jurisdiction: Jurisdiction;
  readonly tier: Tier | null;
  readonly score: number | null;
  readonly personalReason: string | null;
  readonly doNotContact: boolean;
  readonly enrollmentStatus: EnrollmentStatus | null;
}

export interface ProspectEnrollment {
  readonly enrollmentId: string;
  readonly sequenceId: string;
  readonly sequenceName: string;
  readonly transport: TransportKind;
  readonly status: EnrollmentStatus;
  readonly currentStep: number;
  readonly maxSteps: number;
  readonly lastSentAt: Date | null;
  readonly nextDueAt: Date | null;
  readonly threadId: string | null;
  readonly repliedAt: Date | null;
}

export interface ProspectRecord {
  readonly contactId: string;
  readonly firmId: string;
  readonly firstName: string;
  readonly lastName: string | null;
  readonly title: string | null;
  readonly email: string | null;
  readonly emailStatus: string;
  readonly linkedinUrl: string | null;
  readonly decisionRole: string | null;
  readonly personalReason: string | null;
  readonly warmPathContact: string | null;
  readonly doNotContact: boolean;
  readonly firmName: string;
  readonly firmType: string | null;
  readonly aumBand: string | null;
  readonly jurisdiction: Jurisdiction;
  readonly mandateTags: readonly string[];
  readonly typicalTicketUsd: string | null;
  readonly decisionSpeed: string | null;
  readonly depinFamiliarity: string | null;
  readonly source: string | null;
  readonly score: number | null;
  readonly tier: Tier | null;
  readonly scoreFactors: ScoreFactors | null;
  readonly notes: string | null;
  readonly enrollments: readonly ProspectEnrollment[];
}

export interface ActivityRow {
  readonly id: string;
  readonly occurredAt: Date;
  readonly actor: string;
  readonly action: string;
  readonly templateKey: string | null;
  readonly detail: Record<string, unknown>;
}

export interface ExistingPerson {
  readonly email: string | null;
  readonly firmName: string;
  readonly firstName: string;
  readonly lastName: string | null;
}

/**
 * Section 9.1. Everything in `replied`, newest first. This is the home screen.
 */
export async function listActionQueue(db: Database): Promise<QueueRow[]> {
  const replyLog = alias(activityLog, "reply_log");

  const rows = await db
    .select({
      enrollmentId: enrollments.id,
      contactId: contacts.id,
      firmId: firms.id,
      repliedAt: enrollments.repliedAt,
      updatedAt: enrollments.updatedAt,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      title: contacts.title,
      email: contacts.email,
      firmName: firms.name,
      tier: firms.tier,
      jurisdiction: firms.jurisdiction,
      sequenceName: sequences.name,
      transport: sequences.transport,
      personalReason: contacts.personalReason,
      warmPathContact: contacts.warmPathContact,
      linkedinUrl: contacts.linkedinUrl,
      replySnippet: sql<string | null>`(
        SELECT ${replyLog.detail}->>'from'
        FROM ${replyLog}
        WHERE ${replyLog.enrollmentId} = ${enrollments.id}
          AND ${replyLog.action} = 'reply'
        ORDER BY ${replyLog.occurredAt} DESC
        LIMIT 1
      )`,
    })
    .from(enrollments)
    .innerJoin(contacts, eq(contacts.id, enrollments.contactId))
    .innerJoin(firms, eq(firms.id, contacts.firmId))
    .innerJoin(sequences, eq(sequences.id, enrollments.sequenceId))
    .where(eq(enrollments.status, "replied"))
    .orderBy(sql`${enrollments.repliedAt} DESC NULLS LAST`, desc(enrollments.updatedAt));

  return rows.map((row) => ({
    ...row,
    email: row.email ?? null,
    tier: (row.tier as Tier | null) ?? null,
    replySnippet: row.replySnippet ?? null,
  }));
}

/**
 * Section 9.4. Active enrollments due in the next seven days, plus anything
 * already overdue, so this morning's strip shows work that slipped.
 */
export async function listCalendarWindow(
  db: Database,
  now: Date,
  days = 7,
): Promise<CalendarRow[]> {
  const start = startOfUtcDay(now);
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      enrollmentId: enrollments.id,
      contactId: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      firmName: firms.name,
      tier: firms.tier,
      dueAt: enrollments.nextDueAt,
      lastSentAt: enrollments.lastSentAt,
      delayDays: sequenceSteps.delayDays,
      sequenceName: sequences.name,
      nextStepNumber: sequenceSteps.stepNumber,
    })
    .from(enrollments)
    .innerJoin(contacts, eq(contacts.id, enrollments.contactId))
    .innerJoin(firms, eq(firms.id, contacts.firmId))
    .innerJoin(sequences, eq(sequences.id, enrollments.sequenceId))
    .innerJoin(
      sequenceSteps,
      and(
        eq(sequenceSteps.sequenceId, sequences.id),
        eq(sequenceSteps.stepNumber, sql`${enrollments.currentStep} + 1`),
      ),
    )
    .where(
      and(
        eq(enrollments.status, "active"),
        or(
          and(gte(enrollments.nextDueAt, start), lt(enrollments.nextDueAt, end)),
          and(sql`${enrollments.nextDueAt} IS NULL`, sql`${enrollments.lastSentAt} IS NULL`),
          sql`${enrollments.nextDueAt} < ${start}`,
        ),
      ),
    )
    .orderBy(sql`${enrollments.nextDueAt} NULLS FIRST`);

  return rows.map((row) => ({
    enrollmentId: row.enrollmentId,
    contactId: row.contactId,
    firstName: row.firstName,
    lastName: row.lastName,
    firmName: row.firmName,
    tier: (row.tier as Tier | null) ?? null,
    dueAt: row.dueAt ?? row.lastSentAt ?? start,
    sequenceName: row.sequenceName,
    nextStepNumber: row.nextStepNumber,
  }));
}

/**
 * Rows the operator should evaluate for today's send desk.
 *
 * This is not dispatch_candidates. It is broader on purpose, so a Tier 1,
 * suppressed, or excluded-jurisdiction prospect still appears, with the
 * reason coming from evaluateSend. The worker never reads this function.
 */
export async function listSendPreviewRows(db: Database, now: Date): Promise<SendPreviewRow[]> {
  const end = new Date(startOfUtcDay(now).getTime() + 24 * 60 * 60 * 1000);

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

  const rows = (await db.execute(sql`
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
      c.email,
      c.first_name,
      c.last_name,
      c.title,
      c.personal_reason,
      c.do_not_contact,
      f.name              AS firm_name,
      f.tier,
      f.jurisdiction
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
      AND t.content_tier = 'corporate'
      AND (
        e.next_due_at IS NULL
        OR e.next_due_at < ${end}
        OR e.last_sent_at IS NULL
      )
    ORDER BY e.next_due_at NULLS FIRST, e.id
  `)) as unknown as PreviewSqlRow[];

  return rows.map((row) => ({
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
  }));
}

export async function listTodaysLog(db: Database, now: Date) {
  const start = startOfUtcDay(now);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return db
    .select({
      id: activityLog.id,
      occurredAt: activityLog.occurredAt,
      actor: activityLog.actor,
      action: activityLog.action,
      templateKey: activityLog.templateKey,
      detail: activityLog.detail,
      contactId: activityLog.contactId,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      firmName: firms.name,
    })
    .from(activityLog)
    .leftJoin(contacts, eq(contacts.id, activityLog.contactId))
    .leftJoin(firms, eq(firms.id, contacts.firmId))
    .where(
      and(
        gte(activityLog.occurredAt, start),
        lt(activityLog.occurredAt, end),
        sql`${activityLog.action} IN ('sent', 'skipped', 'blocked', 'error')`,
      ),
    )
    .orderBy(desc(activityLog.occurredAt));
}

export async function listActiveSuppressions(db: Database): Promise<SuppressionEntry[]> {
  const rows = await db.select().from(suppressions).where(eq(suppressions.active, true));
  return rows.map((row) => ({
    value: row.value,
    matchType: row.matchType,
    active: row.active,
  }));
}

export async function getProspect(db: Database, contactId: string): Promise<ProspectRecord | null> {
  const contactRows = await db
    .select({
      contactId: contacts.id,
      firmId: firms.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      title: contacts.title,
      email: contacts.email,
      emailStatus: contacts.emailStatus,
      linkedinUrl: contacts.linkedinUrl,
      decisionRole: contacts.decisionRole,
      personalReason: contacts.personalReason,
      warmPathContact: contacts.warmPathContact,
      doNotContact: contacts.doNotContact,
      firmName: firms.name,
      firmType: firms.type,
      aumBand: firms.aumBand,
      jurisdiction: firms.jurisdiction,
      mandateTags: firms.mandateTags,
      typicalTicketUsd: firms.typicalTicketUsd,
      decisionSpeed: firms.decisionSpeed,
      depinFamiliarity: firms.depinFamiliarity,
      source: firms.source,
      score: firms.score,
      tier: firms.tier,
      scoreFactors: firms.scoreFactors,
      notes: firms.notes,
    })
    .from(contacts)
    .innerJoin(firms, eq(firms.id, contacts.firmId))
    .where(eq(contacts.id, contactId))
    .limit(1);

  const contact = contactRows[0];
  if (!contact) return null;

  const enrollmentRows = await db
    .select({
      enrollmentId: enrollments.id,
      sequenceId: sequences.id,
      sequenceName: sequences.name,
      transport: sequences.transport,
      status: enrollments.status,
      currentStep: enrollments.currentStep,
      maxSteps: sequences.maxSteps,
      lastSentAt: enrollments.lastSentAt,
      nextDueAt: enrollments.nextDueAt,
      threadId: enrollments.threadId,
      repliedAt: enrollments.repliedAt,
    })
    .from(enrollments)
    .innerJoin(sequences, eq(sequences.id, enrollments.sequenceId))
    .where(eq(enrollments.contactId, contactId));

  return {
    ...contact,
    email: contact.email ?? null,
    typicalTicketUsd: contact.typicalTicketUsd ?? null,
    tier: (contact.tier as Tier | null) ?? null,
    scoreFactors: (contact.scoreFactors as ScoreFactors | null) ?? null,
    enrollments: enrollmentRows,
  };
}

export async function listActivityForContact(db: Database, contactId: string): Promise<ActivityRow[]> {
  const rows = await db
    .select({
      id: activityLog.id,
      occurredAt: activityLog.occurredAt,
      actor: activityLog.actor,
      action: activityLog.action,
      templateKey: activityLog.templateKey,
      detail: activityLog.detail,
    })
    .from(activityLog)
    .where(eq(activityLog.contactId, contactId))
    .orderBy(desc(activityLog.occurredAt))
    .limit(200);

  return rows.map((row) => ({
    id: String(row.id),
    occurredAt: row.occurredAt,
    actor: row.actor,
    action: row.action,
    templateKey: row.templateKey,
    detail: (row.detail ?? {}) as Record<string, unknown>,
  }));
}

export async function listDirectory(db: Database): Promise<DirectoryRow[]> {
  type DirectorySqlRow = {
    contact_id: string;
    firm_id: string;
    first_name: string;
    last_name: string | null;
    title: string | null;
    email: string | null;
    firm_name: string;
    jurisdiction: Jurisdiction;
    tier: number | null;
    score: number | null;
    personal_reason: string | null;
    do_not_contact: boolean;
    enrollment_status: EnrollmentStatus | null;
  };

  const rows = (await db.execute(sql`
    SELECT DISTINCT ON (c.id)
      c.id AS contact_id,
      f.id AS firm_id,
      c.first_name,
      c.last_name,
      c.title,
      c.email,
      f.name AS firm_name,
      f.jurisdiction,
      f.tier,
      f.score,
      c.personal_reason,
      c.do_not_contact,
      e.status AS enrollment_status
    FROM contacts c
    JOIN firms f ON f.id = c.firm_id
    LEFT JOIN enrollments e ON e.contact_id = c.id
    ORDER BY
      c.id,
      CASE e.status
        WHEN 'replied' THEN 0
        WHEN 'active' THEN 1
        WHEN 'paused' THEN 2
        WHEN 'manual_only' THEN 3
        WHEN 'not_started' THEN 4
        ELSE 5
      END
  `)) as unknown as DirectorySqlRow[];

  return rows
    .map((row) => ({
      contactId: row.contact_id,
      firmId: row.firm_id,
      firstName: row.first_name,
      lastName: row.last_name,
      title: row.title,
      email: row.email,
      firmName: row.firm_name,
      jurisdiction: row.jurisdiction,
      tier: (row.tier as Tier | null) ?? null,
      score: row.score,
      personalReason: row.personal_reason,
      doNotContact: row.do_not_contact,
      enrollmentStatus: row.enrollment_status,
    }))
    .sort((a, b) => a.firmName.localeCompare(b.firmName) || a.firstName.localeCompare(b.firstName));
}

export async function listExistingPeople(db: Database): Promise<ExistingPerson[]> {
  const rows = await db
    .select({
      email: contacts.email,
      firmName: firms.name,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
    .from(contacts)
    .innerJoin(firms, eq(firms.id, contacts.firmId));

  return rows.map((row) => ({
    email: row.email ?? null,
    firmName: row.firmName,
    firstName: row.firstName,
    lastName: row.lastName,
  }));
}

export async function getEnrollment(db: Database, enrollmentId: string) {
  const rows = await db
    .select({
      enrollmentId: enrollments.id,
      contactId: enrollments.contactId,
      status: enrollments.status,
      firmId: firms.id,
      currentTier: firms.tier,
    })
    .from(enrollments)
    .innerJoin(contacts, eq(contacts.id, enrollments.contactId))
    .innerJoin(firms, eq(firms.id, contacts.firmId))
    .where(eq(enrollments.id, enrollmentId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    currentTier: (row.currentTier as Tier | null) ?? null,
  };
}

export async function insertImportedRow(
  db: Database,
  row: ImportedProspect,
): Promise<{ firmId: string; contactId: string; createdFirm: boolean }> {
  const existingFirm = await db
    .select({ id: firms.id })
    .from(firms)
    .where(sql`lower(${firms.name}) = ${row.firmName.trim().toLowerCase()}`)
    .limit(1);

  let firmId = existingFirm[0]?.id;
  let createdFirm = false;

  if (!firmId) {
    const inserted = await db
      .insert(firms)
      .values({
        name: row.firmName,
        type: row.firmType,
        aumBand: row.aumBand,
        jurisdiction: row.jurisdiction,
        mandateTags: [...row.mandateTags],
        typicalTicketUsd: row.typicalTicketUsd,
        decisionSpeed: row.decisionSpeed,
        depinFamiliarity: row.depinFamiliarity,
        source: row.source,
        notes: row.notes,
      })
      .returning({ id: firms.id });
    firmId = inserted[0]!.id;
    createdFirm = true;
  }

  const insertedContact = await db
    .insert(contacts)
    .values({
      firmId,
      firstName: row.firstName,
      lastName: row.lastName,
      title: row.title,
      email: row.email,
      linkedinUrl: row.linkedinUrl,
      decisionRole: row.decisionRole,
      personalReason: row.personalReason,
      warmPathContact: row.warmPathContact,
    })
    .returning({ id: contacts.id });

  return { firmId, contactId: insertedContact[0]!.id, createdFirm };
}

export async function updateFirmScore(
  db: Database,
  firmId: string,
  input: {
    score: number;
    tier: Tier;
    factors: ScoreFactors;
  },
): Promise<void> {
  await db
    .update(firms)
    .set({
      score: input.score,
      tier: input.tier,
      scoreFactors: input.factors,
      updatedAt: new Date(),
    })
    .where(eq(firms.id, firmId));
}

export async function getFirmForRescore(db: Database, firmId: string) {
  const rows = await db
    .select({
      firmId: firms.id,
      name: firms.name,
      tier: firms.tier,
      scoreFactors: firms.scoreFactors,
      enrollmentStatus: enrollments.status,
    })
    .from(firms)
    .leftJoin(contacts, eq(contacts.firmId, firms.id))
    .leftJoin(enrollments, eq(enrollments.contactId, contacts.id))
    .where(eq(firms.id, firmId))
    .orderBy(sql`CASE WHEN ${enrollments.status} = 'manual_only' THEN 0 ELSE 1 END`)
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    firmId: row.firmId,
    name: row.name,
    tier: (row.tier as Tier | null) ?? null,
    scoreFactors: (row.scoreFactors as ScoreFactors | null) ?? null,
    enrollmentStatus: (row.enrollmentStatus as EnrollmentStatus | null) ?? null,
  };
}

function startOfUtcDay(now: Date): Date {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}
