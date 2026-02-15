-- Add ESPN authentication columns to league table
-- Allows persistent storage of SWID and espn_s2 cookies for API access

ALTER TABLE league
  ADD COLUMN IF NOT EXISTS espn_swid TEXT,
  ADD COLUMN IF NOT EXISTS espn_s2 TEXT;

-- Add index for leagues requiring auth
CREATE INDEX IF NOT EXISTS idx_league_has_auth
  ON league(id) WHERE espn_swid IS NOT NULL;

-- Add comments
COMMENT ON COLUMN league.espn_swid IS 'ESPN SWID cookie for private league access';
COMMENT ON COLUMN league.espn_s2 IS 'ESPN espn_s2 cookie for private league access';
