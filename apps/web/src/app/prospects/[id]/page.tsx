import { notFound } from "next/navigation";
import type { ProspectView } from "@depinfin/compliance";
import { draftLinkedInMessage } from "@depinfin/core";
import { CopyButton } from "../../../components/CopyButton.js";
import { QueueActions } from "../../../components/QueueActions.js";
import { formatWhen } from "../../../server/calendar.js";
import { displayName, jurisdictionLabel, tierLabel } from "../../../server/now.js";
import { getStore } from "../../../server/store.js";

export default async function ProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const prospect = await store.getProspect(id);
  if (!prospect) notFound();
  const history = await store.listActivityForContact(id);

  const view: ProspectView = {
    contactId: prospect.contactId,
    email: prospect.email ?? "",
    firstName: prospect.firstName,
    lastName: prospect.lastName,
    title: prospect.title,
    firmName: prospect.firmName,
    personalReason: prospect.personalReason,
    doNotContact: prospect.doNotContact,
    tier: prospect.tier,
    jurisdiction: prospect.jurisdiction,
  };
  const draft = draftLinkedInMessage({
    prospect: view,
    linkedinUrl: prospect.linkedinUrl,
  });

  const replied = prospect.enrollments.find((e) => e.status === "replied");

  return (
    <main>
      <h1 className="page-title">{displayName(prospect.firstName, prospect.lastName)}</h1>
      <p className="lede">
        {prospect.title ? `${prospect.title}, ` : ""}
        {prospect.firmName}
      </p>
      <div className="chips">
        <span className={prospect.tier === 1 ? "chip chip-tier1" : "chip"}>{tierLabel(prospect.tier)}</span>
        {prospect.score !== null ? <span className="chip">Score {prospect.score}</span> : null}
        <span className="chip">{jurisdictionLabel(prospect.jurisdiction)}</span>
        {prospect.doNotContact ? <span className="chip chip-blocked">Do not contact</span> : null}
      </div>
      <div className="columns" style={{ marginTop: 24 }}>
        <section className="card">
          <h2>Record</h2>
          <p className="mono">{prospect.email ?? "No email"}</p>
          <p>
            <strong>Personal reason.</strong> {prospect.personalReason ?? "Empty"}
          </p>
          <p>
            <strong>Warm path.</strong> {prospect.warmPathContact ?? "None on file"}
          </p>
          <p className="meta">
            {prospect.firmType ?? "untyped"} · {prospect.aumBand ?? "aum unknown"} · source{" "}
            {prospect.source ?? "unknown"}
          </p>
          {prospect.notes ? <p>{prospect.notes}</p> : null}
          {replied ? (
            <QueueActions enrollmentId={replied.enrollmentId} contactId={prospect.contactId} />
          ) : null}
        </section>
        <section className="card">
          <h2>LinkedIn draft</h2>
          <p className="meta">
            INV-8. Copy and send from your own account. There is no send button here.
          </p>
          {draft.profileUrl ? (
            <p>
              <a href={draft.profileUrl} target="_blank" rel="noreferrer">
                Open profile
              </a>
            </p>
          ) : (
            <p className="meta">No profile URL on file</p>
          )}
          {draft.available ? (
            <>
              <pre className="draft">{draft.text}</pre>
              <div className="actions">
                <CopyButton text={draft.text} />
              </div>
            </>
          ) : (
            <p className="reason">{draft.reason}</p>
          )}
        </section>
      </div>
      <section style={{ marginTop: 28 }}>
        <h2>Sequences</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Sequence</th>
              <th>Status</th>
              <th>Step</th>
              <th>Next due</th>
            </tr>
          </thead>
          <tbody>
            {prospect.enrollments.map((enrollment) => (
              <tr key={enrollment.enrollmentId}>
                <td>
                  {enrollment.sequenceName}
                  <div className="meta">{enrollment.transport}</div>
                </td>
                <td>{enrollment.status.replace("_", " ")}</td>
                <td className="mono">
                  {enrollment.currentStep}/{enrollment.maxSteps}
                </td>
                <td className="mono">{enrollment.nextDueAt ? formatWhen(enrollment.nextDueAt) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section style={{ marginTop: 28 }}>
        <h2>History</h2>
        {history.length === 0 ? <p className="meta">No activity logged.</p> : null}
        <ol className="history">
          {history.map((row) => (
            <li key={row.id}>
              <div className="meta">
                {formatWhen(row.occurredAt)} · {row.actor} · {row.action}
                {row.templateKey ? ` · ${row.templateKey}` : ""}
              </div>
              <div>{reasonFromDetail(row.detail) ?? JSON.stringify(row.detail)}</div>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

function reasonFromDetail(detail: Record<string, unknown>): string | null {
  if (typeof detail.reason === "string") return detail.reason;
  if (detail.to && detail.from) return `Moved from ${String(detail.from)} to ${String(detail.to)}`;
  return null;
}
