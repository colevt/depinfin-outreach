/**
 * INV-3. Personalization is required on first touch.
 *
 * Two distinct refusals live here, and both log as SKIPPED:
 *   1. A template references a field the prospect has not filled in, or has
 *      filled in with whitespace.
 *   2. Any merge placeholder survives substitution.
 */

import type { ProspectView } from "./types.js";

/** `{{ first_name }}`, `{{personal_reason}}`. Case-insensitive, whitespace-tolerant. */
export const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g;

export interface MergeFields {
  readonly [field: string]: string | null | undefined;
}

export interface MergeResult {
  readonly subject: string;
  readonly body: string;
  /** Placeholders whose field is empty or whitespace-only. */
  readonly emptyFields: readonly string[];
  /** Placeholders with no corresponding field, plus anything left after substitution. */
  readonly unresolved: readonly string[];
}

export function extractPlaceholders(text: string): string[] {
  const scan = new RegExp(PLACEHOLDER_PATTERN.source, "g");
  const found: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = scan.exec(text)) !== null) {
    const name = match[1];
    if (name !== undefined) found.push(name.toLowerCase());
  }
  return found;
}

/** The merge surface available to corporate templates. Deliberately small. */
export function fieldsFromProspect(prospect: ProspectView): MergeFields {
  return {
    first_name: prospect.firstName,
    last_name: prospect.lastName,
    title: prospect.title,
    firm_name: prospect.firmName,
    personal_reason: prospect.personalReason,
  };
}

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim().length === 0;
}

export function merge(
  template: { readonly subject: string; readonly body: string },
  fields: MergeFields,
): MergeResult {
  const emptyFields = new Set<string>();
  const unresolved = new Set<string>();

  const substitute = (text: string): string =>
    text.replace(new RegExp(PLACEHOLDER_PATTERN.source, "g"), (whole, rawName: string) => {
      const name = rawName.toLowerCase();
      if (!(name in fields)) {
        unresolved.add(name);
        return whole;
      }
      const value = fields[name];
      if (isBlank(value)) {
        emptyFields.add(name);
        return whole;
      }
      return value as string;
    });

  const subject = substitute(template.subject);
  const body = substitute(template.body);

  // Second pass. Catches a placeholder introduced by a merge value itself.
  for (const leftover of [...extractPlaceholders(subject), ...extractPlaceholders(body)]) {
    if (!emptyFields.has(leftover)) unresolved.add(leftover);
  }

  return {
    subject,
    body,
    emptyFields: [...emptyFields],
    unresolved: [...unresolved],
  };
}

/** "Personal Reason" from "personal_reason". Section 9 legibility. */
export function humanizeField(field: string): string {
  return field
    .split(/[_.]/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
