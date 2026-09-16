import Link from "next/link";
import { SkipReason } from "../../components/SkipReason";
import { evaluatePreviewRow, splitPreview } from "../../server/preview";
import { deskNow, tierLabel } from "../../server/now";
import { getStore } from "../../server/store";

export default async function SendsPage() {
  const store = getStore();
  const now = deskNow(store);
  const [rows, suppressions, logged, sentToday] = await Promise.all([
    store.listSendPreviewRows(now),
    store.listActiveSuppressions(),
    store.listTodaysLog(now),
    store.countSentToday(now),
  ]);

  const decisions = rows.map((row) => evaluatePreviewRow(row, suppressions, now));
  const { ready, held } = splitPreview(decisions);
  const cap = Number.parseInt(process.env["DAILY_SEND_CAP"] ?? "40", 10);

  return (
    <main>
      <h1 className="page-title">Today&apos;s sends</h1>
      <p className="lede">
        Ready means evaluateSend allowed it. Held reasons are the pipeline text, not
        gate numbers. This page does not send mail.
      </p>
      <p className="mono">
        {sentToday} of {Number.isInteger(cap) ? cap : 40} sent today, counted from the log.
      </p>
      <div className="columns" style={{ marginTop: 24 }}>
        <section>
          <h2>Will go out</h2>
          {ready.length === 0 ? <p className="empty">Nothing ready.</p> : null}
          {ready.map((row) => (
            <article key={row.enrollmentId} className="card">
              <div className="name">{row.name}</div>
              <div className="chips">
                <span className="chip chip-ready">Ready to send</span>
                <span className={row.tier === 1 ? "chip chip-tier1" : "chip"}>{tierLabel(row.tier)}</span>
                <span className="chip">{row.transport}</span>
              </div>
              <p>{row.firmName}</p>
              {row.subject ? <p className="meta">{row.subject}</p> : null}
              <SkipReason reason={row.reason} />
              <Link href={`/prospects/${row.contactId}`}>Open prospect</Link>
            </article>
          ))}
        </section>
        <section>
          <h2>Held</h2>
          {held.length === 0 ? <p className="empty">Nothing held.</p> : null}
          {held.map((row) => (
            <article key={row.enrollmentId} className="card">
              <div className="name">{row.name}</div>
              <div className="chips">
                <span className="chip chip-held">Held</span>
                <span className={row.tier === 1 ? "chip chip-tier1" : "chip"}>{tierLabel(row.tier)}</span>
              </div>
              <p>{row.firmName}</p>
              <SkipReason reason={row.reason} />
              <Link href={`/prospects/${row.contactId}`}>Open prospect</Link>
            </article>
          ))}
        </section>
      </div>
      <section style={{ marginTop: 36 }}>
        <h2>Already logged today</h2>
        {logged.length === 0 ? <p className="meta">No send, skip, block, or error yet today.</p> : null}
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Action</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {logged.map((row) => (
              <tr key={row.id}>
                <td className="mono">{row.occurredAt.toISOString().slice(11, 16)}</td>
                <td>
                  {row.contactId ? (
                    <Link href={`/prospects/${row.contactId}`}>
                      {row.name ?? row.email ?? "unknown"}
                    </Link>
                  ) : (
                    row.name ?? "—"
                  )}
                  <div className="meta">{row.firmName}</div>
                </td>
                <td>{row.action}</td>
                <td>
                  <SkipReason reason={row.reason} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
