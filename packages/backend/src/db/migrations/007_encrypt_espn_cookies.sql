-- Migration 007: Add encrypted columns for ESPN authentication cookies
--
-- This migration adds BYTEA columns to store AES-256-GCM encrypted ESPN credentials.
-- The plaintext columns (espn_swid, espn_s2) are kept temporarily for backward compatibility
-- during the migration rollout. A future migration will drop the plaintext columns after
-- all credentials have been migrated to encrypted storage.

ALTER TABLE league
  ADD COLUMN espn_swid_encrypted BYTEA,
  ADD COLUMN espn_s2_encrypted BYTEA;

-- Add comment documenting the encryption format
COMMENT ON COLUMN league.espn_swid_encrypted IS 'AES-256-GCM encrypted ESPN SWID cookie. Format: [iv:16][authTag:16][encrypted:*]';
COMMENT ON COLUMN league.espn_s2_encrypted IS 'AES-256-GCM encrypted ESPN espn_s2 cookie. Format: [iv:16][authTag:16][encrypted:*]';
