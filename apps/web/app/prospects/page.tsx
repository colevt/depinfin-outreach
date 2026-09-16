import Link from "next/link";
import { listProspects } from "@depinfin/db";
import { db } from "../../lib/db";
import { ago, humanize, tierLabel } from "../../lib/view";

export const dynamic = "force-dynamic";

/**
 * The prospect list. Open one to write to them.
 *
 * "Needs a reason" is a first-class filter rather than a detail, because a
 * record without a specific, verifiable reason for contact is a name and not a
 * prospect (INV-3), and nothing can be sent to one. Making that easy to find
 * is the difference between a list that grows and a list that works.
 */
export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<{ side?: string; tier?: string; q?: string; needs?: string }>;
}) {
  const params = await searchParams;
  const side = params.side === "buy" || params.side === "sell" ? params.side : undefined;
  const tier = params.tier === undefined ? undefined : Number.parseInt(params.tier, 10);
  const needsReason = params.needs === "1";

  const rows = await listProspects(db(), {
    ...(side === undefined ? {} : { side }),
    ...(tier === undefined || Number.isNaN(tier) ? {} : { tier }),
    ...(params.q === undefined ? {} : { search: params.q }),
    ...(needsReason ? { needsReason: true } : {}),
  });

  const missingReason = rows.filter(
    (row) => row.personal_reason === null || row.personal_reason.trim() === "",
  ).length;

  return (
    <>
      <h1>Prospects</h1>
      <p className="lede">
        {rows.length} shown.
        {missingReason > 0
          ? ` ${missingReason} have no reason for contact on file, so nothing can go to them yet.`
          : ""}
      </p>

      <form className="card tight" method="get">
        <div className="row">
          <input
            type="search"
            name="q"
            placeholder="Name, firm, or address"
            defaultValue={params.q ?? ""}
            style={{ maxWidth: 280 }}
          />
          <select name="side" defaultValue={side ?? ""} style={{ maxWidth: 150 }}>
            <option value="">Both sides</option>
            <option value="buy">Buy side</option>
            <option value="sell">Sell side</option>
          </select>
          <select name="tier" defaultValue={params.tier ?? ""} style={{ maxWidth: 130 }}>
            <option value="">Any tier</option>
            <option value="1">Tier 1</option>
            <option value="2">Tier 2</option>
            <option value="3">Tier 3</option>
          </select>
          <label className="check">
            <input type="checkbox" name="needs" value="1" defaultChecked={needsReason} />
            <span>Needs a reason</span>
          </label>
          <button className="btn" type="submit">
            Filter
          </button>
        </div>
      </form>

      {rows.length === 0 ? (
        <div className="empty">
          Nothing matches. <Link href="/search">Build a search</Link> to find some.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Firm</th>
              <th>Side</th>
              <th>Tier</th>
              <th>Status</th>
              <th>Reason for contact</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const hasReason =
                row.personal_reason !== null && row.personal_reason.trim() !== "";
              return (
                <tr key={row.contact_id}>
                  <td>
                    <Link href={`/prospects/${row.contact_id}`}>{row.name}</Link>
                    {row.title === null ? null : (
                      <div className="muted">{row.title}</div>
                    )}
                  </td>
                  <td>
                    {row.firm_name}
                    <div className="muted">
                      {humanize(row.firm_type ?? row.operator_category)}
                    </div>
                  </td>
                  <td className="muted">{row.side}</td>
                  <td>
                    {row.tier === 1 ? (
                      <span className="tag t1">tier 1</span>
                    ) : (
                      <span className="muted">{tierLabel(row.tier)}</span>
                    )}
                  </td>
                  <td>
                    {row.suppressed ? <span className="tag bad">suppressed</span> : null}
                    {row.do_not_contact ? <span className="tag bad">do not contact</span> : null}
                    {row.enrollment_status === "replied" ? (
                      <span className="tag good">replied {ago(row.replied_at)}</span>
                    ) : null}
                    {row.open_drafts > 0 ? (
                      <span className="tag">{row.open_drafts} draft</span>
                    ) : null}
                    {!row.suppressed &&
                    !row.do_not_contact &&
                    row.enrollment_status !== "replied" &&
                    row.open_drafts === 0 ? (
                      <span className="muted">{row.enrollment_status ?? "not enrolled"}</span>
                    ) : null}
                  </td>
                  <td className={hasReason ? "muted" : ""}>
                    {hasReason ? (
                      row.personal_reason
                    ) : (
                      <span className="tag bad">none on file</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
