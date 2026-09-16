/**
 * Composing a message for one prospect. This is what the Prospects tab does.
 *
 * Two starting points, and the difference matters:
 *
 *   first touch   Nobody has written to this person yet. INV-3 applies: there
 *                 must be a specific, verifiable reason for contact, and
 *                 without one this is a name rather than a prospect.
 *
 *   reply         They wrote back. The sequence is terminal for automation
 *                 (section 5) and stays that way until an operator acts. The
 *                 reason for contact is the reply itself.
 *
 * Nothing here decides whether a message may go out. That decision belongs to
 * `evaluateDraft` in packages/compliance, and this module calls it rather than
 * repeating any part of it.
 */

import {
  type ContentTier,
  type DraftChannel,
  type DraftKind,
  type DraftDecision,
  type ProspectView,
  type SuppressionEntry,
  evaluateDraft,
  fieldsFromProspect,
  merge,
} from "@depinfin/compliance";
import {
  COPY_RULES,
  DO_NOT_CLAIM,
  POSITIONING_POINTS,
  buySideProfile,
  sellSideProfile,
} from "../knowledge/index.js";
import type {
  FirmType,
  MarketSide,
  OperatorCategory,
  TemplateStage,
} from "../knowledge/types.js";

export interface TemplateRecord {
  readonly id: string;
  readonly key: string;
  readonly subject: string;
  readonly body: string;
  readonly contentTier: ContentTier;
  readonly side: MarketSide;
  readonly stage: TemplateStage;
  /** Empty means any prospect type on that side. */
  readonly audienceFirmTypes: readonly FirmType[];
  readonly audienceOperatorCategories: readonly OperatorCategory[];
}

export interface ProspectContext {
  readonly prospect: ProspectView;
  readonly side: MarketSide;
  readonly firmType: FirmType | null;
  readonly operatorCategory: OperatorCategory | null;
}

/** A template offered for this prospect, and why. */
export interface TemplateMatch {
  readonly template: TemplateRecord;
  /** Higher is a better fit. Ties keep source order. */
  readonly specificity: number;
  readonly why: string;
}

/**
 * Templates that fit this prospect at this stage, most specific first.
 *
 * A template that names prospect types is only offered to those types. One
 * that names none is a general fallback, always offered but ranked below a
 * targeted match, because a targeted template is the reason the targeting
 * columns exist.
 */
export function matchTemplates(
  templates: readonly TemplateRecord[],
  context: ProspectContext,
  stage: TemplateStage,
): TemplateMatch[] {
  const matches: TemplateMatch[] = [];

  for (const template of templates) {
    if (template.side !== context.side) continue;
    if (template.stage !== stage) continue;
    // INV-6. Belt and braces over the database check constraint.
    if (template.contentTier !== "corporate") continue;

    const targetsFirmTypes = template.audienceFirmTypes.length > 0;
    const targetsCategories = template.audienceOperatorCategories.length > 0;

    if (context.side === "buy" && targetsFirmTypes) {
      if (context.firmType === null) continue;
      if (!template.audienceFirmTypes.includes(context.firmType)) continue;
      matches.push({
        template,
        specificity: 2,
        why: `Written for ${context.firmType.replace(/_/g, " ")}`,
      });
      continue;
    }

    if (context.side === "sell" && targetsCategories) {
      if (context.operatorCategory === null) continue;
      if (!template.audienceOperatorCategories.includes(context.operatorCategory)) continue;
      matches.push({
        template,
        specificity: 2,
        why: `Written for ${context.operatorCategory.replace(/_/g, " ")} operators`,
      });
      continue;
    }

    // A template targeting the other side's dimension is not a general one.
    if ((context.side === "buy" && targetsCategories) ||
        (context.side === "sell" && targetsFirmTypes)) {
      continue;
    }

    matches.push({ template, specificity: 1, why: "General template for this side" });
  }

  return matches.sort((a, b) => b.specificity - a.specificity);
}

export interface ComposeInput {
  readonly context: ProspectContext;
  readonly kind: DraftKind;
  readonly channel: DraftChannel;
  /** Omit to start from a blank draft. */
  readonly template?: TemplateRecord;
  /** Operator edits, applied over the merged template. */
  readonly overrides?: { readonly subject?: string; readonly body?: string };
  readonly suppressions: readonly SuppressionEntry[];
}

export interface ComposedDraft {
  readonly subject: string;
  readonly body: string;
  readonly templateId: string | null;
  readonly templateKey: string | null;
  readonly kind: DraftKind;
  readonly channel: DraftChannel;
  readonly contentTier: ContentTier;
  /** From packages/compliance. The only authority on whether this may go out. */
  readonly decision: DraftDecision;
  /** Shown beside the editor. Not rules, prompts. */
  readonly guidance: DraftGuidance;
}

