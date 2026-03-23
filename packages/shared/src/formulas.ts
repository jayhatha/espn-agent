import type { StatComponents, Category } from "./types.js";

/**
 * Component-based formulas for rate statistics
 * Per DESIGN_DOC.md §5.3
 */

export function calculateAVG(components: StatComponents): number {
  const { AB = 0, H = 0 } = components;
  if (AB === 0) return 0;
  return H / AB;
}

export function calculateOBP(components: StatComponents): number {
  const { AB = 0, H = 0, BB = 0, HBP = 0, SF = 0 } = components;
  const denominator = AB + BB + HBP + SF;
  if (denominator === 0) return 0;
  return (H + BB + HBP) / denominator;
}

export function calculateSLG(components: StatComponents): number {
  const { AB = 0, TB = 0 } = components;
  if (AB === 0) return 0;
  return TB / AB;
}

export function calculateOPS(components: StatComponents): number {
  return calculateOBP(components) + calculateSLG(components);
}

export function calculateERA(components: StatComponents): number {
  const { IP = 0, ER = 0 } = components;
  if (IP === 0) return 0;
  return (9 * ER) / IP;
}

export function calculateWHIP(components: StatComponents): number {
  const { IP = 0 } = components;
  // Prefer pitcher-specific keys (HA, BBA) to avoid collision with batter H/BB
  // Falls back to H/BB for backward compat with team daily data
  const hitsAllowed = components.HA ?? components.H ?? 0;
  const walksAllowed = components.BBA ?? components.BB ?? 0;
  if (IP === 0) return 0;
  return (hitsAllowed + walksAllowed) / IP;
}

export function calculateK9(components: StatComponents): number {
  const { IP = 0, K = 0 } = components;
  if (IP === 0) return 0;
  return (9 * K) / IP;
}

export function calculateWPCT(components: StatComponents): number {
  const { W = 0, L = 0 } = components;
  const total = W + L;
  if (total === 0) return 0;
  return W / total;
}

/**
 * Combine current-to-date and projected components
 */
export function combineComponents(
  current: StatComponents,
  projected: StatComponents,
): StatComponents {
  const result: StatComponents = {};
  const allKeys = new Set([...Object.keys(current), ...Object.keys(projected)]);

  for (const key of allKeys) {
    result[key] = (current[key] ?? 0) + (projected[key] ?? 0);
  }

  return result;
}

/**
 * Calculate final rate stat from combined components
 */
export function calculateFinalRate(
  formulaId: string,
  currentComponents: StatComponents,
  projectedComponents: StatComponents,
): number {
  const combined = combineComponents(currentComponents, projectedComponents);

  switch (formulaId) {
    case "avg":
      return calculateAVG(combined);
    case "obp":
      return calculateOBP(combined);
    case "slg":
      return calculateSLG(combined);
    case "ops":
      return calculateOPS(combined);
    case "era":
      return calculateERA(combined);
    case "whip":
      return calculateWHIP(combined);
    case "k9":
      return calculateK9(combined);
    case "wpct":
      return calculateWPCT(combined);
    default:
      throw new Error(`Unknown formula: ${formulaId}`);
  }
}

/**
 * Get required components for a formula
 */
export function getRequiredComponents(formulaId: string): string[] {
  switch (formulaId) {
    case "avg":
      return ["AB", "H"];
    case "obp":
      return ["AB", "H", "BB", "HBP", "SF"];
    case "slg":
      return ["AB", "TB"];
    case "ops":
      return ["AB", "H", "BB", "HBP", "SF", "TB"];
    case "era":
      return ["IP", "ER"];
    case "whip":
      return ["IP", "HA", "BBA"];
    case "k9":
      return ["IP", "K"];
    case "wpct":
      return ["W", "L"];
    default:
      return [];
  }
}

/**
 * VBD (Value Based Drafting) and SGP (Standings Gain Points) functions
 * Used for draft rankings and auction valuations
 */

/**
 * Calculate Standings Gain Points (SGP) for a single stat value
 * SGP = (value - mean) / stdDev
 * Returns how many standard deviations above/below mean
 */
