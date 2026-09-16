/**
 * Queries behind the daily internal digest.
 *
 * The digest is about prospects and goes to an internal reader. Nothing here
 * writes, and nothing here is on the send path. `loadDigestRecipients` reads a
 * table that migration 0006 constrains to internal domains with a trigger, and
 * `loadInternalDomains` reads the list that trigger checks against, so the
 * worker can re-check the same thing before sending.
 */

import { sql } from "drizzle-orm";
import type { Database } from "../client.js";
import { hydrateDates } from "../rows.js";

/**
 * Two conventions in this file, both learned the hard way against a real
 * database rather than from the type checker.
 *
 * Row shapes are type aliases, not interfaces. drizzle's `execute<T>`
 * constrains T to Record<string, unknown>, and only an alias carries the
 * implicit index signature that satisfies it.
 *
 * Timestamps are interpolated as ISO strings with an explicit ::timestamptz
 * cast. A JS Date passed straight into a raw `sql` template reaches the driver
 * as an object it will not serialize, and the query fails at runtime while
 * typechecking cleanly.
 *
 * Timestamps coming back are hydrated with `hydrateDates`, for the mirror
 * image of the same problem: `execute` returns them as strings whatever the
 * row type says.
 */

export type DigestProspectRow = {
  contact_id: string;
  name: string;
  title: string | null;
  firm_name: string;
  firm_type: string | null;
  side: "buy" | "sell";
  tier: number | null;
  score: number | null;
  personal_reason: string | null;
  added_at: Date;
};

export type DigestReplyRow = {
  contact_id: string;
  name: string;
  firm_name: string;
  replied_at: Date;
  snippet: string;
};

export type DigestDraftRow = {
  contact_id: string;
  name: string;
  firm_name: string;
  kind: string;
  channel: string;
  updated_at: Date;
  lint_clean: boolean;
};

export type SkipReasonRow = {
  reason: string;
  count: number;
};

export async function loadDigestRecipients(db: Database): Promise<string[]> {
  const rows = await db.execute<{ address: string }>(sql`
    SELECT address::text AS address FROM digest_recipients WHERE active ORDER BY address
  `);
  return [...rows].map((row) => row.address);
}

export async function loadInternalDomains(db: Database): Promise<string[]> {
  const rows = await db.execute<{ domain: string }>(sql`
    SELECT domain::text AS domain FROM internal_domains ORDER BY domain
  `);
  return [...rows].map((row) => row.domain);
}

/** Contacts added since `since`. What the digest is for. */
export async function newProspectsSince(db: Database, since: Date): Promise<DigestProspectRow[]> {
  const rows = await db.execute<DigestProspectRow>(sql`
    SELECT
      c.id                                        AS contact_id,
      btrim(c.first_name || ' ' || coalesce(c.last_name, '')) AS name,
      c.title,
      f.name                                      AS firm_name,
      f.type::text                                AS firm_type,
      f.side::text                                AS side,
      f.tier,
      f.score,
      c.personal_reason,
      c.created_at                                AS added_at
    FROM contacts c
    JOIN firms f ON f.id = c.firm_id
    WHERE c.created_at >= ${since.toISOString()}::timestamptz
    ORDER BY f.tier NULLS LAST, f.score DESC NULLS LAST, c.created_at DESC
  `);
  return hydrateDates([...rows], ["added_at"]);
}

/**
 * The action queue. Section 9 makes this the home screen, and the digest leads
 * with it for the same reason: a reply waiting on an operator is the most
 * expensive thing in the system to leave sitting.
 */
export async function awaitingReply(db: Database, limit = 25): Promise<DigestReplyRow[]> {
  const rows = await db.execute<DigestReplyRow>(sql`
    SELECT
      c.id                                        AS contact_id,
      btrim(c.first_name || ' ' || coalesce(c.last_name, '')) AS name,
      f.name                                      AS firm_name,
      e.replied_at,
      coalesce(
        (
          SELECT left(btrim(a.detail ->> 'snippet'), 160)
          FROM activity_log a
          WHERE a.contact_id = c.id AND a.action = 'reply'
          ORDER BY a.occurred_at DESC
          LIMIT 1
        ),
        ''
      )                                           AS snippet
    FROM enrollments e
    JOIN contacts c ON c.id = e.contact_id
    JOIN firms f ON f.id = c.firm_id
    WHERE e.status = 'replied'
    ORDER BY e.replied_at DESC NULLS LAST
    LIMIT ${limit}
  `);
  return hydrateDates([...rows], ["replied_at"]);
}

