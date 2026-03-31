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

/** Number of Monte Carlo simulation runs */
const MC_RUNS = 500;

/**
 * Box-Muller transform: generate standard normal random variable.
 * Returns a value from N(0,1).
 */
function randn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

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

/**
 * Team projection data for Monte Carlo simulation.
 */
export interface TeamCategoryValue {
  teamId: number;
  categoryId: string;
  projectedValue: number;
  confidence?: ConfidenceInterval;
}

/**
 * Monte Carlo simulation for overall roto point confidence intervals.
 *
 * For each simulation run:
 *   1. Perturb each team's per-category projected value using their confidence interval
 *   2. Rank all teams per category, assign roto points
 *   3. Sum roto points per team
 *   4. Record each team's total roto points
 *
 * After all runs: compute P10/P50/P90 from the distribution of total points per team.
 *
 * This captures the key insight that roto point uncertainty depends on how close
 * teams are to each other — a team barely leading in HR has high downside risk,
 * while a team crushing ERA has a locked-in advantage.
 *
 * @param teamCategoryValues - All teams' per-category projected values with confidence
 * @param categories - Category metadata (direction: HIGHER_BETTER or LOWER_BETTER)
 * @param numTeams - Total teams in the league
 * @returns Map of teamId → ConfidenceInterval for overall roto points
 */
export function monteCarloRotoPoints(
  teamCategoryValues: TeamCategoryValue[],
  categories: Array<{ categoryId: string; direction: "HIGHER_BETTER" | "LOWER_BETTER" }>,
  numTeams: number,
): Map<number, ConfidenceInterval> {
  // Build lookup: categoryId → teamId → { projectedValue, sd }
  const teamIds = [...new Set(teamCategoryValues.map((v) => v.teamId))];
  const catLookup = new Map<string, Map<number, { projected: number; sd: number }>>();

  for (const tcv of teamCategoryValues) {
    if (!catLookup.has(tcv.categoryId)) {
      catLookup.set(tcv.categoryId, new Map());
    }
    // Derive SD from confidence interval if available
    // SD = (P90 - P50) / 1.28 (since P90 = P50 + 1.28 * SD)
    let sd = 0;
    if (tcv.confidence && tcv.confidence.p90 > tcv.confidence.p10) {
      sd = (tcv.confidence.p90 - tcv.confidence.p50) / 1.28;
    }
    catLookup.get(tcv.categoryId)!.set(tcv.teamId, {
      projected: tcv.projectedValue,
      sd,
    });
  }

  // Collect total roto points per team across all MC runs
  const pointsDistributions = new Map<number, number[]>();
  for (const tid of teamIds) {
    pointsDistributions.set(tid, []);
  }

  for (let run = 0; run < MC_RUNS; run++) {
    // Accumulate roto points for this run
    const runPoints = new Map<number, number>();
    for (const tid of teamIds) {
      runPoints.set(tid, 0);
    }

    for (const cat of categories) {
      const catTeams = catLookup.get(cat.categoryId);
      if (!catTeams) continue;

      // Generate perturbed values for each team in this category
      const perturbedValues: Array<{ teamId: number; value: number }> = [];
      for (const tid of teamIds) {
        const data = catTeams.get(tid);
        if (!data) {
          perturbedValues.push({ teamId: tid, value: 0 });
          continue;
        }
        // Perturb: value = projected + randn() * SD
        const perturbed = data.sd > 0
          ? data.projected + randn() * data.sd
          : data.projected;
        perturbedValues.push({ teamId: tid, value: perturbed });
      }

      // Rank by category direction
      perturbedValues.sort((a, b) =>
        cat.direction === "HIGHER_BETTER"
          ? b.value - a.value
          : a.value - b.value,
      );

      // Assign roto points: rank 1 gets numTeams points, rank N gets 1
      for (let i = 0; i < perturbedValues.length; i++) {
        const rotoPoints = numTeams - i;
        const current = runPoints.get(perturbedValues[i].teamId) ?? 0;
        runPoints.set(perturbedValues[i].teamId, current + rotoPoints);
      }
    }

    // Record this run's total points per team
    for (const [tid, points] of runPoints) {
      pointsDistributions.get(tid)!.push(points);
    }
  }

  // Compute P10/P50/P90 from distributions
  const result = new Map<number, ConfidenceInterval>();
  for (const [tid, dist] of pointsDistributions) {
    dist.sort((a, b) => a - b);
    const p10Idx = Math.floor(dist.length * 0.10);
    const p50Idx = Math.floor(dist.length * 0.50);
    const p90Idx = Math.floor(dist.length * 0.90);
    result.set(tid, {
      p10: dist[p10Idx],
      p50: dist[p50Idx],
      p90: dist[Math.min(p90Idx, dist.length - 1)],
    });
  }

  return result;
}
