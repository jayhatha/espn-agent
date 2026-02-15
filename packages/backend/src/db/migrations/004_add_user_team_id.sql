-- Add user_team_id to league table for auto-detected team ownership
ALTER TABLE league
ADD COLUMN user_team_id INTEGER REFERENCES team(id) ON DELETE SET NULL;

CREATE INDEX idx_league_user_team ON league(user_team_id);

COMMENT ON COLUMN league.user_team_id IS 'Auto-detected team belonging to the authenticated user (matched via SWID)';
