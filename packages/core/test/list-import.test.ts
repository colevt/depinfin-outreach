import { describe, expect, it } from "vitest";
import { dedupeImport, parseImportCsv, rescoreFirm, scoreImportedRow } from "../src/list-import.js";

const header =
  "firm_name,jurisdiction,first_name,last_name,email,personal_reason,mandate_fit,ticket_fit,category_literacy,warm_path,decision_speed_score";

function csv(rows: string[]): string {
  return [header, ...rows].join("\n");
}

describe("list import parse", () => {
  it("reads a clean row and scores it", () => {
    const parsed = parseImportCsv(
      csv(["North Arc,us,Dana,Okafor,dana@northarc.com,your note at Denver,4,3,2,5,1"]),
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    const row = parsed.rows[0]!;
    expect(row.email).toBe("dana@northarc.com");
    expect(row.jurisdiction).toBe("us");
    expect(row.factors).toMatchObject({
      mandateFit: 4,
      ticketFit: 3,
      categoryLiteracy: 2,
      warmPath: 5,
      decisionSpeed: 1,
    });
    expect(scoreImportedRow(row)?.score).toBe(4 * 3 + 3 * 2 + 2 * 2 + 5 * 3 + 1);
    expect(scoreImportedRow(row)?.tier).toBe(2);
  });

  it("reports missing required columns in plain language", () => {
    const parsed = parseImportCsv("first_name,email\nDana,dana@northarc.com");
    expect(parsed.rows).toEqual([]);
    expect(parsed.errors.map((e) => e.reason)).toEqual(
      expect.arrayContaining(["Missing column firm_name", "Missing column jurisdiction"]),
    );
  });

  it("drops a row with an empty first name and keeps the next one", () => {
    const parsed = parseImportCsv(
      csv([
        "North Arc,us,,Okafor,dana@northarc.com,reason,4,3,2,5,1",
        "Helios,us,Marcus,Chen,marcus@helios.com,shared a thesis,3,3,3,3,3",
      ]),
    );
    expect(parsed.rows.map((r) => r.firstName)).toEqual(["Marcus"]);
    expect(parsed.errors).toEqual([{ line: 2, reason: "First Name empty" }]);
  });

  it("accepts quoted commas in personal_reason", () => {
    const parsed = parseImportCsv(
      'firm_name,jurisdiction,first_name,personal_reason\nNorth Arc,us,Dana,"spoke at Denver, then followed up"',
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.personalReason).toBe("spoke at Denver, then followed up");
  });
});

describe("list import dedupe", () => {
  it("suppresses an exact email match, case-insensitive", () => {
    const parsed = parseImportCsv(csv(["North Arc,us,Dana,Okafor,Dana@NorthArc.com,reason,3,3,3,3,3"]));
    const result = dedupeImport(parsed.rows, [
      { email: "dana@northarc.com", firmName: "Other", firstName: "Other", lastName: "Person" },
    ]);
    expect(result.accepted).toEqual([]);
    expect(result.duplicates[0]?.reason).toBe("Address already on file: dana@northarc.com");
  });

  it("suppresses the same person at the same firm without an email", () => {
    const parsed = parseImportCsv("firm_name,jurisdiction,first_name,last_name\nNorth Arc,us,Dana,Okafor");
    const result = dedupeImport(parsed.rows, [
      { email: null, firmName: "north arc", firstName: "dana", lastName: "okafor" },
    ]);
    expect(result.accepted).toEqual([]);
    expect(result.duplicates[0]?.reason).toBe("Already on file: Dana Okafor at North Arc");
  });

  it("dedupes inside the file itself", () => {
    const parsed = parseImportCsv(
      csv([
        "North Arc,us,Dana,Okafor,dana@northarc.com,reason,3,3,3,3,3",
        "North Arc,us,Dana,Okafor,dana@northarc.com,reason,3,3,3,3,3",
      ]),
    );
    const result = dedupeImport(parsed.rows, []);
    expect(result.accepted).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
  });
});

describe("rescoring through list building", () => {
  it("does not overwrite a manual_only enrollment status", () => {
    const result = rescoreFirm({
      factors: { mandateFit: 5, ticketFit: 5, categoryLiteracy: 5, warmPath: 5, decisionSpeed: 5 },
      currentTier: 3,
      enrollmentStatus: "manual_only",
    });
    expect(result.enrollmentStatus).toBe("manual_only");
  });

  it("holds Tier 1 without an operator demotion", () => {
    const result = rescoreFirm({
      factors: { mandateFit: 1, ticketFit: 1, categoryLiteracy: 1, warmPath: 1, decisionSpeed: 1 },
      currentTier: 1,
      enrollmentStatus: "active",
    });
    expect(result.tier).toBe(1);
    expect(result.requiresOperatorAction).toBe(true);
  });
});
