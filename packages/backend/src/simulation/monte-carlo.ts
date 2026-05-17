import type { Category, StatComponents } from "../../../shared/dist/index.js";
import {
  calculateFinalRate,
  PITCHING_STAT_KEYS,
} from "../../../shared/dist/index.js";
import {
  assignRanksWithTies,
  computeOverallRotoPoints,
} from "../utils/roto-ranking.js";
import { createRng } from "./prng.js";
import type { Rng } from "./prng.js";
import { buildAllOpportunityStreams } from "./opportunity.js";
import { applyChurnLayer } from "./churn.js";
import { simulateTeamRun } from "./daily-simulator.js";
import type {
  SimulationState,
  SimulationConfig,
  TeamOpportunityStream,
  TeamRunResult,
  MonteCarloResult,
  TeamFinishDistribution,
} from "./types.js";

const DEFAULT_RUNS = 500;

// ─── Category value computation ───────────────────────────────────────────────

function computeCategoryValue(
  category: Category,
  batterComponents: StatComponents,
  pitcherComponents: StatComponents,
): number {
  const isPitchingCat = PITCHING_STAT_KEYS.has(category.stat_key);
  const components = isPitchingCat ? pitcherComponents : batterComponents;

  if (category.type === "COUNTING") {
    return components[category.stat_key] ?? 0;
  }

  if (category.type === "RATE") {
    const formulaId = category.formula_id ?? category.stat_key.toLowerCase();
    try {
      return calculateFinalRate(formulaId, {}, components);
    } catch {
      return 0;
    }
  }

  return 0;
}

// ─── Per-category ranking ─────────────────────────────────────────────────────

function rankCategoryForRun(
  results: TeamRunResult[],
  category: Category,
): Array<{ teamId: number; rotoPoints: number }> {
  const values = results.map((r) => ({
    teamId: r.teamId,
    value: computeCategoryValue(
      category,
      r.batterComponents,
      r.pitcherComponents,
    ),
  }));

  values.sort((a, b) =>
    category.direction === "HIGHER_BETTER"
      ? b.value - a.value
      : a.value - b.value,
  );

  return assignRanksWithTies(values, results.length);
}

// ─── Single run execution ─────────────────────────────────────────────────────

function executeRun(
  state: SimulationState,
  streams: TeamOpportunityStream[],
  rng: Rng | null,
  enableChurn: boolean,
): TeamRunResult[] {
  return streams.map((stream) => {
    const teamInput = state.teams.find((t) => t.teamId === stream.teamId)!;
    const churned = applyChurnLayer(stream, rng, enableChurn);
    return simulateTeamRun(
      churned,
      teamInput.currentBatterComponents,
      teamInput.currentPitcherComponents,
      teamInput.gsUsed,
      state.gsCap,
      rng,
    );
  });
}

// ─── Roto point computation ───────────────────────────────────────────────────

function computeRunRotoPoints(
  results: TeamRunResult[],
  categories: Category[],
): Map<number, number> {
  const categoryRankings = categories.map((cat) =>
    rankCategoryForRun(results, cat),
  );
  return computeOverallRotoPoints(categoryRankings);
}

function computeFinishPositions(
  rotoPoints: Map<number, number>,
): Map<number, number> {
  const sorted = Array.from(rotoPoints.entries()).sort((a, b) => b[1] - a[1]);
  const ranks = new Map<number, number>();
  let prevPts = Infinity;
  let rank = 1;
  for (let i = 0; i < sorted.length; i++) {
    const [teamId, pts] = sorted[i];
    if (pts < prevPts) {
      rank = i + 1;
      prevPts = pts;
    }
    ranks.set(teamId, rank);
  }
  return ranks;
}

// ─── Statistics utilities ─────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

// ─── Result builder ───────────────────────────────────────────────────────────

interface BuildResultParams {
  leagueId: number;
  snapshotDate: string;
  projectionsRunId: number;
  seed: number;
  runs: number;
  teamIds: number[];
  teamNames: Map<number, string>;
  numTeams: number;
  categories: Category[];
  rotoPointsHistory: Map<number, number[]>;
  finishHistory: Map<number, number[]>;
  categoryValueHistory: Map<number, Map<string, number[]>>;
  deterministicRotoPoints: Record<number, number>;
}

function buildResult(params: BuildResultParams): MonteCarloResult {
  const {
    leagueId,
    snapshotDate,
    projectionsRunId,
    seed,
    runs,
    teamIds,
    teamNames,
    numTeams,
    categories,
    rotoPointsHistory,
    finishHistory,
    categoryValueHistory,
    deterministicRotoPoints,
  } = params;

  const teams: TeamFinishDistribution[] = teamIds.map((teamId) => {
    const rotoSeries = [...(rotoPointsHistory.get(teamId) ?? [])].sort(
      (a, b) => a - b,
    );
    const finishSeries = finishHistory.get(teamId) ?? [];
    const totalRuns = Math.max(finishSeries.length, 1);

    const finishProbabilities: number[] = new Array(numTeams).fill(0);
    for (const finish of finishSeries) {
      if (finish >= 1 && finish <= numTeams) {
        finishProbabilities[finish - 1] += 1 / totalRuns;
      }
    }

    const p1 = finishProbabilities[0] ?? 0;
    const pTop3 = finishProbabilities.slice(0, 3).reduce((s, p) => s + p, 0);
    const pTopHalf = finishProbabilities
      .slice(0, Math.ceil(numTeams / 2))
      .reduce((s, p) => s + p, 0);

    const catHistory = categoryValueHistory.get(teamId)!;
    const categoryP50: Record<string, number> = {};
    const categorySwing: Record<string, number> = {};
    for (const cat of categories) {
      const series = [...(catHistory.get(cat.category_id) ?? [])].sort(
        (a, b) => a - b,
      );
      categoryP50[cat.category_id] = percentile(series, 50);
      categorySwing[cat.category_id] =
        percentile(series, 90) - percentile(series, 10);
    }

    const mean =
      rotoSeries.length > 0
        ? rotoSeries.reduce((s, v) => s + v, 0) / rotoSeries.length
        : 0;

    return {
      teamId,
      teamName: teamNames.get(teamId) ?? `Team ${teamId}`,
      projectedRotoPoints: mean,
      rotoPointsP10: percentile(rotoSeries, 10),
      rotoPointsP50: percentile(rotoSeries, 50),
      rotoPointsP90: percentile(rotoSeries, 90),
      finishProbabilities,
      p1,
      pTop3,
      pTopHalf,
      categoryP50,
      categorySwing,
    };
  });

  return {
    leagueId,
    snapshotDate,
    projectionsRunId,
    seed,
    runs,
    computedAt: new Date().toISOString(),
    teams,
    calibration: { deterministicRotoPoints },
  };
}

