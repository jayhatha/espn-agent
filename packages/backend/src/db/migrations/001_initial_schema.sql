-- Initial schema for ESPN Fantasy Baseball Assistant
-- Based on DESIGN_DOC.md §4

-- Core entities

CREATE TABLE league (
  id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'espn',
  espn_league_id INTEGER NOT NULL,
  season INTEGER NOT NULL,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (provider, espn_league_id, season)
);

CREATE INDEX idx_league_espn ON league(espn_league_id, season);

CREATE TABLE league_settings_version (
  id SERIAL PRIMARY KEY,
  league_id INTEGER NOT NULL REFERENCES league(id) ON DELETE CASCADE,
  effective_date DATE NOT NULL,
  settings_json JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (league_id, effective_date)
);

CREATE INDEX idx_league_settings_league ON league_settings_version(league_id, effective_date DESC);

CREATE TABLE team (
  id SERIAL PRIMARY KEY,
  league_id INTEGER NOT NULL REFERENCES league(id) ON DELETE CASCADE,
  espn_team_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (league_id, espn_team_id)
);

CREATE INDEX idx_team_league ON team(league_id);

CREATE TABLE player (
  id SERIAL PRIMARY KEY,
  espn_player_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  mlb_team TEXT,
  positions TEXT[] NOT NULL DEFAULT '{}',
  bats_throws TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_player_espn ON player(espn_player_id);
CREATE INDEX idx_player_name ON player(name);

CREATE TABLE player_identity_map (
  player_id INTEGER PRIMARY KEY REFERENCES player(id) ON DELETE CASCADE,
  fangraphs_key TEXT,
  confidence NUMERIC(3, 2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  resolution_method TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_player_identity_fangraphs ON player_identity_map(fangraphs_key);

-- Raw payload archive

CREATE TABLE league_raw_payload (
  id BIGSERIAL PRIMARY KEY,
  league_id INTEGER NOT NULL REFERENCES league(id) ON DELETE CASCADE,
  fetched_at TIMESTAMP NOT NULL DEFAULT NOW(),
  endpoint TEXT NOT NULL,
  views TEXT[] NOT NULL DEFAULT '{}',
  scoring_period_id INTEGER,
  x_fantasy_filter JSONB,
  response_json JSONB NOT NULL,
  schema_fingerprint TEXT NOT NULL
);

CREATE INDEX idx_raw_payload_league_time ON league_raw_payload(league_id, fetched_at DESC);
CREATE INDEX idx_raw_payload_fingerprint ON league_raw_payload(league_id, schema_fingerprint);

-- Daily snapshots

CREATE TABLE league_daily_snapshot (
  league_id INTEGER NOT NULL REFERENCES league(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  settings_version_id INTEGER NOT NULL REFERENCES league_settings_version(id),
  projections_run_id INTEGER,
  is_degraded BOOLEAN NOT NULL DEFAULT FALSE,
  degraded_reasons TEXT[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (league_id, snapshot_date)
);

CREATE INDEX idx_snapshot_date ON league_daily_snapshot(snapshot_date DESC);

CREATE TABLE team_daily_category_totals (
  league_id INTEGER NOT NULL,
  snapshot_date DATE NOT NULL,
  team_id INTEGER NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL,
  value NUMERIC NOT NULL,
  components_json JSONB,
  PRIMARY KEY (league_id, snapshot_date, team_id, category_id),
  FOREIGN KEY (league_id, snapshot_date) REFERENCES league_daily_snapshot(league_id, snapshot_date) ON DELETE CASCADE
);

CREATE INDEX idx_category_totals_team ON team_daily_category_totals(team_id, snapshot_date DESC);

CREATE TABLE team_daily_category_ranks (
  league_id INTEGER NOT NULL,
  snapshot_date DATE NOT NULL,
  team_id INTEGER NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  roto_points NUMERIC,
  PRIMARY KEY (league_id, snapshot_date, team_id, category_id),
  FOREIGN KEY (league_id, snapshot_date) REFERENCES league_daily_snapshot(league_id, snapshot_date) ON DELETE CASCADE
);

CREATE INDEX idx_category_ranks_team ON team_daily_category_ranks(team_id, snapshot_date DESC);

CREATE TABLE team_daily_overall (
  league_id INTEGER NOT NULL,
  snapshot_date DATE NOT NULL,
  team_id INTEGER NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  overall_points NUMERIC NOT NULL,
  overall_rank INTEGER NOT NULL,
  PRIMARY KEY (league_id, snapshot_date, team_id),
  FOREIGN KEY (league_id, snapshot_date) REFERENCES league_daily_snapshot(league_id, snapshot_date) ON DELETE CASCADE
);

CREATE INDEX idx_overall_team ON team_daily_overall(team_id, snapshot_date DESC);

-- Projected standings

CREATE TABLE team_daily_projected_category (
  league_id INTEGER NOT NULL,
  snapshot_date DATE NOT NULL,
  team_id INTEGER NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL,
  projected_value NUMERIC NOT NULL,
  projected_rank INTEGER NOT NULL,
  projected_roto_points NUMERIC,
  projected_components_json JSONB,
  PRIMARY KEY (league_id, snapshot_date, team_id, category_id),
  FOREIGN KEY (league_id, snapshot_date) REFERENCES league_daily_snapshot(league_id, snapshot_date) ON DELETE CASCADE
);

CREATE INDEX idx_projected_category_team ON team_daily_projected_category(team_id, snapshot_date DESC);

CREATE TABLE team_daily_projected_overall (
  league_id INTEGER NOT NULL,
  snapshot_date DATE NOT NULL,
  team_id INTEGER NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  projected_overall_points NUMERIC NOT NULL,
  projected_overall_rank INTEGER NOT NULL,
  PRIMARY KEY (league_id, snapshot_date, team_id),
  FOREIGN KEY (league_id, snapshot_date) REFERENCES league_daily_snapshot(league_id, snapshot_date) ON DELETE CASCADE
);

CREATE INDEX idx_projected_overall_team ON team_daily_projected_overall(team_id, snapshot_date DESC);

-- Roster snapshots

CREATE TABLE team_roster_snapshot (
  league_id INTEGER NOT NULL,
  snapshot_date DATE NOT NULL,
  team_id INTEGER NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  roster_status TEXT NOT NULL,
  roster_slot TEXT,
  acquisition_type TEXT,
  PRIMARY KEY (league_id, snapshot_date, team_id, player_id),
  FOREIGN KEY (league_id, snapshot_date) REFERENCES league_daily_snapshot(league_id, snapshot_date) ON DELETE CASCADE
);

CREATE INDEX idx_roster_snapshot_team ON team_roster_snapshot(team_id, snapshot_date DESC);

-- Transaction events

CREATE TABLE league_transaction_event (
  id BIGSERIAL PRIMARY KEY,
  league_id INTEGER NOT NULL REFERENCES league(id) ON DELETE CASCADE,
  event_time TIMESTAMP NOT NULL,
  event_date DATE NOT NULL,
  event_type TEXT NOT NULL,
  team_id INTEGER NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  counterparty_team_id INTEGER REFERENCES team(id) ON DELETE CASCADE,
  players_added INTEGER[] NOT NULL DEFAULT '{}',
  players_dropped INTEGER[] NOT NULL DEFAULT '{}',
  espn_event_id TEXT,
  payload_hash TEXT NOT NULL,
  raw_event_json JSONB NOT NULL,
  UNIQUE (league_id, event_time, team_id, payload_hash)
);

CREATE INDEX idx_transaction_league_time ON league_transaction_event(league_id, event_date DESC);
CREATE INDEX idx_transaction_team ON league_transaction_event(team_id, event_date DESC);
CREATE INDEX idx_transaction_espn_id ON league_transaction_event(espn_event_id) WHERE espn_event_id IS NOT NULL;

-- Projections

CREATE TABLE projections_run (
  id SERIAL PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'fangraphs',
  system TEXT NOT NULL DEFAULT 'depth_charts_ros',
  as_of_date DATE NOT NULL,
  ingested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  staleness TEXT NOT NULL DEFAULT 'fresh',
  artifacts_json JSONB,
  UNIQUE (source, system, as_of_date)
);

CREATE INDEX idx_projections_run_date ON projections_run(as_of_date DESC);

CREATE TABLE player_projection (
  projections_run_id INTEGER NOT NULL REFERENCES projections_run(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  stat_components_json JSONB NOT NULL,
  PRIMARY KEY (projections_run_id, player_id)
);

CREATE INDEX idx_player_projection_player ON player_projection(player_id);

-- Add foreign key for snapshots referencing projections
ALTER TABLE league_daily_snapshot
  ADD CONSTRAINT fk_snapshot_projections
  FOREIGN KEY (projections_run_id) REFERENCES projections_run(id);
