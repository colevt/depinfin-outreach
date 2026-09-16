import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SendPreviewInput } from "@depinfin/core";
import type { SendPreviewRow } from "@depinfin/db";

const webRoot = new URL("../", import.meta.url).pathname;

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

/**
 * The desk shows what the pipeline decided. It is not a send path, and these
 * assert that by reading its own source. Ported from the operator-ui branch.
 *
 * A grep is a blunt instrument, and that is the point: it keeps holding when
 * the person adding a transport import has a good reason and no memory of this
 * file.
 */
describe("INV-1, INV-8 and INV-9, the desk is not a send path", () => {
  const source = [...walk(join(webRoot, "app")), ...walk(join(webRoot, "lib"))]
    .map((file) => `${file}\n${readFileSync(file, "utf8")}`)
    .join("\n");

  it("imports no transport adapter", () => {
    expect(source).not.toMatch(/@depinfin\/transport-/);
  });

  it("does not call the dispatcher or the candidate query", () => {
    expect(source).not.toMatch(/runDispatch|selectDispatchCandidates/);
  });

  it("has no linter bypass", () => {
    expect(source).not.toMatch(/skip_?[Ll]int|force[Ss]end|bypass[Ll]int|ignore[Ll]int/);
  });

  it("has no LinkedIn automation of any kind", () => {
    expect(source).not.toMatch(/puppeteer|playwright|selenium|linkedin-api|unofficial/i);
    // The desk records that a human sent a LinkedIn message. It never sends.
    expect(source).not.toMatch(/sendLinkedIn|postToLinkedIn/);
  });

  it("exposes no parameter that would include Tier 1 in automated dispatch", () => {
    expect(source).not.toMatch(/includeTier1|forceTier1|dispatchTier1|allowTier1/);
  });

  it("cannot switch cold outreach on", () => {
    // Migration 0006 refuses it without a recorded counsel sign-off, and the
    // desk does not offer the control at all. Section 11.
    expect(source).not.toMatch(/coldOutreachEnabled\s*[:=]\s*true/);
    expect(source).not.toMatch(/cold_outreach_enabled\s*=\s*true/);
  });

  it("cannot delete a suppression", () => {
    expect(source).not.toMatch(/deleteSuppression|removeSuppression/);
  });
});

describe("the preview row shape has not drifted", () => {
  /**
   * packages/core describes the preview input in terms of the compliance types
   * rather than importing it from packages/db, because the domain does not
   * depend on persistence. This app depends on both, so it is the honest place
   * to assert the two are still the same shape. It is a compile-time check:
   * if they drift, this file stops typechecking.
   */
  it("assigns a db row to the core input, and back", () => {
    type DbToCore = SendPreviewRow extends SendPreviewInput ? true : false;
    type CoreToDb = SendPreviewInput extends SendPreviewRow ? true : false;

    const dbToCore: DbToCore = true;
    const coreToDb: CoreToDb = true;

    expect(dbToCore && coreToDb).toBe(true);
  });
});
