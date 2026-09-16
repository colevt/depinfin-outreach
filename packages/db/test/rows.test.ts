import { describe, expect, it } from "vitest";
import { asDate, hydrateDates } from "../src/rows.js";

/**
 * These exist because the bug they cover typechecked cleanly and still broke
 * every page that showed a timestamp. `execute` returns a timestamptz as a
 * string while the row type says Date, so the first call to `.toISOString()`
 * or `Intl.DateTimeFormat` threw at runtime.
 */
describe("asDate", () => {
  it("passes a Date through", () => {
    const date = new Date("2026-09-16T11:00:00Z");
    expect(asDate(date)).toBe(date);
  });

  it("parses the string the driver actually returns", () => {
    const parsed = asDate("2026-09-16 11:00:00+00");
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.toISOString()).toBe("2026-09-16T11:00:00.000Z");
  });

  it("parses an ISO string", () => {
    expect(asDate("2026-09-16T11:00:00.000Z")?.toISOString()).toBe("2026-09-16T11:00:00.000Z");
  });

  it("returns null for null and undefined", () => {
    expect(asDate(null)).toBeNull();
    expect(asDate(undefined)).toBeNull();
  });

  it("returns null rather than an Invalid Date", () => {
    // An Invalid Date propagates silently and fails somewhere else. A null
    // fails at the first use, where the cause is still visible.
    expect(asDate("not a date")).toBeNull();
    expect(asDate(new Date("nonsense"))).toBeNull();
    expect(asDate({})).toBeNull();
  });
});

describe("hydrateDates", () => {
  it("converts only the named columns", () => {
    const rows = [{ id: "a", occurred_at: "2026-09-16 11:00:00+00", label: "2026-01-01" }];
    const [row] = hydrateDates(rows, ["occurred_at"]);
    expect(row?.occurred_at).toBeInstanceOf(Date);
    expect(row?.label).toBe("2026-01-01");
  });

  it("leaves a null timestamp null", () => {
    const [row] = hydrateDates([{ sent_at: null }], ["sent_at"]);
    expect(row?.sent_at).toBeNull();
  });

  it("does not mutate the rows it was given", () => {
    const rows = [{ occurred_at: "2026-09-16 11:00:00+00" }];
    hydrateDates(rows, ["occurred_at"]);
    expect(typeof rows[0]?.occurred_at).toBe("string");
  });

  it("handles an empty result set", () => {
    expect(hydrateDates([], ["occurred_at"])).toEqual([]);
  });
});
