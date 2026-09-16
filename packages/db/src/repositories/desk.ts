/**
 * Reads and writes behind the operator desk.
 *
 * The UI calls these. It does not write SQL, and it does not decide
 * eligibility: anything the desk shows about whether a message may go out
 * comes from packages/compliance.
 *
 * Same conventions as the digest repository. Row shapes are type aliases,
 * timestamps are interpolated as ISO strings with an explicit cast, and
 * timestamps coming back are hydrated to real Dates, because `execute` returns
 * them as strings whatever the row type says.
 */

import { sql } from "drizzle-orm";
import type { Database } from "../client.js";
import { hydrateDates } from "../rows.js";

export type ProspectListRow = {
  contact_id: string;
  first_name: string;
  last_name: string | null;
  name: string;
  title: string | null;
  email: string | null;
  linkedin_url: string | null;
  personal_reason: string | null;
  do_not_contact: boolean;
  decision_role: string | null;
  firm_id: string;
  firm_name: string;
  firm_type: string | null;
  operator_category: string | null;
  side: "buy" | "sell";
  jurisdiction: string;
  tier: number | null;
  score: number | null;
  aum_band: string | null;
  enrollment_status: string | null;
  replied_at: Date | null;
  last_sent_at: Date | null;
  open_drafts: number;
  suppressed: boolean;
};

const PROSPECT_SELECT = sql`
  SELECT
    c.id                                        AS contact_id,
    c.first_name,
    c.last_name,
    btrim(c.first_name || ' ' || coalesce(c.last_name, '')) AS name,
    c.title,
    c.email::text                               AS email,
    c.linkedin_url,
    c.personal_reason,
    c.do_not_contact,
    c.decision_role::text                       AS decision_role,
    f.id                                        AS firm_id,
    f.name                                      AS firm_name,
    f.type::text                                AS firm_type,
    f.operator_category::text                   AS operator_category,
    f.side::text                                AS side,
    f.jurisdiction::text                        AS jurisdiction,
    f.tier,
    f.score,
    f.aum_band::text                            AS aum_band,
    e.status::text                              AS enrollment_status,
    e.replied_at,
    e.last_sent_at,
    (
      SELECT count(*)::int FROM drafts d
      WHERE d.contact_id = c.id AND d.status = 'draft'
    )                                           AS open_drafts,
    EXISTS (
      SELECT 1 FROM suppressions s
      WHERE s.active AND c.email IS NOT NULL AND (
        (s.match_type = 'email'  AND s.value = c.email)
        OR (s.match_type = 'domain' AND s.value = split_part(c.email::text, '@', 2)::citext)
      )
    )                                           AS suppressed
  FROM contacts c
  JOIN firms f ON f.id = c.firm_id
  LEFT JOIN LATERAL (
    SELECT status, replied_at, last_sent_at
    FROM enrollments en WHERE en.contact_id = c.id
    ORDER BY en.updated_at DESC LIMIT 1
  ) e ON true
`;

export interface ProspectFilter {
  readonly side?: "buy" | "sell";
  readonly tier?: number;
  readonly search?: string;
  readonly needsReason?: boolean;
  readonly limit?: number;
}

export async function listProspects(
  db: Database,
  filter: ProspectFilter = {},
): Promise<ProspectListRow[]> {
  const conditions = [sql`true`];
  if (filter.side !== undefined) conditions.push(sql`f.side = ${filter.side}::market_side`);
  if (filter.tier !== undefined) conditions.push(sql`f.tier = ${filter.tier}`);
  if (filter.needsReason === true) {
    conditions.push(sql`(c.personal_reason IS NULL OR btrim(c.personal_reason) = '')`);
  }
  if (filter.search !== undefined && filter.search.trim() !== "") {
    const pattern = `%${filter.search.trim()}%`;
    conditions.push(
      sql`(c.first_name ILIKE ${pattern} OR c.last_name ILIKE ${pattern}
           OR f.name ILIKE ${pattern} OR c.email::text ILIKE ${pattern})`,
    );
  }

  const where = conditions.reduce((acc, condition, index) =>
    index === 0 ? condition : sql`${acc} AND ${condition}`,
  );

  const rows = await db.execute<ProspectListRow>(sql`
    ${PROSPECT_SELECT}
    WHERE ${where}
    ORDER BY f.tier NULLS LAST, f.score DESC NULLS LAST, c.created_at DESC
    LIMIT ${filter.limit ?? 200}
  `);
  return hydrateDates([...rows], ["replied_at", "last_sent_at"]);
}

