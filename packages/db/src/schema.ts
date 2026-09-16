/**
 * Drizzle mirror of migrations/0002_schema.sql.
 *
 * The SQL files are authoritative. This file exists for typed queries, not to
 * generate the schema, because the invariants that matter here are database
 * permissions and check constraints that a schema generator would not express.
 */

import {
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const citext = customType<{ data: string }>({ dataType: () => "citext" });

export const firmTypeEnum = pgEnum("firm_type", [
  "single_family_office", "multi_family_office", "ria", "ocio",
  "crypto_fund", "rwa_fund", "infra_fund", "individual_hnw", "ecosystem_principal",
]);
export const aumBandEnum = pgEnum("aum_band", ["under_100m", "100m_500m", "500m_1b", "over_1b"]);
export const jurisdictionEnum = pgEnum("jurisdiction", ["us", "non_us", "eu", "uk", "eea"]);
export const decisionSpeedEnum = pgEnum("decision_speed", ["fast", "medium", "slow"]);
export const depinFamiliarityEnum = pgEnum("depin_familiarity", ["high", "medium", "none"]);
export const emailStatusEnum = pgEnum("email_status", ["unverified", "valid", "invalid", "bounced"]);
export const decisionRoleEnum = pgEnum("decision_role", ["principal", "cio", "analyst", "gatekeeper"]);
export const transportKindEnum = pgEnum("transport_kind", ["warm", "cold"]);
export const enrollmentStatusEnum = pgEnum("enrollment_status", [
  "not_started", "active", "paused", "replied", "stopped", "completed", "manual_only",
]);
export const suppressionMatchTypeEnum = pgEnum("suppression_match_type", ["email", "domain"]);
export const activityActionEnum = pgEnum("activity_action", [
  "sent", "skipped", "blocked", "error", "reply", "opt_out",
  "stage_change", "enrolled", "unenrolled", "rescored",
]);
/** INV-6. Both values exist so offering_documents can be typed. Only
 *  'corporate' is accepted by templates, enforced by a check constraint. */
export const contentTierEnum = pgEnum("content_tier", ["corporate", "offering"]);

export const firms = pgTable("firms", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: firmTypeEnum("type"),
  aumBand: aumBandEnum("aum_band"),
  domicileCountry: text("domicile_country"),
  domicileRegion: text("domicile_region"),
  jurisdiction: jurisdictionEnum("jurisdiction").notNull(),
  mandateTags: text("mandate_tags").array().notNull().default([]),
  typicalTicketUsd: numeric("typical_ticket_usd"),
  decisionSpeed: decisionSpeedEnum("decision_speed"),
  depinFamiliarity: depinFamiliarityEnum("depin_familiarity"),
  source: text("source"),
  score: integer("score"),
  tier: integer("tier"),
  /** Inputs the score was computed from, so a rescore is recomputable. */
  scoreFactors: jsonb("score_factors").$type<{
    mandateFit: number;
    ticketFit: number;
    categoryLiteracy: number;
    warmPath: number;
    decisionSpeed: number;
  }>(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id").notNull().references(() => firms.id),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    title: text("title"),
    email: citext("email").unique(),
    emailStatus: emailStatusEnum("email_status").notNull().default("unverified"),
    linkedinUrl: text("linkedin_url"),
    decisionRole: decisionRoleEnum("decision_role"),
    personalReason: text("personal_reason"),
    warmPathContact: text("warm_path_contact"),
    doNotContact: boolean("do_not_contact").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({ firmIdx: index("contacts_firm_id_idx").on(table.firmId) }),
);

export const templates = pgTable("templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  contentTier: contentTierEnum("content_tier").notNull().default("corporate"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** INV-6. Present so nothing writes offering material into templates. Nothing
 *  in this codebase joins it to a sequence, because no such join exists. */
export const offeringDocuments = pgTable("offering_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  storageRef: text("storage_ref").notNull(),
  contentTier: contentTierEnum("content_tier").notNull().default("offering"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sequences = pgTable("sequences", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  transport: transportKindEnum("transport").notNull(),
  maxSteps: integer("max_steps").notNull().default(5),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sequenceSteps = pgTable(
  "sequence_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sequenceId: uuid("sequence_id").notNull().references(() => sequences.id),
    stepNumber: integer("step_number").notNull(),
    delayDays: integer("delay_days").notNull().default(0),
    templateId: uuid("template_id").notNull().references(() => templates.id),
    replyInThread: boolean("reply_in_thread").notNull().default(true),
  },
  (table) => ({ stepUnique: unique().on(table.sequenceId, table.stepNumber) }),
);

export const enrollments = pgTable(
  "enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id").notNull().references(() => contacts.id),
    sequenceId: uuid("sequence_id").notNull().references(() => sequences.id),
    status: enrollmentStatusEnum("status").notNull().default("not_started"),
    currentStep: integer("current_step").notNull().default(0),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    nextDueAt: timestamp("next_due_at", { withTimezone: true }),
    threadId: text("thread_id"),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    enrollmentUnique: unique().on(table.contactId, table.sequenceId),
    dueIdx: index("enrollments_due_idx").on(table.status, table.nextDueAt),
  }),
);

/** INV-4. The application role has INSERT and UPDATE here, never DELETE. */
export const suppressions = pgTable("suppressions", {
  id: uuid("id").primaryKey().defaultRandom(),
  value: citext("value").notNull(),
  matchType: suppressionMatchTypeEnum("match_type").notNull(),
  reason: text("reason").notNull(),
  actor: text("actor").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  active: boolean("active").notNull().default(true),
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  deactivatedBy: text("deactivated_by"),
  deactivationReason: text("deactivation_reason"),
});

/** INV-5. The application role has SELECT and INSERT here. Nothing else. */
export const activityLog = pgTable("activity_log", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  actor: text("actor").notNull(),
  contactId: uuid("contact_id").references(() => contacts.id),
  enrollmentId: uuid("enrollment_id").references(() => enrollments.id),
  action: activityActionEnum("action").notNull(),
  templateKey: text("template_key"),
  detail: jsonb("detail").notNull().default({}),
});

export const excludedJurisdictions = pgTable("excluded_jurisdictions", {
  jurisdiction: jurisdictionEnum("jurisdiction").primaryKey(),
  reason: text("reason").notNull(),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
});
