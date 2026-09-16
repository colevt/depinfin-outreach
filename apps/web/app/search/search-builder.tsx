"use client";

import { useActionState, useState } from "react";
import {
  type ImportState,
  type SearchState,
  buildSearchAction,
  importLeadsAction,
} from "../../lib/actions";

/**
 * INV-8. The search button, in the only form it can take.
 *
 * This builds a query and hands it to the operator. It does not run a search,
 * fetch a result, or read a profile. The operator opens the link, signed in as
 * themselves, and works the results at human speed. That constraint is not
 * squeamishness about terms of service: automated search and messaging gets
 * accounts restricted, and the accounts at risk are the founders', whose
 * personal credibility is the scarce asset in this raise.
 */
export function SearchBuilder({
  firmTypes,
  operatorCategories,
  decisionRoles,
  runInstructions,
}: {
  firmTypes: readonly { value: string; label: string }[];
  operatorCategories: readonly { value: string; label: string }[];
  decisionRoles: readonly { value: string; label: string }[];
  runInstructions: readonly string[];
}) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [copied, setCopied] = useState(false);
  const [state, run, building] = useActionState<SearchState | null, FormData>(
    buildSearchAction,
    null,
  );
  const [importState, runImport, importing] = useActionState<ImportState | null, FormData>(
    importLeadsAction,
    null,
  );

  async function copyQuery() {
    if (state === null) return;
    try {
      await navigator.clipboard.writeText(state.query);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <form className="card">
        <div className="cols-2">
          <label className="field">
            <span>Name this search, so it can be saved and re-run</span>
            <input type="text" name="name" placeholder="Crypto funds, CIOs, US" />
          </label>
          <label className="field">
            <span>Side</span>
            <select
              name="side"
              value={side}
              onChange={(e) => setSide(e.target.value as "buy" | "sell")}
            >
              <option value="buy">Buy side, capital</option>
              <option value="sell">Sell side, operators</option>
            </select>
          </label>
        </div>

        {side === "buy" ? (
          <fieldset>
            <legend>Firm types</legend>
            <div className="row">
              {firmTypes.map((type) => (
                <label className="check" key={type.value}>
                  <input type="checkbox" name="firmTypes" value={type.value} />
                  <span>{type.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <fieldset>
            <legend>Operator categories</legend>
            <div className="row">
              {operatorCategories.map((type) => (
                <label className="check" key={type.value}>
                  <input type="checkbox" name="operatorCategories" value={type.value} />
                  <span>{type.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset>
          <legend>Decision role</legend>
          <div className="row">
            {decisionRoles.map((role) => (
              <label className="check" key={role.value}>
                <input type="checkbox" name="decisionRoles" value={role.value} />
                <span>{role.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="cols-2">
          <label className="field">
            <span>Locations, comma separated. Set as a filter in the browser, not in the query.</span>
            <input type="text" name="locations" placeholder="United States, New York" />
          </label>
          <label className="field">
            <span>Must include, comma separated</span>
            <input type="text" name="mustInclude" placeholder="DePIN, real assets" />
          </label>
          <label className="field">
            <span>Exclude, comma separated</span>
            <input type="text" name="exclude" placeholder="recruiter, student" />
          </label>
        </div>

        <label className="check">
          <input type="checkbox" name="requireCategoryLiteracy" />
          <span>
            Require category literacy. Profile must mention DePIN, digital infrastructure, or
            real-world assets.
          </span>
        </label>

        <div className="row">
          <button className="btn primary" formAction={run} disabled={building}>
            {building ? "Building" : "Build the search"}
          </button>
          <button
            className="btn"
            formAction={run}
            name="save"
            value="true"
            disabled={building}
          >
            Build and save
          </button>
        </div>
      </form>

      {state === null ? null : state.query === "" ? (
        <div className="card">
          <div className="muted">
            Nothing selected, so there is no query to build. Pick at least a firm type, a role, or
            a term to include.
          </div>
        </div>
      ) : (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Your query</h3>
          <pre className="copyable">{state.query}</pre>
          <div className="row">
            <a
              className="btn primary"
              href={state.url}
              target="_blank"
              rel="noreferrer noopener"
            >
              Open in LinkedIn
            </a>
            <a className="btn" href={state.salesNavigatorUrl} target="_blank" rel="noreferrer noopener">
              Open in Sales Navigator
            </a>
            <button className="btn" type="button" onClick={copyQuery}>
              {copied ? "Copied" : "Copy the query"}
            </button>
            {state.saved ? <span className="tag good">saved</span> : null}
          </div>

          <h3>What this asks for</h3>
          {state.explanation.map((line, index) => (
            <div className="note" key={index}>
              {line}
            </div>
          ))}

          <h3>Then</h3>
          <ol style={{ paddingLeft: 18, margin: 0 }} className="muted">
            {runInstructions.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ol>
        </div>
      )}

      <h2>Bring the results back</h2>
      <form className="card">
        <label className="field">
          <span>
            Paste the rows you kept. Name, title, firm, one per line, tab, pipe, or comma
            separated. A profile URL anywhere on the line is picked up.
          </span>
          <textarea
            name="pasted"
            rows={10}
            placeholder={
              "Dana Reyes\tChief Investment Officer\tNorth Arc Capital\thttps://www.linkedin.com/in/dana-reyes"
            }
          />
        </label>
        <button className="btn primary" formAction={runImport} disabled={importing}>
          {importing ? "Reading" : "Read the paste"}
        </button>
      </form>

      {importState === null ? null : (
        <div className="card">
          <div className="row">
            <span className="tag good">{importState.fresh.length} new</span>
            <span className="tag">{importState.existing} already in the pipeline</span>
            <span className="tag">{importState.duplicated} repeated in the paste</span>
          </div>

          {importState.warnings.length > 0 ? (
            <>
              <h3>Could not read</h3>
              {importState.warnings.map((warning, index) => (
                <div className="blocker" key={index}>
                  Line {warning.line}: {warning.reason}
                </div>
              ))}
            </>
          ) : null}

          {importState.fresh.length === 0 ? null : (
            <>
              <h3>New</h3>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Title</th>
                    <th>Firm</th>
                    <th>Profile</th>
                  </tr>
                </thead>
                <tbody>
                  {importState.fresh.map((lead, index) => (
                    <tr key={index}>
                      <td>{lead.name}</td>
                      <td className="muted">{lead.title}</td>
                      <td className="muted">{lead.firm}</td>
                      <td>
                        {lead.url === "" ? (
                          <span className="muted">none</span>
                        ) : (
                          <a href={lead.url} target="_blank" rel="noreferrer noopener">
                            profile
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="note" style={{ marginTop: 10 }}>
                These are candidates, not prospects. Each one needs a specific, verifiable reason
                for contact before anything can be sent, and nothing here can invent one.
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