export async function getProspect(
  db: Database,
  contactId: string,
): Promise<ProspectListRow | null> {
  const rows = await db.execute<ProspectListRow>(sql`
    ${PROSPECT_SELECT}
    WHERE c.id = ${contactId}::uuid
    LIMIT 1
  `);
  return hydrateDates([...rows], ["replied_at", "last_sent_at"])[0] ?? null;
}

/**
 * Section 9 item 1. Everything in `replied` status, newest first. The home
 * screen.
 */
export async function actionQueue(db: Database, limit = 50): Promise<ProspectListRow[]> {
  const rows = await db.execute<ProspectListRow>(sql`
    ${PROSPECT_SELECT}
    WHERE e.status = 'replied'
    ORDER BY e.replied_at DESC NULLS LAST
    LIMIT ${limit}
  `);
  return hydrateDates([...rows], ["replied_at", "last_sent_at"]);
}

export type ActivityRow = {
  id: string;
  occurred_at: Date;
  actor: string;
  action: string;
  template_key: string | null;
  detail: Record<string, unknown>;
};

export async function historyFor(
  db: Database,
  contactId: string,
  limit = 100,
): Promise<ActivityRow[]> {
  const rows = await db.execute<ActivityRow>(sql`
    SELECT id::text AS id, occurred_at, actor, action::text AS action, template_key, detail
    FROM activity_log
    WHERE contact_id = ${contactId}::uuid
    ORDER BY occurred_at DESC
    LIMIT ${limit}
  `);
  return hydrateDates([...rows], ["occurred_at"]);
}

export type TemplateRow = {
  id: string;
  key: string;
  subject: string;
  body: string;
  content_tier: string;
  side: "buy" | "sell";
  stage: string;
  channel: string;
  audience_firm_types: string[];
  audience_operator_categories: string[];
  notes: string | null;
};

export async function listTemplates(db: Database): Promise<TemplateRow[]> {
  const rows = await db.execute<TemplateRow>(sql`
    SELECT
      id::text AS id, key, subject, body,
      content_tier::text AS content_tier,
      side::text AS side, stage::text AS stage, channel::text AS channel,
      audience_firm_types::text[] AS audience_firm_types,
      audience_operator_categories::text[] AS audience_operator_categories,
      notes
    FROM templates
    ORDER BY side, stage, channel, key
  `);
  return [...rows];
}

export type DraftRow = {
  id: string;
  contact_id: string;
  template_id: string | null;
  kind: string;
  channel: string;
  subject: string;
  body: string;
  status: string;
  lint_clean: boolean;
  lint_findings: unknown;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  sent_at: Date | null;
};

export async function draftsForContact(db: Database, contactId: string): Promise<DraftRow[]> {
  const rows = await db.execute<DraftRow>(sql`
    SELECT
      id::text AS id, contact_id::text AS contact_id, template_id::text AS template_id,
      kind::text AS kind, channel::text AS channel, subject, body, status::text AS status,
      lint_clean, lint_findings, created_by, created_at, updated_at, sent_at
    FROM drafts
    WHERE contact_id = ${contactId}::uuid
    ORDER BY created_at DESC
  `);
  return hydrateDates([...rows], ["created_at", "updated_at", "sent_at"]);
}

export interface SaveDraftInput {
  readonly contactId: string;
  readonly templateId: string | null;
  readonly kind: "first_touch" | "follow_up" | "reply";
  readonly channel: "email" | "linkedin";
  readonly subject: string;
  readonly body: string;
  readonly lintClean: boolean;
  readonly lintFindings: unknown;
  readonly createdBy: string;
}

/**
 * Inserts a draft. `lint_clean` is stored with it, and the check constraint in
 * 0006 refuses to let an unclean draft leave draft status. Nothing here can
 * set that flag without the linter's verdict, because the caller gets it from
 * packages/compliance.
 */
export async function saveDraft(db: Database, input: SaveDraftInput): Promise<string> {
  const rows = await db.execute<{ id: string }>(sql`
    INSERT INTO drafts (
      contact_id, template_id, kind, channel, subject, body,
      lint_clean, lint_findings, created_by
    ) VALUES (
      ${input.contactId}::uuid,
      ${input.templateId}::uuid,
      ${input.kind}::draft_kind,
      ${input.channel}::draft_channel,
      ${input.subject},
      ${input.body},
      ${input.lintClean},
      ${JSON.stringify(input.lintFindings ?? [])}::jsonb,
      ${input.createdBy}
    )
    RETURNING id::text AS id
  `);
  const id = [...rows][0]?.id;
  if (id === undefined) throw new Error("draft insert returned no id");
  return id;
}

