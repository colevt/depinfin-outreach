import { describe, expect, it } from "vitest";
import { merge } from "../src/merge.js";
import { evaluateSend } from "../src/pipeline.js";
import { allowed, evaluation, prospect, refusal, template } from "./fixtures.js";

describe("INV-3 personalization is required on first touch", () => {
  it("refuses when personal_reason is empty and the template references it", () => {
    const decision = evaluateSend(evaluation({ prospect: prospect({ personalReason: "" }) }));
    const refused = refusal(decision);
    expect(refused.gate).toBe("personal_reason");
    expect(refused.outcome).toBe("skipped");
    expect(refused.reason).toBe("Personal Reason empty");
  });

  it("refuses when personal_reason is whitespace only", () => {
    const decision = evaluateSend(
      evaluation({ prospect: prospect({ personalReason: "   \n\t  " }) }),
    );
    expect(refusal(decision).gate).toBe("personal_reason");
  });

  it("refuses when personal_reason is null", () => {
    const decision = evaluateSend(evaluation({ prospect: prospect({ personalReason: null }) }));
    expect(refusal(decision).gate).toBe("personal_reason");
  });

  it("allows an empty personal_reason when the template does not reference it", () => {
    const decision = evaluateSend(
      evaluation({
        prospect: prospect({ personalReason: null }),
        template: template({
          subject: "{{first_name}}, a note on DePIN infrastructure",
          body: "Hi {{first_name}}, a short note from DePINfin.",
        }),
      }),
    );
    expect(allowed(decision).merged.subject).toBe("Dana, a note on DePIN infrastructure");
  });

  it("refuses an unresolved placeholder anywhere in merged output", () => {
    const decision = evaluateSend(
      evaluation({
        template: template({
          subject: "{{first_name}}, a note",
          body: "Hi {{first_name}}, about {{mandate_thesis}}.",
        }),
      }),
    );
    const refused = refusal(decision);
    expect(refused.gate).toBe("merge_resolved");
    expect(refused.reason).toBe("Unresolved placeholder: Mandate Thesis");
  });

  it("refuses an unresolved placeholder in the subject", () => {
    const decision = evaluateSend(
      evaluation({ template: template({ subject: "{{unknown_field}} intro" }) }),
    );
    expect(refusal(decision).gate).toBe("merge_resolved");
  });

  it("catches a placeholder introduced by a merge value itself", () => {
    const result = merge(
      { subject: "s", body: "Hi {{first_name}}" },
      { first_name: "{{admin_note}}" },
    );
    expect(result.unresolved).toContain("admin_note");
  });

  it("substitutes every known field", () => {
    const result = merge(
      { subject: "{{first_name}} {{last_name}}", body: "{{title}} at {{firm_name}}: {{personal_reason}}" },
      {
        first_name: "Dana",
        last_name: "Okafor",
        title: "CIO",
        firm_name: "North Arc",
        personal_reason: "the Denver roundtable",
      },
    );
    expect(result.subject).toBe("Dana Okafor");
    expect(result.body).toBe("CIO at North Arc: the Denver roundtable");
    expect(result.unresolved).toEqual([]);
    expect(result.emptyFields).toEqual([]);
  });

  it("tolerates whitespace and case inside the placeholder", () => {
    const result = merge({ subject: "{{  First_Name }}", body: "x" }, { first_name: "Dana" });
    expect(result.subject).toBe("Dana");
  });
});
