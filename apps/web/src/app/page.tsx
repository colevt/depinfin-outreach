import { CalendarStrip } from "../components/CalendarStrip";
import { QueueActions } from "../components/QueueActions";
import { buildCalendarDays, relativeTime } from "../server/calendar";
import { deskNow, displayName, jurisdictionLabel, tierLabel } from "../server/now";
import { getStore } from "../server/store";

export default async function QueuePage() {
  const store = getStore();
  const now = deskNow(store);
  const [queue, calendar] = await Promise.all([
    store.listActionQueue(),
    store.listCalendarWindow(now, 7),
  ]);
  const days = buildCalendarDays(now, calendar, 7);

  return (
    <main>
      <h1 className="page-title">Replies waiting</h1>
      <p className="lede">
        Everyone in replied, newest first. Automation will not write them again until
        you resume, which is logged.
      </p>
      <CalendarStrip days={days} />
      {queue.length === 0 ? (
        <p className="empty">No replies waiting. Check today&apos;s sends.</p>
      ) : (
        <section className="queue" aria-label="Action queue">
          {queue.map((item) => (
            <article key={item.enrollmentId} className="card">
              <div className="card-top">
                <div className="name">{displayName(item.firstName, item.lastName)}</div>
                <div className="meta">
                  {item.repliedAt ? relativeTime(item.repliedAt, now) : "time unknown"}
                </div>
              </div>
              <div className="chips">
                <span className="chip chip-replied">Replied</span>
                <span className={item.tier === 1 ? "chip chip-tier1" : "chip"}>{tierLabel(item.tier)}</span>
                <span className="chip">{jurisdictionLabel(item.jurisdiction)}</span>
                <span className="chip">{item.transport} · {item.sequenceName}</span>
              </div>
              <p>
                {item.title ? `${item.title}, ` : ""}
                {item.firmName}
              </p>
              {item.personalReason ? <p className="reason">{item.personalReason}</p> : null}
              {item.warmPathContact ? (
                <p className="meta">Warm path: {item.warmPathContact}</p>
              ) : (
                <p className="meta">No warm path on file</p>
              )}
              <QueueActions enrollmentId={item.enrollmentId} contactId={item.contactId} />
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
