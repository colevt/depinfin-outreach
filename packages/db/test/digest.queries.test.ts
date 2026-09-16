import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "../src/client.js";
import {
  awaitingReply,
  dispatchCountsSince,
  loadAutomationSettings,
  loadDigestRecipients,
  loadInternalDomains,
  newProspectsSince,
  openDrafts,
  topSkipReasons,
} from "../src/repositories/digest.js";
import { APP_URL, HAS_DB, ownerSql } from "./helpers.js";

const suite = HAS_DB ? describe : describe.skip;

/**
 * These run the digest SQL against a real database. A fake in the worker test
 * proves the runner logic; only this proves the queries parse, the columns
 * exist, and the joins are what they claim to be.
 */
suite("digest queries run", () => {
  const owner = HAS_DB ? ownerSql() : null;
  const handle = HAS_DB ? createDatabase(APP_URL!) : null;
  const tag = `digest-${Date.now()}`;
  const since = new Date(Date.now() - 60 * 60 * 1000);

  beforeAll(async () => {
    if (!HAS_DB) return;
    await owner!`
      WITH f AS (
        INSERT INTO firms (name, jurisdiction, tier, score, side, type)
        VALUES (${`Firm ${tag}`}, 'us', 2, 31, 'buy', 'crypto_fund')
        RETURNING id
      ), c AS (
        INSERT INTO contacts (firm_id, first_name, last_name, title, email, personal_reason)
        SELECT f.id, 'Dana', 'Reyes', 'CIO', ${`dana.${tag}@example.com`},
               'spoke at the DePIN panel'
        FROM f RETURNING id
      )
      INSERT INTO drafts (contact_id, kind, subject, body, lint_clean, created_by)
      SELECT c.id, 'first_touch', ${`Subject ${tag}`}, 'body', true, 'suite' FROM c
    `;
  });

  afterAll(async () => {
    await handle?.close();
    await owner?.end({ timeout: 5 });
  });

  it("reads the recipients and the internal domains", async () => {
    expect(await loadDigestRecipients(handle!.db)).toContain("cole@depinfin.com");
    expect(await loadInternalDomains(handle!.db)).toContain("depinfin.com");
  });

  it("finds a prospect added inside the window, with its firm joined", async () => {
    // Matched on the per-run firm, not on the name. Two people called Dana
    // Reyes is an ordinary thing for a prospect database to contain.
    const rows = await newProspectsSince(handle!.db, since);
    const row = rows.find((r) => r.firm_name === `Firm ${tag}`);
    expect(row).toBeDefined();
    expect(row?.name).toBe("Dana Reyes");
    expect(row?.firm_type).toBe("crypto_fund");
    expect(row?.side).toBe("buy");
    expect(row?.tier).toBe(2);
  });

  it("does not find one added before the window", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const rows = await newProspectsSince(handle!.db, future);
    expect(rows.find((r) => r.firm_name === `Firm ${tag}`)).toBeUndefined();
  });

  it("finds the open draft with its contact and firm", async () => {
    const rows = await openDrafts(handle!.db);
    const row = rows.find((r) => r.firm_name === `Firm ${tag}`);
    expect(row).toBeDefined();
    expect(row?.kind).toBe("first_touch");
    expect(row?.channel).toBe("email");
    expect(row?.lint_clean).toBe(true);
  });

  it("reads the action queue without throwing on an empty one", async () => {
    await expect(awaitingReply(handle!.db)).resolves.toBeInstanceOf(Array);
  });

  it("counts dispatch outcomes and skip reasons", async () => {
    const counts = await dispatchCountsSince(handle!.db, since);
    expect(counts).toEqual({
      sent: expect.any(Number),
      skipped: expect.any(Number),
      blocked: expect.any(Number),
    });
    await expect(topSkipReasons(handle!.db, since)).resolves.toBeInstanceOf(Array);
  });

  it("reads the single automation settings row", async () => {
    const settings = await loadAutomationSettings(handle!.db);
    expect(settings.daily_send_cap).toBeGreaterThan(0);
    expect(settings.digest_timezone.length).toBeGreaterThan(0);
    expect(typeof settings.cold_outreach_enabled).toBe("boolean");
  });

  it("can write a digest log row, and it does not count as a send", async () => {
    // INV-5 holds: this is an insert, and the application role has no other
    // verb on activity_log. The point here is that 'digest' is a distinct
    // action, so gate 12's count of the day's sends never sees it.
    //
    // Scoped to this run's own tag rather than asserted as a before and after
    // delta. vitest runs test files in parallel, so a global count can move
    // between two reads because another file inserted a row, and a test that
    // fails on a schedule nobody controls is worse than no test.
    await handle!.sql`
      INSERT INTO activity_log (actor, action, detail)
      VALUES ('suite', 'digest', ${JSON.stringify({ tag })}::jsonb)
    `;

    const rows = await handle!.sql<{ action: string; count: string }[]>`
      SELECT action::text AS action, count(*)::text AS count
      FROM activity_log
      WHERE detail ->> 'tag' = ${tag}
      GROUP BY action
    `;

    expect(rows).toEqual([{ action: "digest", count: "1" }]);

    // And the action is outside the set gate 12 counts.
    const counted = await handle!.sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM activity_log
      WHERE detail ->> 'tag' = ${tag}
        AND action IN ('sent', 'skipped', 'blocked')
    `;
    expect(counted[0]?.count).toBe("0");
  });
});
