# CLAUDE.md

Repo-level instructions for the DePINfin buy-side outreach platform.

Read this file in full before writing code. The constraints in section 2 are not style preferences. They are compliance boundaries, and violating them creates legal exposure for the company, not just a bug. If a requested feature conflicts with section 2, stop and say so rather than implementing it.

---

## 1. What this is

An internal outreach and pipeline system used by DePINfin to build interest among prospective investors in decentralized physical infrastructure, and to manage those relationships from first contact through qualification.

**In scope:** prospect data, enrichment, scoring, email sequencing, reply handling, LinkedIn message drafting, calendar visibility, activity logging, reporting.

**Out of scope for v1:** offering materials, subscription flow, accreditation verification, document execution, payment settlement, investor portal. See section 10.

Users: three internal operators. This is not a multi-tenant product. Optimize for correctness and auditability over scale.

---

## 2. Non-negotiable invariants

Each invariant has a test ID. Every one must have a passing test before the corresponding feature ships. Do not implement a feature flag, admin override, or config option that disables any of these.

### INV-1 — Tier 1 prospects are never sent automated mail

Records with `tier = 1` or `sequence_status = 'manual_only'` are structurally ineligible for automated sending. Enforce at the query layer, not with a post-filter: the candidate selection query must exclude them, so no code path can reach them.

**Rationale:** highest-value relationships get messages written by a human. A templated email to a top prospect is an unrecoverable error.

### INV-2 — Return-implying language blocks the send

Before any outbound message is dispatched, subject and body pass a linter. On any match, the send is refused, the prospect is untouched, and a `BLOCKED` audit entry is written.

Blocked patterns:

- Terms: `yield`, `high yield`, `real yield`, `apy`, `guaranteed`, `guarantee`, `risk-free`, `riskless`, `assured`, `promised return`, `annual return`, `roi`, `principal protected`, `no risk`, `prospectus`, `secured note`
- Any numeric percentage figure, regex `\b\d{1,3}(\.\d+)?\s*%`
- Matching is case-insensitive, word-boundary aware, and runs on the **merged** output, never the raw template

The linter is not bypassable. No `force` parameter, no `skip_lint` flag, no environment variable. If a legitimate message trips it, the message gets rewritten.

**Rationale:** return-implying language in outreach copy is the highest-frequency securities-compliance error available to this company. "Prospectus" is also incorrect terminology for a Reg D offering, use "offering" or "memorandum."

### INV-3 — Personalization is required on first touch

If a template contains a personalization placeholder and the prospect's corresponding field is empty or whitespace, the send is refused and logged as `SKIPPED`. Any unresolved merge placeholder remaining after substitution also refuses the send.

**Rationale:** quality gate. A record without a specific, verifiable reason for contact is a name, not a prospect.

### INV-4 — Suppression is checked on every send, on every step

Suppression matches on full email address and on bare domain. Checked immediately before dispatch on every step of a sequence, not once at enrollment. A suppression entry is permanent and cannot be deleted through the application, only marked inactive with a reason and an actor.

Inbound replies matching `stop`, `unsubscribe`, `remove me`, `take me off`, `do not contact`, or `opt out` automatically create a suppression entry, set `do_not_contact = true`, and terminate the sequence.

**Rationale:** CAN-SPAM requires a working opt-out honored within 10 business days. Honor it immediately.

### INV-5 — The audit log is append-only

Every send, skip, block, error, reply, opt-out, verification event, and stage change writes a row. No `UPDATE`, no `DELETE`. Enforce with database permissions, not application convention. Include timestamp, actor, prospect ID, action, and detail.

**Rationale:** Rule 17Ad-9 recordkeeping, and this is the evidentiary record if the offering is ever examined.

### INV-6 — Corporate content and offering content are separated at the schema level

Two distinct content tiers, in separate tables, with no foreign key permitting offering content to attach to an automated sequence.

| Tier | Contents | Gate |
|---|---|---|
| Tier 1, corporate | Who DePINfin is, what DePIN is, the platform model, partner credibility, sector theses | None |
| Tier 2, offering | Specific assets, terms, financial models, projected distributions, memoranda, subscription docs | Verified accredited investor record required |

Automated sequences may reference Tier 1 content only. The data model must make attaching Tier 2 content to a sequence impossible, not merely discouraged.

**Rationale:** existing DePINfin policy. A single document cannot serve both as general market-facing content and as a Rule 506(c) investment solicitation. Enforcing this in application logic alone guarantees it is eventually bypassed.

