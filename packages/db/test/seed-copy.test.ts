import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BLOCKED_TERMS, OPT_OUT_PHRASES, lint } from "@depinfin/compliance";

/**
 * Seeded templates are prospect-facing copy, so they answer to section 13 and
 * to INV-2 like any other message. No database needed: this reads the
 * migration files.
 *
 * Every migration that inserts a template is covered, found by reading the
 * directory rather than by a list someone has to remember to extend. A new
 * template file is checked the moment it exists.
 */
const MIGRATIONS = new URL("../migrations/", import.meta.url).pathname;

const copyFiles = readdirSync(MIGRATIONS)
  .filter((file) => file.endsWith(".sql"))
  .map((file) => [file, readFileSync(join(MIGRATIONS, file), "utf8")] as const)
  .filter(([, contents]) => /INSERT\s+INTO\s+templates/i.test(contents));

describe("seeded template copy", () => {
  it("finds the files that carry prospect-facing copy", () => {
    expect(copyFiles.map(([file]) => file)).toEqual(["0005_seed.sql", "0007_templates.sql"]);
  });

  it.each(copyFiles)("%s contains no opt-out phrase", (_file, contents) => {
    // Opt-out detection reads the whole inbound body, quoted history included.
    // A phrase in our own copy would come back quoted on every ordinary reply
    // and read as an opt-out, suppressing the prospect who answered.
    for (const phrase of OPT_OUT_PHRASES) {
      const pattern = new RegExp(`\\b${phrase.split(" ").join("\\s+")}\\b`, "i");
      expect(contents, `copy contains the opt-out phrase "${phrase}"`).not.toMatch(pattern);
    }
  });

  it.each(copyFiles)("%s passes the INV-2 linter", (_file, contents) => {
    expect(lint("", contents)).toEqual([]);
  });

  it.each(copyFiles)("%s uses no blocked term anywhere", (_file, contents) => {
    for (const term of BLOCKED_TERMS) {
      const pattern = new RegExp(`\\b${term.split(" ").join("\\s+")}\\b`, "i");
      expect(contents, `copy contains the blocked term "${term}"`).not.toMatch(pattern);
    }
  });

  it.each(copyFiles)("%s uses no em dash, section 13", (_file, contents) => {
    expect(contents).not.toMatch(/—/);
  });

  it.each(copyFiles)("%s does not call an offering a prospectus", (_file, contents) => {
    // Covered by BLOCKED_TERMS above, asserted separately because it is the
    // terminology error section 13 calls out by name rather than a compliance
    // risk in its own right.
    expect(contents.toLowerCase()).not.toContain("prospectus");
  });
});
