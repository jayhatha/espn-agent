ALTER TABLE player ADD COLUMN espn_asv NUMERIC DEFAULT NULL;
COMMENT ON COLUMN player.espn_asv IS 'ESPN Average Season Value (auction dollar value from draftRanksByRankType.STANDARD.auctionValue)';
