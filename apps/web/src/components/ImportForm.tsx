"use client";

import { useActionState } from "react";
import { importProspects, type ImportActionResult } from "../server/actions";

const idle: ImportActionResult = { ok: true, message: "", imported: 0, duplicates: 0, errors: 0 };

export function ImportForm() {
  const [state, action, pending] = useActionState(
    async (_prev: ImportActionResult, formData: FormData) => importProspects(formData),
    idle,
  );

  return (
    <form action={action} className="card">
      <p className="lede" style={{ marginBottom: 12 }}>
        CSV with <span className="mono">firm_name, jurisdiction, first_name</span>. Optional
        scoring columns: mandate_fit, ticket_fit, category_literacy, warm_path,
        decision_speed_score. Enrichment is not wired. Duplicates match on email or on
        firm plus name.
      </p>
      <div className="actions">
        <input type="file" name="file" accept=".csv,text/csv" required />
        <button className="btn btn-solid" type="submit" disabled={pending}>
          {pending ? "Importing" : "Import"}
        </button>
      </div>
      {state.message ? <p className={state.ok ? "flash" : "flash-bad"}>{state.message}</p> : null}
    </form>
  );
}