export async function discardDraft(db: Database, draftId: string): Promise<void> {
  await db.execute(sql`
    UPDATE drafts SET status = 'discarded', updated_at = now()
    WHERE id = ${draftId}::uuid AND status = 'draft'
  `);
}

/** INV-8. A LinkedIn draft is marked sent by the human who sent it. */
export async function markLinkedInSent(db: Database, draftId: string): Promise<void> {
  await db.execute(sql`
    UPDATE drafts
    SET status = 'sent', sent_at = now(), updated_at = now()
    WHERE id = ${draftId}::uuid AND channel = 'linkedin' AND lint_clean
  `);
}

export async function setPersonalReason(
  db: Database,
  contactId: string,
  reason: string,
): Promise<void> {
  await db.execute(sql`
    UPDATE contacts SET personal_reason = ${reason}, updated_at = now()
    WHERE id = ${contactId}::uuid
  `);
}

export type SavedSearchRow = {
  id: string;
  name: string;
  side: "buy" | "sell";
  channel: string;
  criteria: unknown;
  query_text: string;
  url: string;
  created_by: string;
  created_at: Date;
};

export async function listSavedSearches(db: Database): Promise<SavedSearchRow[]> {
  const rows = await db.execute<SavedSearchRow>(sql`
    SELECT id::text AS id, name, side::text AS side, channel::text AS channel,
           criteria, query_text, url, created_by, created_at
    FROM saved_searches
    ORDER BY created_at DESC
    LIMIT 50
  `);
  return hydrateDates([...rows], ["created_at"]);
}

export interface SaveSearchInput {
  readonly name: string;
  readonly side: "buy" | "sell";
  readonly channel: "linkedin" | "web";
  readonly criteria: unknown;
  readonly queryText: string;
  readonly url: string;
  readonly createdBy: string;
}

export async function saveSearch(db: Database, input: SaveSearchInput): Promise<void> {
  await db.execute(sql`
    INSERT INTO saved_searches (name, side, channel, criteria, query_text, url, created_by)
    VALUES (
      ${input.name}, ${input.side}::market_side, ${input.channel}::search_channel,
      ${JSON.stringify(input.criteria)}::jsonb, ${input.queryText}, ${input.url},
      ${input.createdBy}
    )
    ON CONFLICT (name) DO UPDATE SET
      criteria = EXCLUDED.criteria,
      query_text = EXCLUDED.query_text,
      url = EXCLUDED.url
  `);
}

export type ResearchNoteRow = {
  id: string;
  firm_id: string | null;
  contact_id: string | null;
  headline: string;
  body: string;
  sources: unknown;
  provider: string;
  created_by: string;
  created_at: Date;
};

export async function researchFor(
  db: Database,
  contactId: string,
): Promise<ResearchNoteRow[]> {
  const rows = await db.execute<ResearchNoteRow>(sql`
    SELECT r.id::text AS id, r.firm_id::text AS firm_id, r.contact_id::text AS contact_id,
           r.headline, r.body, r.sources, r.provider, r.created_by, r.created_at
    FROM research_notes r
    WHERE r.contact_id = ${contactId}::uuid
       OR r.firm_id = (SELECT firm_id FROM contacts WHERE id = ${contactId}::uuid)
    ORDER BY r.created_at DESC
    LIMIT 50
  `);
  return hydrateDates([...rows], ["created_at"]);
}

export interface SaveResearchInput {
  readonly contactId: string | null;
  readonly firmId: string | null;
  readonly headline: string;
  readonly body: string;
  readonly sources: readonly { url: string; title: string; fetchedAt: string }[];
  readonly provider: string;
  readonly createdBy: string;
}

export async function saveResearch(db: Database, input: SaveResearchInput): Promise<void> {
  await db.execute(sql`
    INSERT INTO research_notes (contact_id, firm_id, headline, body, sources, provider, created_by)
    VALUES (
      ${input.contactId}::uuid, ${input.firmId}::uuid, ${input.headline}, ${input.body},
      ${JSON.stringify(input.sources)}::jsonb, ${input.provider}, ${input.createdBy}
    )
  `);
}

export interface UpdateAutomationInput {
  readonly sequencesEnabled: boolean;
  readonly dailySendCap: number;
  readonly sendWindowStart: string;
  readonly sendWindowEnd: string;
  readonly sendDays: readonly number[];
  readonly sendTimezone: string;
  readonly digestEnabled: boolean;
  readonly digestHour: number;
  readonly digestTimezone: string;
  readonly updatedBy: string;
}