### INV-7 — Excluded jurisdictions are skipped

Prospects with jurisdiction in the configured exclusion set (default `EU`, `UK`, `EEA`) are excluded from automated sending at the query layer. Warm, human-initiated contact only.

**Rationale:** third-party contact data does not by itself establish a lawful basis for processing under GDPR. Gated on outside counsel. See section 11.

### INV-8 — No LinkedIn automation

The system drafts and queues LinkedIn messages with prospect context and a profile link. A human sends them from their own account. Do not add browser automation, headless drivers, unofficial API clients, or any library whose purpose is programmatic LinkedIn messaging or scraping, even if requested.

**Rationale:** violates LinkedIn's User Agreement. The accounts at risk belong to the founders, and their personal credibility is the scarce asset in this raise.

### INV-9 — Sending paths are separate

Two distinct, non-interchangeable transports:

- **Warm transport:** Gmail API via OAuth. One-to-one, human-composed or human-reviewed, sent from a real operator inbox on the primary domain. Replies land in that inbox.
- **Cold transport:** dedicated ESP or sending infrastructure on a **separate domain**, never the primary domain.

Never route cold sequence traffic through the warm transport. Model these as separate adapters behind a common interface with an explicit `transport` field on the campaign, and make misrouting a type error.

**Rationale:** cold volume on the primary domain destroys deliverability for all company mail, including investor correspondence. This is irreversible in practice.

### INV-10 — No compensated referral mechanics

Do not build commission tracking, referral payouts, or any feature that computes compensation tied to investor subscriptions or scaled to raise size.

**Rationale:** referral fees tied to investor subscriptions and scaled to raise size are the core indicator of unregistered broker activity under Exchange Act §15(a), and no federal finder's exemption exists. Gated on counsel. See section 11.

---

## 3. Architecture

```
apps/
  web/                    Operator UI
  worker/                 Scheduled jobs: sequence dispatch, reply polling, enrichment
packages/
  core/                   Domain model, sequence state machine, scoring
  compliance/             Linter, suppression, eligibility rules. No other package
                          may reimplement these.
  transports/
    gmail/                Warm transport adapter
    cold/                 Cold transport adapter
  enrichment/             Provider adapters behind one interface
  db/                     Schema, migrations, repositories
```

**Rule:** `packages/compliance` is the single source of truth for INV-1 through INV-4 and INV-7. Every send path calls into it. If eligibility or linting logic appears anywhere else, that is a defect.

### Recommended stack

TypeScript throughout. Next.js for the UI, Postgres for storage, Drizzle or Prisma for the data layer, a job runner with durable scheduling, Zod for validation at every boundary. Nothing exotic. Three users means boring and correct beats clever.

---

## 4. Data model

Illustrative, not prescriptive on naming. The relationships and constraints matter.

### `firms`

```
id                  uuid pk
name                text not null
type                enum(single_family_office, multi_family_office, ria, ocio,
                         crypto_fund, rwa_fund, infra_fund, individual_hnw,
                         ecosystem_principal)
aum_band            enum(under_100m, 100m_500m, 500m_1b, over_1b)
domicile_country    text
domicile_region     text
jurisdiction        enum(us, non_us, eu, uk, eea) not null
mandate_tags        text[]
typical_ticket_usd  numeric
decision_speed      enum(fast, medium, slow)
depin_familiarity   enum(high, medium, none)
source              text
score               integer
tier                integer check (tier in (1,2,3))
notes               text
created_at, updated_at
```

### `contacts`

```
id                  uuid pk
firm_id             uuid fk -> firms
first_name          text not null
last_name           text
title               text
email               citext unique
email_status        enum(unverified, valid, invalid, bounced)
linkedin_url        text
decision_role       enum(principal, cio, analyst, gatekeeper)
personal_reason     text          -- INV-3 gate
warm_path_contact   text
do_not_contact      boolean not null default false
created_at, updated_at
```

### `sequences` / `sequence_steps` / `enrollments`

```
sequences
  id, name, transport enum(warm, cold) not null, max_steps int default 5, active bool

sequence_steps
  id, sequence_id, step_number, delay_days, template_id, reply_in_thread bool

enrollments
  id, contact_id, sequence_id
  status enum(not_started, active, paused, replied, stopped, completed, manual_only)
  current_step int, last_sent_at, next_due_at, thread_id, replied_at
  unique (contact_id, sequence_id)
```

