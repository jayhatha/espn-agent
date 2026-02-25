-- Add player pool columns to existing player table
ALTER TABLE player ADD COLUMN IF NOT EXISTS pct_owned NUMERIC(5,2);
ALTER TABLE player ADD COLUMN IF NOT EXISTS current_season_stats_json JSONB;
ALTER TABLE player ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;

-- Index for sync timestamp queries
CREATE INDEX IF NOT EXISTS idx_player_last_synced ON player(last_synced_at);

-- Comments for documentation
COMMENT ON COLUMN player.pct_owned IS 'Rostered percentage across all ESPN leagues (0-100)';
COMMENT ON COLUMN player.current_season_stats_json IS 'Current season counting stats: {AB, H, R, HR, RBI, SB, BB, IP, K, W, SV, ERA, WHIP}';
COMMENT ON COLUMN player.last_synced_at IS 'Last successful sync timestamp from ESPN';
