import Link from "next/link";
import {
  listCounselSignoffs,
  listSequences,
  loadAutomationSettings,
  loadDigestRecipients,
} from "@depinfin/db";
import { db } from "../../lib/db";
import { formatWhen } from "../../lib/view";
import { toggleSequenceAction, updateAutomationAction } from "../../lib/actions";

export const dynamic = "force-dynamic";

const DAYS = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [7, "Sun"],
] as const;

/**
 * Everything that runs on its own, and the controls for it.
 *
 * Two things on this page are read-only on purpose. Cold outreach has no
 * toggle, because the trigger in migration 0006 refuses to switch it on
 * without a recorded counsel sign-off and the sign-off is recorded out of band
 * by someone with database access. A greyed-out switch would still teach an
 * operator that it is theirs to flip. And the digest recipient list is shown
 * rather than edited, because it is constrained to internal domains and
 * changing it is rare enough not to need a form.
 */
export default async function AutomationPage() {
  const [settings, sequences, signoffs, recipients] = await Promise.all([
    loadAutomationSettings(db()),
    listSequences(db()),
    listCounselSignoffs(db()),
    loadDigestRecipients(db()),
  ]);

  const coldSignoff = signoffs.find((s) => s.item === "rule_506c_cold_outreach");

  return (
    <>
      <h1>Automation</h1>
      <p className="lede">
        What runs without anyone watching. Sequences are {settings.sequences_enabled ? "on" : "off"}
        , the daily cap is {settings.daily_send_cap}, and the digest is{" "}
        {settings.digest_enabled ? "on" : "off"}. Last changed by {settings.updated_by},{" "}
        {formatWhen(settings.updated_at)}.
      </p>

      <form action={updateAutomationAction}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Sending</h2>

          <label className="check">
            <input
              type="checkbox"
              name="sequencesEnabled"
              defaultChecked={settings.sequences_enabled}
            />
            <span>
              Dispatch warm sequences. Off means nothing goes out on a schedule, whatever the
              sequences below say.
            </span>
          </label>

          <div className="cols-2">
            <label className="field">
              <span>Daily cap, counted from the audit log rather than from memory</span>
              <input
                type="number"
                name="dailySendCap"
                min={0}
                max={500}
                defaultValue={settings.daily_send_cap}
              />
            </label>
            <label className="field">
              <span>Timezone the window is local to</span>
              <input type="text" name="sendTimezone" defaultValue={settings.send_timezone} />
            </label>
            <label className="field">
              <span>Window opens</span>
              <input
                type="time"
                name="sendWindowStart"
                defaultValue={settings.send_window_start.slice(0, 5)}
              />
            </label>
            <label className="field">
              <span>Window closes</span>
              <input
                type="time"
                name="sendWindowEnd"
                defaultValue={settings.send_window_end.slice(0, 5)}
              />
            </label>
          </div>

          <fieldset>
            <legend>Days</legend>
            <div className="row">
              {DAYS.map(([value, label]) => (
                <label className="check" key={value}>
                  <input
                    type="checkbox"
                    name="sendDays"
                    value={value}
                    defaultChecked={settings.send_days.includes(value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Daily digest</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Internal mail about prospects. It goes to internal addresses only, enforced by the
            database rather than by this page, and it never counts against the sending cap.
          </p>

          <label className="check">
            <input type="checkbox" name="digestEnabled" defaultChecked={settings.digest_enabled} />
            <span>Send the daily digest</span>
          </label>

          <div className="cols-2">
            <label className="field">
              <span>Hour it goes out, 0 to 23</span>
              <input
                type="number"
                name="digestHour"
                min={0}
                max={23}
                defaultValue={settings.digest_hour}
              />
            </label>
            <label className="field">
              <span>Digest timezone</span>
              <input type="text" name="digestTimezone" defaultValue={settings.digest_timezone} />
            </label>
          </div>

          <h3>Goes to</h3>
          <div className="row">
            {recipients.map((address) => (
              <span className="tag" key={address}>
                {address}
              </span>
            ))}
          </div>
          <div className="muted" style={{ marginTop: 6 }}>
            Adding an address outside an internal domain is refused by the database. That is
            deliberate: a digest full of prospect data must never be addressable to a prospect.
          </div>
        </div>

        <button className="btn primary" type="submit">
          Save settings
        </button>
      </form>

      <h2>Sequences</h2>
      {sequences.length === 0 ? (
        <div className="empty">No sequences yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Transport</th>
              <th>Steps</th>
              <th>Active enrollments</th>
              <th>State</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sequences.map((sequence) => (
              <tr key={sequence.id}>
                <td>{sequence.name}</td>
                <td>
                  <span className={`tag ${sequence.transport === "cold" ? "bad" : ""}`}>
                    {sequence.transport}
                  </span>
                </td>
                <td>{sequence.step_count}</td>
                <td>{sequence.active_enrollments}</td>
                <td>
                  {sequence.active ? (
                    <span className="tag good">active</span>
                  ) : (
                    <span className="tag">paused</span>
                  )}
                </td>
                <td>
                  <form action={toggleSequenceAction}>
                    <input type="hidden" name="sequenceId" value={sequence.id} />
                    <input type="hidden" name="active" value={sequence.active ? "false" : "true"} />
                    <button className="btn quiet" type="submit">
                      {sequence.active ? "Pause" : "Activate"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Cold outreach and mass sending</h2>
      <div className="gate-banner">
        <strong>
          {settings.cold_outreach_enabled ? "On, with a sign-off on file." : "Off, and not yours to switch on."}
        </strong>
        <p style={{ marginBottom: 6 }}>
          Cold sequences and mass outreach are gated on written sign-off from outside counsel. The
          database refuses to enable them without a recorded sign-off, so there is no toggle here
          and putting one here would be misleading. When counsel signs off, the sign-off is
          recorded directly and this page starts saying so.
        </p>
        <div className="muted">
          {coldSignoff === undefined
            ? "Nothing recorded for rule_506c_cold_outreach."
            : `${coldSignoff.counsel}, recorded by ${coldSignoff.recorded_by} on ${formatWhen(
                coldSignoff.recorded_at,
              )}${coldSignoff.signed_off ? "" : ", not signed off"}.`}
        </div>
      </div>

      <h2>What this page cannot do</h2>
      <div className="card tight">
        <ul style={{ margin: 0, paddingLeft: 18 }} className="muted">
          <li>
            Send to a tier 1 prospect automatically. They are excluded in the query that picks
            candidates, so there is no setting that includes them. Write to them from{" "}
            <Link href="/prospects">Prospects</Link>.
          </li>
          <li>
            Turn off the linter. There is no flag, no override, and no environment variable. A
            message that trips it gets rewritten.
          </li>
          <li>
            Delete a suppression. They can be marked inactive with a reason and an actor, and that
            is all.
          </li>
          <li>
            Send anything on LinkedIn. The desk drafts, a human sends from their own account.
          </li>
        </ul>
      </div>
    </>
  );
}
