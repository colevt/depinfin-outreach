import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import type { Database } from "../client.js";
import { contacts, enrollments } from "../schema.js";
import type { EnrollmentStatus } from "@depinfin/compliance";

export interface RecordSendInput {
  readonly enrollmentId: string;
  readonly threadId: string | null;
  readonly sentAt: Date;
  readonly nextDueAt: Date | null;
}

/** Section 6 step 13. Persist thread_id, last_sent_at, next_due_at. */
export async function recordSend(db: Database, input: RecordSendInput): Promise<void> {
  await db
    .update(enrollments)
    .set({
      currentStep: sql`${enrollments.currentStep} + 1`,
      lastSentAt: input.sentAt,
      nextDueAt: input.nextDueAt,
      ...(input.threadId !== null ? { threadId: input.threadId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(enrollments.id, input.enrollmentId));
}

export async function setStatus(
  db: Database,
  enrollmentId: string,
  status: EnrollmentStatus,
  extra: { repliedAt?: Date } = {},
): Promise<void> {
  await db
    .update(enrollments)
    .set({
      status,
      ...(extra.repliedAt ? { repliedAt: extra.repliedAt } : {}),
      updatedAt: new Date(),
    })
    .where(eq(enrollments.id, enrollmentId));
}

/** Section 7. Threads worth polling: has a thread, not terminal. */
export async function pollableEnrollments(db: Database) {
  return db
    .select({
      enrollmentId: enrollments.id,
      contactId: enrollments.contactId,
      threadId: enrollments.threadId,
      status: enrollments.status,
      email: contacts.email,
    })
    .from(enrollments)
    .innerJoin(contacts, eq(contacts.id, enrollments.contactId))
    .where(
      and(
        isNotNull(enrollments.threadId),
        ne(enrollments.status, "stopped"),
        ne(enrollments.status, "replied"),
        ne(enrollments.status, "completed"),
      ),
    );
}

export async function markDoNotContact(db: Database, contactId: string): Promise<void> {
  await db
    .update(contacts)
    .set({ doNotContact: true, updatedAt: new Date() })
    .where(eq(contacts.id, contactId));
}
