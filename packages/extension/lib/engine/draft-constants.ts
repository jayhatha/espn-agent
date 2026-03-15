/**
 * draft-constants.ts
 *
 * Constants and helpers for positional bid weighting, SP tier caps,
 * and games-started cap awareness.
 *
 * Pure values — no side effects, no state reads.
 */

// ============================================================
// Positional Weights
// ============================================================

/**
 * Bid ceiling bonuses by position. Scarce hitting positions get
 * higher bonuses so the auto-bidder is willing to stretch for them.
 *
 * SS +4, OF +3, 3B +3, 1B +2, 2B +2, C +1
 * Pitchers and flex/bench get no bonus.
 */
export const POSITIONAL_WEIGHTS: Record<string, number> = {
  SS: 4,
  OF: 3,
  "3B": 3,
  "1B": 2,
  "2B": 2,
  C: 1,
  SP: 0,
  RP: 0,
  P: 0,
  DH: 2,
  UTIL: 0,
  BN: 0,
};

/**
 * Return the maximum positional weight for a player who is eligible
 * at multiple positions. A SS/2B dual-eligible player gets +4 (SS weight).
 */
export function getPositionalWeight(positions: string[]): number {
  let max = 0;
  for (const pos of positions) {
    const upper = pos.toUpperCase();
    const w = POSITIONAL_WEIGHTS[upper] ?? 0;
    if (w > max) max = w;
  }
  return max;
}

// ============================================================
// SP Tier Caps
// ============================================================

/**
 * Maximum bid for each SP tier slot. As more SPs are drafted,
 * the cap for the next SP decreases to preserve budget for hitters
 * and high-K relievers.
 *
 * SP1: $18, SP2: $12, SP3: $10, SP4: $5, SP5+: $3
 */
export const SP_TIER_CAPS: ReadonlyArray<{ tier: number; max: number }> = [
  { tier: 1, max: 18 },
  { tier: 2, max: 12 },
  { tier: 3, max: 10 },
  { tier: 4, max: 5 },
  { tier: 5, max: 3 },
];

/**
 * Return the maximum bid for the next SP slot given how many SPs
 * are already on the roster.
 *
 * spCount=0 -> tier 1 cap ($18)
 * spCount=1 -> tier 2 cap ($12)
 * spCount=4+ -> tier 5 cap ($3)
 */
export function getSpTierCap(spCount: number): number {
  const tierIndex = Math.min(spCount, SP_TIER_CAPS.length - 1);
  return SP_TIER_CAPS[tierIndex].max;
}

// ============================================================
// Games Started Cap
// ============================================================

/**
 * ESPN standard leagues enforce a 200 games-started cap for pitchers.
 * This limits the number of SP roster slots that generate meaningful value.
 * Implication: don't overpay for SPs beyond tier 3 — save budget for
 * high-K relievers who contribute without consuming GS.
 */
export const GS_CAP = 200;

// ============================================================
// Category Rank Targets (INF-03)
// ============================================================

/**
 * Target finish position per scoring category.
 * Used by strategy logic and displayed in sidebar to guide draft priorities.
 *
 * Lower number = more aggressive target (top 3 = finish in top 3 of league).
 * OPS/HR: top 3, SB/SV: top 4, K: top 5, others: sensible defaults.
 */
export const CATEGORY_RANK_TARGETS: Record<string, number> = {
  OPS: 3,   // finish top 3
  HR: 3,
  SB: 4,
  SV: 4,
  K: 5,
  R: 4,
  RBI: 4,
  W: 5,
  ERA: 4,
  WHIP: 4,
};
