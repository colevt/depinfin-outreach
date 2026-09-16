import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * listSendPreviewRows is broader than dispatch_candidates on purpose.
 * The worker must never read it. Automated sending stays on the view.
 */
describe("operator preview is not a dispatch source", () => {
  it("is unused by the worker", () => {
    const dispatch = readFileSync(
      new URL("../../../apps/worker/src/dispatch-runner.ts", import.meta.url),
      "utf8",
    );
    const job = readFileSync(new URL("../../../apps/worker/src/jobs/dispatch.ts", import.meta.url), "utf8");
    const candidates = readFileSync(new URL("../src/candidates.ts", import.meta.url), "utf8");
    expect(dispatch).not.toMatch(/listSendPreviewRows/);
    expect(job).not.toMatch(/listSendPreviewRows/);
    expect(candidates).not.toMatch(/listSendPreviewRows/);
    expect(candidates).toMatch(/dispatch_candidates/);
  });
});
