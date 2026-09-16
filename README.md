# DePINfin outreach platform

Internal buy-side outreach and pipeline system. Three operators, one tenant,
optimized for correctness and auditability.

`CLAUDE.md` is the governing document. Section 2 lists ten invariants that are
compliance boundaries rather than style preferences. This README says where each
one is enforced and what is verified.

## Status against the section 12 build order

| # | Step | Status |
|---|---|---|
| 1 | `packages/db` schema, migrations, database-level permissions | Built |
| 2 | `packages/compliance` with the section 8 test suite | Built |
| 3 | `packages/core` state machine, scoring | Built |
| 4 | Warm transport, Gmail API OAuth | Built, needs credentials |
| 5 | Dry-run mode, then live dispatch | Built |
| 6 | Reply polling and opt-out handling | Built |
| 7 | Operator UI, section 9 priority order | Not started |
| 8 | Enrichment adapters | Not started |
| 9 | Cold transport on a separate domain | Adapter and guards built, no ESP wired |

Nothing here has been executed. This machine has no Node, no pnpm, and no
Postgres, so the test suite has never run. See "Before trusting any of this".

## Where each invariant lives

| Invariant | Enforced at | Verified by |
|---|---|---|
| INV-1 Tier 1 never automated | `migrations/0004` view, re-checked in `pipeline.ts` gate 4 | `packages/compliance/test/inv1.tier.test.ts`, `packages/db/test/candidates.query-layer.test.ts` |
| INV-2 return-implying language | `packages/compliance/src/linter.ts`, gate 11 on merged output | `packages/compliance/test/inv2.linter.test.ts` |
| INV-3 personalization required | `packages/compliance/src/merge.ts`, gates 9 and 10 | `packages/compliance/test/inv3.personalization.test.ts` |
| INV-4 suppression every step | view `NOT EXISTS` clause, gate 2, plus grants and triggers in `0003` | `inv4.suppression.test.ts`, `inv5.append-only.test.ts` |
| INV-5 append-only audit log | grants and triggers in `migrations/0003` | `packages/db/test/inv5.append-only.test.ts` |
| INV-6 content tiers separated | `templates_corporate_only` check constraint, no FK to `offering_documents` | `inv6-7.content-and-jurisdiction.test.ts`, `candidates.query-layer.test.ts` |
| INV-7 excluded jurisdictions | `excluded_jurisdictions` joined in the view, gate 5 | `inv6-7.content-and-jurisdiction.test.ts`, `candidates.query-layer.test.ts` |
| INV-8 no LinkedIn automation | No browser driver, headless client, or LinkedIn dependency exists in this repo | Absence of any such dependency in `package.json` |
| INV-9 separate sending paths | Type-level in `packages/transports/contract`, domain check at construction | `packages/transports/cold/test/inv9.transport-separation.test.ts` |
| INV-10 no referral mechanics | No commission, payout, or referral table, column, or code path exists | Absence |

## Layout

```
packages/compliance    Linter, suppression, eligibility, merge, the pure gate
                       pipeline. Single source of truth for INV-1 to INV-4 and
                       INV-7. No I/O, no clock read, no environment variable.
packages/core          Sequence state machine, scoring, rescoring guardrails.
packages/db            SQL migrations (authoritative), Drizzle schema for typed
                       queries, the dispatch_candidates view, repositories.
packages/transports/   contract (types and dispatch), gmail (warm), cold.
apps/worker            Gates 12 to 14, dry-run mode, reply polling.
apps/web               Section 9 operator UI. Not started.
```

## Running it

Node 20.11 or newer, pnpm, and Postgres 14 or newer.

```bash
pnpm install
pnpm typecheck
pnpm test
```

Database setup. The application role must not own the tables, because INV-5
depends on grants that an owner bypasses.

```bash
createdb depinfin
psql depinfin -c "CREATE ROLE depinfin_app LOGIN PASSWORD 'CHANGE_ME'"
cp .env.example .env    # fill in both URLs
pnpm db:migrate         # runs as MIGRATION_DATABASE_URL, never as the app role
```

Then run the integration tests, which are skipped without a database:

```bash
TEST_MIGRATION_DATABASE_URL=... TEST_DATABASE_URL=... pnpm test
```

Dispatch:

```bash
pnpm worker:dry-run      # every gate runs, the log is written, nothing is sent
pnpm worker:dispatch
pnpm worker:poll-replies
```

## Before trusting any of this

1. **The test suite has never run.** It was written against the section 8 list
   but not executed, because this machine has no Node. The INV-2 patterns and
   the opt-out and merge logic were verified separately by porting the regexes
   and re-running every case from the test files, and all of them behaved. That
   is a check on the pattern design, not a green suite. Run `pnpm test` first.
2. **INV-4 and INV-5 are only verified against a real Postgres.** Those tests
   skip without `TEST_DATABASE_URL`, deliberately: a green run on a laptop with
   no database must not read as "the grants hold".

## Judgment calls worth a look

Three places worth a second read before this handles real prospects.

1. **The INV-2 term list does not catch inflections.** `guarantee` and
   `guaranteed` are both listed, but `guarantees` matches neither, and the same
   holds for `yields` and `returns`. The word-boundary requirement in section 8
   is what makes this so, and it is the right call for `royalty` and `shipyard`.
   Most real cases get caught anyway by the percentage rule. Expanding the list
   is a change to a compliance boundary, so it is flagged here rather than made
   quietly. Adding `guarantees`, `yields`, `returns of`, and `projected return`
   is the suggested change if you want it.
2. **Opt-out detection reads the whole inbound body, quoted history included.**
   That is INV-4 taken literally, and a missed opt-out is the worse of the two
   failure modes. It carries one copy constraint: outbound mail must not say
   "reply stop and we will take you off", because that line comes back inside
   the quoted history of every ordinary reply and each of those replies then
   reads as an opt-out. Warm one-to-one mail carries no footer, so this is not
   a live problem today. Revisit it at section 12 step 9, when a cold sequence
   needs an unsubscribe line.
3. **The linter normalizes before matching.** NFKC folding, zero-width
   stripping, and unicode dash folding, so `a​py` and `risk‑free` with a
   non-ASCII hyphen are caught. Normalization only ever widens what is caught.

## Not built, on purpose

Section 10 items are absent: no accreditation flow, no subscription or payment
path, no investor portal, no open-tracking pixels or link wrapping, no
multi-tenancy, no referral or commission mechanics, and no LinkedIn automation
of any kind. Section 11 items stay gated on outside counsel.

Nothing in this repo constitutes legal advice, and no comment or generated copy
asserts that a practice is compliant.
