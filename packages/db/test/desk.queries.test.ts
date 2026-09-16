import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "../src/client.js";
import {
  actionQueue,
  draftsForContact,
  getProspect,
  historyFor,
  listProspects,
  listTemplates,
  saveDraft,
  suppressionRowsFor,
} from "../src/repositories/desk.js";
import { APP_URL, HAS_DB, ownerSql } from "./helpers.js";

const suite = HAS_DB ? describe : describe.skip;

/**
 * The desk's queries, against a real database. Two things they have to get
 * right beyond returning rows: the suppression flag the UI shows must agree
 * with what the compliance gates would decide, and timestamps must come back
 * as Dates rather than as strings the row types merely claim are Dates.
 */
suite("desk queries", () => {
  const owner = HAS_DB ? ownerSql() : null;
  const handle = HAS_DB ? createDatabase(APP_URL!) : null;
  const tag = `desk-q-${Date.now()}`;
  const domain = `${tag}.example.com`;
  let contactId = "";
  let suppressedId = "";

  beforeAll(async () => {
    if (!HAS_DB) return;

    const rows = await owner!<{ id: string }[]>`
      WITH f AS (
        INSERT INTO firms (name, type, jurisdiction, side, tier, score)
        VALUES (${`Firm ${tag}`}, 'crypto_fund', 'us', 'buy', 2, 33)
        RETURNING id
      )
      INSERT INTO contacts (firm_id, first_name, last_name, title, email, personal_reason)
      SELECT f.id, 'Dana', 'Reyes', 'CIO', ${`dana.${tag}@${domain}`}, 'spoke at the panel'
      FROM f RETURNING id
    `;
    contactId = rows[0]!.id;

    const suppressedRows = await owner!<{ id: string }[]>`
      WITH f AS (
        INSERT INTO firms (name, type, jurisdiction, side, tier)
        VALUES (${`Blocked ${tag}`}, 'ria', 'us', 'buy', 3)
        RETURNING id
      )
      INSERT INTO contacts (firm_id, first_name, email, personal_reason)
      SELECT f.id, 'Blocked', ${`blocked.${tag}@${domain}`}, 'a reason'
      FROM f RETURNING id
    `;
    suppressedId = suppressedRows[0]!.id;

    await owner!`
      INSERT INTO suppressions (value, match_type, reason, actor)
      VALUES (${`blocked.${tag}@${domain}`}, 'email', 'test', 'suite')
    `;

    await owner!`
      INSERT INTO activity_log (actor, contact_id, action, detail)
      VALUES ('suite', ${contactId}::uuid, 'skipped', '{"reason":"Personal Reason empty"}'::jsonb)
    `;
  });

  afterAll(async () => {
    await handle?.close();
    await owner?.end({ timeout: 5 });
  });

  it("lists a prospect with its firm and enrollment joined", async () => {
    const rows = await listProspects(handle!.db, { search: tag });
    const row = rows.find((r) => r.contact_id === contactId);
    expect(row?.name).toBe("Dana Reyes");
    expect(row?.firm_name).toBe(`Firm ${tag}`);
    expect(row?.firm_type).toBe("crypto_fund");
    expect(row?.side).toBe("buy");
    expect(row?.open_drafts).toBe(0);
  });

  it("filters by side, tier, and missing reason", async () => {
    expect(await listProspects(handle!.db, { search: tag, side: "sell" })).toEqual([]);
    const tier2 = await listProspects(handle!.db, { search: tag, tier: 2 });
    expect(tier2.map((r) => r.contact_id)).toEqual([contactId]);
    expect(await listProspects(handle!.db, { search: tag, needsReason: true })).toEqual([]);
  });

  it("flags a suppressed prospect the same way the gates would", async () => {
    const rows = await listProspects(handle!.db, { search: tag });
    expect(rows.find((r) => r.contact_id === suppressedId)?.suppressed).toBe(true);
    expect(rows.find((r) => r.contact_id === contactId)?.suppressed).toBe(false);

    // And the gates agree, because they read the same rows.
    const forGate = await suppressionRowsFor(handle!.db, `blocked.${tag}@${domain}`);
    expect(forGate).toHaveLength(1);
    expect(forGate[0]?.matchType).toBe("email");
  });

  it("returns no suppression rows for an address with none", async () => {
    expect(await suppressionRowsFor(handle!.db, `dana.${tag}@${domain}`)).toEqual([]);
    expect(await suppressionRowsFor(handle!.db, null)).toEqual([]);
  });

  it("gets one prospect by id, and null for an unknown one", async () => {
    expect((await getProspect(handle!.db, contactId))?.name).toBe("Dana Reyes");
    expect(await getProspect(handle!.db, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("returns history with the reason the pipeline wrote", async () => {
    const rows = await historyFor(handle!.db, contactId);
    expect(rows[0]?.action).toBe("skipped");
    expect(rows[0]?.detail["reason"]).toBe("Personal Reason empty");
  });

  it("hydrates timestamps into real Dates", async () => {
    // The regression this covers typechecked cleanly and broke every page
    // that showed a time.
    const history = await historyFor(handle!.db, contactId);
    expect(history[0]?.occurred_at).toBeInstanceOf(Date);
    expect(() => history[0]?.occurred_at.toISOString()).not.toThrow();
  });

  it("saves a draft with the linter verdict and finds it again", async () => {
    const draftId = await saveDraft(handle!.db, {
      contactId,
      templateId: null,
      kind: "first_touch",
      channel: "email",
      subject: `Subject ${tag}`,
      body: "contracted revenue from deployed infrastructure",
      lintClean: true,
      lintFindings: [],
      createdBy: "suite",
    });
    expect(draftId).toMatch(/^[0-9a-f-]{36}$/);

    const drafts = await draftsForContact(handle!.db, contactId);
    expect(drafts[0]?.id).toBe(draftId);
    expect(drafts[0]?.lint_clean).toBe(true);
    expect(drafts[0]?.created_at).toBeInstanceOf(Date);

    const rows = await listProspects(handle!.db, { search: tag });
    expect(rows.find((r) => r.contact_id === contactId)?.open_drafts).toBe(1);
  });

  it("stores an unclean draft and refuses to let it be approved", async () => {
    const draftId = await saveDraft(handle!.db, {
      contactId,
      templateId: null,
      kind: "first_touch",
      channel: "email",
      subject: `Unclean ${tag}`,
      body: "a guaranteed 14% annual return",
      lintClean: false,
      lintFindings: [{ gate: "linter", reason: "Return-implying language" }],
      createdBy: "suite",
    });

    let refused = false;
    try {
      await handle!.sql`UPDATE drafts SET status = 'approved' WHERE id = ${draftId}::uuid`;
    } catch {
      refused = true;
    }
    expect(refused).toBe(true);
  });

  it("keeps the action queue to contacts who replied", async () => {
    const queue = await actionQueue(handle!.db);
    expect(queue.every((row) => row.enrollment_status === "replied")).toBe(true);
    expect(queue.find((row) => row.contact_id === contactId)).toBeUndefined();
  });

  it("lists templates with their targeting and channel", async () => {
    const templates = await listTemplates(handle!.db);
    const linkedin = templates.filter((t) => t.channel === "linkedin");
    expect(linkedin.length).toBeGreaterThan(0);
    expect(linkedin.every((t) => t.subject === "")).toBe(true);
    expect(templates.every((t) => t.content_tier === "corporate")).toBe(true);
    expect(
      templates.some((t) => t.audience_firm_types.includes("crypto_fund")),
    ).toBe(true);
  });
});
