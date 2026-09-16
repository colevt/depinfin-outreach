/**
 * In-memory operator desk, used when WEB_FIXTURES=1.
 *
 * This exists so the UI can be reviewed without Postgres. The banner in the
 * chrome is mandatory: fixture rows are not live prospects.
 */

import type { EnrollmentStatus, Jurisdiction, ProspectView, SuppressionEntry, Tier } from "@depinfin/compliance";
import type {
  ActivityRow,
  CalendarRow,
  DirectoryRow,
  ExistingPerson,
  ImportedProspect,
  ProspectEnrollment,
  ProspectRecord,
  QueueRow,
  SendPreviewRow,
} from "@depinfin/db";
import type { ScoringFactors } from "@depinfin/core";
import type { LoggedSend, OperatorStore } from "./types";

export const FIXTURE_NOW = new Date("2026-09-16T14:00:00.000Z");

interface FirmRec {
  id: string;
  name: string;
  type: string | null;
  aumBand: string | null;
  jurisdiction: Jurisdiction;
  mandateTags: string[];
  typicalTicketUsd: string | null;
  decisionSpeed: string | null;
  depinFamiliarity: string | null;
  source: string | null;
  score: number | null;
  tier: Tier | null;
  scoreFactors: ScoringFactors | null;
  notes: string | null;
}

interface ContactRec {
  id: string;
  firmId: string;
  firstName: string;
  lastName: string | null;
  title: string | null;
  email: string | null;
  emailStatus: string;
  linkedinUrl: string | null;
  decisionRole: string | null;
  personalReason: string | null;
  warmPathContact: string | null;
  doNotContact: boolean;
}

interface EnrollmentRec {
  id: string;
  contactId: string;
  sequenceId: string;
  sequenceName: string;
  transport: "warm" | "cold";
  status: EnrollmentStatus;
  currentStep: number;
  maxSteps: number;
  lastSentAt: Date | null;
  nextDueAt: Date | null;
  threadId: string | null;
  repliedAt: Date | null;
  delayDays: number;
  updatedAt: Date;
}

const INTRO_TEMPLATE = {
  key: "corporate_intro_1",
  subject: "{{first_name}}, a note on DePIN infrastructure",
  body:
    "Hi {{first_name}},\n\nI am reaching out because {{personal_reason}}.\n\n" +
    "DePINfin builds non-custodial software and administrative tooling for " +
    "decentralized physical infrastructure.\n\nCole",
  contentTier: "corporate" as const,
};

function hoursAgo(hours: number): Date {
  return new Date(FIXTURE_NOW.getTime() - hours * 60 * 60 * 1000);
}

function daysFromToday(days: number, hour = 15): Date {
  const d = new Date(Date.UTC(2026, 8, 16 + days, hour, 0, 0));
  return d;
}

