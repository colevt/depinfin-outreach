# Operator UI

Section 12 step 7. Not started.

Build in the section 9 priority order, and not in a different one:

1. **Action queue.** Everything in `replied` status, newest first. This is the
   home screen and the only screen that matters most mornings.
2. **Today's sends.** What will dispatch, and what was skipped with the reason.
   The reasons already come out of the pipeline in plain language, for example
   "Personal Reason empty" and "Domain suppressed: northarc.com". Render them
   as they are. Do not map them back to codes.
3. **Prospect detail.** Full history from `activity_log`, every logged touch,
   warm path, and the LinkedIn draft with a copy button. INV-8: a copy button,
   never a send button.
4. **Calendar strip.** Next seven days alongside the queue.
5. **List building.** Import, dedupe, enrich, score.

The UI calls `packages/compliance` for anything it displays about eligibility.
It does not decide eligibility itself.
