import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { evaluatePreviewRow } from "@depinfin/core";
import { createDatabase } from "../src/client.js";
import { selectDispatchCandidates } from "../src/candidates.js";
import { listCalendarWindow, listSendPreviewRows } from "../src/repositories/preview.js";
import { APP_URL, HAS_DB, ownerSql } from "./helpers.js";

const suite = HAS_DB ? describe : describe.skip;

/**
 * The preview against a real database, and the property that matters most
 * about it: it is a superset of `dispatch_candidates`, never a subset.
 *
 * A row the view excludes has to appear here, held, with the reason. A row the
 * view includes has to appear here too, ready. If the preview ever showed
 * fewer rows than the dispatcher acts on, an operator would be reading a
 * screen that quietly omits what is about to happen.
 */
suite("send preview queries", () => {
  const owner = HAS_DB ? ownerSql() : null;
  const handle = HAS_DB ? createDatabase(APP_URL!) : null;
  const tag = `prev-${Date.now()}`;
  const domain = `${tag}.example.com`;
  const now = new Date();

  async function seed(opts: {
    label: string;
    tier: number | null;
    jurisdiction: string;
    status: string;
    personalReason?: string | null;
  }): Promise<void> {
    await owner!`
      WITH f AS (
        INSERT INTO firms (name, type, jurisdiction, side, tier)
        VALUES (${`Firm ${opts.label} ${tag}`}, 'crypto_fund',
                ${opts.jurisdiction}::jurisdiction, 'buy', ${opts.tier})
        RETURNING id
      ), c AS (
        INSERT INTO contacts (firm_id, first_name, last_name, email, personal_reason)
        SELECT f.id, ${opts.label}, 'Tester', ${`${opts.label}.${tag}@${domain}`},
               ${opts.personalReason === undefined ? "a specific, verifiable reason" : opts.personalReason}
        FROM f RETURNING id
      )
      INSERT INTO enrollments (contact_id, sequence_id, status, current_step)
      SELECT c.id, (SELECT id FROM sequences WHERE name = ${`Seq ${tag}`}),
             ${opts.status}::enrollment_status, 0
      FROM c
    `;
  }

  beforeAll(async () => {
    if (!HAS_DB) return;
    await owner!`
      INSERT INTO sequences (name, transport, max_steps)
      VALUES (${`Seq ${tag}`}, 'warm', 3)
    `;
    await owner!`
      INSERT INTO sequence_steps (sequence_id, step_number, delay_days, template_id)
      SELECT s.id, 1, 0, t.id FROM sequences s, templates t
      WHERE s.name = ${`Seq ${tag}`} AND t.key = 'buy_crypto_native_intro'
    `;

    await seed({ label: "eligible", tier: 2, jurisdiction: "us", status: "active" });
    await seed({ label: "tierone", tier: 1, jurisdiction: "us", status: "active" });
    await seed({ label: "excluded", tier: 2, jurisdiction: "uk", status: "active" });
    await seed({ label: "manual", tier: 2, jurisdiction: "us", status: "manual_only" });
    await seed({
      label: "noreason",
      tier: 2,
      jurisdiction: "us",
      status: "active",
      personalReason: null,
    });
  });

  afterAll(async () => {
    await handle?.close();
    await owner?.end({ timeout: 5 });
  });

  function mine<T extends { prospect: { email: string } }>(rows: readonly T[]): T[] {
    return rows.filter((row) => row.prospect.email.endsWith(`@${domain}`));
  }

  it("includes rows the dispatch view deliberately excludes", async () => {
    const rows = mine(await listSendPreviewRows(handle!.db, now));
    const labels = rows.map((row) => row.prospect.firstName).sort();
    expect(labels).toEqual(["eligible", "excluded", "manual", "noreason", "tierone"]);
  });

  it("is a superset of dispatch_candidates, never a subset", async () => {
    const preview = mine(await listSendPreviewRows(handle!.db, now));
    const candidates = (await selectDispatchCandidates(handle!.db, "warm", 200)).filter((row) =>
      row.prospect.email.endsWith(`@${domain}`),
    );

    const previewIds = new Set(preview.map((row) => row.enrollmentId));
    for (const candidate of candidates) {
      expect(previewIds.has(candidate.enrollmentId), candidate.prospect.email).toBe(true);
    }
    expect(preview.length).toBeGreaterThan(candidates.length);
  });

  it("gives each held row the reason the dispatcher would log", async () => {
    const rows = mine(await listSendPreviewRows(handle!.db, now));
    const byName = new Map(
      rows.map((row) => [row.prospect.firstName, evaluatePreviewRow(row, [], now)]),
    );

    expect(byName.get("eligible")?.willDispatch).toBe(true);
    expect(byName.get("tierone")?.reason).toBe("Tier 1, human-written mail only");
    expect(byName.get("excluded")?.reason).toBe("UK jurisdiction, warm contact only");
    expect(byName.get("manual")?.reason).toBe("Manual only, human-written mail only");
    expect(byName.get("noreason")?.reason).toBe("Personal Reason empty");
  });

  it("hydrates its timestamps", async () => {
    const rows = mine(await listSendPreviewRows(handle!.db, now));
    for (const row of rows) {
      expect(row.nextDueAt === null || row.nextDueAt instanceof Date).toBe(true);
      expect(row.enrollment.lastSentAt === null || row.enrollment.lastSentAt instanceof Date).toBe(
        true,
      );
    }
  });

  it("returns the corporate template, merged by the caller not the query", async () => {
    const rows = mine(await listSendPreviewRows(handle!.db, now));
    expect(rows.every((row) => row.template.contentTier === "corporate")).toBe(true);
    expect(rows[0]?.template.subject).toContain("{{");
  });

  it("lists the calendar window with a next step, and hydrates real Dates", async () => {
    const rows = (await listCalendarWindow(handle!.db, now, 7)).filter((row) =>
      row.firm_name.includes(tag),
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.due_at === null || row.due_at instanceof Date).toBe(true);
      expect(row.next_step_number).toBe(1);
      expect(row.name).toMatch(/Tester$/);
    }
  });

  it("leaves a never-scheduled enrollment's due date null rather than guessing", async () => {
    // Substituting the start of the UTC day here would put every one of these
    // four or five hours into the previous local day, and the strip would
    // render them all as overdue. The caller decides what "now" means.
    const rows = (await listCalendarWindow(handle!.db, now, 7)).filter((row) =>
      row.firm_name.includes(tag),
    );
    const neverSent = rows.filter((row) => row.due_at === null);
    expect(neverSent.length).toBeGreaterThan(0);
  });

  it("keeps a paused enrollment out of the calendar but in the preview", async () => {
    await owner!`
      UPDATE enrollments SET status = 'paused'
      WHERE contact_id = (SELECT id FROM contacts WHERE email = ${`eligible.${tag}@${domain}`})
    `;

    const calendar = (await listCalendarWindow(handle!.db, now, 7)).filter((row) =>
      row.firm_name.includes(`eligible ${tag}`),
    );
    const preview = mine(await listSendPreviewRows(handle!.db, now)).filter(
      (row) => row.prospect.firstName === "eligible",
    );

    expect(calendar).toHaveLength(0);
    expect(preview).toHaveLength(1);
    expect(evaluatePreviewRow(preview[0]!, [], now).reason).toBe("Sequence is paused");

    await owner!`
      UPDATE enrollments SET status = 'active'
      WHERE contact_id = (SELECT id FROM contacts WHERE email = ${`eligible.${tag}@${domain}`})
    `;
  });
});

