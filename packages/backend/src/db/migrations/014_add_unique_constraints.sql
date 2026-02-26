-- Migration 014: Add missing unique constraints
-- Created: 2026-02-26

-- Add UNIQUE constraint on refresh_tokens.token_hash
-- Prevents duplicate token hashes (security issue)
ALTER TABLE refresh_tokens
ADD CONSTRAINT refresh_tokens_token_hash_unique UNIQUE (token_hash);

-- Drop old transaction_impact constraint and replace with composite
-- Old constraint only included player_gained_id, not player_lost_id
-- This meant drop-only transactions could duplicate
ALTER TABLE transaction_impact
DROP CONSTRAINT IF EXISTS transaction_impact_unique_per_transaction_player;

ALTER TABLE transaction_impact
ADD CONSTRAINT transaction_impact_unique_per_transaction
UNIQUE (league_id, transaction_date, transaction_type, player_gained_id, player_lost_id);

-- Note: This composite constraint handles all transaction types:
-- - Adds: player_gained_id set, player_lost_id NULL
-- - Drops: player_gained_id NULL, player_lost_id set
-- - Trades: both set
