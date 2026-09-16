import Link from "next/link";
import type { CalendarDay } from "../server/calendar";

export function CalendarStrip({ days }: { days: readonly CalendarDay[] }) {
  return (
    <section className="calendar" aria-label="Next seven days">
      {days.map((day) => (
        <div key={day.key} className="day" data-today={day.isToday ? "true" : "false"}>
          <div className="day-head">
            <span>{day.weekday}</span>
            <span>{day.label}</span>
          </div>
          {day.items.length === 0 ? <div className="meta">Clear</div> : null}
          {day.items.map((item) => (
            <Link key={item.enrollmentId} href={`/prospects/${item.contactId}`}>
              {item.firstName} {item.lastName ?? ""}
              <div className="meta">
                {item.firmName}
                {item.tier ? ` · T${item.tier}` : ""}
              </div>
            </Link>
          ))}
        </div>
      ))}
    </section>
  );
}