export function calculateCategorySGP(
  statValue: number,
  allPlayerValues: number[]
): number {
  if (allPlayerValues.length === 0) return 0;

  const n = allPlayerValues.length;
  let sum = 0;
  let sumSq = 0;
  for (const val of allPlayerValues) {
    sum += val;
    sumSq += val * val;
  }
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return 0;

  return (statValue - mean) / stdDev;
}

/**
 * Calculate total SGP across all categories for a player
 * Handles both COUNTING and RATE stats with proper direction handling
 */
export function calculateTotalSGP(
  projection: StatComponents,
  allProjections: StatComponents[],
  categories: Array<{
    stat_key: string;
    type: "COUNTING" | "RATE" | "POINTS";
    direction: "HIGHER_BETTER" | "LOWER_BETTER";
    formula_id?: string;
  }>
): number {
  let totalSGP = 0;

  for (const category of categories) {
    let statValue: number;
    let allValues: number[];

    if (category.type === "COUNTING") {
      // Direct stat value for counting stats
      statValue = projection[category.stat_key] || 0;
      allValues = allProjections.map((p) => p[category.stat_key] || 0);
    } else if (category.type === "RATE" && category.formula_id) {
      // Calculate rate from components
      try {
        statValue = calculateFinalRate(category.formula_id, {}, projection);
        allValues = allProjections.map((p) => {
          try {
            return calculateFinalRate(category.formula_id!, {}, p);
          } catch {
            return 0;
          }
        });
      } catch {
        // Skip this category if rate calculation fails
        continue;
      }
    } else {
      // Skip unsupported category types
      continue;
    }

    // Calculate SGP for this category
    let sgp = calculateCategorySGP(statValue, allValues);

    // Invert SGP for LOWER_BETTER categories (ERA, WHIP)
    if (category.direction === "LOWER_BETTER") {
      sgp = -sgp;
    }

    totalSGP += sgp;
  }

  return totalSGP;
}

/**
 * Calculate replacement level index for a position
 * Returns the 1-based index of the replacement player
 */
export function getReplacementLevel(
  position: string,
  rosterSlots: Record<string, number>,
  totalTeams: number
): number {
  // Get slot count for this position
  let slotCount = rosterSlots[position] || 0;

  // Prorate shared/utility slots by typical usage to avoid double-counting
  // players who fill both a dedicated slot and a flex slot.
  // OF is NOT prorated — it has dedicated slots, not shared with other positions.
  if (position === "UTIL") {
    slotCount = (rosterSlots["UTIL"] || 0) * 0.2;
  } else if (position === "IF" || position === "MI") {
    slotCount = (rosterSlots[position] || 0) * 0.25;
  } else if (position === "CI") {
    slotCount = (rosterSlots[position] || 0) * 0.33;
  }

  // Total players at this position that would be rostered
  const totalRostered = slotCount * totalTeams;

  // AUDIT FIX: Replacement level is just after the last rostered player
  // Guard against invalid inputs (very small leagues or zero slots)
  return Math.max(1, Math.ceil(totalRostered) + 1);
}

/**
 * Calculate Value Based Drafting (VBD) score
 * VBD = player SGP - replacement level SGP
 * Returns 0 for players below replacement
 */
export function calculateVBD(
  playerSGP: number,
  replacementSGP: number
): number {
  const vbd = playerSGP - replacementSGP;
  return Math.max(0, vbd);
}

/**
 * Calculate total spending pool for auction drafts
 * Total budget minus minimum bids for all roster spots
 */
export function calculateSpendingPool(
  budget: number,
  totalTeams: number,
  rosterSize: number,
  minBid: number
): number {
  const totalBudget = budget * totalTeams;
  const minSpend = minBid * rosterSize * totalTeams;
  return totalBudget - minSpend;
}

/**
 * Convert VBD to auction dollar value
 * Proportional share of spending pool plus minimum bid
 */
export function calculateAuctionDollarValue(
  vbd: number,
  totalVBD: number,
  spendingPool: number,
  minBid: number
): number {
  if (totalVBD === 0) return minBid;

  const proportionalValue = (vbd / totalVBD) * spendingPool;
  const dollarValue = Math.round(proportionalValue + minBid);

  return Math.max(minBid, dollarValue);
}