### `templates`

```
id, key, subject, body
content_tier enum(corporate) not null default 'corporate'
    check (content_tier = 'corporate')   -- INV-6 hard constraint
```

Offering material lives in a separate `offering_documents` table with no relation to `sequence_steps`. There is no valid join.

### `suppressions`

```
id, value text not null        -- email or bare domain
match_type enum(email, domain) not null
reason text not null
actor text not null
created_at
active boolean not null default true
-- INV-5: no delete permission for the application role
```

### `activity_log`

```
id bigserial pk
occurred_at timestamptz not null default now()
actor text not null
contact_id uuid
action enum(sent, skipped, blocked, error, reply, opt_out, stage_change,
            enrolled, unenrolled, rescored)
template_key text
detail jsonb
-- INV-5: INSERT only. Revoke UPDATE and DELETE from the application role.
```

### Scoring

Weighted rubric, deterministic, recomputable:

```
score = mandate_fit * 3
      + ticket_fit * 2
      + category_literacy * 2
      + warm_path * 3
      + decision_speed * 1
```

Each factor 1 to 5. Tier 1 is 40+, Tier 2 is 28 to 39, Tier 3 below 28.

Rescoring must never overwrite a `manual_only` enrollment status, and must never move a contact out of Tier 1 without an explicit operator action logged to `activity_log`.

---

## 5. Sequence state machine

```
not_started --enroll--> active
active --send--> active            (increments current_step, sets next_due_at)
active --max steps--> completed
active --inbound reply--> replied  (terminal until operator acts)
active --opt-out reply--> stopped  (terminal, writes suppression)
active --operator pause--> paused
paused --operator resume--> active
any --operator stop--> stopped
```

`replied` and `stopped` are terminal for automation. No automated message is ever sent to a contact who has written back. Resuming from `replied` requires an explicit operator action, logged.

---

## 6. Send pipeline

Every dispatch passes these gates in order. Any failure aborts and logs. No gate is skippable.

1. Transport matches campaign transport (INV-9)
2. Contact not suppressed, by email and by domain (INV-4)
3. `do_not_contact` is false
4. Tier is not 1, status is not `manual_only` (INV-1)
5. Jurisdiction not in exclusion set (INV-7)
6. Step is due per `delay_days` from `last_sent_at`
7. `current_step` is below `max_steps`
8. Template is `content_tier = 'corporate'` (INV-6)
9. Merge completes with zero unresolved placeholders (INV-3)
10. `personal_reason` is non-empty if the template references it (INV-3)
11. Linter passes on merged subject and body (INV-2)
12. Daily cap not exceeded, counted from `activity_log`, not from memory
13. Dispatch, then persist `thread_id`, `last_sent_at`, `next_due_at`
14. Write `sent` to `activity_log`

Steps 1 through 11 must be pure functions in `packages/compliance`, callable without side effects, so they are trivially testable and reusable by a dry-run mode.

**Dry-run mode is a first-class feature.** It runs the full pipeline and writes to the log without dispatching.

---

## 7. Reply handling

Poll the warm transport on a schedule. For each enrollment with a `thread_id` and non-terminal status:

1. Fetch thread, identify messages not from an operator address
2. On any inbound message, set `replied_at`
3. Scan the latest inbound body for opt-out patterns (INV-4). On match: suppress, set `do_not_contact`, status `stopped`, log `opt_out`
4. Otherwise status `replied`, surface in the operator action queue, log `reply`

Handle deleted or inaccessible threads without throwing. A missing thread is not an error state.

---

## 8. Test cases

These must exist and pass. Named by invariant.

**INV-1**
- Tier 1 contact with a due step is absent from the candidate query result set
- `manual_only` enrollment is absent from the candidate query result set
- No public API accepts a parameter that includes Tier 1 in automated dispatch

**INV-2**
- Each blocked term, in isolation, in subject and in body, refuses the send
- `14%`, `14 %`, `7.5%` each refuse the send
- Case variants `APY`, `apy`, `Apy` all refuse
- `royalty` does not trip `roi`; `yielded` and `shipyard` do not trip `yield` (word-boundary correctness)
- A blocked send writes `blocked` to the log and leaves enrollment state unchanged
- No code path reaches dispatch with a linter failure present
- Linting runs on merged output: a clean template with a blocked term injected via a merge field still refuses

