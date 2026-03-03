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
  const { IP = 0, H = 0, BB = 0 } = components;
  if (IP === 0) return 0;
  return (H + BB) / IP;
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
      return ["IP", "H", "BB"];
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

  // Calculate mean
  const sum = allPlayerValues.reduce((acc, val) => acc + val, 0);
  const mean = sum / allPlayerValues.length;

  // Calculate population standard deviation
  const squaredDiffs = allPlayerValues.map((val) => Math.pow(val - mean, 2));
  const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / allPlayerValues.length;
  const stdDev = Math.sqrt(variance);

  // Avoid division by zero
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
