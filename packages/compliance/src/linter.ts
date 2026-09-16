/**
 * INV-2. Return-implying language blocks the send.
 *
 * There is no bypass in this file by design. No `force` argument, no
 * `skipLint` option, no environment variable is read here. If a legitimate
 * message trips the linter, the message gets rewritten. Adding a parameter
 * that suppresses a finding is a violation of INV-2, not a feature.
 *
 * The linter runs on MERGED output, never on the raw template, so a clean
 * template that receives a blocked term through a merge field still refuses.
 */

/** The mandated block list from CLAUDE.md section 2, INV-2. Order is irrelevant. */
export const BLOCKED_TERMS: readonly string[] = Object.freeze([
  "yield",
  "high yield",
  "real yield",
  "apy",
  "guaranteed",
  "guarantee",
  "risk-free",
  "riskless",
  "assured",
  "promised return",
  "annual return",
  "roi",
  "principal protected",
  "no risk",
  "prospectus",
  "secured note",
]);

/** Any numeric percentage figure. Matches `14%`, `14 %`, `7.5%`. */
export const PERCENTAGE_PATTERN = /\b\d{1,3}(?:\.\d+)?\s*%/;

export type LintField = "subject" | "body";

export interface LintFinding {
  readonly kind: "term" | "percentage";
  /** The blocked term as listed, or "percentage". */
  readonly rule: string;
  /** The exact text that matched, after normalization. */
  readonly match: string;
  readonly field: LintField;
  readonly index: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Word-boundary aware, case-insensitive, whitespace-tolerant between the words
 * of a multi-word term.
 *
 * `\b` is deliberate: `ROI-based` must match `roi`, while `royalty` must not,
 * and `high-yield` must match `yield`, while `yielded` and `shipyard` must not.
 */
function termPattern(term: string): RegExp {
  const inner = term.split(/\s+/).map(escapeRegExp).join("\\s+");
  return new RegExp(`\\b${inner}\\b`, "gi");
}

const TERM_PATTERNS: readonly { term: string; pattern: RegExp }[] = BLOCKED_TERMS.map((term) => ({
  term,
  pattern: termPattern(term),
}));

const ZERO_WIDTH = /[​-‍⁠﻿]/g;
const UNICODE_DASHES = /[‐-―−]/g;

/**
 * Defensive normalization before matching. Compatibility-folds lookalike
 * characters, strips zero-width characters, and folds unicode dashes to a
 * hyphen, so `ap​y` with an invisible separator and `risk‑free` with a
 * non-ASCII hyphen are caught like their plain spellings.
 *
 * Normalization only ever widens what is caught. It cannot let a match through.
 */
export function normalizeForLint(text: string): string {
  return text.normalize("NFKC").replace(ZERO_WIDTH, "").replace(UNICODE_DASHES, "-");
}

function scanField(text: string, field: LintField): LintFinding[] {
  const normalized = normalizeForLint(text);
  const findings: LintFinding[] = [];

  for (const { term, pattern } of TERM_PATTERNS) {
    // Fresh regex per scan: shared /g regexes carry lastIndex between calls.
    const scoped = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = scoped.exec(normalized)) !== null) {
      findings.push({ kind: "term", rule: term, match: match[0], field, index: match.index });
      if (match[0].length === 0) scoped.lastIndex += 1;
    }
  }

  const percentScan = new RegExp(PERCENTAGE_PATTERN.source, "g");
  let percentMatch: RegExpExecArray | null;
  while ((percentMatch = percentScan.exec(normalized)) !== null) {
    findings.push({
      kind: "percentage",
      rule: "percentage",
      match: percentMatch[0],
      field,
      index: percentMatch.index,
    });
  }

  return findings.sort((a, b) => a.index - b.index);
}

/**
 * Lint merged subject and body. Returns every finding, not just the first,
 * so the operator sees the whole rewrite job at once.
 */
export function lint(subject: string, body: string): LintFinding[] {
  return [...scanField(subject, "subject"), ...scanField(body, "body")];
}

export function isClean(subject: string, body: string): boolean {
  return lint(subject, body).length === 0;
}

/** Operator-legible summary. Section 9: legible reasons, not error codes. */
export function describeFindings(findings: readonly LintFinding[]): string {
  if (findings.length === 0) return "No blocked language";
  const parts = findings.map((f) =>
    f.kind === "percentage"
      ? `percentage figure "${f.match}" in ${f.field}`
      : `blocked term "${f.match}" in ${f.field}`,
  );
  const unique = [...new Set(parts)];
  return `Return-implying language: ${unique.join(", ")}`;
}
