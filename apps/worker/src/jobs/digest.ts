/**
 * The daily internal digest. Run with --dry-run to build and log it without
 * sending.
 *
 * Scheduled separately from dispatch. The digest reports on what dispatch did,
 * so running it at the same time would report on a run that has not finished.
 */

import {
  awaitingReply,
  createDatabase,
  dispatchCountsSince,
  loadAutomationSettings,
  loadDigestRecipients,
  loadInternalDomains,
  newProspectsSince,
  openDrafts,
  topSkipReasons,
  writeLog,
} from "@depinfin/db";
import type { DigestInput } from "@depinfin/core";
import { GmailTransport } from "@depinfin/transport-gmail";
import { runDigest } from "../digest-runner.js";
import { databaseUrl, gmailConfig } from "../config.js";

/** A day back. The digest covers what happened since the last one. */
const WINDOW_MS = 24 * 60 * 60 * 1000;

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const { db, close } = createDatabase(databaseUrl());
  const gmail = new GmailTransport(gmailConfig());
  const now = new Date();

  try {
    const settings = await loadAutomationSettings(db);
    if (!settings.digest_enabled && !dryRun) {
      console.log("digest: switched off in automation settings, nothing sent");
      return;
    }

    const summary = await runDigest(
      {
        loadRecipients: () => loadDigestRecipients(db),
        loadInternalDomains: () => loadInternalDomains(db),
        gatherDigest: (forDate) => gather(db, forDate, settings),
        send: (message) => gmail.send(message),
        writeLog: (entry) => writeLog(db, entry),
      },
      {
        now,
        actor: dryRun ? "worker:digest-dry-run" : "worker:digest",
        dryRun,
      },
    );

    console.log(
      `${dryRun ? "digest dry run" : "digest"}: ${summary.subject}\n` +
        `  ${summary.counts.replies} replies, ${summary.counts.newProspects} new prospects, ` +
        `${summary.counts.openDrafts} open drafts\n` +
        `  ${dryRun ? "not sent" : `sent to ${summary.sentTo.join(", ")}`}`,
    );
  } finally {
    await close();
  }
}

async function gather(
  db: ReturnType<typeof createDatabase>["db"],
  forDate: Date,
  settings: Awaited<ReturnType<typeof loadAutomationSettings>>,
): Promise<DigestInput> {
  const since = new Date(forDate.getTime() - WINDOW_MS);

  const [prospects, replies, drafts, counts, skips] = await Promise.all([
    newProspectsSince(db, since),
    awaitingReply(db),
    openDrafts(db),
    dispatchCountsSince(db, since),
    topSkipReasons(db, since),
  ]);

  return {
    forDate,
    timezone: settings.digest_timezone,
    newProspects: prospects.map((row) => ({
      contactId: row.contact_id,
      name: row.name,
      title: row.title,
      firmName: row.firm_name,
      firmType: row.firm_type,
      side: row.side,
      tier: row.tier,
      score: row.score,
      personalReason: row.personal_reason,
      addedAt: row.added_at,
    })),
    replies: replies.map((row) => ({
      contactId: row.contact_id,
      name: row.name,
      firmName: row.firm_name,
      repliedAt: row.replied_at,
      snippet: row.snippet,
    })),
    openDrafts: drafts.map((row) => ({
      contactId: row.contact_id,
      name: row.name,
      firmName: row.firm_name,
      kind: row.kind,
      channel: row.channel,
      updatedAt: row.updated_at,
      lintClean: row.lint_clean,
    })),
    dispatch: {
      sent: counts.sent,
      skipped: counts.skipped,
      blocked: counts.blocked,
      topSkipReasons: skips.map((row) => ({ reason: row.reason, count: row.count })),
    },
    automation: {
      sequencesEnabled: settings.sequences_enabled,
      dailySendCap: settings.daily_send_cap,
      coldOutreachEnabled: settings.cold_outreach_enabled,
    },
  };
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
