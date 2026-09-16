import Link from "next/link";
import {
  BUY_SIDE_PROFILES,
  FACTOR_GUIDE,
  SELL_SIDE_PROFILES,
  buySideProfile,
} from "@depinfin/core";
import { getProspect, listProspects } from "@depinfin/db";
import { db } from "../../lib/db";
import { humanize } from "../../lib/view";
import { saveResearchAction } from "../../lib/actions";

export const dynamic = "force-dynamic";

/**
 * Research on a prospect, recorded with its sources.
 *
 * Sources are required, not encouraged. Section 13 treats market figures as
 * investor-material claims that need a verified source before use, and a note
 * with no URL is a claim with nothing behind it sitting one copy and paste
 * away from a prospect-facing draft. The action refuses to save without one.
 *
 * What to go and find is on the right, from the same ICP definitions the
 * scoring rubric and the draft guidance use.
 */
export default async function ResearchPage({
  searchParams,
}: {
  searchParams: Promise<{ contactId?: string }>;
}) {
  const { contactId } = await searchParams;
  const prospect = contactId === undefined ? null : await getProspect(db(), contactId);
  const recent = await listProspects(db(), { limit: 40 });

  const profile =
    prospect !== null && prospect.side === "buy" && prospect.firm_type !== null
      ? buySideProfile(prospect.firm_type as Parameters<typeof buySideProfile>[0])
      : null;

  return (
    <>
      <h1>Research</h1>
      <p className="lede">
        {prospect === null
          ? "Pick a prospect, then record what you found and where you found it."
          : `Researching ${prospect.name} at ${prospect.firm_name}.`}
      </p>

      <div className="grid">
        <div>
          <form className="card" action={saveResearchAction}>
            <label className="field">
              <span>Prospect</span>
              <select name="contactId" defaultValue={prospect?.contact_id ?? ""}>
                <option value="">Not about one person</option>
                {recent.map((row) => (
                  <option key={row.contact_id} value={row.contact_id}>
                    {row.name} · {row.firm_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>What you found, in one line</span>
              <input
                type="text"
                name="headline"
                placeholder="Runs the alternatives sleeve, wrote about DePIN in June"
              />
            </label>

            <label className="field">
              <span>The detail</span>
              <textarea name="body" rows={8} />
            </label>

            <label className="field">
              <span>
                Sources, one per line. A URL, then an optional title. Required: a note without one
                is a claim with nothing behind it.
              </span>
              <textarea
                name="sources"
                rows={4}
                placeholder={"https://example.com/post  Their write-up on DePIN economics"}
              />
            </label>

            <label className="field">
              <span>Where this came from</span>
              <input type="text" name="provider" defaultValue="manual" />
            </label>

            <button className="btn primary" type="submit">
              Record it
            </button>
          </form>

          {prospect === null ? null : (
            <div className="card tight">
              <h3 style={{ marginTop: 0 }}>This prospect</h3>
              <div className="row">
                <Link href={`/prospects/${prospect.contact_id}`}>{prospect.name}</Link>
                <span className="muted">{prospect.firm_name}</span>
                <span className="tag">{humanize(prospect.firm_type ?? prospect.operator_category)}</span>
                <span className="tag">{prospect.side} side</span>
              </div>
              {prospect.personal_reason === null || prospect.personal_reason.trim() === "" ? (
                <div className="blocker" style={{ marginTop: 8 }}>
                  No reason for contact on file. That is what this research is for.
                </div>
              ) : (
                <div className="muted" style={{ marginTop: 8 }}>
                  Reason on file: {prospect.personal_reason}
                </div>
              )}
            </div>
          )}
        </div>

        <aside>
          <h2>What to look for</h2>

          {profile === null ? (
            <>
              <div className="card tight">
                <h3 style={{ marginTop: 0 }}>Buy side</h3>
                {BUY_SIDE_PROFILES.slice(0, 4).map((entry) => (
                  <div key={entry.firmType} style={{ marginBottom: 10 }}>
                    <div>{entry.label}</div>
                    <div className="muted">{entry.qualifiers[0]}</div>
                  </div>
                ))}
              </div>
              <div className="card tight">
                <h3 style={{ marginTop: 0 }}>Sell side</h3>
                {SELL_SIDE_PROFILES.slice(0, 4).map((entry) => (
                  <div key={entry.category} style={{ marginBottom: 10 }}>
                    <div>{entry.label}</div>
                    <div className="muted">{entry.qualifyingQuestion}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="card tight">
              <h3 style={{ marginTop: 0 }}>{profile.label}</h3>
              <div style={{ marginBottom: 10 }}>{profile.thesis}</div>

              <h3>Qualifies them</h3>
              <ul style={{ margin: 0, paddingLeft: 18 }} className="muted">
                {profile.qualifiers.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>

              <h3>Rules them out</h3>
              <ul style={{ margin: 0, paddingLeft: 18 }} className="muted">
                {profile.disqualifiers.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>

              <h3>Typical ticket</h3>
              <div className="muted">{profile.ticketBand}</div>
            </div>
          )}

          <div className="card tight">
            <h3 style={{ marginTop: 0 }}>How this turns into a score</h3>
            <div className="muted" style={{ marginBottom: 10 }}>
              Five factors, one to five each, weighted. Tier 1 is 40 and up.
            </div>
            {FACTOR_GUIDE.map((guide) => (
              <div key={guide.factor} style={{ marginBottom: 10 }}>
                <div>
                  {guide.label} <span className="tag">weight {guide.weight}</span>
                </div>
                <div className="muted">
                  1: {guide.anchors[0]}. 5: {guide.anchors[4]}.
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
