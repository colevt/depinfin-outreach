import type {
  EnrollmentView,
  ProspectView,
  SendDecision,
  SuppressionEntry,
  TemplateView,
} from "../src/types.js";
import type { SendEvaluationInput } from "../src/pipeline.js";

export const NOW = new Date("2026-03-10T14:00:00.000Z");

export function prospect(overrides: Partial<ProspectView> = {}): ProspectView {
  return {
    contactId: "00000000-0000-4000-8000-000000000001",
    email: "dana@northarc.com",
    firstName: "Dana",
    lastName: "Okafor",
    title: "CIO",
    firmName: "North Arc Family Office",
    personalReason: "your note on metered infrastructure at the Denver roundtable",
    doNotContact: false,
    tier: 2,
    jurisdiction: "us",
    ...overrides,
  };
}

export function template(overrides: Partial<TemplateView> = {}): TemplateView {
  return {
    key: "corporate_intro_1",
    subject: "{{first_name}}, a note on DePIN infrastructure",
    body: "Hi {{first_name}},\n\nI read {{personal_reason}}.\n\nCole",
    contentTier: "corporate",
    ...overrides,
  };
}

export function enrollment(overrides: Partial<EnrollmentView> = {}): EnrollmentView {
  return {
    status: "active",
    currentStep: 0,
    maxSteps: 5,
    lastSentAt: null,
    delayDays: 3,
    ...overrides,
  };
}

export function evaluation(overrides: Partial<SendEvaluationInput> = {}): SendEvaluationInput {
  return {
    transportKind: "warm",
    campaignTransport: "warm",
    prospect: prospect(),
    enrollment: enrollment(),
    template: template(),
    suppressions: [] as readonly SuppressionEntry[],
    now: NOW,
    ...overrides,
  };
}

export function refusal(decision: SendDecision): Extract<SendDecision, { allowed: false }> {
  if (decision.allowed) throw new Error("expected the send to be refused, it was allowed");
  return decision;
}

export function allowed(decision: SendDecision): Extract<SendDecision, { allowed: true }> {
  if (!decision.allowed) {
    throw new Error(`expected the send to be allowed, it was refused: ${decision.reason}`);
  }
  return decision;
}
