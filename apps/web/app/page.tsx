import Link from "next/link";
import {
  actionQueue,
  listActiveSuppressions,
  listCalendarWindow,
  listSendPreviewRows,
  loadAutomationSettings,
  todaysActivity,
} from "@depinfin/db";
import {
  buildCalendarDays,
  evaluatePreviewRow,
  groupHeldReasons,
  splitPreview,
} from "@depinfin/core";
import { db } from "../lib/db";
import { ago, formatWhen, humanize, tierLabel } from "../lib/view";

export const dynamic = "force-dynamic";

/**
 * Section 9 items 1, 2 and 4, on one screen.
 *
 * The queue is everything in `replied` status, newest first, and it is the
 * only thing that matters most mornings. Under it, what the dispatcher is
 * about to do and what it will refuse, then what it already did today. The
 * calendar strip sits alongside, as section 9 asks.
 *
 * Every verdict here comes from `evaluateSend` in packages/compliance, the
 * same function the worker calls, so the reason on this screen is the string
 * that will land in the audit log. The reasons are rendered as written. They
 * are already meant for a person.
 */
export default async function QueuePage() {
  const now = new Date();

  const [queue, settings, previewRows, suppressions, calendarRows] = await Promise.all([
    actionQueue(db()),
    loadAutomationSettings(db()),
    listSendPreviewRows(db(), now),
    listActiveSuppressions(db()),
    listCalendarWindow(db(), now, 7),
  ]);

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const today = await todaysActivity(db(), since);

  const decisions = previewRows.map((row) => evaluatePreviewRow(row, suppressions, now));
  const { ready, held } = splitPreview(decisions);
  const heldReasons = groupHeldReasons(decisions);

  // The strip is built in the timezone the dispatcher sends in, not in UTC. A
  // step due at 9pm in New York belongs on tonight's cell, not tomorrow's.
  const days = buildCalendarDays(
    now,
    calendarRows.map((row) => ({
      enrollmentId: row.enrollment_id,
      contactId: row.contact_id,
      name: row.name,
      firmName: row.firm_name,
      tier: row.tier,
      dueAt: row.due_at ?? now,
      sequenceName: row.sequence_name,
      nextStepNumber: row.next_step_number,
    })),
    { timeZone: settings.send_timezone },
  );

  const sent = today.filter((row) => row.action === "sent");
  const refused = today.filter((row) => row.action !== "sent");

  return (
    <>
      <h1>Queue</h1>
      <p className="lede">
        {queue.length === 0
          ? "Nobody is waiting on you."
          : `${queue.length} ${queue.length === 1 ? "person has" : "people have"} written back. ` +
            "Automation will not touch any of them again until you act."}
      </p>

      {!settings.sequences_enabled ? (
        <div className="gate-banner">
          <strong>Sequences are off.</strong> Nothing is dispatching. Turn them on in{" "}
          <Link href="/automation">Automation</Link> when you are ready.
        </div>
      ) : null}

      <div className="grid">
        <div>
          {queue.length === 0 ? (
            <div className="empty">Nothing in the queue.</div>
          ) : (
            queue.map((row) => (
              <div className="card" key={row.contact_id}>
                <div className="spread">
                  <div>
                    <div className="row">
                      <Link href={`/prospects/${row.contact_id}`}>
                        <strong>{row.name}</strong>
                      </Link>
                      <span className="muted">
                        {row.title === null ? "" : `${row.title}, `}
                        {row.firm_name}
                      </span>
                      {row.tier === 1 ? <span className="tag t1">tier 1</span> : null}
                      {row.suppressed ? <span className="tag bad">suppressed</span> : null}
                    </div>
                    <div className="muted" style={{ marginTop: 4 }}>
                      replied {ago(row.replied_at)}
                      {row.firm_type === null ? "" : ` · ${humanize(row.firm_type)}`}
                      {` · ${row.side} side · ${tierLabel(row.tier)}`}
                    </div>
                  </div>
                  <Link className="btn primary" href={`/prospects/${row.contact_id}?kind=reply`}>
                    Write reply
                  </Link>
                </div>
              </div>
            ))
          )}

          <h2>Next to go out</h2>
          <div className="row" style={{ marginBottom: 10 }}>
            <span className="tag good">{ready.length} will send</span>
            <span className="tag bad">{held.length} held</span>
            <span className="tag">cap {settings.daily_send_cap}</span>
          </div>

          {decisions.length === 0 ? (
            <div className="empty">Nothing is queued to dispatch.</div>
          ) : (
            <>
              {heldReasons.length > 0 ? (
                <div className="card tight">
                  <h3 style={{ marginTop: 0 }}>Held because</h3>
                  {heldReasons.map((entry) => (
                    <div className="row" key={entry.reason}>
                      <span className="tag bad">{entry.count}</span>
                      {/* Verbatim from the pipeline. Section 9. */}
                      <span>{entry.reason}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              <table>
                <thead>
                  <tr>
                    <th>Who</th>
                    <th>Sequence</th>
                    <th>Step</th>
                    <th>What happens</th>
                  </tr>
                </thead>
                <tbody>
                  {decisions.map((decision) => (
                    <tr key={decision.enrollmentId}>
                      <td>
                        <Link href={`/prospects/${decision.contactId}`}>{decision.name}</Link>
                        <div className="muted">{decision.firmName}</div>
                      </td>
                      <td className="muted">
                        {decision.sequenceName}
                        <div>
                          <span className={`tag ${decision.transport === "cold" ? "bad" : ""}`}>
                            {decision.transport}
                          </span>
                        </div>
                      </td>
                      <td className="muted">{decision.stepNumber}</td>
                      <td>
                        {decision.willDispatch ? (
                          <>
                            <span className="tag good">will send</span>
                            <div className="muted">{decision.subject}</div>
                          </>
                        ) : (
                          <>
                            <span className="tag bad">held</span>
                            <div className="muted">{decision.reason}</div>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h2>Already today</h2>
          <div className="row" style={{ marginBottom: 10 }}>
            <span className="tag good">{sent.length} sent</span>
            <span className="tag">{refused.length} skipped or blocked</span>
          </div>

          {today.length === 0 ? (
            <div className="empty">Nothing has run today.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>What</th>
                  <th>Who</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {today.map((row, index) => (
                  <tr key={`${row.occurred_at.toISOString()}-${index}`}>
                    <td className="muted">{formatWhen(row.occurred_at)}</td>
                    <td>
                      <span
                        className={`tag ${
                          row.action === "sent" ? "good" : row.action === "blocked" ? "bad" : ""
                        }`}
                      >
                        {row.action}
                      </span>
                    </td>
                    <td>
                      {row.name}
                      {row.firm_name === "" ? "" : <span className="muted"> · {row.firm_name}</span>}
                    </td>
                    <td className="muted">{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <aside>
          <h2 style={{ marginTop: 0 }}>Next seven days</h2>
          <div className="muted" style={{ marginBottom: 8 }}>
            {settings.send_timezone}
          </div>

          <div className="strip">
            {days.map((day) => (
              <div className={`strip-day${day.isToday ? " today" : ""}`} key={day.key}>
                <div className="strip-weekday">{day.weekday}</div>
                <div className="strip-date">{day.label}</div>
                <div className={`strip-count${day.items.length === 0 ? " none" : ""}`}>
                  {day.items.length === 0 ? "" : day.items.length}
                </div>
              </div>
            ))}
          </div>

          {(days[0]?.overdue.length ?? 0) > 0 ? (
            <div className="card tight" style={{ marginTop: 12 }}>
              <h3 style={{ marginTop: 0 }}>Overdue</h3>
              {(days[0]?.overdue ?? []).map((item) => (
                <div key={item.enrollmentId} style={{ marginBottom: 6 }}>
                  <Link href={`/prospects/${item.contactId}`}>{item.name}</Link>
                  <div className="muted">
                    {item.firmName} · due {ago(item.dueAt)}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {days.map((day) =>
            day.items.length === 0 ? null : (
              <div className="card tight" key={day.key} style={{ marginTop: 12 }}>
                <h3 style={{ marginTop: 0 }}>
                  {day.isToday ? "Today" : `${day.weekday} ${day.label}`}
                </h3>
                {day.items.map((item) => (
                  <div key={item.enrollmentId} style={{ marginBottom: 6 }}>
                    <Link href={`/prospects/${item.contactId}`}>{item.name}</Link>
                    {item.tier === 1 ? <span className="tag t1">tier 1</span> : null}
                    <div className="muted">
                      {item.firmName} · step {item.nextStepNumber}
                    </div>
                  </div>
                ))}
              </div>
            ),
          )}
        </aside>
      </div>
    </>
  );
}
