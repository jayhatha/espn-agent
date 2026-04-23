-- Phase 84: distinguish live-game events from projection-driven snapshot events

ALTER TABLE standings_change_event
  ADD COLUMN IF NOT EXISTS event_source VARCHAR(20) NOT NULL DEFAULT 'snapshot';

CREATE INDEX IF NOT EXISTS idx_sce_source
  ON standings_change_event (league_id, event_source, snapshot_date DESC);

COMMENT ON COLUMN standings_change_event.event_source IS
  'live = generated during live-poll cycle (actual stat change); snapshot = generated from overnight projection diff';
