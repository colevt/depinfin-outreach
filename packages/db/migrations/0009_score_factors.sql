-- 0009. Persist the scoring inputs, not only the result.
--
-- Section 4 requires the rubric to be deterministic and recomputable. The
-- score and the tier are already stored, but the five factors that produced
-- them are not, so last month's score cannot be reproduced and nobody can say
-- which factor moved. That also matters for the Tier 1 guardrail: rescoring
-- must never move a contact out of Tier 1 without an explicit operator action,
-- and reviewing such an action means seeing what changed.
--
-- Ported from the operator-ui branch, which had it right.

ALTER TABLE firms ADD COLUMN IF NOT EXISTS score_factors jsonb;

COMMENT ON COLUMN firms.score_factors IS
  'Scoring inputs so a rescore is recomputable (CLAUDE.md section 4). Keys: '
  'mandateFit, ticketFit, categoryLiteracy, warmPath, decisionSpeed. Each 1 to 5.';
