"use client";

import { useActionState, useState } from "react";
import {
  type ComposeState,
  checkDraft,
  saveDraftAction,
} from "../../../lib/actions";

export interface ComposerTemplate {
  readonly id: string;
  readonly key: string;
  readonly subject: string;
  readonly body: string;
  readonly channel: string;
  readonly stage: string;
  readonly why: string;
}

/**
 * The editor.
 *
 * Two things it deliberately does not do. It does not evaluate anything
 * itself: every verdict on this screen comes back from the server, where
 * packages/compliance decides. And it has no send button for a LinkedIn
 * message, only a copy button (INV-8), because a human sends those from their
 * own account.
 */
export function Composer({
  contactId,
  templates,
  initialKind,
  firstName,
}: {
  contactId: string;
  templates: readonly ComposerTemplate[];
  initialKind: "first_touch" | "follow_up" | "reply";
  firstName: string;
}) {
  const [kind, setKind] = useState(initialKind);
  const [channel, setChannel] = useState<"email" | "linkedin">("email");
  const [templateId, setTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [copied, setCopied] = useState(false);

  const [checkState, runCheck, checking] = useActionState<ComposeState | null, FormData>(
    checkDraft,
    null,
  );
  const [saveState, runSave, saving] = useActionState<ComposeState | null, FormData>(
    saveDraftAction,
    null,
  );

  const state = saveState ?? checkState;
  const available = templates.filter(
    (t) => t.channel === channel && stageFor(kind) === t.stage,
  );

  function applyTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((t) => t.id === id);
    if (template === undefined) return;
    // Merge fields are resolved on the server, where the prospect's record is.
    // What shows here is the raw template until the first check comes back.
    setSubject(template.subject);
    setBody(template.body);
  }

  async function copyOut() {
    const text = channel === "email" ? `${subject}\n\n${body}` : body;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const resolved = state === null ? { subject, body } : { subject: state.subject, body: state.body };

  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 12 }}>
        <label className="field" style={{ marginBottom: 0, maxWidth: 170 }}>
          <span>What is this</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="first_touch">First contact</option>
            <option value="follow_up">Follow up</option>
            <option value="reply">Reply to them</option>
          </select>
        </label>
        <label className="field" style={{ marginBottom: 0, maxWidth: 150 }}>
          <span>Channel</span>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as "email" | "linkedin")}
          >
            <option value="email">Email</option>
            <option value="linkedin">LinkedIn</option>
          </select>
        </label>
        <label className="field" style={{ marginBottom: 0, flex: 1, minWidth: 220 }}>
          <span>Start from</span>
          <select value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
            <option value="">Blank</option>
            {available.map((template) => (
              <option key={template.id} value={template.id}>
                {template.key} · {template.why}
              </option>
            ))}
          </select>
        </label>
      </div>

      <form>
        <input type="hidden" name="contactId" value={contactId} />
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="channel" value={channel} />
        <input type="hidden" name="templateId" value={templateId} />

        {channel === "email" ? (
          <label className="field">
            <span>Subject</span>
            <input
              type="text"
              name="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={`${firstName}, a question`}
            />
          </label>
        ) : (
          <input type="hidden" name="subject" value="" />
        )}

        <label className="field">
          <span>
            {channel === "linkedin"
              ? "Message. Short beats complete here."
              : "Body"}
          </span>
          <textarea
            name="body"
            rows={channel === "linkedin" ? 6 : 16}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>

        <div className="row">
          <button className="btn" formAction={runCheck} disabled={checking || saving}>
            {checking ? "Checking" : "Check it"}
          </button>
          <button className="btn primary" formAction={runSave} disabled={checking || saving}>
            {saving ? "Saving" : "Save draft"}
          </button>
          {channel === "linkedin" ? (
            <button className="btn" type="button" onClick={copyOut}>
              {copied ? "Copied" : "Copy for LinkedIn"}
            </button>
          ) : null}
        </div>
      </form>

      {state === null ? null : (
        <div style={{ marginTop: 14 }}>
          {state.ok ? (
            <div className="ok-note">{state.message}</div>
          ) : (
            <>
              <div className="muted" style={{ marginBottom: 6 }}>
                {state.message}
              </div>
              {state.blockers.map((blocker, index) => (
                <div
                  className={`blocker${blocker.terminal ? " terminal" : ""}`}
                  key={`${blocker.gate}-${index}`}
                >
                  {blocker.reason}
                  {blocker.terminal ? (
                    <div className="muted" style={{ fontWeight: 400 }}>
                      Editing will not clear this one.
                    </div>
                  ) : null}
                </div>
              ))}
            </>
          )}

          {resolved.subject !== subject || resolved.body !== body ? (
            <div style={{ marginTop: 12 }}>
              <h3>Merged, as it would go out</h3>
              {channel === "email" ? <pre className="copyable">{resolved.subject}</pre> : null}
              <pre className="copyable">{resolved.body}</pre>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function stageFor(kind: "first_touch" | "follow_up" | "reply"): string {
  return kind;
}
