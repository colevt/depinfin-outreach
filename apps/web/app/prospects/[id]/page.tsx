import Link from "next/link";
import { notFound } from "next/navigation";
import { guidanceFor, matchTemplates, type ProspectContext, type TemplateRecord } from "@depinfin/core";
import {
  draftsForContact,
  getProspect,
  historyFor,
  listTemplates,
  researchFor,
} from "@depinfin/db";
import { db } from "../../../lib/db";
import { ago, formatWhen, humanize, tierLabel } from "../../../lib/view";
import { toProspectView } from "../../../lib/view";
import { Composer, type ComposerTemplate } from "./composer";
import { discardDraftAction, markLinkedInSentAction, setReasonAction } from "../../../lib/actions";

export const dynamic = "force-dynamic";

/**
 * Section 9 item 3. One prospect, everything about them, and the place where
 * mail to them gets written.
 *
 * The guidance panel on the right comes from the knowledge layer, so what an
 * operator is reminded of here is the same thing the rest of the system knows.
 */
export default async function ProspectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const { id } = await params;
  const { kind } = await searchParams;

  const prospect = await getProspect(db(), id);
  if (prospect === null) notFound();

  const [history, drafts, templates, research] = await Promise.all([
    historyFor(db(), id),
    draftsForContact(db(), id),
    listTemplates(db()),
    researchFor(db(), id),
  ]);

  const context: ProspectContext = {
    prospect: toProspectView(prospect),
    side: prospect.side,
    firmType: (prospect.firm_type as ProspectContext["firmType"]) ?? null,
    operatorCategory: (prospect.operator_category as ProspectContext["operatorCategory"]) ?? null,
  };

  const initialKind =
    kind === "reply" || kind === "follow_up" || kind === "first_touch"
      ? kind
      : prospect.enrollment_status === "replied"
        ? "reply"
        : "first_touch";

  const guidance = guidanceFor(context, initialKind, "email");

  // Templates that fit this prospect, ranked, with the reason they fit. The
  // matcher lives in packages/core so the desk and any future caller offer the
  // same set.
  const records: TemplateRecord[] = templates.map((t) => ({
    id: t.id,
    key: t.key,
    subject: t.subject,
    body: t.body,
    contentTier: "corporate",
    side: t.side,
    stage: t.stage as TemplateRecord["stage"],
    audienceFirmTypes: t.audience_firm_types as TemplateRecord["audienceFirmTypes"],
    audienceOperatorCategories:
      t.audience_operator_categories as TemplateRecord["audienceOperatorCategories"],
  }));

  const channelByTemplateId = new Map(templates.map((t) => [t.id, t.channel]));
  const offered: ComposerTemplate[] = (["first_touch", "follow_up", "reply"] as const).flatMap(
    (stage) =>
      matchTemplates(records, context, stage).map((match) => ({
        id: match.template.id,
        key: match.template.key,
        subject: match.template.subject,
        body: match.template.body,
        channel: channelByTemplateId.get(match.template.id) ?? "email",
        stage,
        why: match.why,
      })),
  );

  const openDrafts = drafts.filter((d) => d.status === "draft");
  const hasReason =
    prospect.personal_reason !== null && prospect.personal_reason.trim() !== "";

  return (
    <>
      <div className="spread">
        <div>
          <h1>{prospect.name}</h1>
          <div className="row muted">
            {prospect.title === null ? null : <span>{prospect.title}</span>}
            <span>{prospect.firm_name}</span>
            <span>{humanize(prospect.firm_type ?? prospect.operator_category)}</span>
            <span>{prospect.side} side</span>
            <span>{tierLabel(prospect.tier)}</span>
            {prospect.score === null ? null : <span>score {prospect.score}</span>}
            <span>{prospect.jurisdiction.toUpperCase()}</span>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            {prospect.email === null ? (
              <span className="tag bad">no address</span>
            ) : (
              <span className="mono">{prospect.email}</span>
            )}
            {prospect.linkedin_url === null ? null : (
              <a href={prospect.linkedin_url} target="_blank" rel="noreferrer noopener">
                LinkedIn profile
              </a>
            )}
          </div>
        </div>
        <Link className="btn quiet" href="/prospects">
          Back to list
        </Link>
      </div>

      {prospect.suppressed || prospect.do_not_contact ? (
        <div className="gate-banner" style={{ marginTop: 16 }}>
          <strong>Nothing can go to this person.</strong>{" "}
          {prospect.do_not_contact
            ? "They are marked do not contact."
            : "Their address or domain is suppressed."}{" "}
          A suppression is permanent by design and cannot be deleted from here.
        </div>
      ) : null}

      <div className="grid" style={{ marginTop: 20 }}>
        <div>
          <h2>Write</h2>

          {!hasReason ? (
            <div className="card">
              <div className="blocker">
                No reason for contact on file. Nothing can be sent until there is one.
              </div>
              <form action={setReasonAction}>
                <input type="hidden" name="contactId" value={prospect.contact_id} />
                <label className="field">
                  <span>
                    Why this person, specifically. Something verifiable, not a category.
                  </span>
                  <input
                    type="text"
                    name="reason"
                    placeholder="spoke on the DePIN panel in Austin in June"
                  />
                </label>
                <button className="btn primary" type="submit">
                  Save reason
                </button>
              </form>
            </div>
          ) : (
            <Composer
              contactId={prospect.contact_id}
              templates={offered}
              initialKind={initialKind}
              firstName={prospect.first_name}
            />
          )}

          {openDrafts.length > 0 ? (
            <>
              <h3>Open drafts</h3>
              {openDrafts.map((draft) => (
                <div className="card tight" key={draft.id}>
                  <div className="spread">
                    <div>
                      <div className="row">
                        <span className="tag">{humanize(draft.kind)}</span>
                        <span className="tag">{draft.channel}</span>
                        {draft.lint_clean ? (
                          <span className="tag good">clean</span>
                        ) : (
                          <span className="tag bad">blocked</span>
                        )}
                        <span className="muted">{ago(draft.updated_at)}</span>
                      </div>
                      {draft.subject === "" ? null : (
                        <div style={{ marginTop: 6 }}>{draft.subject}</div>
                      )}
                      <pre className="copyable" style={{ marginTop: 6 }}>
                        {draft.body}
                      </pre>
                    </div>
                  </div>
                  <div className="row">
                    {draft.channel === "linkedin" && draft.lint_clean ? (
                      <form action={markLinkedInSentAction}>
                        <input type="hidden" name="draftId" value={draft.id} />
                        <input type="hidden" name="contactId" value={prospect.contact_id} />
                        {/* INV-8. This records that a human sent it. It does
                            not send anything. */}
                        <button className="btn" type="submit">
                          I sent this on LinkedIn
                        </button>
                      </form>
                    ) : null}
                    <form action={discardDraftAction}>
                      <input type="hidden" name="draftId" value={draft.id} />
                      <input type="hidden" name="contactId" value={prospect.contact_id} />
                      <button className="btn quiet" type="submit">
                        Discard
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </>
          ) : null}

          <h2>History</h2>
          {history.length === 0 ? (
            <div className="empty">Nothing logged yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>What</th>
                  <th>Who</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id}>
                    <td className="muted">{formatWhen(row.occurred_at)}</td>
                    <td>
                      <span className="tag">{row.action}</span>
                    </td>
                    <td className="muted">{row.actor}</td>
                    <td className="muted">
                      {typeof row.detail["reason"] === "string"
                        ? row.detail["reason"]
                        : row.template_key ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <aside>
          <h2>Before you write</h2>

          {guidance.notes.map((note, index) => (
            <div className="note" key={index}>
              {note}
            </div>
          ))}

          {guidance.angle === null ? null : (
            <div className="card tight">
              <h3>Why they would care</h3>
              <div>{guidance.angle}</div>
              {guidance.leadWith === null ? null : (
                <>
                  <h3>Lead with</h3>
                  <div>{guidance.leadWith}</div>
                </>
              )}
              {guidance.objection === null ? null : (
                <>
                  <h3>Expect</h3>
                  <div>{guidance.objection}</div>
                </>
              )}
            </div>
          )}

          <div className="card tight">
            <h3>Never claim</h3>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {guidance.doNotClaim.map((item, index) => (
                <li key={index} className="muted">
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="card tight">
            <h3>House copy rules</h3>
            {guidance.copyRules.map((rule, index) => (
              <div key={index} style={{ marginBottom: 8 }}>
                <div>{rule.rule}</div>
                {rule.instead === null ? null : (
                  <div className="muted">{rule.instead}</div>
                )}
              </div>
            ))}
          </div>

          <div className="card tight">
            <h3>Research on file</h3>
            {research.length === 0 ? (
              <div className="muted">
                None. <Link href={`/research?contactId=${prospect.contact_id}`}>Add some</Link>.
              </div>
            ) : (
              research.map((note) => (
                <div key={note.id} style={{ marginBottom: 10 }}>
                  <div>{note.headline}</div>
                  <div className="muted">
                    {note.provider} · {formatWhen(note.created_at)}
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
