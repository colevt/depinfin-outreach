"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  type ProspectContext,
  type TemplateRecord,
  buildLinkedInSearch,
  composeDraft,
  dedupeKey,
  dedupeLeads,
  parsePastedLeads,
} from "@depinfin/core";
import {
  discardDraft,
  getProspect,
  listProspects,
  listTemplates,
  markLinkedInSent,
  saveDraft,
  saveResearch,
  saveSearch,
  setPersonalReason,
  setSequenceActive,
  suppressionRowsFor,
  updateAutomation,
  writeLog,
} from "@depinfin/db";
import { db } from "./db";
import { actor, setOperator } from "./operator";
import { toProspectView } from "./view";

/**
 * Every mutation the desk performs. Zod validates at the boundary, because a
 * server action is a public HTTP endpoint whatever the form on the other side
 * looks like.
 *
 * Nothing here decides whether a message may go out. `composeDraft` calls
 * `evaluateDraft` in packages/compliance, and the verdict it returns is what
 * gets stored alongside the draft. The check constraint in migration 0006 then
 * refuses to let an unclean draft leave draft status, so a bug in this file
 * cannot approve one.
 */

const uuid = z.string().uuid();

export async function chooseOperator(formData: FormData): Promise<void> {
  const name = z.string().min(1).parse(formData.get("operator"));
  await setOperator(name);
  revalidatePath("/", "layout");
}

const composeSchema = z.object({
  contactId: uuid,
  templateId: z.union([uuid, z.literal("")]).optional(),
  kind: z.enum(["first_touch", "follow_up", "reply"]),
  channel: z.enum(["email", "linkedin"]),
  subject: z.string().max(400).default(""),
  body: z.string().max(20000).default(""),
});

export interface ComposeState {
  readonly ok: boolean;
  readonly message: string;
  readonly blockers: readonly { gate: string; reason: string; terminal: boolean }[];
  readonly subject: string;
  readonly body: string;
}

/**
 * Evaluates a draft without saving it. The editor calls this on demand so an
 * operator sees the linter's findings while writing rather than at the moment
 * they try to send.
 */
export async function checkDraft(
  _previous: ComposeState | null,
  formData: FormData,
): Promise<ComposeState> {
  const input = composeSchema.parse(Object.fromEntries(formData));
  const composed = await composeFor(input);

  return {
    ok: composed.decision.sendable,
    message: composed.decision.sendable
      ? "Clean. Nothing blocking."
      : `${composed.decision.blockers.length} blocking`,
    blockers: composed.decision.blockers.map((b) => ({
      gate: b.gate,
      reason: b.reason,
      terminal: b.terminal,
    })),
    subject: composed.subject,
    body: composed.body,
  };
}

export async function saveDraftAction(
  _previous: ComposeState | null,
  formData: FormData,
): Promise<ComposeState> {
  const input = composeSchema.parse(Object.fromEntries(formData));
  const composed = await composeFor(input);
  const who = await actor();

  const draftId = await saveDraft(db(), {
    contactId: input.contactId,
    templateId: input.templateId === undefined || input.templateId === "" ? null : input.templateId,
    kind: input.kind,
    channel: input.channel,
    subject: composed.subject,
    body: composed.body,
    lintClean: composed.decision.sendable,
    lintFindings: composed.decision.blockers,
    createdBy: who,
  });

  await writeLog(db(), {
    actor: who,
    contactId: input.contactId,
    action: composed.decision.sendable ? "stage_change" : "blocked",
    detail: {
      reason: composed.decision.sendable
        ? "Draft saved, clean"
        : composed.decision.blockers.map((b) => b.reason).join("; "),
      draftId,
      kind: input.kind,
      channel: input.channel,
    },
  });

  revalidatePath(`/prospects/${input.contactId}`);

  return {
    ok: composed.decision.sendable,
    message: composed.decision.sendable
      ? "Saved. Clean and ready."
      : "Saved as a draft. It cannot be sent until the blockers below are cleared.",
    blockers: composed.decision.blockers.map((b) => ({
      gate: b.gate,
      reason: b.reason,
      terminal: b.terminal,
    })),
    subject: composed.subject,
    body: composed.body,
  };
}

