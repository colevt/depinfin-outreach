/**
 * Section 9, list building. Parse, dedupe, and score. Enrichment is section 12
 * step 8 and is not implemented here.
 *
 * Dedupe is exact: normalized email, or the same firm name plus first and last
 * name. Close-enough matching is an operator job.
 */

import { normalizeEmail, type Jurisdiction } from "@depinfin/compliance";
import { rescore, type Factor, type RescoreInput, type RescoreResult, type ScoringFactors } from "./scoring.js";
import type { Tier } from "@depinfin/compliance";

export const JURISDICTIONS: readonly Jurisdiction[] = ["us", "non_us", "eu", "uk", "eea"];

export const FIRM_TYPES = [
  "single_family_office",
  "multi_family_office",
  "ria",
  "ocio",
  "crypto_fund",
  "rwa_fund",
  "infra_fund",
  "individual_hnw",
  "ecosystem_principal",
] as const;

export const AUM_BANDS = ["under_100m", "100m_500m", "500m_1b", "over_1b"] as const;
export const DECISION_SPEEDS = ["fast", "medium", "slow"] as const;
export const DEPIN_FAMILIARITY = ["high", "medium", "none"] as const;
export const DECISION_ROLES = ["principal", "cio", "analyst", "gatekeeper"] as const;

export type FirmType = (typeof FIRM_TYPES)[number];
export type AumBand = (typeof AUM_BANDS)[number];
export type DecisionSpeed = (typeof DECISION_SPEEDS)[number];
export type DepinFamiliarity = (typeof DEPIN_FAMILIARITY)[number];
export type DecisionRole = (typeof DECISION_ROLES)[number];

export interface ImportRow {
  readonly line: number;
  readonly firmName: string;
  readonly jurisdiction: Jurisdiction;
  readonly firstName: string;
  readonly lastName: string | null;
  readonly title: string | null;
  readonly email: string | null;
  readonly linkedinUrl: string | null;
  readonly personalReason: string | null;
  readonly warmPathContact: string | null;
  readonly decisionRole: DecisionRole | null;
  readonly firmType: FirmType | null;
  readonly aumBand: AumBand | null;
  readonly mandateTags: readonly string[];
  readonly typicalTicketUsd: string | null;
  readonly decisionSpeed: DecisionSpeed | null;
  readonly depinFamiliarity: DepinFamiliarity | null;
  readonly source: string | null;
  readonly notes: string | null;
  readonly factors: ScoringFactors | null;
}

export interface ParseError {
  readonly line: number;
  readonly reason: string;
}

export interface ParseResult {
  readonly rows: readonly ImportRow[];
  readonly errors: readonly ParseError[];
}

export interface ExistingRecord {
  readonly email: string | null;
  readonly firmName: string;
  readonly firstName: string;
  readonly lastName: string | null;
}

export interface Duplicate {
  readonly row: ImportRow;
  readonly reason: string;
}

export interface DedupeResult {
  readonly accepted: readonly ImportRow[];
  readonly duplicates: readonly Duplicate[];
}

const HEADER_ALIASES: Record<string, string> = {
  firm: "firm_name",
  company: "firm_name",
  linkedin: "linkedin_url",
  warm_path_person: "warm_path_contact",
  tags: "mandate_tags",
};

function normalizeHeader(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/\s+/g, "_");
  return HEADER_ALIASES[key] ?? key;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

function blankToNull(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function parseEnum<T extends string>(
  value: string | null,
  allowed: readonly T[],
  label: string,
  line: number,
  errors: ParseError[],
): T | null {
  if (value === null) return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_") as T;
  if (!allowed.includes(normalized)) {
    errors.push({
      line,
      reason: `${label} must be ${allowed.join(", ")}, got "${value}"`,
    });
    return null;
  }
  return normalized;
}

function parseFactor(value: string | null, label: string, line: number, errors: ParseError[]): Factor | null {
  if (value === null) return null;
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    errors.push({ line, reason: `${label} must be an integer from 1 to 5, got "${value}"` });
    return null;
  }
  return n as Factor;
}

function personKey(firmName: string, firstName: string, lastName: string | null): string {
  return `${firmName.trim().toLowerCase()}|${firstName.trim().toLowerCase()}|${(lastName ?? "").trim().toLowerCase()}`;
}

/**
 * Parses a CSV of prospects. Required columns: firm_name, jurisdiction, first_name.
 * Unknown columns are ignored. A bad row is reported and dropped, it does not
 * abort the file.
 */
