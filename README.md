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
| 7 | Operator UI, section 9 priority order | Built |
| 8 | Enrichment adapters | Not started. Research is recorded by hand, with sources |
| 9 | Cold transport on a separate domain | Adapter and guards built, no ESP wired |

The suite runs. 540 of 540 pass, including the cases that need a real Postgres,
and CI runs them on every push. See "What the suite actually covers".

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
| INV-8 no LinkedIn automation | Search building only, in `packages/core/src/search`. Nothing in the repo fetches LinkedIn | `packages/core/test/search.test.ts` greps the module for `fetch`, `axios`, `puppeteer`, `playwright`, `selenium`, and `headless`. A LinkedIn template cannot attach to a sequence step, by composite foreign key |
| INV-9 separate sending paths | Type-level in `packages/transports/contract`, domain check at construction | `packages/transports/cold/test/inv9.transport-separation.test.ts` |
| INV-10 no referral mechanics | No commission, payout, or referral table, column, or code path exists | Absence |

## Layout

```
packages/compliance    Linter, suppression, eligibility, merge, the pure gate
                       pipeline, and the draft gates. Single source of truth
                       for INV-1 to INV-4 and INV-7. No I/O, no clock read, no
                       environment variable.
packages/core          Sequence state machine, scoring, the knowledge and ICP
                       layer, the search builder, the draft composer, the
                       digest builder.
packages/db            SQL migrations (authoritative), Drizzle schema for typed
                       queries, the dispatch_candidates view, repositories.
packages/transports/   contract (types and dispatch), gmail (warm), cold.
apps/worker            Gates 12 to 14, dry-run mode, reply polling, the digest.
apps/web               The desk. See apps/web/README.md.
```

## What DePINfin is, and who the buy side is

`packages/core/src/knowledge` holds it, once, so drafts and research prompts
stop restating it and stop getting it wrong. Two descriptions live there and
they are not interchangeable: the internal shorthand "compliance and
capital-formation layer" is exactly the phrasing section 13 forbids in
prospect-facing copy, so the approved external line leads with software and
names the SPV as issuer of record. Every prospect-facing string in that
directory is run through the linter by its own test.

`icp.ts` defines both sides. Buy side is capital, and it is where the
securities posture lives: everything in section 2 is about not mishandling a
buy-side prospect. Sell side is the operators who would raise through the
platform, tracked but not a focus. Whether that distinction holds legally is a
question for counsel, not for a source file, and the file says so.

## Running it

Node 20.11 or newer, pnpm, and Postgres 14 or newer.

```bash
pnpm install
pnpm typecheck   # builds every package, then checks the tests against source
pnpm test
```

`pnpm typecheck` is also the build. It emits `dist/` for each package, which
the worker scripts import, so run it before `pnpm worker:*`.

Database setup. Two roles. The application role must not own the tables,
because INV-5 depends on grants that an owner bypasses.

```bash
psql -c "CREATE ROLE depinfin_owner LOGIN PASSWORD 'CHANGE_ME'"
psql -c "CREATE ROLE depinfin_app   LOGIN PASSWORD 'CHANGE_ME'"
createdb depinfin -O depinfin_owner
cp .env.example .env    # fill in both URLs
pnpm db:migrate         # runs as MIGRATION_DATABASE_URL, never as the app role
```

Then run the whole suite. Without these two variables the database cases skip,
and under `CI=1` a missing database is a hard failure rather than a skip:

```bash
TEST_MIGRATION_DATABASE_URL=... TEST_DATABASE_URL=... pnpm test
```

The suite is re-runnable against a database that already holds a previous run's
rows. That matters more here than in most projects: a suppression is permanent
by design, so nothing can clean one up, and every fixture that creates one is
scoped to a per-run address or domain. `.github/workflows/ci.yml` runs the
suite twice against the same database to keep it that way.

Dispatch and the digest:

```bash
pnpm worker:dry-run          # every gate runs, the log is written, nothing is sent
pnpm worker:dispatch
pnpm worker:poll-replies
pnpm worker:digest-dry-run   # builds and logs the digest without sending
pnpm worker:digest
```

The desk:

```bash
pnpm dev                 # http://localhost:3000
```

## What the suite actually covers

540 tests, all passing, against Postgres 16. The database cases were run
against a live database created by the setup above, and repeated against the
same database to confirm the run leaves it usable. The desk was run against
that database too, with every route checked.

What running it for the first time found, all since fixed:

1. **`dispatch()` did not reject a mismatched transport at compile time.** The
   two `@ts-expect-error` directives in the INV-9 test were unused, which is
   the compiler saying the misroute it was asserting against compiled fine.
   `K` was inferred from all three arguments at once, TypeScript widened it to
   `"warm" | "cold"`, and method parameter bivariance let a cold campaign
   through the warm adapter. `NoInfer` on the campaign and message parameters
   fixes it, and the directives are now load-bearing. The runtime
   `TransportMismatchError` was never the intended first line of defence here.
2. **Nothing built where the package entry points said it did.** Every package
   compiled to `dist/src/index.js` while its `package.json` pointed at
   `dist/index.js`, so no workspace import resolved and roughly thirty type
   errors were being masked by `any`. Package builds now cover `src` only, and
   the tests are typechecked separately by `tsconfig.tests.json` against
   source, matching what vitest actually runs.
3. **Two database fixtures could only pass once.** Both created permanent
   suppressions at fixed addresses. On a second run against the same database
   the deactivation case found its row already inactive, so the trigger it
   asserts had no transition to guard and the case passed for the wrong reason.
   Both are per-run now.

Two more the desk found, also fixed:

4. **Raw queries returned timestamps as strings while the row types said
   `Date`.** drizzle's `execute` does not carry the query builder's column
   types, so a `timestamptz` arrives as a string and a row type claiming `Date`
   is a lie the compiler cannot catch. Every page showing a time failed at
   runtime, and the digest would have failed the same way when it formatted
   one. Raw queries hydrate their timestamps now, and `packages/db/test/rows.test.ts`
   covers it.
5. **A `Date` passed into a raw query template failed to serialize.** The
   mirror image of the same problem, on the way in. Timestamps are ISO strings
   with an explicit cast now.

Still true, and worth keeping in mind:

- **INV-4 and INV-5 mean nothing without a real Postgres.** They are grants and
  triggers. The tests skip without `TEST_DATABASE_URL` so a green laptop run is
  never mistaken for "the grants hold", and CI refuses to start without one.
- **Nothing has been run against live Gmail credentials or a live ESP.** Every
  transport test uses a fake. Section 12 steps 4 and 9 are unexercised outside
  the type system.

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
