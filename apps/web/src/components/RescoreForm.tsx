"use client";

import { useActionState } from "react";
import { rescoreFirmAction, type ActionResult } from "../server/actions.js";
import type { ScoringFactors } from "@depinfin/core";

const idle: ActionResult = { ok: true, message: "" };

export function RescoreForm({
  firmId,
  factors,
}: {
  firmId: string;
  factors: ScoringFactors | null;
}) {
  const [state, action, pending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => rescoreFirmAction(formData),
    idle,
  );

  return (
    <form action={action} className="card">
      <input type="hidden" name="firmId" value={firmId} />
      <div className="chips">
        <Field name="mandateFit" label="Mandate" defaultValue={factors?.mandateFit} />
        <Field name="ticketFit" label="Ticket" defaultValue={factors?.ticketFit} />
        <Field name="categoryLiteracy" label="Literacy" defaultValue={factors?.categoryLiteracy} />
        <Field name="warmPath" label="Warm path" defaultValue={factors?.warmPath} />
        <Field name="decisionSpeed" label="Speed" defaultValue={factors?.decisionSpeed} />
      </div>
      <label className="confirm">
        <input type="checkbox" name="confirmDemotion" />
        Allow leaving Tier 1
      </label>
      <input type="text" name="demotionReason" placeholder="Demotion reason, if leaving Tier 1" />
      <div className="actions">
        <button className="btn" type="submit" disabled={pending}>
          Rescore
        </button>
      </div>
      {state.message ? <p className={state.ok ? "flash" : "flash-bad"}>{state.message}</p> : null}
    </form>
  );
}

function Field({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue?: number;
}) {
  return (
    <label className="mono">
      {label}{" "}
      <input
        type="number"
        name={name}
        min={1}
        max={5}
        defaultValue={defaultValue ?? 3}
        style={{ width: 56 }}
      />
    </label>
  );
}
