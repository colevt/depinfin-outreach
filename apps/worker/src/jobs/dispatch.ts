/**
 * Scheduled warm dispatch. Run with --dry-run to exercise every gate and write
 * the log without sending anything.
 *
 * The cold transport is not wired here. Section 12 puts it last, after
 * deliverability groundwork on a separate domain.
 */

import {
  countSentToday,
  createDatabase,
  recordSend,
  selectDispatchCandidates,
  suppressionsFor,
  writeLog,
} from "@depinfin/db";
import { GmailTransport } from "@depinfin/transport-gmail";
import { runDispatch } from "../dispatch-runner.js";
import { dailyCap, databaseUrl, gmailConfig } from "../config.js";

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const { db, close } = createDatabase(databaseUrl());
  const gmail = new GmailTransport(gmailConfig());
  const now = new Date();

  try {
    const summary = await runDispatch(
      {
        loadCandidates: (transport, limit) => selectDispatchCandidates(db, transport, limit),
        suppressionsFor: (email) => suppressionsFor(db, email),
        countSentToday: (at) => countSentToday(db, at),
        writeLog: (entry) => writeLog(db, entry),
        recordSend: (input) => recordSend(db, input),
        send: (message) => gmail.send(message),
      },
      {
        transport: "warm",
        now,
        dailyCap: dailyCap(),
        dryRun,
        actor: dryRun ? "worker:dry-run" : "worker:dispatch",
      },
    );

    console.log(
      `${dryRun ? "dry run" : "dispatch"}: ${summary.considered} considered, ` +
        `${summary.sent} sent, ${summary.skipped} skipped, ${summary.blocked} blocked, ` +
        `${summary.errored} errored`,
    );
    for (const outcome of summary.outcomes) {
      console.log(`  ${outcome.action.padEnd(7)} ${outcome.email.padEnd(34)} ${outcome.reason}`);
    }
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
