import { listTemplates } from "@depinfin/db";
import { COPY_RULES, DO_NOT_CLAIM } from "@depinfin/core";
import { db } from "../../lib/db";
import { humanize } from "../../lib/view";

export const dynamic = "force-dynamic";

/**
 * Templates, grouped by who they are for.
 *
 * Every one is corporate content, enforced by a check constraint rather than
 * by discipline. Offering material is not here and has no route to here: it
 * lives in a separate table with no join to a sequence step, and reaching it
 * requires a verified accreditation record, which is out of scope for v1.
 */
export default async function TemplatesPage() {
  const templates = await listTemplates(db());

  const groups = new Map<string, typeof templates>();
  for (const template of templates) {
    const key = `${template.side}|${template.channel}`;
    const existing = groups.get(key) ?? [];
    existing.push(template);
    groups.set(key, existing);
  }

  return (
    <>
      <h1>Templates</h1>
      <p className="lede">
        {templates.length} templates, targeted by side, prospect type, and stage. A template that
        names prospect types is only offered for those types. One that names none is a general
        fallback and ranks below a targeted match.
      </p>

      {[...groups.entries()].map(([key, group]) => {
        const [side, channel] = key.split("|");
        return (
          <section key={key}>
            <h2>
              {side === "buy" ? "Buy side, capital" : "Sell side, operators"} ·{" "}
              {channel === "linkedin" ? "LinkedIn messages" : "Email"}
            </h2>

            {channel === "linkedin" ? (
              <div className="note">
                These are drafted here and sent by a human from their own account. A LinkedIn
                template cannot be attached to a sequence step, enforced by a foreign key rather
                than by a code review.
              </div>
            ) : null}

            {group.map((template) => (
              <div className="card" key={template.id}>
                <div className="row">
                  <strong className="mono">{template.key}</strong>
                  <span className="tag">{humanize(template.stage)}</span>
                  <span className="tag good">{template.content_tier}</span>
                  {template.audience_firm_types.length > 0
                    ? template.audience_firm_types.map((type) => (
                        <span className="tag" key={type}>
                          {humanize(type)}
                        </span>
                      ))
                    : null}
                  {template.audience_operator_categories.length > 0
                    ? template.audience_operator_categories.map((type) => (
                        <span className="tag" key={type}>
                          {humanize(type)}
                        </span>
                      ))
                    : null}
                  {template.audience_firm_types.length === 0 &&
                  template.audience_operator_categories.length === 0 ? (
                    <span className="tag">any type on this side</span>
                  ) : null}
                </div>

                {template.notes === null ? null : (
                  <div className="muted" style={{ margin: "6px 0" }}>
                    {template.notes}
                  </div>
                )}

                {template.subject === "" ? null : (
                  <pre className="copyable">{template.subject}</pre>
                )}
                <pre className="copyable">{template.body}</pre>
              </div>
            ))}
          </section>
        );
      })}

      <h2>The rules every one of these follows</h2>
      <div className="card tight">
        {COPY_RULES.map((rule) => (
          <div key={rule.id} style={{ marginBottom: 10 }}>
            <div>
              {rule.rule}{" "}
              {rule.enforcedByLinter ? (
                <span className="tag bad">refused by the linter</span>
              ) : (
                <span className="tag">house rule</span>
              )}
            </div>
            {rule.instead === null ? null : <div className="muted">{rule.instead}</div>}
          </div>
        ))}
      </div>

      <h3>Never claim</h3>
      <div className="card tight">
        <ul style={{ margin: 0, paddingLeft: 18 }} className="muted">
          {DO_NOT_CLAIM.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
