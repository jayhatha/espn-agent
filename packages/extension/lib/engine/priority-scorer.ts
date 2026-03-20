/**
 * priority-scorer.ts
 *
 * EV-based priority scoring engine (Phase 62).
 * Replaces the SGP/ASV blend in bid-optimizer.ts.
 *
 * Formula: priority_score = EV × category_weight × scarcity_weight × team_need_weight
 * Max bid = inflated FG$ + EV buffer + category bonus, hard capped at FG$ × 1.25
 *
 * Pure functions: no Zustand reads, no DOM access, no side effects.
 */

import type { PoolPlayer, CategoryState, PriorityScoreResult } from "./types";

// ============================================================
// Category weights (Phase 62 locked decisions)
// ============================================================

const CATEGORY_WEIGHTS: Record<string, number> = {
  SB: 1.5,
  SV: 1.4,
  ERA: 1.3,
  WHIP: 1.3,
  OPS: 1.2,
  HR: 1.0,
  RBI: 1.0,
  R: 1.0,
  W: 1.0,
  K: 1.0,
};

const DEFAULT_CATEGORY_WEIGHT = 1.0;

// ============================================================
// getCategoryWeight
// ============================================================

/**
 * Returns the max category weight among the provided stat keys.
 * A player contributing to multiple categories gets the MAX weight (not sum).
 */
export function getCategoryWeight(statKeys: string[]): number {
  let max = DEFAULT_CATEGORY_WEIGHT;
  for (const key of statKeys) {
    const w = CATEGORY_WEIGHTS[key] ?? DEFAULT_CATEGORY_WEIGHT;
    if (w > max) max = w;
  }
  return max;
}

// ============================================================
// tagPlayer
// ============================================================

/**
 * Tags a player with descriptive labels based on their stat profile.
 *
 * Tags:
 * - is_SB_anchor: hitter with SB >= 20
 * - is_OPS_anchor: hitter with OPS >= 0.850
 * - is_closer: pitcher with SV > 20
 * - is_replaceable_bat: hitter with SB < 5 AND OPS < 0.800
 * - is_SP_anchor: pitcher where K/IP > median, ERA < median, WHIP < median
 *
 * @param player       The player to tag
 * @param poolMedians  Optional pitcher pool medians for is_SP_anchor detection
 * @returns            Array of matching tag strings (empty if none)
 */
export function tagPlayer(
  player: PoolPlayer,
  poolMedians?: { kPerIP: number; era: number; whip: number },
): string[] {
  const tags: string[] = [];
  const { isPitcher, stats } = player;

  if (!isPitcher) {
    // Hitter-only tags
    const sb = stats["SB"] ?? 0;
    const ops = stats["OPS"] ?? 0;

    if (sb >= 20) {
      tags.push("is_SB_anchor");
    }
    if (ops >= 0.85) {
      tags.push("is_OPS_anchor");
    }
    if (sb < 5 && ops < 0.8) {
      tags.push("is_replaceable_bat");
    }
  } else {
    // Pitcher-only tags
    const sv = stats["SV"] ?? 0;
    const k = stats["K"] ?? 0;
    const ip = stats["IP"] ?? 0;
    const era = stats["ERA"] ?? 0;
    const whip = stats["WHIP"] ?? 0;

    if (sv > 20) {
      tags.push("is_closer");
    }

    if (
      poolMedians != null &&
      ip > 0 &&
      k / ip > poolMedians.kPerIP &&
      era < poolMedians.era &&
      whip < poolMedians.whip
    ) {
      tags.push("is_SP_anchor");
    }
  }

  return tags;
}

// ============================================================
// computeEVMaxBid
// ============================================================

/**
 * Compute the final max bid from components.
 *
 * Formula:
 *   base = fgDollars × inflationFactor
 *   If endgame: dampen evBuffer and categoryBonus by 0.7×
 *   raw = base + evBuffer + categoryBonus
 *   cap = fgDollars × 1.25   (on RAW fgDollars, not inflated)
 *   maxBid = max(1, round(min(raw, cap, max(1, budget - 1))))
 */
export function computeEVMaxBid(
  fgDollars: number,
  evBuffer: number,
  categoryBonus: number,
  inflationFactor: number,
  budget: number,
  isEndgame: boolean,
): number {
  const base = fgDollars * inflationFactor;

  // Endgame: 30% dampening on discretionary buffers
  const effectiveEvBuffer = isEndgame ? Math.round(evBuffer * 0.7) : evBuffer;
  const effectiveCategoryBonus = isEndgame ? Math.round(categoryBonus * 0.7) : categoryBonus;

  const raw = base + effectiveEvBuffer + effectiveCategoryBonus;

  // Hard cap on RAW fgDollars (not inflated)
  const cap = fgDollars * 1.25;

  // Budget constraint: leave at least $1 in reserve
  const budgetCeiling = Math.max(1, budget - 1);

  return Math.max(1, Math.round(Math.min(raw, cap, budgetCeiling)));
}

