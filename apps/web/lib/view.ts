import type { Jurisdiction, ProspectView, Tier } from "@depinfin/compliance";
import type { ProspectListRow } from "@depinfin/db";

/**
 * Database row to the flat shape the compliance gates take.
 *
 * One conversion, in one place. The gates are the authority on eligibility and
 * they take exactly this, so anywhere in the desk that needs a verdict starts
 * here rather than assembling a near-miss of its own.
 */
export function toProspectView(row: ProspectListRow): ProspectView {
  return {
    contactId: row.contact_id,
    email: row.email ?? "",
    firstName: row.first_name,
    lastName: row.last_name,
    title: row.title,
    firmName: row.firm_name,
    personalReason: row.personal_reason,
    doNotContact: row.do_not_contact,
    tier: (row.tier as Tier | null) ?? null,
    jurisdiction: row.jurisdiction as Jurisdiction,
  };
}

export function humanize(value: string | null): string {
  if (value === null || value === "") return "";
  return value
    .split("_")
    .map((part) => (part.length > 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

export function formatWhen(value: Date | string | null): string {
  if (value === null) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** How long ago, in the least fussy way that is still accurate. */
export function ago(value: Date | string | null): string {
  if (value === null) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function tierLabel(tier: number | null): string {
  if (tier === null) return "untiered";
  return `tier ${tier}`;
}