// ─── Monte Carlo runner ───────────────────────────────────────────────────────

/**
 * Phase 107: Run Monte Carlo simulation for the full league (MC-01, MC-02, OPS-01).
 *
 * - Runs N stochastic simulations using a seeded PRNG for reproducibility (OPS-01)
 * - Deterministic baseline verifies alignment with StandingsProjectionAgent (SIM-02)
 * - Returns per-team finish distributions, roto-point intervals, and category
 *   swing ranges for downstream API and scenario evaluation (MC-02)
 */
export function runMonteCarlo(
  state: SimulationState,
  config: SimulationConfig = {},
): MonteCarloResult {
  const runs = config.runs ?? DEFAULT_RUNS;
  const seed = config.seed ?? 0;
  const enableChurn = config.enableChurn ?? true;
  const deterministic = config.deterministic ?? false;

  const teamIds = state.teams.map((t) => t.teamId);
  const teamNames = new Map(state.teams.map((t) => [t.teamId, t.teamName]));
  const numTeams = state.teams.length;

  // Pre-compute active/bench assignments once (reused across all runs)
  const streams = buildAllOpportunityStreams(state);

  // Deterministic baseline run (rng = null: no noise, no churn)
  const deterministicResults = executeRun(state, streams, null, false);
  const deterministicRotoPoints = computeRunRotoPoints(
    deterministicResults,
    state.categories,
  );

  if (deterministic) {
    // Deterministic mode: single run, no sampling (SIM-02)
    const finishPositions = computeFinishPositions(deterministicRotoPoints);
    return buildResult({
      leagueId: state.leagueId,
      snapshotDate: state.snapshotDate,
      projectionsRunId: state.projectionsRunId,
      seed,
      runs: 1,
      teamIds,
      teamNames,
      numTeams,
      categories: state.categories,
      rotoPointsHistory: new Map(
        teamIds.map((id) => [id, [deterministicRotoPoints.get(id) ?? 0]]),
      ),
      finishHistory: new Map(
        teamIds.map((id) => [id, [finishPositions.get(id) ?? numTeams]]),
      ),
      categoryValueHistory: buildDeterministicCategoryHistory(
        deterministicResults,
        state.categories,
        teamIds,
      ),
      deterministicRotoPoints: Object.fromEntries(
        deterministicRotoPoints.entries(),
      ),
    });
  }

  // Stochastic runs
  const rotoPointsHistory = new Map<number, number[]>(
    teamIds.map((id) => [id, []]),
  );
  const finishHistory = new Map<number, number[]>(
    teamIds.map((id) => [id, []]),
  );
  const categoryValueHistory = new Map<number, Map<string, number[]>>(
    teamIds.map((id) => [
      id,
      new Map(state.categories.map((c) => [c.category_id, []])),
    ]),
  );

  const rng = createRng(seed);

  for (let run = 0; run < runs; run++) {
    const results = executeRun(state, streams, rng, enableChurn);
    const rotoPoints = computeRunRotoPoints(results, state.categories);
    const finishPositions = computeFinishPositions(rotoPoints);

    for (const teamId of teamIds) {
      rotoPointsHistory.get(teamId)!.push(rotoPoints.get(teamId) ?? 0);
      finishHistory.get(teamId)!.push(finishPositions.get(teamId) ?? numTeams);

      const catHistory = categoryValueHistory.get(teamId)!;
      const result = results.find((r) => r.teamId === teamId)!;
      for (const cat of state.categories) {
        const val = computeCategoryValue(
          cat,
          result.batterComponents,
          result.pitcherComponents,
        );
        catHistory.get(cat.category_id)!.push(val);
      }
    }
  }

  return buildResult({
    leagueId: state.leagueId,
    snapshotDate: state.snapshotDate,
    projectionsRunId: state.projectionsRunId,
    seed,
    runs,
    teamIds,
    teamNames,
    numTeams,
    categories: state.categories,
    rotoPointsHistory,
    finishHistory,
    categoryValueHistory,
    deterministicRotoPoints: Object.fromEntries(
      deterministicRotoPoints.entries(),
    ),
  });
}

function buildDeterministicCategoryHistory(
  results: TeamRunResult[],
  categories: Category[],
  teamIds: number[],
): Map<number, Map<string, number[]>> {
  const history = new Map<number, Map<string, number[]>>(
    teamIds.map((id) => [
      id,
      new Map(categories.map((c) => [c.category_id, []])),
    ]),
  );
  for (const result of results) {
    const catHistory = history.get(result.teamId)!;
    for (const cat of categories) {
      const val = computeCategoryValue(
        cat,
        result.batterComponents,
        result.pitcherComponents,
      );
      catHistory.get(cat.category_id)!.push(val);
    }
  }
  return history;
}