async function composeFor(input: z.infer<typeof composeSchema>) {
  const prospect = await getProspect(db(), input.contactId);
  if (prospect === null) throw new Error("No such prospect");

  const templates = await listTemplates(db());
  const template = templates.find((t) => t.id === input.templateId);

  const context: ProspectContext = {
    prospect: toProspectView(prospect),
    side: prospect.side,
    firmType: (prospect.firm_type as ProspectContext["firmType"]) ?? null,
    operatorCategory: (prospect.operator_category as ProspectContext["operatorCategory"]) ?? null,
  };

  const suppressions = await suppressionRowsFor(db(), prospect.email);

  const record: TemplateRecord | undefined =
    template === undefined
      ? undefined
      : {
          id: template.id,
          key: template.key,
          subject: template.subject,
          body: template.body,
          contentTier: "corporate",
          side: template.side,
          stage: template.stage as TemplateRecord["stage"],
          audienceFirmTypes: template.audience_firm_types as TemplateRecord["audienceFirmTypes"],
          audienceOperatorCategories:
            template.audience_operator_categories as TemplateRecord["audienceOperatorCategories"],
        };

  return composeDraft({
    context,
    kind: input.kind,
    channel: input.channel,
    ...(record === undefined ? {} : { template: record }),
    overrides: { subject: input.subject, body: input.body },
    suppressions,
  });
}

export async function discardDraftAction(formData: FormData): Promise<void> {
  const draftId = uuid.parse(formData.get("draftId"));
  const contactId = uuid.parse(formData.get("contactId"));
  await discardDraft(db(), draftId);
  await writeLog(db(), {
    actor: await actor(),
    contactId,
    action: "stage_change",
    detail: { reason: "Draft discarded", draftId },
  });
  revalidatePath(`/prospects/${contactId}`);
}

/**
 * INV-8. A LinkedIn message is sent by a human from their own account. This
 * records that they did it. There is no send here and there will not be one.
 */
export async function markLinkedInSentAction(formData: FormData): Promise<void> {
  const draftId = uuid.parse(formData.get("draftId"));
  const contactId = uuid.parse(formData.get("contactId"));
  await markLinkedInSent(db(), draftId);
  await writeLog(db(), {
    actor: await actor(),
    contactId,
    action: "stage_change",
    detail: { reason: "LinkedIn message sent by hand", draftId, channel: "linkedin" },
  });
  revalidatePath(`/prospects/${contactId}`);
}

export async function setReasonAction(formData: FormData): Promise<void> {
  const contactId = uuid.parse(formData.get("contactId"));
  const reason = z.string().trim().min(1).max(2000).parse(formData.get("reason"));
  await setPersonalReason(db(), contactId, reason);
  await writeLog(db(), {
    actor: await actor(),
    contactId,
    action: "stage_change",
    detail: { reason: "Personal reason set", personalReason: reason },
  });
  revalidatePath(`/prospects/${contactId}`);
}

const automationSchema = z.object({
  sequencesEnabled: z.coerce.boolean(),
  dailySendCap: z.coerce.number().int().min(0).max(500),
  sendWindowStart: z.string().regex(/^\d{2}:\d{2}$/),
  sendWindowEnd: z.string().regex(/^\d{2}:\d{2}$/),
  sendDays: z.string(),
  sendTimezone: z.string().min(1),
  digestEnabled: z.coerce.boolean(),
  digestHour: z.coerce.number().int().min(0).max(23),
  digestTimezone: z.string().min(1),
});