const SEED_FIRMS: FirmRec[] = [
  {
    id: "firm-northarc",
    name: "North Arc Family Office",
    type: "single_family_office",
    aumBand: "500m_1b",
    jurisdiction: "us",
    mandateTags: ["infrastructure", "real_assets"],
    typicalTicketUsd: "2500000",
    decisionSpeed: "medium",
    depinFamiliarity: "medium",
    source: "Denver roundtable",
    score: 39,
    tier: 2,
    scoreFactors: { mandateFit: 4, ticketFit: 4, categoryLiteracy: 3, warmPath: 4, decisionSpeed: 3 },
    notes: "Met via the metered-infrastructure panel.",
  },
  {
    id: "firm-helios",
    name: "Helios OCIO",
    type: "ocio",
    aumBand: "over_1b",
    jurisdiction: "us",
    mandateTags: ["infrastructure"],
    typicalTicketUsd: "5000000",
    decisionSpeed: "slow",
    depinFamiliarity: "high",
    source: "warm intro",
    score: 44,
    tier: 1,
    scoreFactors: { mandateFit: 5, ticketFit: 5, categoryLiteracy: 4, warmPath: 4, decisionSpeed: 2 },
    notes: "Tier 1. Human-written mail only.",
  },
  {
    id: "firm-redwood",
    name: "Redwood RIA",
    type: "ria",
    aumBand: "100m_500m",
    jurisdiction: "us",
    mandateTags: ["alternatives"],
    typicalTicketUsd: "750000",
    decisionSpeed: "fast",
    depinFamiliarity: "none",
    source: "list build",
    score: 31,
    tier: 2,
    scoreFactors: { mandateFit: 3, ticketFit: 3, categoryLiteracy: 2, warmPath: 3, decisionSpeed: 5 },
    notes: null,
  },
  {
    id: "firm-atelier",
    name: "Atelier Privé",
    type: "multi_family_office",
    aumBand: "500m_1b",
    jurisdiction: "eu",
    mandateTags: ["real_assets"],
    typicalTicketUsd: "1500000",
    decisionSpeed: "slow",
    depinFamiliarity: "medium",
    source: "conference list",
    score: 30,
    tier: 2,
    scoreFactors: { mandateFit: 4, ticketFit: 3, categoryLiteracy: 3, warmPath: 2, decisionSpeed: 1 },
    notes: "EU. Warm contact only until counsel clears GDPR posture.",
  },
  {
    id: "firm-pine",
    name: "Pine Court Capital",
    type: "ria",
    aumBand: "100m_500m",
    jurisdiction: "us",
    mandateTags: ["crypto"],
    typicalTicketUsd: "500000",
    decisionSpeed: "fast",
    depinFamiliarity: "high",
    source: "import",
    score: 24,
    tier: 3,
    scoreFactors: { mandateFit: 2, ticketFit: 2, categoryLiteracy: 4, warmPath: 1, decisionSpeed: 4 },
    notes: null,
  },
];

const SEED_CONTACTS: ContactRec[] = [
  {
    id: "contact-dana",
    firmId: "firm-northarc",
    firstName: "Dana",
    lastName: "Okafor",
    title: "CIO",
    email: "dana@northarc.com",
    emailStatus: "valid",
    linkedinUrl: "https://www.linkedin.com/in/dana-okafor",
    decisionRole: "cio",
    personalReason: "your note on metered infrastructure at the Denver roundtable",
    warmPathContact: "Ben Kline at Helios, shared the panel",
    doNotContact: false,
  },
  {
    id: "contact-marcus",
    firmId: "firm-helios",
    firstName: "Marcus",
    lastName: "Chen",
    title: "Managing Director",
    email: "marcus@heliosocio.com",
    emailStatus: "valid",
    linkedinUrl: "https://www.linkedin.com/in/marcus-chen-helios",
    decisionRole: "principal",
    personalReason: "the introduction from Ben after the Denver panel",
    warmPathContact: "Ben Kline, same firm",
    doNotContact: false,
  },
  {
    id: "contact-priya",
    firmId: "firm-redwood",
    firstName: "Priya",
    lastName: "Shah",
    title: "Partner",
    email: "priya@redwoodria.com",
    emailStatus: "valid",
    linkedinUrl: "https://www.linkedin.com/in/priya-shah-redwood",
    decisionRole: "principal",
    personalReason: "your published note on contracted revenue in physical networks",
    warmPathContact: null,
    doNotContact: false,
  },
  {
    id: "contact-elena",
    firmId: "firm-redwood",
    firstName: "Elena",
    lastName: "Voss",
    title: "Analyst",
    email: "elena@redwoodria.com",
    emailStatus: "valid",
    linkedinUrl: null,
    decisionRole: "analyst",
    personalReason: "you cover infrastructure managers for Priya Shah",
    warmPathContact: "Priya Shah, same firm",
    doNotContact: false,
  },
  {
    id: "contact-sophie",
    firmId: "firm-atelier",
    firstName: "Sophie",
    lastName: "Laurent",
    title: "Principal",
    email: "sophie@atelierprive.eu",
    emailStatus: "valid",
    linkedinUrl: "https://www.linkedin.com/in/sophie-laurent",
    decisionRole: "principal",
    personalReason: "we sat next to each other at the Paris infrastructure breakfast",
    warmPathContact: null,
    doNotContact: false,
  },
  {
    id: "contact-tom",
    firmId: "firm-pine",
    firstName: "Tom",
    lastName: "Reed",
    title: "Associate",
    email: "tom@pinecourt.com",
    emailStatus: "unverified",
    linkedinUrl: null,
    decisionRole: "analyst",
    personalReason: null,
    warmPathContact: null,
    doNotContact: false,
  },
  {
    id: "contact-james",
    firmId: "firm-helios",
    firstName: "James",
    lastName: "Whitaker",
    title: "Principal",
    email: "james@heliosocio.com",
    emailStatus: "valid",
    linkedinUrl: "https://www.linkedin.com/in/james-whitaker",
    decisionRole: "principal",
    personalReason: "the Helios infrastructure review you published in August",
    warmPathContact: "Marcus Chen, same firm",
    doNotContact: false,
  },
];

