-- 0006. Persist scoring inputs so a rescore is recomputable (section 4).
-- The application role already has UPDATE on firms.

ALTER TABLE firms
  ADD COLUMN IF NOT EXISTS score_factors jsonb;

COMMENT ON COLUMN firms.score_factors IS
  'Scoring inputs so a rescore is recomputable. Keys: mandateFit, ticketFit, categoryLiteracy, warmPath, decisionSpeed.';
