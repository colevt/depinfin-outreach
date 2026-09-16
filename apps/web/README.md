# The desk

Section 12 step 7. The operator UI, built in the section 9 priority order.

Next.js App Router, server components for reads, server actions for writes,
Zod at every boundary. Three users, one tenant, no authentication. There is an
operator picker, and it is attribution rather than access control: every row in
`activity_log` carries an actor, and "web" tells a future reader nothing about
who made a decision. If this ever faces anyone outside the three, it needs real
authentication first, and that is a different piece of work rather than a
bigger cookie.

## Screens

| Route | What it is |
|---|---|
| `/` | Queue. Everyone in `replied` status, newest first, then what the dispatcher is about to do and why it will refuse each held row, then what already ran today. The seven-day calendar strip sits alongside. |
| `/prospects` | The list, filtered by side, tier, and whether a reason for contact is on file. |
| `/prospects/[id]` | One prospect. History, drafts, and the composer. |
| `/automation` | Sequences, the daily cap and window, the digest, and what this page cannot do. |
| `/templates` | Templates by side, prospect type, stage, and channel, with the copy rules. |
| `/search` | The LinkedIn search builder and the paste-back importer. |
| `/research` | Research recorded with its sources, and what to look for by prospect type. |

## What the UI does not decide

Eligibility. Every verdict the desk shows comes from `packages/compliance`,
through `evaluateDraft`, and the desk renders the result. A second opinion
about whether a message may go out would be a defect even while it agreed.

The reasons it renders are the ones the pipeline wrote. "Personal Reason empty"
and "Domain suppressed: northarc.com" are already written for a person, and
mapping them back to codes would be undoing work.

## Things that are missing on purpose

- **No send button for a LinkedIn draft.** A copy button, and a separate
  control that records that a human sent it. INV-8.
- **No cold outreach toggle on the Automation page.** The database refuses to
  enable it without a recorded counsel sign-off, so a switch there would be
  decoration that teaches an operator it is theirs to flip. When counsel signs
  off, the sign-off is recorded directly and the page starts saying so.
- **No way to delete a suppression.** They can be marked inactive with a reason
  and an actor. The application role has no DELETE.
- **No linter override.** No flag, no query parameter, no environment variable.
  A draft that trips it is saved as a draft and cannot leave that status, which
  is a check constraint rather than a convention.
- **No way to include Tier 1 in automated sending.** They are excluded in the
  query that selects candidates, so there is no setting that could include
  them.

## Running it

```bash
pnpm install
pnpm typecheck            # builds the workspace packages the app imports
pnpm dev                  # or: pnpm --filter @depinfin/web dev
```

`DATABASE_URL` must point at the **application** role, not the owner. INV-4 and
INV-5 depend on grants that an owner bypasses, so running the desk as the owner
would quietly remove the protection the schema exists to provide.

## The send preview

"Next to go out" runs `evaluateSend` from `packages/compliance`, the same
function the worker calls, and dispatches nothing. The reason shown against a
held row is the exact string that will be written to the audit log, so an
operator sees tomorrow's skips in time to fix them rather than reading about
them the next morning.

The query behind it, `listSendPreviewRows`, is deliberately **broader** than
`dispatch_candidates`. The view exists to make an ineligible prospect
unreachable, so Tier 1, suppressed addresses and excluded jurisdictions are
simply not in it; the preview has to include them in order to explain why they
are held. That makes it the one query in the repo that would break INV-1, INV-4
and INV-7 if the dispatcher ever read it, and
`packages/db/test/preview-not-dispatch.test.ts` asserts it never does.

The calendar strip buckets by local day in `automation_settings.send_timezone`,
not in UTC. A step due at 9pm in New York belongs on tonight's cell, and a
strip that files it under tomorrow is a strip that stops someone acting on it
today.

## Still to build

Section 9 item 5's enrichment adapters, and bulk CSV list import. Research is
recorded by hand with required sources.
