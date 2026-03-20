/**
 * category-state.ts
 *
 * Computes CategoryState once per pick from the current draft state.
 * Implements scarcity weight computation, pace tracking with LOWER_BETTER inversion,
 * surplus pool accumulation from bargain wins, and replacement cliff detection.
 *
 * Called in computeDraftEngine before the bid worker is dispatched.
 *
 * Pure function (except module-level cache which is invalidated on leagueId change).
 */

import type { PoolPlayer, CategoryState } from "./types";

// ============================================================
// Input interface
// ============================================================

export interface ComputeCategoryStateInput {
  leagueId: number | null | undefined;
  undraftedPlayers: PoolPlayer[];           // current undrafted pool
  allUndraftedPlusDrafted: PoolPlayer[];    // all FG players (used for initial stats on first call)
  myDraftedPlayers: Array<{ fgDollars: number; paidDollars: number; normalizedName: string }>;
  myTotals: Record<string, number>;         // from teamDraftedTotals.get(myTeamId) ?? {}
  categoryTargets: Record<string, number>;  // from input.categoryTargets ?? {}
  categoryDirections: Record<string, "HIGHER_BETTER" | "LOWER_BETTER">;
  totalPicksMade: number;
  totalPicksInDraft: number;               // totalTeams × rosterSize
}

// ============================================================
// Module-level cache
// ============================================================

let cachedLeagueId: string | number | null | undefined = undefined;
let cachedInitialPoolStats: Record<string, number> = {};

/** Exported for test reset only — do not call in production code */
export function resetCategoryStateCache(): void {
  cachedLeagueId = undefined;
  cachedInitialPoolStats = {};
}

// ============================================================
// Helpers
// ============================================================

/**
 * Compute the median of a numeric array.
 * Returns 0 for empty arrays.
 */
function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Clamp a value to [min, max].
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Cliff-detection stat keys — we check these categories for value dropoffs.
 * SB, SV, HR, K are the scarce stats where cliff bonuses matter most.
 */
const CLIFF_STAT_KEYS = ["SB", "SV", "HR", "K"];

// ============================================================
// computeInitialPoolStats
// ============================================================

function computeInitialPoolStats(
  allPlayers: PoolPlayer[],
  categoryDirections: Record<string, "HIGHER_BETTER" | "LOWER_BETTER">,
): Record<string, number> {
  const result: Record<string, number> = {};

  // Collect all stat keys from all players
  const allStatKeys = new Set<string>();
  for (const p of allPlayers) {
    for (const key of Object.keys(p.stats)) {
      allStatKeys.add(key);
    }
  }

  for (const statKey of allStatKeys) {
    const direction = categoryDirections[statKey] ?? "HIGHER_BETTER";

    if (direction === "LOWER_BETTER") {
      // ERA, WHIP: use pool median of pitchers with IP > 0
      const vals = allPlayers
        .filter(p => (p.stats["IP"] ?? 0) > 0)
        .map(p => p.stats[statKey])
        .filter((v): v is number => typeof v === "number" && !isNaN(v) && v > 0);
      result[statKey] = vals.length > 0 ? median(vals) : 0;
    } else {
      // HIGHER_BETTER: sum of stat across all players
      let total = 0;
      for (const p of allPlayers) {
        const v = p.stats[statKey];
        if (typeof v === "number" && !isNaN(v)) {
          total += v;
        }
      }
      result[statKey] = total;
    }
  }

  return result;
}

// ============================================================
// computeCategoryState
// ============================================================