const SEED_ENROLLMENTS: EnrollmentRec[] = [
  {
    id: "enr-dana",
    contactId: "contact-dana",
    sequenceId: "seq-warm",
    sequenceName: "Warm intros",
    transport: "warm",
    status: "replied",
    currentStep: 1,
    maxSteps: 5,
    lastSentAt: hoursAgo(30),
    nextDueAt: null,
    threadId: "thread-dana",
    repliedAt: hoursAgo(2),
    delayDays: 3,
    updatedAt: hoursAgo(2),
  },
  {
    id: "enr-marcus",
    contactId: "contact-marcus",
    sequenceId: "seq-warm",
    sequenceName: "Warm intros",
    transport: "warm",
    status: "replied",
    currentStep: 1,
    maxSteps: 5,
    lastSentAt: hoursAgo(50),
    nextDueAt: null,
    threadId: "thread-marcus",
    repliedAt: hoursAgo(5),
    delayDays: 3,
    updatedAt: hoursAgo(5),
  },
  {
    id: "enr-priya",
    contactId: "contact-priya",
    sequenceId: "seq-warm",
    sequenceName: "Warm intros",
    transport: "warm",
    status: "replied",
    currentStep: 1,
    maxSteps: 5,
    lastSentAt: hoursAgo(80),
    nextDueAt: null,
    threadId: "thread-priya",
    repliedAt: hoursAgo(26),
    delayDays: 3,
    updatedAt: hoursAgo(26),
  },
  {
    id: "enr-elena",
    contactId: "contact-elena",
    sequenceId: "seq-warm",
    sequenceName: "Warm intros",
    transport: "warm",
    status: "active",
    currentStep: 0,
    maxSteps: 5,
    lastSentAt: null,
    nextDueAt: daysFromToday(0, 16),
    threadId: null,
    repliedAt: null,
    delayDays: 0,
    updatedAt: hoursAgo(10),
  },
  {
    id: "enr-sophie",
    contactId: "contact-sophie",
    sequenceId: "seq-warm",
    sequenceName: "Warm intros",
    transport: "warm",
    status: "active",
    currentStep: 0,
    maxSteps: 5,
    lastSentAt: null,
    nextDueAt: daysFromToday(1, 15),
    threadId: null,
    repliedAt: null,
    delayDays: 0,
    updatedAt: hoursAgo(12),
  },
  {
    id: "enr-tom",
    contactId: "contact-tom",
    sequenceId: "seq-warm",
    sequenceName: "Warm intros",
    transport: "warm",
    status: "active",
    currentStep: 0,
    maxSteps: 5,
    lastSentAt: null,
    nextDueAt: daysFromToday(0, 17),
    threadId: null,
    repliedAt: null,
    delayDays: 0,
    updatedAt: hoursAgo(8),
  },
  {
    id: "enr-james",
    contactId: "contact-james",
    sequenceId: "seq-warm",
    sequenceName: "Warm intros",
    transport: "warm",
    status: "active",
    currentStep: 0,
    maxSteps: 5,
    lastSentAt: null,
    nextDueAt: daysFromToday(0, 15),
    threadId: null,
    repliedAt: null,
    delayDays: 0,
    updatedAt: hoursAgo(9),
  },
];