**INV-3**
- Empty and whitespace-only `personal_reason` both refuse when the template references it
- An unresolved placeholder anywhere in merged output refuses

**INV-4**
- Exact email match suppresses
- Bare domain match suppresses every address at that domain
- Suppression added between step 1 and step 2 blocks step 2
- Each opt-out phrase creates a suppression, sets `do_not_contact`, and sets status `stopped`
- Application database role has no DELETE on `suppressions`

**INV-5**
- Application role has no UPDATE and no DELETE on `activity_log`
- Every pipeline outcome, including every skip reason, produces exactly one log row

**INV-6**
- No schema path attaches an `offering_documents` row to a `sequence_step`
- Inserting a template with `content_tier != 'corporate'` fails the check constraint

**INV-7**
- EU, UK, and EEA contacts absent from the candidate query result set

**INV-9**
- A cold-transport campaign cannot dispatch through the Gmail adapter, enforced at compile time where possible
- Cold transport rejects configuration pointing at the primary domain

**State machine**
- `replied` and `stopped` never dispatch
- Resuming from `replied` requires an explicit operator action and writes a log row
- Rescoring does not alter `manual_only` status

---

## 9. Operator UX priorities

Built for three people who will use it daily. In priority order:

1. **Action queue.** Everything in `replied` status, newest first. This is the home screen. It is the only screen that matters most mornings.
2. **Today's sends.** What will dispatch, and what was skipped with the reason. Skip reasons must be legible, not error codes.
3. **Prospect detail.** Full history, every logged touch, warm path, LinkedIn draft with a copy button.
4. **Calendar strip.** Next seven days alongside the queue.
5. **List building.** Import, dedupe, enrich, score.

Skip-reason legibility is a real requirement. "Personal Reason empty" beats "eligibility check 10 failed."

---

## 10. Do not build in v1

- Accreditation verification, subscription flow, document execution, payments
- Investor portal or gated data room
- Offering material storage beyond the isolated table required by INV-6
- Any commission, referral, or payout mechanics (INV-10)
- LinkedIn automation of any kind (INV-8)
- Open-tracking pixels or link-wrapping on cold sends. They damage deliverability and add privacy obligations for marginal signal.
- Multi-tenancy, SSO, role hierarchies. Three trusted users.

If asked to add any of the above, reference this section and ask for explicit confirmation before proceeding.

---

## 11. Features gated on outside counsel

Do not enable these in production until written sign-off exists. Build them behind a flag defaulting to off, or do not build them yet.

| Item | Gates |
|---|---|
| Rule 506(c) cold outreach boundaries | Volume and targeting of cold sequences |
| GDPR lawful-basis posture for EU and UK | INV-7 exclusion list |
| Reg S posture for non-US prospects | Any non-US sequence targeting |
| Investor-referral compensation analysis, Exchange Act §15(a) | INV-10, permanently until cleared |

Outside securities counsel is Lowenstein Sandler LLP. Nothing in this repo constitutes legal advice, and no code comment or generated copy should assert that a practice is compliant.

---

## 12. Build order

1. `packages/db` schema, migrations, database-level permissions for INV-5 and INV-6
2. `packages/compliance` with the full test suite from section 8, before any transport exists
3. `packages/core` sequence state machine, scoring
4. Warm transport, Gmail API OAuth
5. Dry-run mode, then live dispatch
6. Reply polling and opt-out handling
7. Operator UI in the section 9 priority order
8. Enrichment adapters
9. Cold transport on a separate domain, last, only after deliverability groundwork

Write section 8's tests before the code they cover. The compliance package is the one part of this system where a bug is not a bug.

---

## 13. Copy conventions

Any generated or templated prospect-facing copy follows these. They are house rules, and the linter enforces the first one.

- No return-implying language. Use "cash-flow-producing," "contracted revenue," or "distributions."
- The SPV is the issuer of record, not the operator. This is a recurring copy error.
- "Offering" or "memorandum," never "prospectus."
- The first note offerings are unsecured. No collateral or security language.
- Web3 token ownership is not legal asset ownership. That gap is the thesis, and it leads the positioning.
- DePINfin is a non-custodial software and administrative tooling provider. Lead with software, not regulatory architecture. Do not describe DePINfin as a broker-dealer, compliance platform, or legal structurer.
- Market figures are investor-material claims requiring source verification before use. Do not hardcode them into templates.
- No em dashes.
