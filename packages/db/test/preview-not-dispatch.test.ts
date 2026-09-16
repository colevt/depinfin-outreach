import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * `listSendPreviewRows` is broader than `dispatch_candidates` on purpose. The
 * view leaves out Tier 1, suppressed addresses, and excluded jurisdictions so
 * that no code path can reach them; the preview has to include them in order
 * to show an operator why they are held.
 *
 * That makes the preview the one query in this package that would break INV-1,
 * INV-4, and INV-7 if the dispatcher ever read it. These tests assert that it
 * does not, by reading the dispatcher's own source. Ported from the
 * operator-ui branch, which got this exactly right.
 */
const read = (path: string): string =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("the operator preview is not a dispatch source", () => {
  const dispatchRunner = read("../../../apps/worker/src/dispatch-runner.ts");
  const dispatchJob = read("../../../apps/worker/src/jobs/dispatch.ts");
  const candidates = read("../src/candidates.ts");

  it("is not read by the dispatch runner", () => {
    expect(dispatchRunner).not.toMatch(/listSendPreviewRows/);
  });

  it("is not read by the dispatch job", () => {
    expect(dispatchJob).not.toMatch(/listSendPreviewRows/);
  });

  it("is not read by the candidate query", () => {
    expect(candidates).not.toMatch(/listSendPreviewRows/);
  });

  it("leaves the candidate query reading the view and nothing else", () => {
    expect(candidates).toMatch(/dispatch_candidates/);
    // Assembling candidates from the base tables would put INV-1, INV-4, and
    // INV-7 back into application code, which is what the view exists to
    // prevent.
    expect(candidates).not.toMatch(/FROM\s+enrollments/i);
    expect(candidates).not.toMatch(/JOIN\s+contacts/i);
  });

  it("says out loud what it is, so the next reader does not reuse it", () => {
    const preview = read("../src/repositories/preview.ts");
    expect(preview).toMatch(/BROADER than `dispatch_candidates`/);
  });
});