// ============================================================
// computePriorityScore
// ============================================================

/**
 * Compute the EV-based priority score for a player.
 *
 * Algorithm:
 * 1. EV = fgDollars - espnAsv; missing ASV → EV = 0 (fairly priced)
 * 2. Determine contributing stat keys (stats with value > 0)
 * 3. category_weight = max weight among contributing stat keys
 * 4. scarcity_weight = from categoryState, clamped [1.0, 2.0]
 * 5. team_need_weight = from pace ratios, clamped [1.0, 2.0]
 * 6. priority_score = max(0, EV) × category_weight × scarcity_weight × team_need_weight
 * 7. evBuffer = EV > 0 ? round(EV × 0.3) : 0
 * 8. categoryBonus = round((category_weight - 1.0) × scarcity_weight × 3)
 */
export function computePriorityScore(
  player: PoolPlayer,
  fgDollars: number,
  espnAsv: number | null | undefined,
  categoryState: CategoryState,
): PriorityScoreResult {
  // Step 1: Compute EV
  // When ASV is missing, treat as fairly priced → EV = 0
  const ev = espnAsv != null ? fgDollars - espnAsv : 0;

  // Step 2: Determine contributing stat keys
  const { isPitcher, stats } = player;
  const candidateStats = isPitcher
    ? ["SV", "ERA", "WHIP", "K", "W"]
    : ["SB", "OPS", "HR", "RBI", "R"];

  const contributingStats = candidateStats.filter(key => (stats[key] ?? 0) > 0);

  // Step 3: Category weight (max among contributing stats)
  const categoryWeight = getCategoryWeight(
    contributingStats.length > 0 ? contributingStats : candidateStats,
  );

  // Step 4: Scarcity weight — use the primary stat (highest weight category)
  let primaryStat = contributingStats[0] ?? candidateStats[0] ?? "";
  let primaryStatWeight = 0;
  for (const key of contributingStats.length > 0 ? contributingStats : candidateStats) {
    const w = CATEGORY_WEIGHTS[key] ?? DEFAULT_CATEGORY_WEIGHT;
    if (w > primaryStatWeight) {
      primaryStatWeight = w;
      primaryStat = key;
    }
  }

  const rawScarcity = categoryState.scarcityWeights[primaryStat] ?? 1.0;
  const scarcityWeight = Math.max(1.0, Math.min(2.0, rawScarcity));

  // Step 5: Team need weight — from pace ratios
  // For HIGHER_BETTER: need = max(0, 1 - paceRatio)
  // For LOWER_BETTER: need = max(0, paceRatio - 1)
  let maxNeed = 0;
  for (const key of contributingStats.length > 0 ? contributingStats : candidateStats) {
    const paceRatio = categoryState.paceRatios[key];
    if (paceRatio == null) continue;
    const direction = categoryState.categoryDirections[key];
    let need: number;
    if (direction === "LOWER_BETTER") {
      need = Math.max(0, paceRatio - 1);
    } else {
      // Default to HIGHER_BETTER
      need = Math.max(0, 1 - paceRatio);
    }
    if (need > maxNeed) maxNeed = need;
  }
  const teamNeedWeight = Math.max(1.0, Math.min(2.0, 1 + Math.min(1.0, maxNeed)));

  // Step 6: Priority score (floored at 0 — negative EV gives 0)
  const priorityScore = Math.max(0, ev) * categoryWeight * scarcityWeight * teamNeedWeight;

  // Step 7: EV buffer (30% of positive EV → extra $ to bid)
  const evBuffer = ev > 0 ? Math.round(ev * 0.3) : 0;

  // Step 8: Category bonus (based on how premium the category and scarcity is)
  const categoryBonus = Math.round((categoryWeight - 1.0) * scarcityWeight * 3);

  // Step 9: Cliff bonus (extra $3 if player is on cliff list)
  const cliffBonus = categoryState.cliffPlayers.includes(player.normalizedName) ? 3 : 0;

  // Step 10: Player tags
  const playerTags = tagPlayer(player);

  // Step 11: Compute max bid using computeEVMaxBid
  // (inflationFactor=1.0 default; endgame handled by caller with budget awareness)
  const totalBonus = categoryBonus + cliffBonus;
  const maxBid = computeEVMaxBid(
    fgDollars,
    evBuffer,
    totalBonus,
    1.0,       // inflationFactor: caller should use computeEVMaxBid directly for inflation
    Infinity,  // budget: unconstrained here; caller should apply budget via computeEVMaxBid
    false,     // isEndgame: caller-controlled
  );

  return {
    priorityScore,
    evBuffer,
    categoryBonus: totalBonus,
    playerTags,
    maxBid,
  };
}
