import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = new URL("../", import.meta.url).pathname;

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

describe("INV-1 / INV-8 / INV-9, the operator UI is not a send path", () => {
  const files = walk(join(webRoot, "src"));
  const source = files.map((file) => `${file}\n${readFileSync(file, "utf8")}`).join("\n");

  it("does not import a transport adapter", () => {
    expect(source).not.toMatch(/@depinfin\/transport-/);
  });

  it("does not call the worker dispatcher", () => {
    expect(source).not.toMatch(/runDispatch|selectDispatchCandidates/);
  });

  it("has no linter bypass and no LinkedIn send", () => {
    expect(source).not.toMatch(/skip_lint|skipLint|forceSend|sendLinkedIn/);
    expect(source).not.toMatch(/puppeteer|playwright|linkedin-api|unofficial/);
  });

  it("does not expose a parameter that includes Tier 1 in automated dispatch", () => {
    expect(source).not.toMatch(/includeTier1|forceTier1|dispatchTier1/);
  });
});
