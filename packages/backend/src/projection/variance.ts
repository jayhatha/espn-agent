import type { StatComponents } from "../../../shared/dist/index.js";
import { assignRanksWithTies } from "../utils/roto-ranking.js";

/**
 * Coefficients of variation per stat type.
 * Source: Phase 79 PRD specification.
 * CV represents the expected standard deviation as a fraction of the mean.
 */
export const STAT_CV: Record<string, number> = {
  HR: 0.3,
  R: 0.2,
  RBI: 0.2,
  SB: 0.35,
  K: 0.15,
  W: 0.3,
  SV: 0.35,
  IP: 0.2,
  H: 0.15, // hits (for rate stat component variance)
  AB: 0.1, // plate appearances are relatively stable
  BB: 0.2,
  ER: 0.25,
  HA: 0.2, // hits allowed
  BBA: 0.2, // walks allowed
  HLD: 0.35,
  QS: 0.3,
};

/** Default CV for stat keys not in the STAT_CV table */
const DEFAULT_CV = 0.25;
const PITCHING_COMPONENT_KEYS = new Set([
  "IP",
  "ER",
  "HA",
  "BBA",
  "K",
  "W",
  "L",
  "SV",
  "HLD",
  "QS",
  "GS",
  "HRA",
]);
const BATTING_COMPONENT_KEYS = new Set([
  "AB",
  "H",
  "1B",
  "2B",
  "3B",
  "HR",
  "TB",
  "BB",
  "HBP",
  "SF",
  "R",
  "RBI",
  "SB",
]);

/** Z-scores for counting-stat normal approximation */
const Z_P10 = -1.28;
const Z_P90 = 1.28;

/** Number of Monte Carlo simulation runs */
const MC_RUNS = 500;

/**
 * Box-Muller transform: generate standard normal random variable.
 * Returns a value from N(0,1).
 */
