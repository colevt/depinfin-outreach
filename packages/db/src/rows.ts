/**
 * Row hydration for raw queries.
 *
 * drizzle's `execute` returns driver rows without the column type information
 * the query builder has, so a timestamptz arrives as a string. A row type that
 * says `Date` is then a lie the type checker cannot catch, and the first thing
 * to call `.toISOString()` or hand the value to `Intl.DateTimeFormat` fails at
 * runtime having typechecked cleanly.
 *
 * Every raw query in this package that selects a timestamp runs its rows
 * through `hydrateDates` so the values match what the types promise.
 */

/** Converts the named columns to Date in place of whatever the driver returned. */
export function hydrateDates<T extends Record<string, unknown>>(
  rows: readonly T[],
  keys: readonly (keyof T)[],
): T[] {
  return rows.map((row) => {
    const copy = { ...row } as Record<string, unknown>;
    for (const key of keys) {
      copy[key as string] = asDate(row[key]);
    }
    return copy as T;
  });
}

/**
 * A Date, or null when there was nothing there. An unparseable value is null
 * rather than an Invalid Date, because Invalid Date propagates silently and a
 * null is visible at the first use.
 */
export function asDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}
