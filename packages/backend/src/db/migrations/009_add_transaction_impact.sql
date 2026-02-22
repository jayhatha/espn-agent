-- Phase 9: Transaction Impact Analysis (Roto WPA)
-- Per-player per-period stats, roster moves, and impact scores

-- Table 1: Per-player per-period counting stats, populated during backfill
CREATE TABLE IF NOT EXISTS player_period_stats (
  league_id       INTEGER NOT NULL REFERENCES league(id) ON DELETE CASCADE,
  snapshot_date   DATE NOT NULL,
  scoring_period  INTEGER NOT NULL,
  player_id       INTEGER NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  team_id         INTEGER NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  lineup_slot_id  INTEGER,
  components_json JSONB NOT NULL,
  PRIMARY KEY (league_id, scoring_period, player_id)
);

CREATE INDEX IF NOT EXISTS idx_pps_team ON player_period_stats(team_id, league_id, scoring_period);
CREATE INDEX IF NOT EXISTS idx_pps_snapshot ON player_period_stats(league_id, snapshot_date);

-- Table 2: Roster moves derived from weekly snapshot diffs
CREATE TABLE IF NOT EXISTS roster_move (
  id              SERIAL PRIMARY KEY,
  league_id       INTEGER NOT NULL REFERENCES league(id) ON DELETE CASCADE,
  team_id         INTEGER NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  move_type       TEXT NOT NULL,
  player_id       INTEGER NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  effective_date  DATE NOT NULL,
  paired_move_id  INTEGER REFERENCES roster_move(id),
  UNIQUE (league_id, team_id, player_id, effective_date, move_type)
);

CREATE INDEX IF NOT EXISTS idx_rm_team ON roster_move(team_id, league_id, effective_date);

-- Table 3: Cached impact scores per move
CREATE TABLE IF NOT EXISTS transaction_impact (
  id                   SERIAL PRIMARY KEY,
  league_id            INTEGER NOT NULL REFERENCES league(id) ON DELETE CASCADE,
  team_id              INTEGER NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  move_type            TEXT NOT NULL,
  player_gained_id     INTEGER REFERENCES player(id),
  player_lost_id       INTEGER REFERENCES player(id),
  effective_date       DATE NOT NULL,
  gained_components    JSONB,
  lost_components      JSONB,
  impact_roto_points   NUMERIC NOT NULL,
  category_impacts     JSONB NOT NULL,
  is_incomplete        BOOLEAN NOT NULL DEFAULT FALSE,
  computed_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (league_id, team_id, player_gained_id, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_ti_team ON transaction_impact(team_id, league_id);
