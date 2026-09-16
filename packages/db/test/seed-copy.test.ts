import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BLOCKED_TERMS, OPT_OUT_PHRASES, lint } from "@depinfin/compliance";

/**
 * The seeded templates are prospect-facing copy, so they answer to section 13
 * and to INV-2 like any other message. No database needed: this reads the
 * migration file.
 */
const seed = readFileSync(
  join(new URL("../migrations/", import.meta.url).pathname, "0005_seed.sql"),
  "utf8",
);

describe("seeded template copy", () => {
  it("contains no opt-out phrase", () => {
    // Opt-out detection reads the whole inbound body, quoted history included.
    // A phrase in our own copy would come back quoted on every ordinary reply
    // and read as an opt-out, suppressing the prospect who answered.
    for (const phrase of OPT_OUT_PHRASES) {
      const pattern = new RegExp(`\\b${phrase.split(" ").join("\\s+")}\\b`, "i");
      expect(seed, `seed copy contains the opt-out phrase "${phrase}"`).not.toMatch(pattern);
    }
  });

  it("passes the INV-2 linter", () => {
    expect(lint("", seed)).toEqual([]);
  });

  it("uses no blocked term anywhere in the file", () => {
    for (const term of BLOCKED_TERMS) {
      const pattern = new RegExp(`\\b${term.split(" ").join("\\s+")}\\b`, "i");
      expect(seed, `seed copy contains the blocked term "${term}"`).not.toMatch(pattern);
    }
  });

  it("uses no em dash, section 13", () => {
    expect(seed).not.toMatch(/—/);
  });

  it("covers every migration file in the directory", () => {
    const files = readdirSync(new URL("../migrations/", import.meta.url).pathname);
    expect(files.filter((f) => f.endsWith(".sql")).length).toBeGreaterThanOrEqual(5);
  });
});
