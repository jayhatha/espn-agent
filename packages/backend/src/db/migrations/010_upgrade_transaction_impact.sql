-- Phase 9 Plan 01: Upgrade transaction_impact table for Shapley values, SGP, and confidence intervals
-- Add columns for Shapley-attributed impact, SGP-normalized category impacts, replacement-level baselines,
-- and bootstrap confidence intervals

ALTER TABLE transaction_impact
  ADD COLUMN IF NOT EXISTS shapley_impact NUMERIC,
  ADD COLUMN IF NOT EXISTS ci_low NUMERIC,
  ADD COLUMN IF NOT EXISTS ci_high NUMERIC,
  ADD COLUMN IF NOT EXISTS is_uncertain BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sgp_category_impacts JSONB,
  ADD COLUMN IF NOT EXISTS replacement_level_components JSONB,
  ADD COLUMN IF NOT EXISTS replacement_level_impact NUMERIC;

-- Comments for documentation
COMMENT ON COLUMN transaction_impact.shapley_impact IS 'Shapley-attributed roto points impact (provably sums to netRosterValue)';
COMMENT ON COLUMN transaction_impact.ci_low IS 'Bootstrap 95% confidence interval lower bound';
COMMENT ON COLUMN transaction_impact.ci_high IS 'Bootstrap 95% confidence interval upper bound';
COMMENT ON COLUMN transaction_impact.is_uncertain IS 'TRUE if confidence interval crosses zero (move effect uncertain)';
COMMENT ON COLUMN transaction_impact.sgp_category_impacts IS 'Per-category SGP-normalized deltas with raw values and factors';
COMMENT ON COLUMN transaction_impact.replacement_level_components IS 'Replacement-level production baseline (draft picks only)';
COMMENT ON COLUMN transaction_impact.replacement_level_impact IS 'Roto points impact vs replacement level (draft picks only)';
