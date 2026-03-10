-- Migration 017: Add missing composite indexes for high-frequency query patterns
-- B-13: These composite indexes prevent full table scans on frequently-queried tables

-- Composite index for team_roster_snapshot lookups by league+date+team
-- Used by: roster endpoint, team overview, trade partner rosters, waiver evaluation
CREATE INDEX IF NOT EXISTS idx_team_roster_snapshot_league_date_team
  ON team_roster_snapshot (league_id, snapshot_date, team_id);

-- Composite index for team_daily_category_totals lookups by league+date+team
-- Used by: standings projection, timeseries, team overview, projected standings
CREATE INDEX IF NOT EXISTS idx_team_daily_cat_totals_league_date_team
  ON team_daily_category_totals (league_id, snapshot_date DESC, team_id);
