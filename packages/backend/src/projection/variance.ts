import type { StatComponents } from "../../../shared/dist/index.js";

/**
 * Coefficients of variation per stat type.
 * Source: Phase 79 PRD specification.
 * CV represents the expected standard deviation as a fraction of the mean.
 */
export const STAT_CV: Record<string, number> = {
  HR: 0.30,
  R: 0.20,
  RBI: 0.20,
  SB: 0.35,
  K: 0.15,
  W: 0.30,
  SV: 0.35,
  IP: 0.20,
  H: 0.15,     // hits (for rate stat component variance)
  AB: 0.10,    // plate appearances are relatively stable
  BB: 0.20,
  ER: 0.25,
  HA: 0.20,    // hits allowed
  BBA: 0.20,   // walks allowed
  HLD: 0.35,
  QS: 0.30,
};

/** Default CV for stat keys not in the STAT_CV table */
const DEFAULT_CV = 0.25;

/** Z-score for 10th percentile (normal distribution) */
const Z_P10 = -1.28;

/** Z-score for 90th percentile (normal distribution) */
const Z_P90 = 1.28;

export interface ConfidenceInterval {
  p10: number;
  p50: number;
  p90: number;
}

/**
 * Compute per-player variance for a single stat.
 * playerVariance = (projectedValue * CV)^2
 */
function playerVariance(projectedValue: number, statKey: string): number {
  if (projectedValue === 0) return 0;
  const cv = STAT_CV[statKey] ?? DEFAULT_CV;
  return (projectedValue * cv) ** 2;
}

/**
 * Compute confidence intervals for a set of counting stats.
 *
 * For each stat key:
 *   1. Sum player projections to get team total
 *   2. Sum player-level variances to get team variance
 *   3. Team SD = sqrt(team variance)
 *   4. P10/P90 = teamTotal +/- Z * teamSD (clamped at 0)
 *
 * @param playerProjections - Array of player stat component objects (already allocated/prorated)
 * @param statKeys - Which stat keys to compute intervals for
 * @returns Map of stat key -> ConfidenceInterval
 */
export function computeConfidenceIntervals(
  playerProjections: StatComponents[],
  statKeys: string[],
): Record<string, ConfidenceInterval> {
  const result: Record<string, ConfidenceInterval> = {};

  for (const statKey of statKeys) {
    let teamTotal = 0;
    let teamVariance = 0;

    for (const proj of playerProjections) {
      const value = proj[statKey] ?? 0;
      teamTotal += value;
      teamVariance += playerVariance(value, statKey);
    }

    const teamSD = Math.sqrt(teamVariance);

    result[statKey] = {
      p10: Math.max(0, teamTotal + Z_P10 * teamSD),
      p50: teamTotal,
      p90: teamTotal + Z_P90 * teamSD,
    };
  }

  return result;
}

/**
 * Compute confidence intervals for rate stats by varying components.
 *
 * For rate stats (ERA, WHIP, OPS, etc.), we can't directly apply CV to the rate.
 * Instead, compute the rate at P10 and P90 component levels.
 *
 * The function varies each component key independently using its CV, builds
 * optimistic (P10) and pessimistic (P90) component sets, then evaluates the
 * rate function at those extremes.
 *
 * For "lower is better" rates (ERA, WHIP), the p10/p90 of the interval
 * represents the best/worst case respectively, handled by taking min/max.
 *
 * @param totalComponents - Already-summed team components
 * @param rateFn - Function that computes the rate from components
 * @param componentKeys - Which component keys to vary
 * @returns ConfidenceInterval for the rate stat
 */
export function computeRateConfidence(
  totalComponents: StatComponents,
  rateFn: (components: StatComponents) => number,
  componentKeys: string[],
): ConfidenceInterval {
  const p50 = rateFn(totalComponents);

  // Build P10 and P90 component sets by varying each component
  const p10Components: StatComponents = { ...totalComponents };
  const p90Components: StatComponents = { ...totalComponents };

  for (const key of componentKeys) {
    const value = totalComponents[key] ?? 0;
    if (value === 0) continue;
    const cv = STAT_CV[key] ?? DEFAULT_CV;
    const sd = value * cv;
    p10Components[key] = Math.max(0, value + Z_P10 * sd);
    p90Components[key] = value + Z_P90 * sd;
  }

  // For "lower is better" rates (ERA, WHIP), P10 of the rate corresponds to
  // the favorable (low) end and P90 to the unfavorable (high) end.
  // min/max ensures P10 is always the lower bound of the interval.
  const rateAtP10Components = rateFn(p10Components);
  const rateAtP90Components = rateFn(p90Components);

  return {
    p10: Math.min(rateAtP10Components, rateAtP90Components),
    p50,
    p90: Math.max(rateAtP10Components, rateAtP90Components),
  };
}