export async function updateAutomationAction(formData: FormData): Promise<void> {
  const raw = {
    sequencesEnabled: formData.get("sequencesEnabled") === "on",
    dailySendCap: formData.get("dailySendCap"),
    sendWindowStart: formData.get("sendWindowStart"),
    sendWindowEnd: formData.get("sendWindowEnd"),
    sendDays: formData.getAll("sendDays").join(","),
    sendTimezone: formData.get("sendTimezone"),
    digestEnabled: formData.get("digestEnabled") === "on",
    digestHour: formData.get("digestHour"),
    digestTimezone: formData.get("digestTimezone"),
  };
  const input = automationSchema.parse(raw);

  const days = input.sendDays
    .split(",")
    .map((d) => Number.parseInt(d, 10))
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);

  const who = await actor();
  await updateAutomation(db(), {
    sequencesEnabled: input.sequencesEnabled,
    dailySendCap: input.dailySendCap,
    sendWindowStart: input.sendWindowStart,
    sendWindowEnd: input.sendWindowEnd,
    sendDays: days.length > 0 ? days : [1, 2, 3, 4, 5],
    sendTimezone: input.sendTimezone,
    digestEnabled: input.digestEnabled,
    digestHour: input.digestHour,
    digestTimezone: input.digestTimezone,
    updatedBy: who,
  });

  await writeLog(db(), {
    actor: who,
    action: "stage_change",
    detail: { reason: "Automation settings changed", ...input, sendDays: days },
  });
  revalidatePath("/automation");
}

export async function toggleSequenceAction(formData: FormData): Promise<void> {
  const sequenceId = uuid.parse(formData.get("sequenceId"));
  const active = formData.get("active") === "true";
  await setSequenceActive(db(), sequenceId, active);
  await writeLog(db(), {
    actor: await actor(),
    action: "stage_change",
    detail: { reason: `Sequence ${active ? "activated" : "paused"}`, sequenceId },
  });
  revalidatePath("/automation");
}

const searchSchema = z.object({
  name: z.string().trim().min(1).max(120),
  side: z.enum(["buy", "sell"]),
  firmTypes: z.array(z.string()).default([]),
  operatorCategories: z.array(z.string()).default([]),
  decisionRoles: z.array(z.string()).default([]),
  locations: z.string().default(""),
  mustInclude: z.string().default(""),
  exclude: z.string().default(""),
  requireCategoryLiteracy: z.boolean().default(false),
});

export interface SearchState {
  readonly query: string;
  readonly url: string;
  readonly salesNavigatorUrl: string;
  readonly explanation: readonly string[];
  readonly saved: boolean;
}

/**
 * INV-8. Builds the query and the URL. It does not open them, fetch them, or
 * read a single result. The operator runs the search in their own browser,
 * signed in as themselves.
 */
export async function buildSearchAction(
  _previous: SearchState | null,
  formData: FormData,
): Promise<SearchState> {
  const input = searchSchema.parse({
    name: formData.get("name") ?? "Untitled search",
    side: formData.get("side") ?? "buy",
    firmTypes: formData.getAll("firmTypes").map(String),
    operatorCategories: formData.getAll("operatorCategories").map(String),
    decisionRoles: formData.getAll("decisionRoles").map(String),
    locations: formData.get("locations") ?? "",
    mustInclude: formData.get("mustInclude") ?? "",
    exclude: formData.get("exclude") ?? "",
    requireCategoryLiteracy: formData.get("requireCategoryLiteracy") === "on",
  });

  const criteria = {
    side: input.side,
    firmTypes: input.firmTypes as never,
    operatorCategories: input.operatorCategories as never,
    decisionRoles: input.decisionRoles as never,
    locations: splitList(input.locations),
    mustInclude: splitList(input.mustInclude),
    exclude: splitList(input.exclude),
    requireCategoryLiteracy: input.requireCategoryLiteracy,
  };

  const built = buildLinkedInSearch(criteria);

  let saved = false;
  if (formData.get("save") === "true" && built.query !== "") {
    await saveSearch(db(), {
      name: input.name,
      side: input.side,
      channel: "linkedin",
      criteria,
      queryText: built.query,
      url: built.url,
      createdBy: await actor(),
    });
    saved = true;
    revalidatePath("/search");
  }

  return {
    query: built.query,
    url: built.url,
    salesNavigatorUrl: built.salesNavigatorUrl,
    explanation: built.explanation,
    saved,
  };
}

