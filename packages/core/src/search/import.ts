/**
 * The other half of INV-8: what happens after a human runs the search.
 *
 * The operator copies rows out of their browser and pastes them in. This
 * parses that paste, normalizes it, and reports what is a duplicate of
 * something already in the pipeline. It reads a string the operator supplied.
 * It does not fetch anything.
 *
 * Imported rows are candidates, not prospects. A prospect needs a specific,
 * verifiable reason for contact (INV-3), and nothing here invents one.
 */

export interface ParsedLead {
  readonly firstName: string;
  readonly lastName: string | null;
  readonly title: string | null;
  readonly firmName: string | null;
  readonly linkedinUrl: string | null;
  /** The line as pasted, kept so an operator can see what produced this. */
  readonly raw: string;
}

export interface ParseWarning {
  readonly line: number;
  readonly raw: string;
  readonly reason: string;
}

export interface ParseResult {
  readonly leads: readonly ParsedLead[];
  readonly warnings: readonly ParseWarning[];
}

const LINKEDIN_URL = /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[^\s,|]+/i;

/**
 * Strips tracking parameters and trailing slashes so the same profile pasted
 * from two places compares equal.
 */
export function normalizeLinkedInUrl(url: string): string | null {
  const match = LINKEDIN_URL.exec(url);
  if (match === null) return null;
  let cleaned = match[0].split("?")[0] ?? match[0];
  cleaned = cleaned.replace(/\/+$/, "");
  const slug = cleaned.slice(cleaned.toLowerCase().indexOf("/in/") + 4);
  return slug.length === 0 ? null : `https://www.linkedin.com/in/${slug}`;
}

function splitFields(line: string): string[] {
  const withoutUrl = line.replace(LINKEDIN_URL, " ");
  const separator = withoutUrl.includes("\t") ? "\t" : withoutUrl.includes("|") ? "|" : ",";
  return withoutUrl
    .split(separator)
    .map((field) => field.trim())
    .filter((field) => field.length > 0);
}

function splitName(full: string): { firstName: string; lastName: string | null } {
  // Drop the credential suffixes that come through in a paste.
  const cleaned = full
    .replace(/\b(?:CFA|CAIA|CPA|MBA|JD|PhD|CFP)\b\.?/gi, "")
    .replace(/[,;]+\s*$/, "")
    .trim();
  const parts = cleaned.split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return { firstName: "", lastName: null };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: null };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

/**
 * Parses pasted rows. Accepts tab, pipe, or comma separated fields in the
 * order name, title, firm, with a profile URL anywhere on the line.
 *
 * Deliberately forgiving about what it accepts and loud about what it could
 * not read. A silently dropped row is worse than a warning an operator reads.
 */
export function parsePastedLeads(pasted: string): ParseResult {
  const leads: ParsedLead[] = [];
  const warnings: ParseWarning[] = [];

  const lines = pasted.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? "";
    if (raw.trim().length === 0) continue;

    const linkedinUrl = normalizeLinkedInUrl(raw);
    const fields = splitFields(raw);

    if (fields.length === 0) {
      if (linkedinUrl === null) {
        warnings.push({ line: index + 1, raw, reason: "No name and no profile URL on this line" });
        continue;
      }
      // A bare URL is still worth keeping. The operator fills in the name.
      leads.push({
        firstName: "",
        lastName: null,
        title: null,
        firmName: null,
        linkedinUrl,
        raw,
      });
      warnings.push({ line: index + 1, raw, reason: "Profile URL only, name is missing" });
      continue;
    }

    const { firstName, lastName } = splitName(fields[0] ?? "");
    if (firstName === "") {
      warnings.push({ line: index + 1, raw, reason: "Could not read a name" });
      continue;
    }

    leads.push({
      firstName,
      lastName,
      title: fields[1] ?? null,
      firmName: fields[2] ?? null,
      linkedinUrl,
      raw,
    });
  }

  return { leads, warnings };
}

/**
 * The key two records are compared on. Profile URL when there is one, because
 * it is the only identifier in a paste that is actually unique. Otherwise name
 * plus firm, lowercased.
 */
export function dedupeKey(lead: {
  readonly firstName: string;
  readonly lastName?: string | null;
  readonly firmName?: string | null;
  readonly linkedinUrl?: string | null;
}): string {
  if (lead.linkedinUrl !== null && lead.linkedinUrl !== undefined && lead.linkedinUrl !== "") {
    const normalized = normalizeLinkedInUrl(lead.linkedinUrl);
    if (normalized !== null) return `url:${normalized.toLowerCase()}`;
  }
  const name = `${lead.firstName} ${lead.lastName ?? ""}`.trim().toLowerCase();
  const firm = (lead.firmName ?? "").trim().toLowerCase();
  return `name:${name}|firm:${firm}`;
}

export interface DedupeResult {
  /** Not seen before, in the pipeline or earlier in this paste. */
  readonly fresh: readonly ParsedLead[];
  /** Already in the pipeline. */
  readonly existing: readonly ParsedLead[];
  /** Repeated inside the paste itself. */
  readonly duplicatedInPaste: readonly ParsedLead[];
}

/**
 * Splits parsed leads against what the pipeline already holds. Pure: the
 * caller passes the existing keys in, so this stays testable and the query
 * that produces them stays in packages/db.
 */
export function dedupeLeads(
  leads: readonly ParsedLead[],
  existingKeys: ReadonlySet<string>,
): DedupeResult {
  const fresh: ParsedLead[] = [];
  const existing: ParsedLead[] = [];
  const duplicatedInPaste: ParsedLead[] = [];
  const seen = new Set<string>();

  for (const lead of leads) {
    const key = dedupeKey(lead);
    if (existingKeys.has(key)) {
      existing.push(lead);
      continue;
    }
    if (seen.has(key)) {
      duplicatedInPaste.push(lead);
      continue;
    }
    seen.add(key);
    fresh.push(lead);
  }

  return { fresh, existing, duplicatedInPaste };
}
