"use server";

import { revalidatePath } from "next/cache";
import { IllegalTransitionError, transition } from "@depinfin/core";
import { dedupeImport, parseImportCsv, rescore, scoreImportedRow, type Factor } from "@depinfin/core";
import { currentActor, persistActor } from "./actor.js";
import { getStore } from "./store.js";

export interface ActionResult {
  readonly ok: boolean;
  readonly message: string;
}

export async function setActor(formData: FormData): Promise<void> {
  await persistActor(String(formData.get("actor") ?? ""));
  revalidatePath("/");
}

export async function resumeEnrollment(formData: FormData): Promise<ActionResult> {
  const enrollmentId = String(formData.get("enrollmentId") ?? "");
  const confirmed = formData.get("confirm") === "on" || formData.get("confirm") === "true";
  if (!confirmed) {
    return { ok: false, message: "Confirm that this prospect should return to automated sending." };
  }

  const actor = await currentActor();
  const store = getStore();
  const enrollment = await store.getEnrollment(enrollmentId);
  if (!enrollment) return { ok: false, message: "Enrollment not found" };

  try {
    const result = transition(enrollment.status, { type: "operator_resume", actor });
    await store.setEnrollmentStatus(enrollment.enrollmentId, result.status);
    await store.writeActivity({
      actor,
      contactId: enrollment.contactId,
      enrollmentId: enrollment.enrollmentId,
      action: result.action,
      detail: result.detail,
    });
    revalidatePath("/");
    revalidatePath("/sends");
    revalidatePath(`/prospects/${enrollment.contactId}`);
    return { ok: true, message: "Returned to automated sending." };
  } catch (error) {
    return { ok: false, message: error instanceof IllegalTransitionError ? error.message : String(error) };
  }
}

export async function stopEnrollment(formData: FormData): Promise<ActionResult> {
  const enrollmentId = String(formData.get("enrollmentId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length === 0) {
    return { ok: false, message: "A stop needs a reason." };
  }

  const actor = await currentActor();
  const store = getStore();
  const enrollment = await store.getEnrollment(enrollmentId);
  if (!enrollment) return { ok: false, message: "Enrollment not found" };

  try {
    const result = transition(enrollment.status, { type: "operator_stop", actor, reason });
    await store.setEnrollmentStatus(enrollment.enrollmentId, result.status);
    await store.writeActivity({
      actor,
      contactId: enrollment.contactId,
      enrollmentId: enrollment.enrollmentId,
      action: result.action,
      detail: result.detail,
    });
    revalidatePath("/");
    revalidatePath("/sends");
    revalidatePath(`/prospects/${enrollment.contactId}`);
    return { ok: true, message: "Sequence stopped." };
  } catch (error) {
    return { ok: false, message: error instanceof IllegalTransitionError ? error.message : String(error) };
  }
}

export interface ImportActionResult extends ActionResult {
  readonly imported: number;
  readonly duplicates: number;
  readonly errors: number;
}

export async function importProspects(formData: FormData): Promise<ImportActionResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a CSV file.", imported: 0, duplicates: 0, errors: 0 };
  }

  const csv = await file.text();
  const parsed = parseImportCsv(csv);
  const store = getStore();
  const existing = await store.listExistingPeople();
  const deduped = dedupeImport(parsed.rows, existing);
  const actor = await currentActor();

  let imported = 0;
  for (const row of deduped.accepted) {
    const inserted = await store.insertImportedRow(row);
    const scored = scoreImportedRow(row);
    const firm = await store.getFirmForRescore(inserted.firmId);
    const firmHasScore = firm?.tier !== null;
    if (scored && (inserted.createdFirm || !firmHasScore) && row.factors) {
      await store.updateFirmScore(inserted.firmId, {
        score: scored.score,
        tier: scored.tier,
        factors: row.factors,
      });
      await store.writeActivity({
        actor,
        contactId: inserted.contactId,
        enrollmentId: null,
        action: "rescored",
        detail: scored.detail,
      });
    }
    imported += 1;
  }

  revalidatePath("/list");
  const errorCount = parsed.errors.length;
  const duplicateCount = deduped.duplicates.length;
  const parts = [
    `${imported} imported`,
    duplicateCount > 0 ? `${duplicateCount} already on file` : null,
    errorCount > 0 ? `${errorCount} rows skipped` : null,
  ].filter(Boolean);
  return {
    ok: imported > 0 || (errorCount === 0 && duplicateCount >= 0),
    message: parts.join(". ") + ".",
    imported,
    duplicates: duplicateCount,
    errors: errorCount,
  };
}

export async function rescoreFirmAction(formData: FormData): Promise<ActionResult> {
  const firmId = String(formData.get("firmId") ?? "");
  const actor = await currentActor();
  const store = getStore();
  const firm = await store.getFirmForRescore(firmId);
  if (!firm) return { ok: false, message: "Firm not found" };

  const readFactor = (name: string): Factor | null => {
    const raw = String(formData.get(name) ?? "");
    const n = Number.parseInt(raw, 10);
    if (!Number.isInteger(n) || n < 1 || n > 5) return null;
    return n as Factor;
  };

  const factors = {
    mandateFit: readFactor("mandateFit"),
    ticketFit: readFactor("ticketFit"),
    categoryLiteracy: readFactor("categoryLiteracy"),
    warmPath: readFactor("warmPath"),
    decisionSpeed: readFactor("decisionSpeed"),
  };
  if (Object.values(factors).some((v) => v === null)) {
    return { ok: false, message: "Each factor must be an integer from 1 to 5." };
  }

  const demote = formData.get("confirmDemotion") === "on";
  const demotionReason = String(formData.get("demotionReason") ?? "").trim();

  const result = rescore({
    factors: factors as { mandateFit: Factor; ticketFit: Factor; categoryLiteracy: Factor; warmPath: Factor; decisionSpeed: Factor },
    currentTier: firm.tier,
    enrollmentStatus: firm.enrollmentStatus,
    ...(demote && demotionReason
      ? { operatorDemotion: { actor, reason: demotionReason } }
      : {}),
  });

  if (result.requiresOperatorAction) {
    return {
      ok: false,
      message: `Score ${result.score} would move this firm to Tier ${result.computedTier}. Tier 1 is held until you confirm the demotion with a reason.`,
    };
  }

  await store.updateFirmScore(firm.firmId, {
    score: result.score,
    tier: result.tier,
    factors: factors as { mandateFit: Factor; ticketFit: Factor; categoryLiteracy: Factor; warmPath: Factor; decisionSpeed: Factor },
  });
  await store.writeActivity({
    actor,
    contactId: null,
    enrollmentId: null,
    action: "rescored",
    detail: { ...result.detail, firmId: firm.firmId, firmName: firm.name },
  });
  revalidatePath("/list");
  return { ok: true, message: `Score ${result.score}, Tier ${result.tier}.` };
}
