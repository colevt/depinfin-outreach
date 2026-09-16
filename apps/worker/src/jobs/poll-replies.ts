/**
 * Section 7. Polls the warm inbox and routes replies and opt-outs.
 */

import {
  addSuppression,
  createDatabase,
  markDoNotContact,
  pollableEnrollments,
  setStatus,
  writeLog,
} from "@depinfin/db";
import { GmailTransport } from "@depinfin/transport-gmail";
import { runReplyPolling } from "../reply-runner.js";
import { databaseUrl, gmailConfig } from "../config.js";

async function main(): Promise<void> {
  const { db, close } = createDatabase(databaseUrl());
  const gmail = new GmailTransport(gmailConfig());

  try {
    const summary = await runReplyPolling(
      {
        pollable: async () => {
          const rows = await pollableEnrollments(db);
          return rows
            .filter((row) => row.threadId !== null && row.email !== null)
            .map((row) => ({
              enrollmentId: row.enrollmentId,
              contactId: row.contactId,
              email: row.email as string,
              threadId: row.threadId as string,
              status: row.status,
            }));
        },
        inboundMessages: (threadId) => gmail.inboundMessages(threadId),
        setStatus: (enrollmentId, status, repliedAt) =>
          setStatus(db, enrollmentId, status, repliedAt ? { repliedAt } : {}),
        markDoNotContact: (contactId) => markDoNotContact(db, contactId),
        addSuppression: (input) => addSuppression(db, input),
        writeLog: (entry) => writeLog(db, entry),
      },
      { actor: "worker:poll-replies" },
    );

    console.log(
      `replies: ${summary.polled} threads polled, ${summary.replies} replies, ` +
        `${summary.optOuts} opt-outs, ${summary.errors} errors`,
    );
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
