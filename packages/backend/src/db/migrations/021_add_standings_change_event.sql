-- Phase 81: Persistent standings change event log

CREATE TABLE IF NOT EXISTS standings_change_event (
  id               BIGSERIAL PRIMARY KEY,
  league_id        INTEGER NOT NULL REFERENCES league(id) ON DELETE CASCADE,
  team_id          INTEGER NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  snapshot_date    DATE NOT NULL,
  occurred_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  category_id      VARCHAR NOT NULL,
  category_name    VARCHAR NOT NULL,
  prev_roto_pts    NUMERIC(6,2) NOT NULL,
  curr_roto_pts    NUMERIC(6,2) NOT NULL,
  roto_delta       NUMERIC(6,2) NOT NULL,
  passed_team_id   INTEGER REFERENCES team(id),
  passed_team_name VARCHAR,
  direction        VARCHAR(10) NOT NULL CHECK (direction IN ('gained', 'lost')),
  proximate_cause  JSONB
);

ALTER TABLE standings_change_event
  ADD CONSTRAINT sce_unique_event
  UNIQUE (league_id, team_id, snapshot_date, category_id);

CREATE INDEX IF NOT EXISTS idx_sce_league_date
  ON standings_change_event (league_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_sce_team_time
  ON standings_change_event (team_id, occurred_at DESC);

COMMENT ON TABLE standings_change_event IS
  'Phase 81: Persisted log of roto-point changes per team per category per snapshot';
COMMENT ON COLUMN standings_change_event.proximate_cause IS
  'JSON: { playerName, stat, value, description } — the player/event that drove the change';
COMMENT ON COLUMN standings_change_event.passed_team_id IS
  'The team we passed (direction=gained) or who passed us (direction=lost)';