export interface DraftGuidance {
  /** Why this prospect, in their own terms. */
  readonly angle: string | null;
  /** What to lead with for this prospect type. */
  readonly leadWith: string | null;
  /** The objection to expect. */
  readonly objection: string | null;
  /** Corporate positioning points safe to draw on (INV-6, Tier 1 content). */
  readonly positioning: readonly { readonly claim: string; readonly support: string }[];
  /** House copy rules, from CLAUDE.md section 13. */
  readonly copyRules: readonly { readonly rule: string; readonly instead: string | null }[];
  /** Claims that are out of bounds whether or not the linter catches them. */
  readonly doNotClaim: readonly string[];
  /** Notes specific to this prospect's situation. */
  readonly notes: readonly string[];
}

/**
 * Merges a template if there is one, applies operator edits, and evaluates the
 * result. Pure. The caller supplies suppressions and persists the outcome.
 */
export function composeDraft(input: ComposeInput): ComposedDraft {
  const { context, template } = input;

  let subject = "";
  let body = "";

  if (template !== undefined) {
    const merged = merge(template, fieldsFromProspect(context.prospect));
    subject = merged.subject;
    body = merged.body;
  }

  if (input.overrides?.subject !== undefined) subject = input.overrides.subject;
  if (input.overrides?.body !== undefined) body = input.overrides.body;

  // A LinkedIn message has no subject line, and carrying one would only make
  // it into the body when an operator copies the draft out.
  if (input.channel === "linkedin") subject = "";

  const contentTier: ContentTier = "corporate";

  const decision = evaluateDraft({
    prospect: context.prospect,
    kind: input.kind,
    channel: input.channel,
    subject,
    body,
    contentTier,
    suppressions: input.suppressions,
  });

  return {
    subject,
    body,
    templateId: template?.id ?? null,
    templateKey: template?.key ?? null,
    kind: input.kind,
    channel: input.channel,
    contentTier,
    decision,
    guidance: guidanceFor(context, input.kind, input.channel),
  };
}

/** What the operator sees beside the editor. */
export function guidanceFor(
  context: ProspectContext,
  kind: DraftKind,
  channel: DraftChannel,
): DraftGuidance {
  const notes: string[] = [];

  if (context.prospect.tier === 1) {
    notes.push(
      "Tier 1. Automated mail never reaches this person by design, so this draft is the whole " +
        "of the outreach. Write it as though it is the only message they will read, because it is.",
    );
  }

  if (kind === "first_touch" && isBlank(context.prospect.personalReason)) {
    notes.push(
      "No personal reason on file. Find one before writing. Without it this is a cold pitch " +
        "to a person, and the send is refused anyway.",
    );
  } else if (kind === "first_touch") {
    notes.push(`Open on the reason for contact: ${context.prospect.personalReason}`);
  }

  if (kind === "reply") {
    notes.push(
      "They wrote back, so the sequence is stopped for automation until an operator resumes it. " +
        "Answer what they actually asked before anything else.",
    );
  }

  if (isExcludedJurisdictionForAutomation(context.prospect.jurisdiction)) {
    notes.push(
      `${context.prospect.jurisdiction.toUpperCase()} prospect. Automated sending excludes this ` +
        "jurisdiction pending counsel on lawful basis, so warm human contact like this is the " +
        "only route. Keep it one to one.",
    );
  }

  if (channel === "linkedin") {
    notes.push(
      "You send this yourself from your own account. Copy it out when it reads right. " +
        "Short beats complete here.",
    );
  }

  const buy = context.side === "buy" && context.firmType !== null
    ? buySideProfile(context.firmType)
    : null;
  const sell = context.side === "sell" && context.operatorCategory !== null
    ? sellSideProfile(context.operatorCategory)
    : null;

  if (sell !== null) {
    notes.push(`Qualifying question: ${sell.qualifyingQuestion}`);
  }

  return {
    angle: buy?.thesis ?? null,
    leadWith: buy?.leadWith ?? null,
    objection: buy?.objection ?? null,
    positioning: POSITIONING_POINTS.map((p) => ({ claim: p.claim, support: p.support })),
    copyRules: COPY_RULES.map((r) => ({ rule: r.rule, instead: r.instead })),
    doNotClaim: DO_NOT_CLAIM,
    notes,
  };
}

function isExcludedJurisdictionForAutomation(jurisdiction: string): boolean {
  return jurisdiction === "eu" || jurisdiction === "uk" || jurisdiction === "eea";
}

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim().length === 0;
}
