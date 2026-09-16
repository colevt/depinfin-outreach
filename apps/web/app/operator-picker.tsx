"use client";

import { useRef } from "react";
import { chooseOperator } from "../lib/actions";

/**
 * Who is at the desk. Not authentication, see lib/operator.ts. This exists so
 * activity_log records which of the three made a decision.
 */
export function OperatorPicker({ operator, operators }: {
  operator: string;
  operators: readonly string[];
}) {
  const form = useRef<HTMLFormElement>(null);

  return (
    <form action={chooseOperator} ref={form}>
      <select
        name="operator"
        defaultValue={operator}
        aria-label="Operator"
        onChange={() => form.current?.requestSubmit()}
      >
        {operators.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </form>
  );
}
