import {
  countSentToday,
  createDatabase,
  getEnrollment,
  getFirmForRescore,
  getProspect,
  insertImportedRow,
  listActionQueue,
  listActiveSuppressions,
  listActivityForContact,
  listCalendarWindow,
  listDirectory,
  listExistingPeople,
  listSendPreviewRows,
  listTodaysLog,
  setStatus,
  updateFirmScore,
  writeLog,
} from "@depinfin/db";
import { createFixtureStore } from "./fixtures";
import type { LoggedSend, OperatorStore } from "./types";

let cached: OperatorStore | null = null;

export function fixturesEnabled(): boolean {
  return process.env["WEB_FIXTURES"] === "1";
}

export function getStore(): OperatorStore {
  if (cached) return cached;
  if (fixturesEnabled()) {
    cached = createFixtureStore();
    return cached;
  }
  const url = process.env["DATABASE_URL"];
  if (!url || url.trim() === "") {
    throw new Error("DATABASE_URL is required, or set WEB_FIXTURES=1 to review the desk on fixture data.");
  }
  cached = createDatabaseStore(url);
  return cached;
}

function createDatabaseStore(url: string): OperatorStore {
  const { db } = createDatabase(url);
  return {
    usingFixtures: false,
    listActionQueue: () => listActionQueue(db),
    listCalendarWindow: (now, days) => listCalendarWindow(db, now, days),
    listSendPreviewRows: (now) => listSendPreviewRows(db, now),
    listTodaysLog: async (now) => (await listTodaysLog(db, now)).map(toLoggedSend),
    listActiveSuppressions: () => listActiveSuppressions(db),
    getProspect: (id) => getProspect(db, id),
    listActivityForContact: (id) => listActivityForContact(db, id),
    listDirectory: () => listDirectory(db),
    listExistingPeople: () => listExistingPeople(db),
    getEnrollment: (id) => getEnrollment(db, id),
    setEnrollmentStatus: (id, status) => setStatus(db, id, status),
    writeActivity: (entry) =>
      writeLog(db, {
        actor: entry.actor,
        contactId: entry.contactId,
        enrollmentId: entry.enrollmentId,
        action: entry.action,
        detail: entry.detail,
      }),
    insertImportedRow: (row) => insertImportedRow(db, row),
    updateFirmScore: (firmId, input) => updateFirmScore(db, firmId, input),
    getFirmForRescore: (firmId) => getFirmForRescore(db, firmId),
    countSentToday: (now) => countSentToday(db, now),
  };
}

function toLoggedSend(
  row: Awaited<ReturnType<typeof listTodaysLog>>[number],
): LoggedSend {
  const detail = (row.detail ?? {}) as Record<string, unknown>;
  const reason = typeof detail.reason === "string" ? detail.reason : row.action;
  const name = row.firstName
    ? `${row.firstName}${row.lastName ? ` ${row.lastName}` : ""}`
    : null;
  return {
    id: String(row.id),
    occurredAt: row.occurredAt,
    actor: row.actor,
    action: row.action as LoggedSend["action"],
    reason,
    contactId: row.contactId,
    name,
    email: row.email ?? null,
    firmName: row.firmName ?? null,
    templateKey: row.templateKey,
  };
}

/** Test helper. Do not use from a send path. */
export function resetStoreCache(): void {
  cached = null;
}

