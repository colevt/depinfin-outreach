# Operator UI

Section 12 step 7, built in the section 9 priority order.

1. **Action queue** at `/`. Everything in `replied`, newest first.
2. **Today's sends** at `/sends`. Ready and held, with pipeline reasons as written.
3. **Prospect detail** at `/prospects/[id]`. History, warm path, LinkedIn draft with a copy button.
4. **Calendar strip** on the queue. Next seven days.
5. **List building** at `/list`. Import, dedupe, score. Enrichment is step 8 and is not wired.

The UI calls `packages/compliance` for eligibility. It does not decide eligibility itself, and it does not dispatch. Resume and stop go through the section 5 state machine and write `activity_log`.

```bash
WEB_FIXTURES=1 pnpm web
```

Fixture mode is for review without Postgres. The banner is on purpose. Against a real database:

```bash
DATABASE_URL=postgres://depinfin_app:... pnpm web
```