function randn(): number {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

interface NormalSource {
  normal(): number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function noisyRate(rate: number, cv: number, rng: NormalSource): number {
  return Math.max(0, rate * (1 + cv * rng.normal()));
}

function sampleRateCount(
  value: number | undefined,
  baselineOpportunity: number,
  sampledOpportunity: number,
  statKey: string,
  rng: NormalSource,
): number {
  if (typeof value !== "number" || baselineOpportunity <= 0) return 0;
  return (
    noisyRate(
      value / baselineOpportunity,
      STAT_CV[statKey] ?? DEFAULT_CV,
      rng,
    ) * sampledOpportunity
  );
}

function sampleJointOutcomeCounts(
  first: number | undefined,
  second: number | undefined,
  baselineOpportunity: number,
  sampledOpportunity: number,
  capacity: number,
  firstKey: string,
  secondKey: string,
  rng: NormalSource,
): [number, number] {
  const baselineFirst = first ?? 0;
  const baselineSecond = second ?? 0;
  const baselineTotal = baselineFirst + baselineSecond;
  if (
    baselineTotal <= 0 ||
    baselineOpportunity <= 0 ||
    sampledOpportunity <= 0
  ) {
    return [0, 0];
  }
  const cv =
    (baselineFirst * (STAT_CV[firstKey] ?? DEFAULT_CV) +
      baselineSecond * (STAT_CV[secondKey] ?? DEFAULT_CV)) /
    baselineTotal;
  const sampledTotal = Math.min(
    capacity,
    noisyRate(baselineTotal / baselineOpportunity, cv, rng) *
      sampledOpportunity,
  );
  const firstShare = baselineFirst / baselineTotal;
  return [sampledTotal * firstShare, sampledTotal * (1 - firstShare)];
}

export function sampleCoherentComponents(
  components: StatComponents,
  rng: NormalSource,
): StatComponents {
  const sampled: StatComponents = {};
  const hasBatting = (components.AB ?? 0) > 0;
  const hasPitching = (components.IP ?? 0) > 0;

  if (hasBatting) {
    const baselineAB = components.AB ?? 0;
    const ab = Math.max(
      0,
      baselineAB * (1 + (STAT_CV.AB ?? 0.1) * rng.normal()),
    );
    const hitRate = clamp(
      noisyRate((components.H ?? 0) / baselineAB, 0.08, rng),
      0,
      1,
    );
    const hits = ab * hitRate;
    const baselineHits = Math.max(components.H ?? 0, 1e-9);
    const baselineTriples = components["3B"] ?? 0;
    const inferredDoubles = Math.max(
      0,
      (components.TB ?? components.H ?? 0) -
        (components.H ?? 0) -
        3 * (components.HR ?? 0) -
        2 * baselineTriples,
    );
    const baselineDoubles = components["2B"] ?? inferredDoubles;
    let homeRuns =
      hits *
      clamp(noisyRate((components.HR ?? 0) / baselineHits, 0.2, rng), 0, 1);
    let doubles =
      hits * clamp(noisyRate(baselineDoubles / baselineHits, 0.15, rng), 0, 1);
    let triples =
      hits * clamp(noisyRate(baselineTriples / baselineHits, 0.2, rng), 0, 1);
    const extraBaseHits = homeRuns + doubles + triples;
    if (extraBaseHits > hits && extraBaseHits > 0) {
      const scale = hits / extraBaseHits;
      homeRuns *= scale;
      doubles *= scale;
      triples *= scale;
    }
    const singles = Math.max(0, hits - homeRuns - doubles - triples);

    Object.assign(sampled, {
      AB: ab,
      H: hits,
      "1B": singles,
      "2B": doubles,
      "3B": triples,
      HR: homeRuns,
      TB: singles + 2 * doubles + 3 * triples + 4 * homeRuns,
    });

    const walks = sampleRateCount(components.BB, baselineAB, ab, "BB", rng);
    const hitByPitch = sampleRateCount(
      components.HBP,
      baselineAB,
      ab,
      "HBP",
      rng,
    );
    const sacrificeFlies = Math.min(
      ab,
      sampleRateCount(components.SF, baselineAB, ab, "SF", rng),
    );
    const timesOnBase = Math.min(ab, hits + walks + hitByPitch);
    const plateAppearances = ab + walks + hitByPitch + sacrificeFlies;
    Object.assign(sampled, {
      BB: walks,
      HBP: hitByPitch,
      SF: sacrificeFlies,
      SB: Math.min(
        timesOnBase,
        sampleRateCount(components.SB, baselineAB, ab, "SB", rng),
      ),
      R: Math.min(
        timesOnBase,
        sampleRateCount(components.R, baselineAB, ab, "R", rng),
      ),
      RBI: Math.min(
        4 * plateAppearances,
        sampleRateCount(components.RBI, baselineAB, ab, "RBI", rng),
      ),
    });
    for (const [key, value] of Object.entries(components)) {
      if (
        BATTING_COMPONENT_KEYS.has(key) ||
        PITCHING_COMPONENT_KEYS.has(key) ||
        typeof value !== "number"
      )
        continue;
      sampled[key] = value * (ab / baselineAB);
    }
  }

  if (hasPitching) {
    const baselineIP = components.IP ?? 0;
    const ip = Math.max(
      0,
      baselineIP * (1 + (STAT_CV.IP ?? 0.2) * rng.normal()),
    );
    sampled.IP = ip;
    for (const key of ["ER", "HA", "BBA"] as const) {
      const value = components[key];
      if (typeof value === "number") {
        sampled[key] =
          noisyRate(value / baselineIP, STAT_CV[key] ?? DEFAULT_CV, rng) * ip;
      }
    }
    const outs = ip * 3;
    const gs = Math.min(
      outs,
      sampleRateCount(components.GS, baselineIP, ip, "GS", rng),
    );
    const baselineAppearances = Math.max(
      components.G ?? 0,
      components.GS ?? 0,
      baselineIP / ((components.GS ?? 0) > 0 ? 5.5 : 1),
    );
    const appearances = Math.max(
      gs,
      typeof components.G === "number"
        ? sampleRateCount(components.G, baselineIP, ip, "G", rng)
        : baselineAppearances * (ip / baselineIP),
    );
    const reliefAppearances = Math.max(0, appearances - gs);
    const baselineReliefAppearances = Math.max(
      0,
      baselineAppearances - (components.GS ?? 0),
    );
    const [wins, losses] = sampleJointOutcomeCounts(
      components.W,
      components.L,
      baselineAppearances,
      appearances,
      appearances,
      "W",
      "L",
      rng,
    );
    const [saves, holds] = sampleJointOutcomeCounts(
      components.SV,
      components.HLD,
      baselineReliefAppearances,
      reliefAppearances,
      reliefAppearances,
      "SV",
      "HLD",
      rng,
    );
    Object.assign(sampled, {
      GS: gs,
      G: appearances,
      K: Math.min(
        outs,
        sampleRateCount(components.K, baselineIP, ip, "K", rng),
      ),
      W: wins,
      L: losses,
      SV: saves,
      HLD: holds,
      QS: Math.min(
        gs,
        sampleRateCount(components.QS, components.GS ?? 0, gs, "QS", rng),
      ),
    });
    if (typeof components.HRA === "number") {
      sampled.HRA = Math.min(
        sampled.HA ?? Number.POSITIVE_INFINITY,
        sampleRateCount(components.HRA, baselineIP, ip, "HRA", rng),
      );
    }
    for (const [key, value] of Object.entries(components)) {
      if (
        PITCHING_COMPONENT_KEYS.has(key) ||
        BATTING_COMPONENT_KEYS.has(key) ||
        sampled[key] !== undefined ||
        typeof value !== "number"
      )
        continue;
      sampled[key] = value * (ip / baselineIP);
    }
  }

  if (!hasBatting && !hasPitching) {
    const opportunityFactor = Math.max(0, 1 + DEFAULT_CV * rng.normal());
    for (const [key, value] of Object.entries(components)) {
      if (typeof value === "number") {
        sampled[key] = value * opportunityFactor;
      }
    }
  }

  return sampled;
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = fraction * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
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
  if (componentKeys.every((key) => (totalComponents[key] ?? 0) === 0)) {
    return { p10: p50, p50, p90: p50 };
  }
  const rng: NormalSource = { normal: randn };
  const rates = Array.from({ length: MC_RUNS }, () =>
    rateFn(sampleCoherentComponents(totalComponents, rng)),
  )
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  return {
    p10: percentile(rates, 0.1),
    p50,
    p90: percentile(rates, 0.9),
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
  categories: Array<{
    categoryId: string;
    direction: "HIGHER_BETTER" | "LOWER_BETTER";
  }>,
  numTeams: number,
): Map<number, ConfidenceInterval> {
  // Build lookup: categoryId → teamId → { projectedValue, sd }
  const teamIds = [...new Set(teamCategoryValues.map((v) => v.teamId))];
  const catLookup = new Map<
    string,
    Map<number, { projected: number; sd: number }>
  >();

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
        const perturbed =
          data.sd > 0 ? data.projected + randn() * data.sd : data.projected;
        perturbedValues.push({ teamId: tid, value: perturbed });
      }

      // Rank by category direction
      perturbedValues.sort((a, b) =>
        cat.direction === "HIGHER_BETTER"
          ? b.value - a.value
          : a.value - b.value,
      );

      for (const ranked of assignRanksWithTies(perturbedValues, numTeams)) {
        const current = runPoints.get(ranked.teamId) ?? 0;
        runPoints.set(ranked.teamId, current + ranked.rotoPoints);
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
    const p10Idx = Math.floor(dist.length * 0.1);
    const p50Idx = Math.floor(dist.length * 0.5);
    const p90Idx = Math.floor(dist.length * 0.9);
    result.set(tid, {
      p10: dist[p10Idx],
      p50: dist[p50Idx],
      p90: dist[Math.min(p90Idx, dist.length - 1)],
    });
  }

  return result;
}
