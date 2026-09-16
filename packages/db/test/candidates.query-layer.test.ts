import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HAS_DB, appSql, expectRefused, ownerSql } from "./helpers.js";

const suite = HAS_DB ? describe : describe.skip;

/**
 * Section 8, the query-layer half. These assert the invariant cannot be
 * reached, not merely that a later filter removes it. Every case seeds a row
 * that would otherwise be a perfectly good candidate, then asserts it is
 * absent from dispatch_candidates.
 */
suite("dispatch_candidates enforces INV-1, INV-4, INV-7 at the query layer", () => {
  const owner = HAS_DB ? ownerSql() : null;
  const app = HAS_DB ? appSql() : null;
  const tag = `qlt-${Date.now()}`;

  async function seedProspect(opts: {
    label: string;
    tier: number | null;
    jurisdiction: string;
    status: string;
    doNotContact?: boolean;
  }): Promise<string> {
    const email = `${opts.label}.${tag}@example.com`;
    const rows = await owner!<{ id: string }[]>`
      WITH f AS (
        INSERT INTO firms (name, jurisdiction, tier)
        VALUES (${`Firm ${opts.label} ${tag}`}, ${opts.jurisdiction}::jurisdiction, ${opts.tier})
        RETURNING id
      ), c AS (
        INSERT INTO contacts (firm_id, first_name, email, personal_reason, do_not_contact)
        SELECT f.id, ${opts.label}, ${email}, 'a specific, verifiable reason', ${opts.doNotContact ?? false}
        FROM f RETURNING id
      )
      INSERT INTO enrollments (contact_id, sequence_id, status, current_step)
      SELECT c.id, (SELECT id FROM sequences WHERE name = ${`Seq ${tag}`}), ${opts.status}::enrollment_status, 0
      FROM c
      RETURNING contact_id AS id
    `;
    return rows[0]!.id;
  }

  async function candidateEmails(): Promise<string[]> {
    const rows = await app!<{ email: string }[]>`
      SELECT email FROM dispatch_candidates WHERE email LIKE ${`%${tag}%`}
    `;
    return rows.map((r) => r.email);
  }

  beforeAll(async () => {
    await owner!`
      INSERT INTO sequences (name, transport, max_steps)
      VALUES (${`Seq ${tag}`}, 'warm', 5)
    `;
    await owner!`
      INSERT INTO sequence_steps (sequence_id, step_number, delay_days, template_id)
      SELECT s.id, 1, 0, t.id
      FROM sequences s, templates t
      WHERE s.name = ${`Seq ${tag}`} AND t.key = 'corporate_intro_1'
    `;
  });

  afterAll(async () => {
    await owner?.end({ timeout: 5 });
    await app?.end({ timeout: 5 });
  });

  it("INV-1: a Tier 1 contact with a due step is absent from the result set", async () => {
    await seedProspect({ label: "tier1", tier: 1, jurisdiction: "us", status: "active" });
    expect(await candidateEmails()).not.toContain(`tier1.${tag}@example.com`);
  });

  it("INV-1: a manual_only enrollment is absent from the result set", async () => {
    await seedProspect({ label: "manual", tier: 2, jurisdiction: "us", status: "manual_only" });
    expect(await candidateEmails()).not.toContain(`manual.${tag}@example.com`);
  });

  it("a Tier 2 US contact on an active enrollment IS in the result set", async () => {
    await seedProspect({ label: "eligible", tier: 2, jurisdiction: "us", status: "active" });
    expect(await candidateEmails()).toContain(`eligible.${tag}@example.com`);
  });

  it("INV-7: EU, UK, and EEA contacts are absent from the result set", async () => {
    for (const jurisdiction of ["eu", "uk", "eea"]) {
      await seedProspect({ label: jurisdiction, tier: 2, jurisdiction, status: "active" });
    }
    const emails = await candidateEmails();
    for (const jurisdiction of ["eu", "uk", "eea"]) {
      expect(emails).not.toContain(`${jurisdiction}.${tag}@example.com`);
    }
  });

  it("INV-4: an exact email suppression removes the row", async () => {
    await seedProspect({ label: "supp-email", tier: 2, jurisdiction: "us", status: "active" });
    expect(await candidateEmails()).toContain(`supp-email.${tag}@example.com`);

    await app!`
      INSERT INTO suppressions (value, match_type, reason, actor)
      VALUES (${`supp-email.${tag}@example.com`}, 'email', 'test', 'suite')
    `;
    expect(await candidateEmails()).not.toContain(`supp-email.${tag}@example.com`);
  });

  it("INV-4: a bare domain suppression removes every address at that domain", async () => {
    await app!`
      INSERT INTO suppressions (value, match_type, reason, actor)
      VALUES ('example.com', 'domain', 'test', 'suite')
    `;
    expect(await candidateEmails()).toEqual([]);

    await app!`
      UPDATE suppressions
      SET active = false, deactivated_by = 'suite', deactivation_reason = 'test teardown'
      WHERE value = 'example.com' AND match_type = 'domain'
    `;
  });

  it("INV-4: do_not_contact removes the row", async () => {
    await seedProspect({
      label: "dnc", tier: 2, jurisdiction: "us", status: "active", doNotContact: true,
    });
    expect(await candidateEmails()).not.toContain(`dnc.${tag}@example.com`);
  });

  it("section 5: replied, stopped, paused, and completed are absent", async () => {
    for (const status of ["replied", "stopped", "paused", "completed"]) {
      await seedProspect({ label: status, tier: 2, jurisdiction: "us", status });
    }
    const emails = await candidateEmails();
    for (const status of ["replied", "stopped", "paused", "completed"]) {
      expect(emails).not.toContain(`${status}.${tag}@example.com`);
    }
  });
});