const SEED_ACTIVITY: ActivityRow[] = [
  {
    id: "1",
    occurredAt: hoursAgo(2),
    actor: "reply-poller",
    action: "reply",
    templateKey: null,
    detail: { from: "dana@northarc.com", reason: "Prospect replied" },
  },
  {
    id: "2",
    occurredAt: hoursAgo(30),
    actor: "worker",
    action: "sent",
    templateKey: "corporate_intro_1",
    detail: { subject: "Dana, a note on DePIN infrastructure", stepNumber: 1 },
  },
  {
    id: "3",
    occurredAt: hoursAgo(5),
    actor: "reply-poller",
    action: "reply",
    templateKey: null,
    detail: { from: "marcus@heliosocio.com", reason: "Prospect replied" },
  },
  {
    id: "4",
    occurredAt: hoursAgo(1),
    actor: "worker",
    action: "skipped",
    templateKey: "corporate_intro_1",
    detail: { reason: "Personal Reason empty", gate: "personal_reason" },
  },
];

const SEED_ACTIVITY_BY_CONTACT: Record<string, string[]> = {
  "contact-dana": ["1", "2"],
  "contact-marcus": ["3"],
  "contact-tom": ["4"],
};

const SEED_SUPPRESSIONS: SuppressionEntry[] = [
  { value: "blocked.example", matchType: "domain", active: true },
];

function firmById(firms: FirmRec[], id: string): FirmRec {
  const firm = firms.find((f) => f.id === id);
  if (!firm) throw new Error(`fixture firm ${id} missing`);
  return firm;
}

function contactById(contacts: ContactRec[], id: string): ContactRec {
  const contact = contacts.find((c) => c.id === id);
  if (!contact) throw new Error(`fixture contact ${id} missing`);
  return contact;
}

function prospectView(firms: FirmRec[], contact: ContactRec): ProspectView {
  const firm = firmById(firms, contact.firmId);
  return {
    contactId: contact.id,
    email: contact.email ?? "",
    firstName: contact.firstName,
    lastName: contact.lastName,
    title: contact.title,
    firmName: firm.name,
    personalReason: contact.personalReason,
    doNotContact: contact.doNotContact,
    tier: firm.tier,
    jurisdiction: firm.jurisdiction,
  };
}

function queueRow(firms: FirmRec[], contacts: ContactRec[], enr: EnrollmentRec): QueueRow {
  const contact = contactById(contacts, enr.contactId);
  const firm = firmById(firms, contact.firmId);
  return {
    enrollmentId: enr.id,
    contactId: contact.id,
    firmId: firm.id,
    repliedAt: enr.repliedAt,
    updatedAt: enr.updatedAt,
    firstName: contact.firstName,
    lastName: contact.lastName,
    title: contact.title,
    email: contact.email,
    firmName: firm.name,
    tier: firm.tier,
    jurisdiction: firm.jurisdiction,
    sequenceName: enr.sequenceName,
    transport: enr.transport,
    personalReason: contact.personalReason,
    warmPathContact: contact.warmPathContact,
    linkedinUrl: contact.linkedinUrl,
    replySnippet: contact.email,
  };
}

function toEnrollmentView(enr: EnrollmentRec): ProspectEnrollment {
  return {
    enrollmentId: enr.id,
    sequenceId: enr.sequenceId,
    sequenceName: enr.sequenceName,
    transport: enr.transport,
    status: enr.status,
    currentStep: enr.currentStep,
    maxSteps: enr.maxSteps,
    lastSentAt: enr.lastSentAt,
    nextDueAt: enr.nextDueAt,
    threadId: enr.threadId,
    repliedAt: enr.repliedAt,
  };
}

