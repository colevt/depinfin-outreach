import type { CalendarRow } from "@depinfin/db";

export interface CalendarDay {
  readonly key: string;
  readonly label: string;
  readonly weekday: string;
  readonly date: Date;
  readonly isToday: boolean;
  readonly items: readonly CalendarRow[];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function buildCalendarDays(now: Date, items: readonly CalendarRow[], days = 7): CalendarDay[] {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const result: CalendarDay[] = [];

  for (let i = 0; i < days; i += 1) {
    const date = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    const key = date.toISOString().slice(0, 10);
    result.push({
      key,
      label: String(date.getUTCDate()),
      weekday: WEEKDAYS[date.getUTCDay()] ?? "",
      date,
      isToday: i === 0,
      items: items.filter((item) => sameUtcDay(item.dueAt, date)),
    });
  }

  return result;
}

function sameUtcDay(value: Date, day: Date): boolean {
  return (
    value.getUTCFullYear() === day.getUTCFullYear() &&
    value.getUTCMonth() === day.getUTCMonth() &&
    value.getUTCDate() === day.getUTCDate()
  );
}

export function relativeTime(value: Date, now: Date): string {
  const delta = now.getTime() - value.getTime();
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function formatWhen(value: Date): string {
  return value.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}
