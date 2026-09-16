import {
  DECISION_ROLES,
  FIRM_TYPES,
  OPERATOR_CATEGORIES,
  RUN_INSTRUCTIONS,
  humanizeEnum,
} from "@depinfin/core";
import { listSavedSearches } from "@depinfin/db";
import { db } from "../../lib/db";
import { formatWhen } from "../../lib/view";
import { SearchBuilder } from "./search-builder";

export const dynamic = "force-dynamic";

/**
 * The search screen.
 *
 * It builds a query and opens it in the operator's browser. It does not run
 * anything, and the banner says so rather than leaving someone to wonder why
 * there is no "fetch results" button.
 */
export default async function SearchPage() {
  const saved = await listSavedSearches(db());

  return (
    <>
      <h1>LinkedIn search</h1>
      <p className="lede">
        Turn the criteria that matter into a query, then run it yourself. This builds the search
        and opens it in your browser under your own account. It does not run searches, fetch
        results, or read profiles, and it will not be made to: automated search and messaging gets
        accounts restricted, and the accounts at risk are yours.
      </p>

      <SearchBuilder
        firmTypes={FIRM_TYPES.map((value) => ({ value, label: humanizeEnum(value) }))}
        operatorCategories={OPERATOR_CATEGORIES.map((value) => ({
          value,
          label: humanizeEnum(value),
        }))}
        decisionRoles={DECISION_ROLES.map((value) => ({ value, label: humanizeEnum(value) }))}
        runInstructions={RUN_INSTRUCTIONS}
      />

      <h2>Saved searches</h2>
      {saved.length === 0 ? (
        <div className="empty">None saved yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Side</th>
              <th>Query</th>
              <th>Saved</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {saved.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td className="muted">{row.side}</td>
                <td className="mono muted">{row.query_text}</td>
                <td className="muted">
                  {formatWhen(row.created_at)} by {row.created_by}
                </td>
                <td>
                  <a className="btn quiet" href={row.url} target="_blank" rel="noreferrer noopener">
                    Open
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
