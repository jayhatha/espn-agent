// =============================================================================
// ESPN credentials from environment variables (v4.0 single-user mode)
// Primary source: ESPN_SWID + ESPN_S2 env vars
// Fallback: encrypted DB columns (espn_swid_encrypted, espn_s2_encrypted)
// =============================================================================

import { decryptToken, hasEncryptionKey } from "./encryption.js";

/**
 * Get ESPN auth cookies from environment variables.
 * Returns the auth object if both ESPN_SWID and ESPN_S2 are set, undefined otherwise.
 */
export function getEspnAuthFromEnv():
  | { SWID: string; espn_s2: string }
  | undefined {
  const swid = process.env.ESPN_SWID;
  const s2 = process.env.ESPN_S2;

  if (swid && s2) {
    return { SWID: swid, espn_s2: s2 };
  }

  return undefined;
}

/**
 * Get ESPN auth cookies from an encrypted league row.
 * Decrypts espn_swid_encrypted + espn_s2_encrypted using ENCRYPTION_KEY.
 * Returns undefined if credentials are not stored or cannot be decrypted.
 */
export function getEspnAuthFromLeague(league: {
  espn_swid_encrypted?: Buffer | string | null;
  espn_s2_encrypted?: Buffer | string | null;
}): { SWID: string; espn_s2: string } | undefined {
  if (!league.espn_swid_encrypted || !league.espn_s2_encrypted)
    return undefined;
  if (!hasEncryptionKey()) return undefined;

  const swid = league.espn_swid_encrypted;
  const s2 = league.espn_s2_encrypted;
  if (!Buffer.isBuffer(swid) || !Buffer.isBuffer(s2)) return undefined;

  try {
    return {
      SWID: decryptToken(swid),
      espn_s2: decryptToken(s2),
    };
  } catch {
    return undefined;
  }
}