export function createFixtureStore(): OperatorStore {
  const firms = structuredClone(SEED_FIRMS);
  const contacts = structuredClone(SEED_CONTACTS);
  const enrollments = structuredClone(SEED_ENROLLMENTS);
  const activity = structuredClone(SEED_ACTIVITY);
  const activityByContact = structuredClone(SEED_ACTIVITY_BY_CONTACT);
  const suppressions = structuredClone(SEED_SUPPRESSIONS);
  let logSeq = 10;

  return {
    usingFixtures: true,

    async listActionQueue() {
      return enrollments
        .filter((e) => e.status === "replied")
        .sort((a, b) => {
          const at = a.repliedAt?.getTime() ?? 0;
          const bt = b.repliedAt?.getTime() ?? 0;
          return bt - at;
        })
        .map((enr) => queueRow(firms, contacts, enr));
    },

    async listCalendarWindow(now: Date, days = 7) {
      const start = new Date(now);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
      const rows: CalendarRow[] = [];
      for (const enr of enrollments) {
        if (enr.status !== "active") continue;
        const due = enr.nextDueAt ?? start;
        if (due >= end && due >= start) continue;
        if (due >= end) continue;
        const contact = contactById(contacts, enr.contactId);
        const firm = firmById(firms, contact.firmId);
        rows.push({
          enrollmentId: enr.id,
          contactId: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          firmName: firm.name,
          tier: firm.tier,
          dueAt: due < start ? start : due,
          sequenceName: enr.sequenceName,
          nextStepNumber: enr.currentStep + 1,
        });
      }
      return rows.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
    },

    async listSendPreviewRows() {
      const rows: SendPreviewRow[] = [];
      for (const enr of enrollments) {
        if (!["active", "paused", "manual_only"].includes(enr.status)) continue;
        const contact = contactById(contacts, enr.contactId);
        if (!contact.email) continue;
        rows.push({
          enrollmentId: enr.id,
          sequenceId: enr.sequenceId,
          sequenceName: enr.sequenceName,
          sequenceTransport: enr.transport,
          stepNumber: enr.currentStep + 1,
          nextDueAt: enr.nextDueAt,
          prospect: prospectView(firms, contact),
          template: INTRO_TEMPLATE,
          enrollment: {
            status: enr.status,
            currentStep: enr.currentStep,
            maxSteps: enr.maxSteps,
            lastSentAt: enr.lastSentAt,
            delayDays: enr.delayDays,
          },
        });
      }
      return rows;
    },

    async listTodaysLog() {
      const start = new Date(FIXTURE_NOW);
      start.setUTCHours(0, 0, 0, 0);
      const logged: LoggedSend[] = [];
      for (const row of activity) {
        if (row.occurredAt < start) continue;
        if (!["sent", "skipped", "blocked", "error"].includes(row.action)) continue;
        const contactId = Object.entries(activityByContact).find(([, ids]) => ids.includes(row.id))?.[0] ?? null;
        const contact = contactId ? contactById(contacts, contactId) : null;
        const firm = contact ? firmById(firms, contact.firmId) : null;
        logged.push({
          id: row.id,
          occurredAt: row.occurredAt,
          actor: row.actor,
          action: row.action as LoggedSend["action"],
          reason: typeof row.detail.reason === "string" ? row.detail.reason : row.action,
          contactId,
          name: contact ? `${contact.firstName} ${contact.lastName ?? ""}`.trim() : null,
          email: contact?.email ?? null,
          firmName: firm?.name ?? null,
          templateKey: row.templateKey,
        });
      }
      return logged.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    },

    async listActiveSuppressions() {
      return suppressions.filter((s) => s.active);
    },

    async getProspect(contactId: string) {
      const contact = contacts.find((c) => c.id === contactId);
      if (!contact) return null;
      const firm = firmById(firms, contact.firmId);
      const record: ProspectRecord = {
        contactId: contact.id,
        firmId: firm.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        title: contact.title,
        email: contact.email,
        emailStatus: contact.emailStatus,
        linkedinUrl: contact.linkedinUrl,
        decisionRole: contact.decisionRole,
        personalReason: contact.personalReason,
        warmPathContact: contact.warmPathContact,
        doNotContact: contact.doNotContact,
        firmName: firm.name,
        firmType: firm.type,
        aumBand: firm.aumBand,
        jurisdiction: firm.jurisdiction,
        mandateTags: firm.mandateTags,
        typicalTicketUsd: firm.typicalTicketUsd,
        decisionSpeed: firm.decisionSpeed,
        depinFamiliarity: firm.depinFamiliarity,
        source: firm.source,
        score: firm.score,
        tier: firm.tier,
        scoreFactors: firm.scoreFactors,
        notes: firm.notes,
        enrollments: enrollments.filter((e) => e.contactId === contact.id).map(toEnrollmentView),
      };
      return record;
    },

    async listActivityForContact(contactId: string) {
      const ids = activityByContact[contactId] ?? [];
      return activity.filter((row) => ids.includes(row.id));
    },

    async listDirectory() {
      const rows: DirectoryRow[] = contacts.map((contact) => {
        const firm = firmById(firms, contact.firmId);
        const enr = enrollments.find((e) => e.contactId === contact.id);
        return {
          contactId: contact.id,
          firmId: firm.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          title: contact.title,
          email: contact.email,
          firmName: firm.name,
          jurisdiction: firm.jurisdiction,
          tier: firm.tier,
          score: firm.score,
          personalReason: contact.personalReason,
          doNotContact: contact.doNotContact,
          enrollmentStatus: enr?.status ?? null,
        };
      });
      return rows.sort((a, b) => a.firmName.localeCompare(b.firmName) || a.firstName.localeCompare(b.firstName));
    },

    async listExistingPeople() {
      const rows: ExistingPerson[] = contacts.map((contact) => ({
        email: contact.email,
        firmName: firmById(firms, contact.firmId).name,
        firstName: contact.firstName,
        lastName: contact.lastName,
      }));
      return rows;
    },

    async getEnrollment(enrollmentId: string) {
      const enr = enrollments.find((e) => e.id === enrollmentId);
      if (!enr) return null;
      const contact = contactById(contacts, enr.contactId);
      const firm = firmById(firms, contact.firmId);
      return {
        enrollmentId: enr.id,
        contactId: enr.contactId,
        status: enr.status,
        firmId: firm.id,
        currentTier: firm.tier,
      };
    },

    async setEnrollmentStatus(enrollmentId: string, status: EnrollmentStatus) {
      const enr = enrollments.find((e) => e.id === enrollmentId);
      if (!enr) throw new Error("Enrollment not found");
      enr.status = status;
      enr.updatedAt = new Date();
    },

    async writeActivity(entry) {
      logSeq += 1;
      const id = String(logSeq);
      activity.push({
        id,
        occurredAt: new Date(),
        actor: entry.actor,
        action: entry.action,
        templateKey: null,
        detail: entry.detail,
      });
      if (entry.contactId) {
        activityByContact[entry.contactId] = [...(activityByContact[entry.contactId] ?? []), id];
      }
    },

    async insertImportedRow(row: ImportedProspect) {
      let firm = firms.find((f) => f.name.toLowerCase() === row.firmName.trim().toLowerCase());
      let createdFirm = false;
      if (!firm) {
        firm = {
          id: `firm-${firms.length + 1}`,
          name: row.firmName,
          type: row.firmType,
          aumBand: row.aumBand,
          jurisdiction: row.jurisdiction,
          mandateTags: [...row.mandateTags],
          typicalTicketUsd: row.typicalTicketUsd,
          decisionSpeed: row.decisionSpeed,
          depinFamiliarity: row.depinFamiliarity,
          source: row.source,
          score: null,
          tier: null,
          scoreFactors: null,
          notes: row.notes,
        };
        firms.push(firm);
        createdFirm = true;
      }
      const contact: ContactRec = {
        id: `contact-${contacts.length + 1}`,
        firmId: firm.id,
        firstName: row.firstName,
        lastName: row.lastName,
        title: row.title,
        email: row.email,
        emailStatus: "unverified",
        linkedinUrl: row.linkedinUrl,
        decisionRole: row.decisionRole,
        personalReason: row.personalReason,
        warmPathContact: row.warmPathContact,
        doNotContact: false,
      };
      contacts.push(contact);
      return { firmId: firm.id, contactId: contact.id, createdFirm };
    },

    async updateFirmScore(firmId, input) {
      const firm = firmById(firms, firmId);
      firm.score = input.score;
      firm.tier = input.tier;
      firm.scoreFactors = input.factors;
    },

    async getFirmForRescore(firmId: string) {
      const firm = firms.find((f) => f.id === firmId);
      if (!firm) return null;
      const contact = contacts.find((c) => c.firmId === firm.id);
      const enr = contact ? enrollments.find((e) => e.contactId === contact.id) : undefined;
      return {
        firmId: firm.id,
        name: firm.name,
        tier: firm.tier,
        scoreFactors: firm.scoreFactors,
        enrollmentStatus: enr?.status ?? null,
      };
    },

    async countSentToday() {
      return activity.filter((row) => row.action === "sent" && row.occurredAt >= startOfDay(FIXTURE_NOW)).length;
    },
  };
}

function startOfDay(now: Date): Date {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}