export function computeCategoryState(input: ComputeCategoryStateInput): CategoryState {
  const {
    leagueId,
    undraftedPlayers,
    allUndraftedPlusDrafted,
    myDraftedPlayers,
    myTotals,
    categoryTargets,
    categoryDirections,
    totalPicksMade,
    totalPicksInDraft,
  } = input;

  // ----------------------------------------------------------
  // 1. Initial pool stats (module-level cache, keyed by leagueId)
  // ----------------------------------------------------------
  if (leagueId !== cachedLeagueId) {
    cachedLeagueId = leagueId;
    cachedInitialPoolStats = computeInitialPoolStats(allUndraftedPlusDrafted, categoryDirections);
  }
  const initialPoolStats = cachedInitialPoolStats;

  // ----------------------------------------------------------
  // 2. Scarcity weights
  // ----------------------------------------------------------
  const scarcityWeights: Record<string, number> = {};

  // Collect all stat keys present in undrafted or in categoryDirections
  const allStatKeys = new Set<string>([
    ...Object.keys(categoryDirections),
    ...undraftedPlayers.flatMap(p => Object.keys(p.stats)),
  ]);

  for (const statKey of allStatKeys) {
    const direction = categoryDirections[statKey] ?? "HIGHER_BETTER";
    const initialVal = initialPoolStats[statKey] ?? 0;

    if (direction === "LOWER_BETTER") {
      // ERA, WHIP: use pool median of undrafted pitchers with IP > 0
      const remainingVals = undraftedPlayers
        .filter(p => (p.stats["IP"] ?? 0) > 0)
        .map(p => p.stats[statKey])
        .filter((v): v is number => typeof v === "number" && !isNaN(v) && v > 0);
      const remainingMedian = remainingVals.length > 0 ? median(remainingVals) : 0;
      const denominator = Math.max(0.01, initialVal);
      // Inverted: when remaining pool gets WORSE (higher ERA), ratio = initial/remaining < 1
      // → weight = 1 + (1 - ratio) > 1 (scarcity of good pitching increases)
      const ratio = denominator / Math.max(0.01, remainingMedian);
      scarcityWeights[statKey] = clamp(1 + (1 - ratio), 1.0, 2.0);
    } else {
      // HIGHER_BETTER: sum of stat in undrafted pool
      let remainingTotal = 0;
      for (const p of undraftedPlayers) {
        const v = p.stats[statKey];
        if (typeof v === "number" && !isNaN(v)) {
          remainingTotal += v;
        }
      }
      const denominator = Math.max(1, initialVal);
      const ratio = remainingTotal / denominator;
      scarcityWeights[statKey] = clamp(1 + (1 - ratio), 1.0, 2.0);
    }
  }

  // ----------------------------------------------------------
  // 3. Pace ratios and force acquisition categories
  // ----------------------------------------------------------
  const paceRatios: Record<string, number> = {};
  const forceAcquisitionCategories: string[] = [];
  const midDraftThreshold = totalPicksInDraft * 0.20;

  for (const statKey of Object.keys(categoryDirections)) {
    const direction = categoryDirections[statKey];
    const myTotal = myTotals[statKey] ?? 0;
    const target = categoryTargets[statKey] ?? 0;

    let paceRatio = 1.0;

    if (direction === "LOWER_BETTER") {
      // Inverted: target/myTotal (lower actual = better pace → higher ratio)
      if (myTotal > 0 && target > 0) {
        paceRatio = target / myTotal;
      } else {
        paceRatio = 1.0;
      }
    } else {
      // HIGHER_BETTER: myTotal/target
      if (target > 0) {
        paceRatio = myTotal / target;
      } else {
        paceRatio = 1.0;
      }
    }

    paceRatios[statKey] = paceRatio;

    // Force acquisition: pace < 0.80 AND mid-draft (> 20% complete)
    if (paceRatio < 0.80 && totalPicksMade > midDraftThreshold) {
      forceAcquisitionCategories.push(statKey);
    }
  }

  // ----------------------------------------------------------
  // 4. Surplus pool
  // ----------------------------------------------------------
  let surplusPool = 0;
  for (const pick of myDraftedPlayers) {
    if (pick.fgDollars > 0) {
      const surplus = Math.max(0, pick.fgDollars - pick.paidDollars);
      surplusPool += surplus;
    }
  }

  // ----------------------------------------------------------
  // 5. Cliff detection
  // ----------------------------------------------------------
  const cliffSet: string[] = [];

  for (const statKey of CLIFF_STAT_KEYS) {
    // Find undrafted players with meaningful contribution to this stat
    // Sort by the stat value descending to identify the top contributor per category
    const contributors = undraftedPlayers
      .filter(p => {
        const v = p.stats[statKey];
        return typeof v === "number" && v > 0;
      })
      .sort((a, b) => (b.stats[statKey] ?? 0) - (a.stats[statKey] ?? 0)); // sort by stat value descending

    if (contributors.length < 2) {
      // Not enough players to compute dropoff
      continue;
    }

    const topPlayer = contributors[0];
    const secondPlayer = contributors[1];
    const dropoff = topPlayer.dollars - (secondPlayer.dollars ?? 0);

    if (dropoff > 5) {
      cliffSet.push(topPlayer.normalizedName);
    }
  }

  // ----------------------------------------------------------
  // 6. Return CategoryState
  // ----------------------------------------------------------
  return {
    scarcityWeights,
    paceRatios,
    surplusPool,
    cliffPlayers: cliffSet,
    initialPoolStats,
    categoryDirections,
    forceAcquisitionCategories,
  };
}
