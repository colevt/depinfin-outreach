import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HAS_DB, appSql, expectRefused, ownerSql } from "./helpers.js";

const suite = HAS_DB ? describe : describe.skip;

/**
 * Migration 0006 carries four rules into the schema rather than leaving them
 * to application code. These assert the database refuses, not that some
 * function remembered to check.
 */
suite("the desk schema enforces its own rules", () => {
  const owner = HAS_DB ? ownerSql() : null;
  const app = HAS_DB ? appSql() : null;
  const tag = `desk-${Date.now()}`;
  let contactId = "";
  let sequenceId = "";

  beforeAll(async () => {
    if (!HAS_DB) return;
    const rows = await owner!<{ id: string }[]>`
      WITH f AS (
        INSERT INTO firms (name, jurisdiction, tier, side)
        VALUES (${`Firm ${tag}`}, 'us', 2, 'buy')
        RETURNING id
      )
      INSERT INTO contacts (firm_id, first_name, email, personal_reason)
      SELECT f.id, 'Dana', ${`dana.${tag}@example.com`}, 'a specific, verifiable reason' FROM f
      RETURNING id
    `;
    contactId = rows[0]!.id;

    const sequences = await owner!<{ id: string }[]>`
      INSERT INTO sequences (name, transport, max_steps)
      VALUES (${`Seq ${tag}`}, 'warm', 5)
      RETURNING id
    `;
    sequenceId = sequences[0]!.id;
  });

  afterAll(async () => {
    await app?.end({ timeout: 5 });
    await owner?.end({ timeout: 5 });
  });

  describe("INV-2 reaches human-composed mail too", () => {
    it("allows an unclean draft to exist", async () => {
      await app!`
        INSERT INTO drafts (contact_id, kind, subject, body, lint_clean, lint_findings, created_by)
        VALUES (${contactId}, 'first_touch', ${`Unclean ${tag}`}, 'we target a 14% return',
                false, '[{"rule":"percentage"}]'::jsonb, 'cole')
      `;
      const rows = await app!<{ count: string }[]>`
        SELECT count(*)::text AS count FROM drafts WHERE subject = ${`Unclean ${tag}`}
      `;
      expect(rows[0]?.count).toBe("1");
    });

    it("refuses to approve a draft the linter has not cleared", async () => {
      await expectRefused(
        () => app!`
          UPDATE drafts SET status = 'approved' WHERE subject = ${`Unclean ${tag}`}
        `,
        /drafts_unclean_stays_draft/i,
      );
    });

    it("refuses to send a draft the linter has not cleared", async () => {
      await expectRefused(
        () => app!`
          UPDATE drafts SET status = 'sent', sent_at = now(), transport = 'warm'
          WHERE subject = ${`Unclean ${tag}`}
        `,
        /drafts_unclean_stays_draft/i,
      );
    });

    it("refuses an unclean draft inserted straight into approved", async () => {
      await expectRefused(
        () => app!`
          INSERT INTO drafts (contact_id, kind, subject, body, status, lint_clean, created_by)
          VALUES (${contactId}, 'first_touch', ${`Straight ${tag}`}, 'guaranteed', 'approved', false, 'cole')
        `,
        /drafts_unclean_stays_draft/i,
      );
    });

    it("allows discarding an unclean draft", async () => {
      await app!`
        UPDATE drafts SET status = 'discarded' WHERE subject = ${`Unclean ${tag}`}
      `;
      const rows = await app!<{ status: string }[]>`
        SELECT status FROM drafts WHERE subject = ${`Unclean ${tag}`}
      `;
      expect(rows[0]?.status).toBe("discarded");
    });

    it("allows approving a draft the linter cleared", async () => {
      await app!`
        INSERT INTO drafts (contact_id, kind, subject, body, lint_clean, created_by)
        VALUES (${contactId}, 'first_touch', ${`Clean ${tag}`},
                'contracted revenue from deployed infrastructure', true, 'cole')
      `;
      await app!`UPDATE drafts SET status = 'approved' WHERE subject = ${`Clean ${tag}`}`;
      const rows = await app!<{ status: string }[]>`
        SELECT status FROM drafts WHERE subject = ${`Clean ${tag}`}
      `;
      expect(rows[0]?.status).toBe("approved");
    });
  });

  describe("INV-6 a draft is corporate content", () => {
    it("refuses a draft marked as offering content", async () => {
      await expectRefused(
        () => app!`
          INSERT INTO drafts (contact_id, kind, subject, body, content_tier, lint_clean, created_by)
          VALUES (${contactId}, 'first_touch', ${`Offering ${tag}`}, 'terms attached',
                  'offering', true, 'cole')
        `,
        /drafts_corporate_only/i,
      );
    });
  });

  describe("INV-8 a LinkedIn draft has no transport", () => {
    it("refuses a LinkedIn draft that names one", async () => {
      await expectRefused(
        () => app!`
          INSERT INTO drafts (contact_id, kind, channel, body, transport, lint_clean, created_by)
          VALUES (${contactId}, 'first_touch', 'linkedin', 'short note', 'warm', true, 'cole')
        `,
        /drafts_linkedin_has_no_transport/i,
      );
    });

    it("accepts a LinkedIn draft with no subject and marks it sent by a human", async () => {
      await app!`
        INSERT INTO drafts (contact_id, kind, channel, body, lint_clean, created_by)
        VALUES (${contactId}, 'first_touch', 'linkedin', ${`short note ${tag}`}, true, 'cole')
      `;
      await app!`
        UPDATE drafts SET status = 'sent', sent_at = now()
        WHERE body = ${`short note ${tag}`}
      `;
      const rows = await app!<{ status: string; transport: string | null }[]>`
        SELECT status, transport FROM drafts WHERE body = ${`short note ${tag}`}
      `;
      expect(rows[0]?.status).toBe("sent");
      expect(rows[0]?.transport).toBeNull();
    });

    it("still refuses an email draft with no subject", async () => {
      await expectRefused(
        () => app!`
          INSERT INTO drafts (contact_id, kind, channel, subject, body, lint_clean, created_by)
          VALUES (${contactId}, 'first_touch', 'email', '   ', 'body', true, 'cole')
        `,
        /drafts_email_has_subject/i,
      );
    });
  });

  describe("the digest goes to internal addresses only", () => {
    it("seeds Cole", async () => {
      const rows = await app!<{ active: boolean }[]>`
        SELECT active FROM digest_recipients WHERE address = 'cole@depinfin.com'
      `;
      expect(rows[0]?.active).toBe(true);
    });

    it("refuses an external address", async () => {
      await expectRefused(
        () => app!`
          INSERT INTO digest_recipients (address, label, added_by)
          VALUES (${`dana.${tag}@example.com`}, 'a prospect', 'suite')
        `,
        /internal addresses only/i,
      );
    });

    it("refuses an update that redirects the digest off an internal domain", async () => {
      await expectRefused(
        () => app!`
          UPDATE digest_recipients SET address = 'someone@example.com'
          WHERE address = 'cole@depinfin.com'
        `,
        /internal addresses only/i,
      );
    });
  });

  describe("section 11 cold outreach is gated on counsel", () => {
    beforeAll(async () => {
      if (!HAS_DB) return;
      // Whatever an earlier run left behind, start from gated and off.
      await owner!`UPDATE automation_settings SET cold_outreach_enabled = false`;
      await owner!`DELETE FROM counsel_signoffs WHERE item = 'rule_506c_cold_outreach'`;
    });

    afterAll(async () => {
      if (!HAS_DB) return;
      await owner!`UPDATE automation_settings SET cold_outreach_enabled = false`;
      await owner!`DELETE FROM counsel_signoffs WHERE item = 'rule_506c_cold_outreach'`;
    });

    it("defaults to off", async () => {
      const rows = await app!<{ cold_outreach_enabled: boolean }[]>`
        SELECT cold_outreach_enabled FROM automation_settings
      `;
      expect(rows[0]?.cold_outreach_enabled).toBe(false);
    });

    it("refuses to enable it with no recorded sign-off", async () => {
      await expectRefused(
        () => app!`UPDATE automation_settings SET cold_outreach_enabled = true`,
        /gated on written outside counsel sign-off/i,
      );
    });

    it("gives the application role no way to record one", async () => {
      const rows = await owner!<{ privilege_type: string }[]>`
        SELECT privilege_type FROM information_schema.role_table_grants
        WHERE grantee = 'depinfin_app' AND table_name = 'counsel_signoffs'
      `;
      const granted = rows.map((r) => r.privilege_type);
      expect(granted).toEqual(["SELECT"]);
    });

    it("allows it once a sign-off is recorded out of band", async () => {
      await owner!`
        INSERT INTO counsel_signoffs (item, signed_off, counsel, reference, recorded_by)
        VALUES ('rule_506c_cold_outreach', true, 'Lowenstein Sandler LLP', 'test', 'suite')
      `;
      await app!`UPDATE automation_settings SET cold_outreach_enabled = true`;
      const rows = await app!<{ cold_outreach_enabled: boolean }[]>`
        SELECT cold_outreach_enabled FROM automation_settings
      `;
      expect(rows[0]?.cold_outreach_enabled).toBe(true);
    });

    it("refuses a sign-off row that is recorded but not signed off", async () => {
      await owner!`
        UPDATE counsel_signoffs SET signed_off = false WHERE item = 'rule_506c_cold_outreach'
      `;
      await owner!`UPDATE automation_settings SET cold_outreach_enabled = false`;
      await expectRefused(
        () => app!`UPDATE automation_settings SET cold_outreach_enabled = true`,
        /gated on written outside counsel sign-off/i,
      );
    });
  });

  describe("INV-8 and INV-9 a LinkedIn template cannot reach the dispatcher", () => {
    it("has a LinkedIn template to attach in the first place", async () => {
      // Without this, the refusal cases below would insert zero rows and pass
      // for the wrong reason.
      const rows = await app!<{ count: string }[]>`
        SELECT count(*)::text AS count FROM templates WHERE key = 'li_buy_generalist'
      `;
      expect(rows[0]?.count).toBe("1");
    });

    it("refuses to attach a LinkedIn template to a sequence step", async () => {
      // The composite foreign key in 0007 is what refuses this. A LinkedIn
      // template attached to a step would be emailed by the dispatcher,
      // subject line and all, to someone who was never mailed.
      await expectRefused(
        () => owner!`
          INSERT INTO sequence_steps (sequence_id, step_number, delay_days, template_id)
          SELECT ${sequenceId}::uuid, 99, 0, t.id
          FROM templates t WHERE t.key = 'li_buy_generalist'
        `,
        /sequence_steps_template_channel_fkey|foreign key/i,
      );
    });

    it("refuses a step that declares a non-email channel", async () => {
      await expectRefused(
        () => owner!`
          INSERT INTO sequence_steps (sequence_id, step_number, delay_days, template_id, template_channel)
          SELECT ${sequenceId}::uuid, 98, 0, t.id, 'linkedin'
          FROM templates t WHERE t.key = 'li_buy_generalist'
        `,
        /sequence_steps_email_only/i,
      );
    });

    it("refuses an email template with no subject", async () => {
      await expectRefused(
        () => owner!`
          INSERT INTO templates (key, subject, body)
          VALUES (${`empty-subject-${tag}`}, '  ', 'body')
        `,
        /templates_email_has_subject/i,
      );
    });

    it("seeds LinkedIn templates with no subject and email templates with one", async () => {
      const rows = await app!<{ channel: string; subject: string }[]>`
        SELECT channel::text AS channel, subject FROM templates
      `;
      for (const row of rows) {
        if (row.channel === "linkedin") expect(row.subject).toBe("");
        else expect(row.subject.trim().length).toBeGreaterThan(0);
      }
      expect(rows.some((r) => r.channel === "linkedin")).toBe(true);
    });
  });

  describe("templates are targeted by prospect type", () => {
    it("ships a first touch template for every buy-side firm type", async () => {
      const rows = await app!<{ missing: string[] }[]>`
        SELECT array_agg(t.value::text) AS missing
        FROM unnest(enum_range(NULL::firm_type)) AS t(value)
        WHERE NOT EXISTS (
          SELECT 1 FROM templates tpl
          WHERE tpl.side = 'buy' AND tpl.stage = 'first_touch' AND tpl.channel = 'email'
            AND (tpl.audience_firm_types = '{}' OR t.value = ANY (tpl.audience_firm_types))
        )
      `;
      expect(rows[0]?.missing).toBeNull();
    });

    it("keeps every seeded template as corporate content", async () => {
      const rows = await app!<{ count: string }[]>`
        SELECT count(*)::text AS count FROM templates WHERE content_tier <> 'corporate'
      `;
      expect(rows[0]?.count).toBe("0");
    });
  });

  describe("automation settings are a single row", () => {
    it("refuses a second one", async () => {
      await expectRefused(
        () => owner!`INSERT INTO automation_settings (id) VALUES (true)`,
        /duplicate key|automation_settings_pkey/i,
      );
    });

    it("refuses a send window that ends before it starts", async () => {
      await expectRefused(
        () => app!`
          UPDATE automation_settings SET send_window_start = '18:00', send_window_end = '09:00'
        `,
        /automation_settings_window_ordered/i,
      );
    });
  });
});
