-- Add injury tracking for players
-- Per Phase 12-01 Task 1: Fix injury data extraction

-- Add injury_status to player table
ALTER TABLE player
ADD COLUMN injury_status TEXT,
ADD COLUMN injury_updated_at TIMESTAMP;

-- Create injury_event table for historical tracking
CREATE TABLE injury_event (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  injury_status TEXT NOT NULL, -- 'IL', 'DTD', 'OUT', 'HEALTHY'
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_injury_event_player ON injury_event(player_id, event_date DESC);
CREATE INDEX idx_injury_event_date ON injury_event(event_date DESC);

-- Add comment for documentation
COMMENT ON COLUMN player.injury_status IS 'Current injury status: IL, DTD, OUT, HEALTHY, or NULL';
COMMENT ON TABLE injury_event IS 'Historical record of player injury status changes';
