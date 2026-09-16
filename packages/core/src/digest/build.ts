/**
 * The daily internal digest.
 *
 * This is the one piece of mail in the system that is not outreach. It goes to
 * an internal reader, it carries prospect data, and it never goes to a
 * prospect. Two things keep that true: the recipient list is constrained to
 * internal domains by a trigger in migration 0006, and this text is built and
 * sent outside the send pipeline entirely.
 *
 * It is deliberately not run through the INV-2 linter. The linter governs what
 * DePINfin says to a prospect. A digest quotes what prospects said to us, and
 * a prospect is perfectly free to write "what is the yield" in a reply. Linting
 * internal mail would refuse to deliver that question, which creates pressure
 * for a bypass, and INV-2 is explicit that no bypass exists. The right answer
 * is to keep internal mail out of the linter's scope, not to weaken the linter.
 */

export interface DigestProspect {
  readonly contactId: string;
  readonly name: string;
  readonly title: string | null;
  readonly firmName: string;
  readonly firmType: string | null;
  readonly side: "buy" | "sell";
  readonly tier: number | null;
  readonly score: number | null;
  readonly personalReason: string | null;
  readonly addedAt: Date;
}

export interface DigestReply {
  readonly contactId: string;
  readonly name: string;
  readonly firmName: string;
  readonly repliedAt: Date;
  /** First line or two of what they wrote. Trimmed by the caller. */
  readonly snippet: string;
}

export interface DigestDraft {
  readonly contactId: string;
  readonly name: string;
  readonly firmName: string;
  readonly kind: string;
  readonly channel: string;
  readonly updatedAt: Date;
  readonly lintClean: boolean;
}

export interface DigestDispatchSummary {
  readonly sent: number;
  readonly skipped: number;
  readonly blocked: number;
  /** Section 9: legible reasons, not error codes. */
  readonly topSkipReasons: readonly { readonly reason: string; readonly count: number }[];
}

export interface DigestAutomationState {
  readonly sequencesEnabled: boolean;
  readonly dailySendCap: number;
  readonly coldOutreachEnabled: boolean;
}

export interface DigestInput {
  readonly forDate: Date;
  readonly timezone: string;
  readonly newProspects: readonly DigestProspect[];
  readonly replies: readonly DigestReply[];
  readonly openDrafts: readonly DigestDraft[];
  readonly dispatch: DigestDispatchSummary;
  readonly automation: DigestAutomationState;
}

export interface BuiltDigest {
  readonly subject: string;
  readonly body: string;
  /** For the log detail, so a digest is auditable without reading the mail. */
  readonly counts: {
    readonly newProspects: number;
    readonly replies: number;
    readonly openDrafts: number;
  };
}

/**
 * Builds the digest. Pure: the caller supplies the data and the date.
 *
 * Ordered by what needs a person. Replies first, because section 9 makes the
 * action queue the home screen and a reply waiting on an operator is the most
 * expensive thing in the system to leave sitting.
 */