export function parseImportCsv(csv: string): ParseResult {
  const lines = csv.split(/\r?\n/).filter((line, index, all) => {
    if (line.trim().length > 0) return true;
    return index !== all.length - 1;
  });
  if (lines.length === 0) {
    return { rows: [], errors: [{ line: 0, reason: "File is empty" }] };
  }

  const headers = splitCsvLine(lines[0] ?? "").map(normalizeHeader);
  const required = ["firm_name", "jurisdiction", "first_name"] as const;
  const errors: ParseError[] = [];
  for (const name of required) {
    if (!headers.includes(name)) {
      errors.push({ line: 1, reason: `Missing column ${name}` });
    }
  }
  if (errors.length > 0) return { rows: [], errors };

  const rows: ImportRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.trim().length === 0) continue;
    const cells = splitCsvLine(line);
    const get = (name: string): string | null => {
      const index = headers.indexOf(name);
      if (index === -1) return null;
      return blankToNull(cells[index]);
    };

    const lineNumber = i + 1;
    const firmName = get("firm_name");
    const firstName = get("first_name");
    const jurisdictionRaw = get("jurisdiction");
    const rowErrors: ParseError[] = [];

    if (firmName === null) rowErrors.push({ line: lineNumber, reason: "Firm Name empty" });
    if (firstName === null) rowErrors.push({ line: lineNumber, reason: "First Name empty" });
    const jurisdiction = parseEnum(jurisdictionRaw, JURISDICTIONS, "Jurisdiction", lineNumber, rowErrors);
    if (jurisdictionRaw === null) {
      rowErrors.push({ line: lineNumber, reason: "Jurisdiction empty" });
    }

    const mandateFit = parseFactor(get("mandate_fit"), "Mandate Fit", lineNumber, rowErrors);
    const ticketFit = parseFactor(get("ticket_fit"), "Ticket Fit", lineNumber, rowErrors);
    const categoryLiteracy = parseFactor(get("category_literacy"), "Category Literacy", lineNumber, rowErrors);
    const warmPath = parseFactor(get("warm_path"), "Warm Path", lineNumber, rowErrors);
    const decisionSpeedFactor = parseFactor(
      get("decision_speed_score") ?? get("speed_fit"),
      "Decision Speed score",
      lineNumber,
      rowErrors,
    );

    const factorValues = [mandateFit, ticketFit, categoryLiteracy, warmPath, decisionSpeedFactor];
    const provided = factorValues.filter((v) => v !== null).length;
    let factors: ScoringFactors | null = null;
    if (provided === 5) {
      factors = {
        mandateFit: mandateFit as Factor,
        ticketFit: ticketFit as Factor,
        categoryLiteracy: categoryLiteracy as Factor,
        warmPath: warmPath as Factor,
        decisionSpeed: decisionSpeedFactor as Factor,
      };
    } else if (provided > 0) {
      rowErrors.push({
        line: lineNumber,
        reason: "Scoring needs all five factors: mandate_fit, ticket_fit, category_literacy, warm_path, decision_speed_score",
      });
    }

    const emailRaw = get("email");
    const email = emailRaw ? normalizeEmail(emailRaw) : null;
    if (emailRaw && !email.includes("@")) {
      rowErrors.push({ line: lineNumber, reason: `Email looks wrong: "${emailRaw}"` });
    }

    const decisionRole = parseEnum(get("decision_role"), DECISION_ROLES, "Decision Role", lineNumber, rowErrors);
    const firmType = parseEnum(get("firm_type"), FIRM_TYPES, "Firm Type", lineNumber, rowErrors);
    const aumBand = parseEnum(get("aum_band"), AUM_BANDS, "AUM Band", lineNumber, rowErrors);
    const decisionSpeed = parseEnum(get("decision_speed"), DECISION_SPEEDS, "Decision Speed", lineNumber, rowErrors);
    const depinFamiliarity = parseEnum(
      get("depin_familiarity"),
      DEPIN_FAMILIARITY,
      "DePIN Familiarity",
      lineNumber,
      rowErrors,
    );

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      continue;
    }

    const tags = get("mandate_tags");
    rows.push({
      line: lineNumber,
      firmName: firmName as string,
      jurisdiction: jurisdiction as Jurisdiction,
      firstName: firstName as string,
      lastName: get("last_name"),
      title: get("title"),
      email,
      linkedinUrl: get("linkedin_url"),
      personalReason: get("personal_reason"),
      warmPathContact: get("warm_path_contact"),
      decisionRole,
      firmType,
      aumBand,
      mandateTags: tags ? tags.split(/[|;]/).map((t) => t.trim()).filter(Boolean) : [],
      typicalTicketUsd: get("typical_ticket_usd"),
      decisionSpeed,
      depinFamiliarity,
      source: get("source"),
      notes: get("notes"),
      factors,
    });
  }

  return { rows, errors };
}

/**
 * Drops rows that collide with an existing record or with an earlier row in
 * the same file. Email wins over name matching.
 */
export function dedupeImport(rows: readonly ImportRow[], existing: readonly ExistingRecord[]): DedupeResult {
  const emails = new Set(
    existing.map((r) => r.email).filter((e): e is string => Boolean(e)).map(normalizeEmail),
  );
  const people = new Set(existing.map((r) => personKey(r.firmName, r.firstName, r.lastName)));

  const accepted: ImportRow[] = [];
  const duplicates: Duplicate[] = [];

  for (const row of rows) {
    if (row.email && emails.has(row.email)) {
      duplicates.push({ row, reason: `Address already on file: ${row.email}` });
      continue;
    }
    const key = personKey(row.firmName, row.firstName, row.lastName);
    if (people.has(key)) {
      duplicates.push({
        row,
        reason: `Already on file: ${row.firstName}${row.lastName ? ` ${row.lastName}` : ""} at ${row.firmName}`,
      });
      continue;
    }
    if (row.email) emails.add(row.email);
    people.add(key);
    accepted.push(row);
  }

  return { accepted, duplicates };
}

export function scoreImportedRow(row: ImportRow, currentTier: Tier | null = null): RescoreResult | null {
  if (row.factors === null) return null;
  return rescore({
    factors: row.factors,
    currentTier,
    enrollmentStatus: null,
  });
}

/**
 * Rescore a firm that is already on file. Guardrails live in `rescore`:
 * manual_only is preserved, Tier 1 is not left without an operator action.
 */
export function rescoreFirm(input: RescoreInput): RescoreResult {
  return rescore(input);
}

export function describeRescore(result: RescoreResult): string {
  if (result.requiresOperatorAction) {
    return `Score ${result.score} would move this firm to Tier ${result.computedTier}. Tier 1 is held until an operator confirms the demotion.`;
  }
  return `Score ${result.score}, Tier ${result.tier}`;
}
