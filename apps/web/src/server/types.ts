import type {
  ActivityRow,
  CalendarRow,
  DirectoryRow,
  ExistingPerson,
  ImportedProspect,
  ProspectRecord,
  QueueRow,
  SendPreviewRow,
} from "@depinfin/db";
import type { EnrollmentStatus, SuppressionEntry, Tier } from "@depinfin/compliance";
import type { ScoringFactors } from "@depinfin/core";

export interface LoggedSend {
  readonly id: string;
  readonly occurredAt: Date;
  readonly actor: string;
  readonly action: "sent" | "skipped" | "blocked" | "error";
  readonly reason: string;
  readonly contactId: string | null;
  readonly name: string | null;
  readonly email: string | null;
  readonly firmName: string | null;
  readonly templateKey: string | null;
}

export interface OperatorStore {
  listActionQueue(): Promise<QueueRow[]>;
  listCalendarWindow(now: Date, days?: number): Promise<CalendarRow[]>;
  listSendPreviewRows(now: Date): Promise<SendPreviewRow[]>;
  listTodaysLog(now: Date): Promise<LoggedSend[]>;
  listActiveSuppressions(): Promise<SuppressionEntry[]>;
  getProspect(contactId: string): Promise<ProspectRecord | null>;
  listActivityForContact(contactId: string): Promise<ActivityRow[]>;
  listDirectory(): Promise<DirectoryRow[]>;
  listExistingPeople(): Promise<ExistingPerson[]>;
  getEnrollment(enrollmentId: string): Promise<{
    enrollmentId: string;
    contactId: string;
    status: EnrollmentStatus;
    firmId: string;
    currentTier: Tier | null;
  } | null>;
  setEnrollmentStatus(enrollmentId: string, status: EnrollmentStatus): Promise<void>;
  writeActivity(entry: {
    actor: string;
    contactId: string | null;
    enrollmentId: string | null;
    action: "stage_change" | "rescored" | "enrolled";
    detail: Record<string, unknown>;
  }): Promise<void>;
  insertImportedRow(row: ImportedProspect): Promise<{
    firmId: string;
    contactId: string;
    createdFirm: boolean;
  }>;
  updateFirmScore(
    firmId: string,
    input: { score: number; tier: Tier; factors: ScoringFactors },
  ): Promise<void>;
  getFirmForRescore(firmId: string): Promise<{
    firmId: string;
    name: string;
    tier: Tier | null;
    scoreFactors: ScoringFactors | null;
    enrollmentStatus: EnrollmentStatus | null;
  } | null>;
  countSentToday(now: Date): Promise<number>;
  readonly usingFixtures: boolean;
}