export function buildDigest(input: DigestInput): BuiltDigest {
  const date = formatDate(input.forDate, input.timezone);
  const lines: string[] = [];

  lines.push(`DePINfin desk, ${date}`);
  lines.push("");

  lines.push(headline(input));
  lines.push("");

  // 1. Replies. These are the only items that cannot wait.
  lines.push(section("Waiting on you", input.replies.length));
  if (input.replies.length === 0) {
    lines.push("  Nothing in the queue.");
  } else {
    for (const reply of input.replies) {
      lines.push(`  ${reply.name}, ${reply.firmName}`);
      lines.push(`    replied ${formatTime(reply.repliedAt, input.timezone)}`);
      if (reply.snippet.trim().length > 0) lines.push(`    "${reply.snippet.trim()}"`);
    }
  }
  lines.push("");

  // 2. New prospects. What the user asked the digest to highlight.
  lines.push(section("New prospects", input.newProspects.length));
  if (input.newProspects.length === 0) {
    lines.push("  None added.");
  } else {
    for (const prospect of byTierThenScore(input.newProspects)) {
      const tier = prospect.tier === null ? "untiered" : `tier ${prospect.tier}`;
      const score = prospect.score === null ? "" : `, score ${prospect.score}`;
      const type = prospect.firmType === null ? "" : `, ${prospect.firmType.replace(/_/g, " ")}`;
      lines.push(`  ${prospect.name}, ${prospect.firmName}${type}`);
      lines.push(`    ${prospect.side} side, ${tier}${score}`);
      if (prospect.title !== null) lines.push(`    ${prospect.title}`);
      lines.push(
        prospect.personalReason === null || prospect.personalReason.trim() === ""
          ? "    No personal reason on file. Nothing can be sent until there is one."
          : `    Reason: ${prospect.personalReason}`,
      );
      if (prospect.tier === 1) {
        lines.push("    Tier 1. Automation never touches this one, so it needs you.");
      }
    }
  }
  lines.push("");

  // 3. Drafts an operator started and left.
  lines.push(section("Open drafts", input.openDrafts.length));
  if (input.openDrafts.length === 0) {
    lines.push("  None open.");
  } else {
    for (const draft of input.openDrafts) {
      const state = draft.lintClean ? "ready to send" : "needs a rewrite before it can go";
      lines.push(`  ${draft.name}, ${draft.firmName}, ${draft.kind} on ${draft.channel}`);
      lines.push(`    ${state}, last touched ${formatTime(draft.updatedAt, input.timezone)}`);
    }
  }
  lines.push("");

  // 4. What the dispatcher did.
  lines.push("Yesterday's dispatch");
  lines.push(
    `  ${input.dispatch.sent} sent, ${input.dispatch.skipped} skipped, ` +
      `${input.dispatch.blocked} blocked`,
  );
  if (input.dispatch.topSkipReasons.length > 0) {
    lines.push("  Skipped because:");
    for (const reason of input.dispatch.topSkipReasons) {
      lines.push(`    ${reason.count} x ${reason.reason}`);
    }
  }
  lines.push("");

  lines.push("Automation");
  lines.push(
    `  Sequences ${input.automation.sequencesEnabled ? "on" : "off"}, ` +
      `daily cap ${input.automation.dailySendCap}`,
  );
  lines.push(
    input.automation.coldOutreachEnabled
      ? "  Cold outreach on. A counsel sign-off is on file for it."
      : "  Cold outreach off, gated on counsel.",
  );

  return {
    subject: subjectFor(input, date),
    body: lines.join("\n"),
    counts: {
      newProspects: input.newProspects.length,
      replies: input.replies.length,
      openDrafts: input.openDrafts.length,
    },
  };
}

/** What the subject line says when it arrives on a phone. */
function subjectFor(input: DigestInput, date: string): string {
  const parts: string[] = [];
  if (input.replies.length > 0) {
    parts.push(`${input.replies.length} ${plural(input.replies.length, "reply", "replies")}`);
  }
  if (input.newProspects.length > 0) {
    parts.push(`${input.newProspects.length} new`);
  }
  if (parts.length === 0) return `DePINfin desk, ${date}, nothing waiting`;
  return `DePINfin desk, ${date}, ${parts.join(", ")}`;
}

function headline(input: DigestInput): string {
  if (input.replies.length > 0) {
    const count = input.replies.length;
    return `${count} ${plural(count, "person", "people")} wrote back. Start there.`;
  }
  if (input.newProspects.length > 0) {
    return "No replies waiting. New prospects below need a reason for contact before anything goes out.";
  }
  return "Quiet day. Nothing waiting on you.";
}

function section(title: string, count: number): string {
  return count === 0 ? title : `${title} (${count})`;
}

function byTierThenScore(prospects: readonly DigestProspect[]): DigestProspect[] {
  return [...prospects].sort((a, b) => {
    const tierA = a.tier ?? 99;
    const tierB = b.tier ?? 99;
    if (tierA !== tierB) return tierA - tierB;
    return (b.score ?? 0) - (a.score ?? 0);
  });
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function formatDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(date);
}