/**
 * Note what is absent: cold_outreach_enabled. The desk cannot switch cold
 * outreach on. The trigger in 0006 would refuse it without a recorded counsel
 * sign-off, and the sign-off is recorded out of band by a person with database
 * access. Putting the toggle on a settings page would only teach an operator
 * that it is theirs to flip.
 */
export async function updateAutomation(
  db: Database,
  input: UpdateAutomationInput,
): Promise<void> {
  await db.execute(sql`
    UPDATE automation_settings SET
      sequences_enabled = ${input.sequencesEnabled},
      daily_send_cap    = ${input.dailySendCap},
      send_window_start = ${input.sendWindowStart}::time,
      send_window_end   = ${input.sendWindowEnd}::time,
      send_days         = ${`{${input.sendDays.join(",")}}`}::integer[],
      send_timezone     = ${input.sendTimezone},
      digest_enabled    = ${input.digestEnabled},
      digest_hour       = ${input.digestHour},
      digest_timezone   = ${input.digestTimezone},
      updated_by        = ${input.updatedBy},
      updated_at        = now()
  `);
}

export type CounselSignoffRow = {
  item: string;
  signed_off: boolean;
  counsel: string;
  reference: string | null;
  recorded_by: string;
  recorded_at: Date;
};

export async function listCounselSignoffs(db: Database): Promise<CounselSignoffRow[]> {
  const rows = await db.execute<CounselSignoffRow>(sql`
    SELECT item, signed_off, counsel, reference, recorded_by, recorded_at
    FROM counsel_signoffs ORDER BY item
  `);
  return hydrateDates([...rows], ["recorded_at"]);
}

export type SequenceRow = {
  id: string;
  name: string;
  transport: string;
  max_steps: number;
  active: boolean;
  step_count: number;
  active_enrollments: number;
};

export async function listSequences(db: Database): Promise<SequenceRow[]> {
  const rows = await db.execute<SequenceRow>(sql`
    SELECT
      s.id::text AS id, s.name, s.transport::text AS transport, s.max_steps, s.active,
      (SELECT count(*)::int FROM sequence_steps st WHERE st.sequence_id = s.id) AS step_count,
      (SELECT count(*)::int FROM enrollments e
       WHERE e.sequence_id = s.id AND e.status = 'active')                      AS active_enrollments
    FROM sequences s
    ORDER BY s.transport, s.name
  `);
  return [...rows];
}

export async function setSequenceActive(
  db: Database,
  sequenceId: string,
  active: boolean,
): Promise<void> {
  await db.execute(sql`
    UPDATE sequences SET active = ${active} WHERE id = ${sequenceId}::uuid
  `);
}

/** Suppression entries relevant to one address, for the compliance gates. */
export async function suppressionRowsFor(
  db: Database,
  email: string | null,
): Promise<{ value: string; matchType: "email" | "domain"; active: boolean }[]> {
  if (email === null || email.trim() === "") return [];
  const domain = email.split("@")[1] ?? "";
  const rows = await db.execute<{ value: string; match_type: "email" | "domain"; active: boolean }>(
    sql`
      SELECT value::text AS value, match_type::text AS match_type, active
      FROM suppressions
      WHERE active AND (
        (match_type = 'email' AND value = ${email}::citext)
        OR (match_type = 'domain' AND value = ${domain}::citext)
      )
    `,
  );
  return [...rows].map((row) => ({
    value: row.value,
    matchType: row.match_type,
    active: row.active,
  }));
}

export type TodayRow = {
  occurred_at: Date;
  action: string;
  name: string;
  firm_name: string;
  reason: string;
};

/** Section 9 item 2. What dispatched today and what was skipped, with reasons. */
export async function todaysActivity(db: Database, since: Date): Promise<TodayRow[]> {
  const rows = await db.execute<TodayRow>(sql`
    SELECT
      a.occurred_at,
      a.action::text AS action,
      coalesce(btrim(c.first_name || ' ' || coalesce(c.last_name, '')), 'unknown') AS name,
      coalesce(f.name, '')                                    AS firm_name,
      coalesce(a.detail ->> 'reason', '')                     AS reason
    FROM activity_log a
    LEFT JOIN contacts c ON c.id = a.contact_id
    LEFT JOIN firms f ON f.id = c.firm_id
    WHERE a.occurred_at >= ${since.toISOString()}::timestamptz
      AND a.action IN ('sent', 'skipped', 'blocked', 'error')
    ORDER BY a.occurred_at DESC
    LIMIT 100
  `);
  return hydrateDates([...rows], ["occurred_at"]);
}
