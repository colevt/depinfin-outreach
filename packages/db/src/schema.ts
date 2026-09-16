/**
 * Drizzle mirror of migrations/0002_schema.sql and 0006_desk.sql.
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

/** Buy side is investors. Sell side is the operators who raise through us. */
export const marketSideEnum = pgEnum("market_side", ["buy", "sell"]);
export const operatorCategoryEnum = pgEnum("operator_category", [
  "telecom", "compute", "energy", "sensing", "mobility",
  "storage", "protocol_foundation", "hardware_oem", "other",
]);
export const templateStageEnum = pgEnum("template_stage", [
  "first_touch", "follow_up", "reply", "breakup",
]);
export const draftKindEnum = pgEnum("draft_kind", ["first_touch", "follow_up", "reply"]);
export const draftStatusEnum = pgEnum("draft_status", ["draft", "approved", "sent", "discarded"]);
/** INV-8. A LinkedIn draft is copied out and sent by a human. */
export const draftChannelEnum = pgEnum("draft_channel", ["email", "linkedin"]);
export const searchChannelEnum = pgEnum("search_channel", ["linkedin", "web"]);

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
  notes: text("notes"),
  side: marketSideEnum("side").notNull().default("buy"),
  operatorCategory: operatorCategoryEnum("operator_category"),
  sectorThesis: text("sector_thesis"),
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
  side: marketSideEnum("side").notNull().default("buy"),
  stage: templateStageEnum("stage").notNull().default("first_touch"),
  /** Empty means any prospect type on that side. */
  audienceFirmTypes: firmTypeEnum("audience_firm_types").array().notNull().default([]),
  audienceOperatorCategories: operatorCategoryEnum("audience_operator_categories")
    .array().notNull().default([]),
  notes: text("notes"),
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

/**
 * Per-prospect composed mail. Two check constraints in 0006 do real work and
 * are not expressible here: a draft cannot leave draft status while
 * `lintClean` is false (INV-2), and a LinkedIn draft cannot carry a transport
 * (INV-8). Read 0006_desk.sql for what the database will actually refuse.
 */
export const drafts = pgTable(
  "drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id").notNull().references(() => contacts.id),
    templateId: uuid("template_id").references(() => templates.id),
    kind: draftKindEnum("kind").notNull(),
    channel: draftChannelEnum("channel").notNull().default("email"),
    subject: text("subject").notNull().default(""),
    body: text("body").notNull(),
    status: draftStatusEnum("status").notNull().default("draft"),
    contentTier: contentTierEnum("content_tier").notNull().default("corporate"),
    lintClean: boolean("lint_clean").notNull().default(false),
    lintFindings: jsonb("lint_findings").notNull().default([]),
    transport: transportKindEnum("transport"),
    threadId: text("thread_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({ contactIdx: index("drafts_contact_idx").on(table.contactId, table.createdAt) }),
);

/**
 * INV-8. Criteria, plus the query text and URL built from them. The operator
 * opens the URL themselves. Nothing in this system fetches it.
 */
export const savedSearches = pgTable("saved_searches", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  side: marketSideEnum("side").notNull(),
  channel: searchChannelEnum("channel").notNull(),
  criteria: jsonb("criteria").notNull(),
  queryText: text("query_text").notNull(),
  url: text("url").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
});

/** Research with its sources. Section 13: a market figure without a source is
 *  not usable in copy, and `sources` is what makes that checkable. */
export const researchNotes = pgTable("research_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  firmId: uuid("firm_id").references(() => firms.id),
  contactId: uuid("contact_id").references(() => contacts.id),
  headline: text("headline").notNull(),
  body: text("body").notNull(),
  sources: jsonb("sources").notNull().default([]),
  provider: text("provider").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Section 11. Read-only to the application role, on purpose. */
export const counselSignoffs = pgTable("counsel_signoffs", {
  item: text("item").primaryKey(),
  signedOff: boolean("signed_off").notNull().default(false),
  counsel: text("counsel").notNull(),
  reference: text("reference"),
  recordedBy: text("recorded_by").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row, keyed on a boolean. `coldOutreachEnabled` is guarded by a trigger
 * that refuses to switch it on without a recorded counsel sign-off.
 */
export const automationSettings = pgTable("automation_settings", {
  id: boolean("id").primaryKey().default(true),
  sequencesEnabled: boolean("sequences_enabled").notNull().default(false),
  dailySendCap: integer("daily_send_cap").notNull().default(40),
  sendWindowStart: text("send_window_start").notNull().default("08:00"),
  sendWindowEnd: text("send_window_end").notNull().default("17:00"),
  sendDays: integer("send_days").array().notNull().default([1, 2, 3, 4, 5]),
  sendTimezone: text("send_timezone").notNull().default("America/New_York"),
  coldOutreachEnabled: boolean("cold_outreach_enabled").notNull().default(false),
  digestEnabled: boolean("digest_enabled").notNull().default(true),
  digestHour: integer("digest_hour").notNull().default(7),
  digestTimezone: text("digest_timezone").notNull().default("America/New_York"),
  updatedBy: text("updated_by").notNull().default("system"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const internalDomains = pgTable("internal_domains", {
  domain: citext("domain").primaryKey(),
  addedBy: text("added_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Constrained by trigger to internal domains. The digest carries prospect
 *  data, so it must never be addressable to a prospect. */
export const digestRecipients = pgTable("digest_recipients", {
  address: citext("address").primaryKey(),
  label: text("label").notNull(),
  active: boolean("active").notNull().default(true),
  addedBy: text("added_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
