-- Add player_period_stats table for per-player, per-period stats with team association
-- Enables tenure-based stats: "stats accumulated while on this team"

CREATE TABLE player_period_stats (
  league_id INTEGER NOT NULL REFERENCES league(id) ON DELETE CASCADE,
  scoring_period INTEGER NOT NULL,
  player_id INTEGER NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  lineup_slot_id INTEGER,
  components_json JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (league_id, scoring_period, player_id)
);

CREATE INDEX idx_player_period_stats_team ON player_period_stats(league_id, team_id);
CREATE INDEX idx_player_period_stats_player ON player_period_stats(player_id, league_id);