export interface ImportState {
  readonly fresh: readonly { name: string; title: string; firm: string; url: string }[];
  readonly existing: number;
  readonly duplicated: number;
  readonly warnings: readonly { line: number; reason: string }[];
}

/**
 * Reads a paste the operator made. Dedupes against what the pipeline already
 * holds and reports what is new. It does not create prospects: a prospect
 * needs a specific reason for contact (INV-3), and nothing here can invent
 * one, so the fresh rows are shown for an operator to work through.
 */
export async function importLeadsAction(
  _previous: ImportState | null,
  formData: FormData,
): Promise<ImportState> {
  const pasted = z.string().max(200000).parse(formData.get("pasted") ?? "");
  const parsed = parsePastedLeads(pasted);

  const known = await listProspects(db(), { limit: 2000 });
  const existingKeys = new Set(
    known.map((row) =>
      dedupeKey({
        firstName: row.first_name,
        lastName: row.last_name,
        firmName: row.firm_name,
        linkedinUrl: row.linkedin_url,
      }),
    ),
  );

  const result = dedupeLeads(parsed.leads, existingKeys);

  return {
    fresh: result.fresh.map((lead) => ({
      name: `${lead.firstName} ${lead.lastName ?? ""}`.trim(),
      title: lead.title ?? "",
      firm: lead.firmName ?? "",
      url: lead.linkedinUrl ?? "",
    })),
    existing: result.existing.length,
    duplicated: result.duplicatedInPaste.length,
    warnings: parsed.warnings.map((w) => ({ line: w.line, reason: w.reason })),
  };
}

const researchSchema = z.object({
  contactId: z.union([uuid, z.literal("")]).default(""),
  firmId: z.union([uuid, z.literal("")]).default(""),
  headline: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(20000),
  sources: z.string().default(""),
  provider: z.string().trim().min(1).max(120).default("manual"),
});

/**
 * Records research with its sources.
 *
 * Sources are required. Section 13 makes market figures investor-material
 * claims that need a verified source before use, and a research note with no
 * URL is a claim with nothing behind it. Storing it without one would put an
 * unsourced figure one copy and paste away from a prospect-facing draft.
 */
export async function saveResearchAction(formData: FormData): Promise<void> {
  const input = researchSchema.parse(Object.fromEntries(formData));

  const sources = splitLines(input.sources)
    .map((line) => {
      const [url, ...rest] = line.split(/\s+/);
      return { url: url ?? "", title: rest.join(" "), fetchedAt: new Date().toISOString() };
    })
    .filter((source) => /^https?:\/\//i.test(source.url));

  if (sources.length === 0) {
    throw new Error(
      "At least one source URL is required. A research note with no source is a claim with " +
        "nothing behind it, and section 13 treats market figures as investor-material claims.",
    );
  }

  await saveResearch(db(), {
    contactId: input.contactId === "" ? null : input.contactId,
    firmId: input.firmId === "" ? null : input.firmId,
    headline: input.headline,
    body: input.body,
    sources,
    provider: input.provider,
    createdBy: await actor(),
  });

  if (input.contactId !== "") {
    await writeLog(db(), {
      actor: await actor(),
      contactId: input.contactId,
      action: "stage_change",
      detail: { reason: "Research recorded", headline: input.headline, sources: sources.length },
    });
    revalidatePath(`/prospects/${input.contactId}`);
  }
  revalidatePath("/research");
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
