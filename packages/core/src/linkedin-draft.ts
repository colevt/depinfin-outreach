/**
 * INV-8. Draft a LinkedIn message. A human copies it and sends it from their
 * own account. There is no send function in this file, and there must never
 * be one.
 *
 * The draft is corporate-tier copy. It runs through the same merge and linter
 * as outbound mail (INV-2, INV-3), because a pasted LinkedIn message is still
 * prospect-facing.
 */

import {
  describeFindings,
  fieldsFromProspect,
  humanizeField,
  lint,
  merge,
  type ProspectView,
} from "@depinfin/compliance";

export const LINKEDIN_DRAFT_TEMPLATE = [
  "{{first_name}}, I am reaching out because {{personal_reason}}.",
  "",
  "DePINfin builds non-custodial software and administrative tooling for decentralized physical infrastructure. Web3 token ownership is not legal asset ownership, and closing that gap is what we work on.",
  "",
  "If the category is interesting to {{firm_name}}, I would like to compare notes.",
].join("\n");

export interface LinkedInDraftInput {
  readonly prospect: ProspectView;
  readonly linkedinUrl: string | null;
}

export type LinkedInDraft =
  | {
      readonly available: true;
      readonly text: string;
      readonly profileUrl: string | null;
    }
  | {
      readonly available: false;
      /** Operator-legible. Same voice as send-pipeline skip reasons. */
      readonly reason: string;
      readonly profileUrl: string | null;
    };

/**
 * Builds a copy-ready draft, or explains why there is nothing to copy.
 * Never returns a draft that would fail the linter or leave a placeholder.
 */
export function draftLinkedInMessage(input: LinkedInDraftInput): LinkedInDraft {
  const profileUrl = input.linkedinUrl?.trim() ? input.linkedinUrl.trim() : null;
  const merged = merge(
    { subject: "", body: LINKEDIN_DRAFT_TEMPLATE },
    fieldsFromProspect(input.prospect),
  );

  if (merged.emptyFields.length > 0) {
    const names = merged.emptyFields.map(humanizeField);
    return {
      available: false,
      reason: `${names.join(", ")} empty`,
      profileUrl,
    };
  }

  if (merged.unresolved.length > 0) {
    const names = merged.unresolved.map(humanizeField);
    return {
      available: false,
      reason: `Unresolved placeholder: ${names.join(", ")}`,
      profileUrl,
    };
  }

  const findings = lint("", merged.body);
  if (findings.length > 0) {
    return {
      available: false,
      reason: describeFindings(findings),
      profileUrl,
    };
  }

  return { available: true, text: merged.body, profileUrl };
}