export async function openDrafts(db: Database, limit = 25): Promise<DigestDraftRow[]> {
  const rows = await db.execute<DigestDraftRow>(sql`
    SELECT
      c.id                                        AS contact_id,
      btrim(c.first_name || ' ' || coalesce(c.last_name, '')) AS name,
      f.name                                      AS firm_name,
      d.kind::text                                AS kind,
      d.channel::text                             AS channel,
      d.updated_at,
      d.lint_clean
    FROM drafts d
    JOIN contacts c ON c.id = d.contact_id
    JOIN firms f ON f.id = c.firm_id
    WHERE d.status = 'draft'
    ORDER BY d.updated_at DESC
    LIMIT ${limit}
  `);
  return hydrateDates([...rows], ["updated_at"]);
}

export type DispatchCounts = {
  sent: number;
  skipped: number;
  blocked: number;
};

/** Counted from activity_log, like everything else that reports on dispatch. */
export async function dispatchCountsSince(db: Database, since: Date): Promise<DispatchCounts> {
  const rows = await db.execute<{ action: string; count: number }>(sql`
    SELECT action::text AS action, count(*)::int AS count
    FROM activity_log
    WHERE occurred_at >= ${since.toISOString()}::timestamptz
      AND action IN ('sent', 'skipped', 'blocked')
    GROUP BY action
  `);
  const counts: DispatchCounts = { sent: 0, skipped: 0, blocked: 0 };
  for (const row of [...rows]) {
    if (row.action === "sent") counts.sent = row.count;
    if (row.action === "skipped") counts.skipped = row.count;
    if (row.action === "blocked") counts.blocked = row.count;
  }
  return counts;
}

/**
 * Why sends were skipped, by the operator-legible reason rather than the gate
 * id. Section 9: "Personal Reason empty" beats "eligibility check 10 failed".
 */
export async function topSkipReasons(
  db: Database,
  since: Date,
  limit = 5,
): Promise<SkipReasonRow[]> {
  const rows = await db.execute<SkipReasonRow>(sql`
    SELECT coalesce(detail ->> 'reason', 'Unknown') AS reason, count(*)::int AS count
    FROM activity_log
    WHERE occurred_at >= ${since.toISOString()}::timestamptz
      AND action IN ('skipped', 'blocked')
    GROUP BY 1
    ORDER BY count DESC, reason
    LIMIT ${limit}
  `);
  return [...rows];
}

export type AutomationSettingsRow = {
  sequences_enabled: boolean;
  daily_send_cap: number;
  send_window_start: string;
  send_window_end: string;
  send_days: number[];
  send_timezone: string;
  cold_outreach_enabled: boolean;
  digest_enabled: boolean;
  digest_hour: number;
  digest_timezone: string;
  updated_by: string;
  updated_at: Date;
};

export async function loadAutomationSettings(db: Database): Promise<AutomationSettingsRow> {
  const rows = await db.execute<AutomationSettingsRow>(sql`
    SELECT
      sequences_enabled, daily_send_cap,
      send_window_start::text AS send_window_start,
      send_window_end::text   AS send_window_end,
      send_days, send_timezone, cold_outreach_enabled,
      digest_enabled, digest_hour, digest_timezone, updated_by, updated_at
    FROM automation_settings
  `);
  const row = hydrateDates([...rows], ["updated_at"])[0];
  if (row === undefined) {
    // Migration 0006 inserts the single row. Its absence means the migration
    // did not run, which is not something to paper over with defaults.
    throw new Error("automation_settings has no row. Run pnpm db:migrate.");
  }
  return row;
}