suite("score factors round-trip", () => {
  const owner = HAS_DB ? ownerSql() : null;
  const handle = HAS_DB ? createDatabase(APP_URL!) : null;
  const tag = `factors-${Date.now()}`;

  afterAll(async () => {
    await handle?.close();
    await owner?.end({ timeout: 5 });
  });

  it("stores the five rubric inputs so a score can be recomputed", async () => {
    // Section 4 calls the rubric recomputable. Storing only the result makes
    // that false: nobody can say which factor moved a firm out of Tier 1.
    const factors = {
      mandateFit: 5,
      ticketFit: 4,
      categoryLiteracy: 5,
      warmPath: 4,
      decisionSpeed: 3,
    };

    await handle!.sql`
      INSERT INTO firms (name, jurisdiction, tier, score, score_factors)
      VALUES (${`Firm ${tag}`}, 'us', 1, 48, ${JSON.stringify(factors)}::jsonb)
    `;

    const rows = await handle!.sql<{ score_factors: typeof factors; score: number }[]>`
      SELECT score_factors, score FROM firms WHERE name = ${`Firm ${tag}`}
    `;

    expect(rows[0]?.score_factors).toEqual(factors);

    const recomputed =
      factors.mandateFit * 3 +
      factors.ticketFit * 2 +
      factors.categoryLiteracy * 2 +
      factors.warmPath * 3 +
      factors.decisionSpeed * 1;
    expect(recomputed).toBe(rows[0]?.score);
  });
});