suite("INV-6 corporate and offering content are separated at the schema level", () => {
  const owner = HAS_DB ? ownerSql() : null;

  afterAll(async () => {
    await owner?.end({ timeout: 5 });
  });

  it("refuses a template that is not corporate content", async () => {
    await expectRefused(
      () => owner!`
        INSERT INTO templates (key, subject, body, content_tier)
        VALUES ('inv6-bad', 's', 'b', 'offering')
      `,
      /templates_corporate_only|check constraint/i,
    );
  });

  it("has no foreign key between offering_documents and sequence_steps", async () => {
    const rows = await owner!<{ count: string }[]>`
      SELECT count(*) FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND (
          (tc.table_name = 'sequence_steps' AND ccu.table_name = 'offering_documents')
          OR (tc.table_name = 'offering_documents' AND ccu.table_name = 'sequence_steps')
        )
    `;
    expect(Number(rows[0]?.count ?? 0)).toBe(0);
  });

  it("has no table that joins offering_documents to a sequence", async () => {
    const rows = await owner!<{ table_name: string }[]>`
      SELECT DISTINCT tc.table_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'offering_documents'
    `;
    expect(rows.map((r) => r.table_name)).toEqual([]);
  });

  it("only exposes corporate templates through dispatch_candidates", async () => {
    const rows = await owner!<{ template_content_tier: string }[]>`
      SELECT DISTINCT template_content_tier FROM dispatch_candidates
    `;
    for (const row of rows) expect(row.template_content_tier).toBe("corporate");
  });
});

suite("INV-7 exclusion set matches the compliance default", () => {
  const owner = HAS_DB ? ownerSql() : null;

  afterAll(async () => {
    await owner?.end({ timeout: 5 });
  });

  it("seeds exactly EU, UK, and EEA", async () => {
    const { DEFAULT_EXCLUDED_JURISDICTIONS } = await import("@depinfin/compliance");
    const rows = await owner!<{ jurisdiction: string }[]>`
      SELECT jurisdiction FROM excluded_jurisdictions ORDER BY jurisdiction
    `;
    expect(rows.map((r) => r.jurisdiction)).toEqual([...DEFAULT_EXCLUDED_JURISDICTIONS].sort());
  });
});
