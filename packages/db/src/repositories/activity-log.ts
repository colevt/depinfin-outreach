/**
 * INV-5. Append only. There is no update function and no delete function in
 * this file, and the application role could not execute one if there were.
 */

import { and, eq, gte, sql } from "drizzle-orm";
import type { Database } from "../client.js";
import { activityLog } from "../schema.js";

export type LogAction =
  | "sent" | "skipped" | "blocked" | "error" | "reply" | "opt_out"
  | "stage_change" | "enrolled" | "unenrolled" | "rescored";

export interface LogEntry {
  readonly actor: string;
  readonly contactId?: string | null;
  readonly enrollmentId?: string | null;
  readonly action: LogAction;
  readonly templateKey?: string | null;
  readonly detail?: Record<string, unknown>;
}

export async function writeLog(db: Database, entry: LogEntry): Promise<void> {
  await db.insert(activityLog).values({
    actor: entry.actor,
    contactId: entry.contactId ?? null,
    enrollmentId: entry.enrollmentId ?? null,
    action: entry.action,
    templateKey: entry.templateKey ?? null,
    detail: entry.detail ?? {},
  });
}

/**
 * Section 6 gate 12. The daily cap is counted from the log, never from memory,
 * so a worker restart cannot reset the day's count.
 */
export async function countSentToday(db: Database, now: Date): Promise<number> {
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);

  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(activityLog)
    .where(and(eq(activityLog.action, "sent"), gte(activityLog.occurredAt, startOfDay)));

  return rows[0]?.count ?? 0;
}

export async function historyForContact(db: Database, contactId: string, limit = 200) {
  return db
    .select()
    .from(activityLog)
    .where(eq(activityLog.contactId, contactId))
    .orderBy(sql`occurred_at DESC`)
    .limit(limit);
}