// ─── Roto Math Functions ───────────────────────────────────────────────

export interface TeamCategoryProjection {
  teamId: number;
  teamName: string;
  value: number;
}

export interface MarginalGain {
  categoryId: string;
  categoryName: string;
  currentRank: number;
  currentRotoPoints: number;
  teamAbove: { teamId: number; teamName: string; value: number } | null;
  myValue: number;
  gap: number;
  potentialPointsGain: number;
  direction: "HIGHER_BETTER" | "LOWER_BETTER";
  difficulty: "easy" | "medium" | "hard" | "elite";
}

export interface AtRiskCategory {
  categoryId: string;
  categoryName: string;
  currentRank: number;
  currentRotoPoints: number;
  teamBelow: { teamId: number; teamName: string; value: number } | null;
  myValue: number;
  gap: number;
  riskLevel: "safe" | "watch" | "danger";
  direction: "HIGHER_BETTER" | "LOWER_BETTER";
}

/**
 * Rank teams by category value and assign roto points.
 * Mirrors backend StandingsProjectionAgent.rankAndStore() logic:
 * rotoPoints = numTeams - rank + 1
 */
export function interpolateRotoPoints(
  teamProjections: TeamCategoryProjection[],
  direction: "HIGHER_BETTER" | "LOWER_BETTER",
): Array<{ teamId: number; teamName: string; rank: number; rotoPoints: number }> {
  if (teamProjections.length === 0) return [];

  const sorted = [...teamProjections].sort((a, b) =>
    direction === "HIGHER_BETTER" ? b.value - a.value : a.value - b.value,
  );
  const numTeams = sorted.length;
  return sorted.map((tp, i) => ({
    teamId: tp.teamId,
    teamName: tp.teamName,
    rank: i + 1,
    rotoPoints: numTeams - i,
  }));
}

/**
 * Compute the cheapest stat improvement needed to gain 1 roto point per category.
 * For each category, finds the team immediately above in rank and computes
 * the absolute gap. Results sorted by smallest gap first (cheapest improvement).
 *
 * For rate stats (ERA, WHIP), the gap is a raw rate differential.
 * Component-level guidance is deferred to future phases.
 */
export function computeMarginalGains(
  myTeamId: number,
  allTeamProjections: Map<string, TeamCategoryProjection[]>,
  categories: Array<{
    category_id: string;
    name: string;
    direction: "HIGHER_BETTER" | "LOWER_BETTER";
  }>,
): MarginalGain[] {
  const gains: MarginalGain[] = [];

  for (const cat of categories) {
    const projections = allTeamProjections.get(cat.category_id);
    if (!projections || projections.length === 0) continue;

    const ranked = interpolateRotoPoints(projections, cat.direction);
    const myEntry = ranked.find((r) => r.teamId === myTeamId);
    if (!myEntry) continue;

    const myProjection = projections.find((p) => p.teamId === myTeamId);
    if (!myProjection) continue;

    const myRankIndex = ranked.findIndex((r) => r.teamId === myTeamId);

    // Team above is the one at myRankIndex - 1 (better rank)
    let teamAbove: MarginalGain["teamAbove"] = null;
    let gap = 0;

    if (myRankIndex > 0) {
      const above = ranked[myRankIndex - 1];
      const aboveProjection = projections.find((p) => p.teamId === above.teamId);
      if (aboveProjection) {
        teamAbove = {
          teamId: above.teamId,
          teamName: above.teamName,
          value: aboveProjection.value,
        };
        gap = Math.abs(aboveProjection.value - myProjection.value);
      }
    }

    gains.push({
      categoryId: cat.category_id,
      categoryName: cat.name,
      currentRank: myEntry.rank,
      currentRotoPoints: myEntry.rotoPoints,
      teamAbove,
      myValue: myProjection.value,
      gap,
      potentialPointsGain: 1,
      direction: cat.direction,
      difficulty: "medium" as const, // placeholder, assigned below
    });
  }

  // Compute average gap for difficulty assignment (exclude rank 1 teams)
  const gapsWithTeamAbove = gains.filter((g) => g.teamAbove !== null && g.gap > 0);
  const avgGap =
    gapsWithTeamAbove.length > 0
      ? gapsWithTeamAbove.reduce((sum, g) => sum + g.gap, 0) / gapsWithTeamAbove.length
      : 1;

  for (const gain of gains) {
    if (gain.teamAbove === null) {
      gain.difficulty = "elite"; // Already rank 1
    } else if (gain.gap < 0.5 * avgGap) {
      gain.difficulty = "easy";
    } else if (gain.gap < 1.0 * avgGap) {
      gain.difficulty = "medium";
    } else if (gain.gap < 2.0 * avgGap) {
      gain.difficulty = "hard";
    } else {
      gain.difficulty = "elite";
    }
  }

  // Sort by gap ascending (cheapest improvement first)
  // Rank 1 teams (gap = 0) go last since they can't improve
  gains.sort((a, b) => {
    if (a.teamAbove === null && b.teamAbove !== null) return 1;
    if (a.teamAbove !== null && b.teamAbove === null) return -1;
    return a.gap - b.gap;
  });

  return gains;
}

