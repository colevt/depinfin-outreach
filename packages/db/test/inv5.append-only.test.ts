import { afterAll, describe, expect, it } from "vitest";
import { HAS_DB, appSql, expectRefused, ownerSql } from "./helpers.js";

const suite = HAS_DB ? describe : describe.skip;

suite("INV-5 the audit log is append-only", () => {
  const app = HAS_DB ? appSql() : null;
  const owner = HAS_DB ? ownerSql() : null;

  afterAll(async () => {
    await app?.end({ timeout: 5 });
    await owner?.end({ timeout: 5 });
  });

  it("gives the application role no UPDATE and no DELETE on activity_log", async () => {
    const rows = await owner!<{ privilege_type: string }[]>`
      SELECT privilege_type FROM information_schema.role_table_grants
      WHERE grantee = 'depinfin_app' AND table_name = 'activity_log'
    `;
    const granted = rows.map((r) => r.privilege_type);
    expect(granted).toContain("SELECT");
    expect(granted).toContain("INSERT");
    expect(granted).not.toContain("UPDATE");
    expect(granted).not.toContain("DELETE");
    expect(granted).not.toContain("TRUNCATE");
  });

  it("refuses an UPDATE on activity_log even as the owner", async () => {
    await owner!`
      INSERT INTO activity_log (actor, action, detail)
      VALUES ('test', 'skipped', '{"case":"inv5"}'::jsonb)
    `;
    await expectRefused(
      () => owner!`UPDATE activity_log SET actor = 'tampered' WHERE actor = 'test'`,
      /append-only/i,
    );
  });

  it("refuses a DELETE on activity_log even as the owner", async () => {
    await expectRefused(
      () => owner!`DELETE FROM activity_log WHERE actor = 'test'`,
      /append-only/i,
    );
  });

  it("refuses a TRUNCATE on activity_log", async () => {
    await expectRefused(() => owner!`TRUNCATE activity_log`, /append-only/i);
  });

  it("still accepts inserts from the application role", async () => {
    await app!`
      INSERT INTO activity_log (actor, action, detail)
      VALUES ('worker', 'skipped', '{"case":"inv5-app"}'::jsonb)
    `;
    const rows = await app!<{ count: string }[]>`
      SELECT count(*) FROM activity_log WHERE actor = 'worker'
    `;
    expect(Number(rows[0]?.count ?? 0)).toBeGreaterThan(0);
  });
});

suite("INV-4 suppressions are permanent", () => {
  const app = HAS_DB ? appSql() : null;
  const owner = HAS_DB ? ownerSql() : null;

  afterAll(async () => {
    await app?.end({ timeout: 5 });
    await owner?.end({ timeout: 5 });
  });

  it("gives the application role no DELETE on suppressions", async () => {
    const rows = await owner!<{ privilege_type: string }[]>`
      SELECT privilege_type FROM information_schema.role_table_grants
      WHERE grantee = 'depinfin_app' AND table_name = 'suppressions'
    `;
    const granted = rows.map((r) => r.privilege_type);
    expect(granted).toContain("INSERT");
    expect(granted).toContain("UPDATE");
    expect(granted).not.toContain("DELETE");
  });

  it("refuses a DELETE on suppressions", async () => {
    await owner!`
      INSERT INTO suppressions (value, match_type, reason, actor)
      VALUES ('permanence-test@example.com', 'email', 'test', 'suite')
      ON CONFLICT DO NOTHING
    `;
    await expectRefused(
      () => owner!`DELETE FROM suppressions WHERE value = 'permanence-test@example.com'`,
      /append-only|permanent/i,
    );
  });

  it("requires an actor and a reason to deactivate", async () => {
    await expectRefused(
      () => app!`
        UPDATE suppressions SET active = false
        WHERE value = 'permanence-test@example.com'
      `,
      /actor and a reason|deactivat/i,
    );
  });

  it("allows deactivation with an actor and a reason", async () => {
    await app!`
      UPDATE suppressions
      SET active = false, deactivated_by = 'cole', deactivation_reason = 'wrong person, confirmed'
      WHERE value = 'permanence-test@example.com'
    `;
    const rows = await app!<{ active: boolean; deactivated_at: Date | null }[]>`
      SELECT active, deactivated_at FROM suppressions
      WHERE value = 'permanence-test@example.com'
    `;
    expect(rows[0]?.active).toBe(false);
    expect(rows[0]?.deactivated_at).not.toBeNull();
  });

  it("refuses to edit the address on an existing entry", async () => {
    await expectRefused(
      () => app!`
        UPDATE suppressions SET value = 'someone-else@example.com'
        WHERE value = 'permanence-test@example.com'
      `,
      /permanent/i,
    );
  });
});
