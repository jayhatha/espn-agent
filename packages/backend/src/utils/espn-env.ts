// =============================================================================
// ESPN credentials from environment variables (v4.0 single-user mode)
// Primary source: ESPN_SWID + ESPN_S2 env vars
// Fallback: encrypted DB columns (espn_swid_encrypted, espn_s2_encrypted)
// =============================================================================

/**
 * Get ESPN auth cookies from environment variables.
 * Returns the auth object if both ESPN_SWID and ESPN_S2 are set, undefined otherwise.
 * Returns strict type with required SWID/espn_s2 (not optional) since env vars are validated.
 */
export function getEspnAuthFromEnv(): { SWID: string; espn_s2: string } | undefined {
  const swid = process.env.ESPN_SWID;
  const s2 = process.env.ESPN_S2;

  if (swid && s2) {
    return { SWID: swid, espn_s2: s2 };
  }

  return undefined;
}