/**
 * Compute categories where roto points are at risk of being lost.
 * For each category, finds the team immediately BELOW in rank and computes
 * the gap. Small gaps = danger (team closing in from behind).
 * Sorted by gap ascending (most at-risk first).
 */
export function computeAtRiskCategories(
  myTeamId: number,
  allTeamProjections: Map<string, TeamCategoryProjection[]>,
  categories: Array<{
    category_id: string;
    name: string;
    direction: "HIGHER_BETTER" | "LOWER_BETTER";
  }>,
): AtRiskCategory[] {
  const risks: AtRiskCategory[] = [];

  for (const cat of categories) {
    const projections = allTeamProjections.get(cat.category_id);
    if (!projections || projections.length === 0) continue;

    const ranked = interpolateRotoPoints(projections, cat.direction);
    const myEntry = ranked.find((r) => r.teamId === myTeamId);
    if (!myEntry) continue;

    const myProjection = projections.find((p) => p.teamId === myTeamId);
    if (!myProjection) continue;

    const myRankIndex = ranked.findIndex((r) => r.teamId === myTeamId);

    // Team below is the one at myRankIndex + 1 (worse rank, trying to catch up)
    let teamBelow: AtRiskCategory["teamBelow"] = null;
    let gap = 0;

    if (myRankIndex < ranked.length - 1) {
      const below = ranked[myRankIndex + 1];
      const belowProjection = projections.find((p) => p.teamId === below.teamId);
      if (belowProjection) {
        teamBelow = {
          teamId: below.teamId,
          teamName: below.teamName,
          value: belowProjection.value,
        };
        gap = Math.abs(myProjection.value - belowProjection.value);
      }
    }

    risks.push({
      categoryId: cat.category_id,
      categoryName: cat.name,
      currentRank: myEntry.rank,
      currentRotoPoints: myEntry.rotoPoints,
      teamBelow,
      myValue: myProjection.value,
      gap,
      riskLevel: "safe" as const, // placeholder, assigned below
      direction: cat.direction,
    });
  }

  // Compute average gap for risk assignment (exclude last-place teams)
  const gapsWithTeamBelow = risks.filter((r) => r.teamBelow !== null && r.gap > 0);
  const avgGap =
    gapsWithTeamBelow.length > 0
      ? gapsWithTeamBelow.reduce((sum, r) => sum + r.gap, 0) / gapsWithTeamBelow.length
      : 1;

  for (const risk of risks) {
    if (risk.teamBelow === null) {
      risk.riskLevel = "safe"; // Already last, no one below
    } else if (risk.gap < 0.33 * avgGap) {
      risk.riskLevel = "danger";
    } else if (risk.gap < 0.75 * avgGap) {
      risk.riskLevel = "watch";
    } else {
      risk.riskLevel = "safe";
    }
  }

  // Sort by gap ascending (most at-risk first)
  // Teams with no one below go last
  risks.sort((a, b) => {
    if (a.teamBelow === null && b.teamBelow !== null) return 1;
    if (a.teamBelow !== null && b.teamBelow === null) return -1;
    return a.gap - b.gap;
  });

  return risks;
}
