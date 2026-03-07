/**
 * rank-boost.ts
 *
 * Shared external rank boost formula for top targets and shopping list scoring.
 * Extracted to avoid circular dependency between index.ts and shopping-list.ts.
 */

const RANK_BOOST_WEIGHT = 0.6;   // Max boost for #1 ranked player
const RANK_BOOST_MAX_RANK = 200; // Normalize ranks across typical draft pool
const UNRANKED_PENALTY = 0.7;    // 30% penalty for players without external rank

/**
 * Compute a multiplicative boost based on external expert ranking.
 * Ranked players get 1.0 to 1.6x boost (lower rank = higher boost).
 * Unranked players get 0.7x penalty.
 */
export function computeExternalRankBoost(externalRank: number | undefined): number {
  if (externalRank == null) return UNRANKED_PENALTY;
  const clampedRank = Math.min(externalRank, RANK_BOOST_MAX_RANK);
  return 1.0 + RANK_BOOST_WEIGHT * (1.0 - clampedRank / RANK_BOOST_MAX_RANK);
}
