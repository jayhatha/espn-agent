-- Migration 015: Remove plaintext ESPN cookie columns
-- All credentials now stored only in encrypted form

ALTER TABLE league
  DROP COLUMN IF EXISTS espn_swid,
  DROP COLUMN IF EXISTS espn_s2;

-- Add comment documenting encrypted-only storage
COMMENT ON COLUMN league.espn_swid_encrypted IS 'AES-256-GCM encrypted ESPN SWID cookie (encrypted-only storage). Format: [iv:16][authTag:16][encrypted:*]';
COMMENT ON COLUMN league.espn_s2_encrypted IS 'AES-256-GCM encrypted ESPN espn_s2 cookie (encrypted-only storage). Format: [iv:16][authTag:16][encrypted:*]';
