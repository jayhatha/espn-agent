-- Add additional indexes for commonly queried columns
-- Enhances performance for API queries and reports

-- Player projection composite index (player + run)
-- Useful for queries that need both player and projection run context
CREATE INDEX IF NOT EXISTS idx_player_projection_composite
  ON player_projection(player_id, projections_run_id);

-- League snapshot by league and date (descending for recent queries)
-- Optimizes time series queries for league history
CREATE INDEX IF NOT EXISTS idx_league_snapshot_league_date
  ON league_daily_snapshot(league_id, snapshot_date DESC);

-- Team daily overall with descending date
-- Improves performance for team performance history queries
CREATE INDEX IF NOT EXISTS idx_team_daily_overall_date
  ON team_daily_overall(team_id, snapshot_date DESC);

-- Team category totals with descending date
-- Speeds up category-specific team history lookups
CREATE INDEX IF NOT EXISTS idx_team_category_totals_date
  ON team_daily_category_totals(team_id, snapshot_date DESC);

-- Add documentation comments
COMMENT ON INDEX idx_player_identity_fangraphs IS 'Fast FanGraphs player ID lookups for projections matching';
COMMENT ON INDEX idx_player_projection_composite IS 'Composite index for player projection queries';
COMMENT ON INDEX idx_league_snapshot_league_date IS 'Efficient time series queries by league';
COMMENT ON INDEX idx_team_daily_overall_date IS 'Team performance history queries';
COMMENT ON INDEX idx_team_category_totals_date IS 'Team category history queries';



