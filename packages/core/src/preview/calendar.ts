/**
 * Section 9 item 4. The next seven days, beside the queue.
 *
 * Every day boundary here is computed in a named timezone, not in UTC. That is
 * the whole point of this file. A New York operator looking at a strip built
 * in UTC sees anything after 20:00 local filed under tomorrow, and "tomorrow"
 * is exactly the word that makes someone not act on it today. The timezone
 * comes from `automation_settings.send_timezone`, so the strip agrees with the
 * window the dispatcher actually sends in.
 *
 * Day arithmetic is done from a noon anchor rather than by adding 24 hours to
 * midnight. On the two days a year a local day is 23 or 25 hours long, adding
 * 24 hours to midnight lands in the wrong day and the strip silently skips or
 * repeats one.
 */

export interface CalendarItem {
  readonly enrollmentId: string;
  readonly contactId: string;
  readonly name: string;
  readonly firmName: string;
  readonly tier: number | null;
  readonly dueAt: Date;
  readonly sequenceName: string;
  readonly nextStepNumber: number;
}

export interface CalendarDay {
  /** Local date, YYYY-MM-DD, in the timezone the strip was built for. */
  readonly key: string;
  /** Day of the month, for the cell. */
  readonly label: string;
  readonly weekday: string;
  readonly isToday: boolean;
  readonly items: readonly CalendarItem[];
  /** Due before today and still not sent. Shown on today, flagged as late. */
  readonly overdue: readonly CalendarItem[];
}

/** `2026-09-16` for this instant, in this timezone. */
export function localDayKey(at: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD, which sorts and compares as a string.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

function weekdayName(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(at);
}

/**
 * A Date at roughly midday of the given local date, which is far enough from
 * either boundary that no DST shift moves it into an adjacent day.
 */
function noonAnchor(key: string): Date {
  const [year, month, day] = key.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12));
}

function addDays(anchor: Date, days: number): Date {
  return new Date(anchor.getTime() + days * 24 * 60 * 60 * 1000);
}

export function buildCalendarDays(
  now: Date,
  items: readonly CalendarItem[],
  options: { readonly timeZone: string; readonly days?: number },
): CalendarDay[] {
  const { timeZone } = options;
  const days = options.days ?? 7;

  const todayKey = localDayKey(now, timeZone);
  const anchor = noonAnchor(todayKey);

  const overdue = items.filter((item) => localDayKey(item.dueAt, timeZone) < todayKey);

  const result: CalendarDay[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const dayAnchor = addDays(anchor, offset);
    const key = localDayKey(dayAnchor, timeZone);
    result.push({
      key,
      label: String(Number.parseInt(key.slice(8, 10), 10)),
      weekday: weekdayName(dayAnchor, timeZone),
      isToday: offset === 0,
      items: items.filter((item) => localDayKey(item.dueAt, timeZone) === key),
      overdue: offset === 0 ? overdue : [],
    });
  }

  return result;
}
