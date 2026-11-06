/**
 * Phase 108: Scenario Evaluator — pure deterministic scoring helpers.
 *
 * Accepts a ScenarioMutation (waiver add/drop or bilateral trade) against a
 * canonical SimulationState and returns deterministic legality, blocking issues,
 * per-category deltas, and overall roto deltas for both teams (for trades).
 *
 * No DB access. No Monte Carlo randomness. Safe to call multiple times with
 * different mutations against the same cached baseline state.
 */

import type { StatComponents, Category } from "../../../shared/dist/index.js";
import {
  calculateFinalRate,
  PITCHING_STAT_KEYS,
} from "../../../shared/dist/index.js";
import { buildTeamOpportunityStream } from "./opportunity.js";
import { simulateTeamRun } from "./daily-simulator.js";
import { allocateProjections } from "../projection/allocator.js";
import type { RosteredPlayer, RosterGap } from "../projection/types.js";
import type {
  SimulationState,
  TeamSimInput,
  TeamRunResult,
  WaiverMutation,
  TradeMutation,
  ScenarioMutation,
  ScenarioEvaluationResult,
  CategoryDeltaMap,
} from "./types.js";

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Compute the category value from a deterministic team run result.
 */
function computeCategoryValue(
  category: Category,
  result: TeamRunResult,
): number {
  const isPitching = PITCHING_STAT_KEYS.has(category.stat_key);
  const components = isPitching
    ? result.pitcherComponents
    : result.batterComponents;

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

/**
 * Run one team through the deterministic simulation (rng = null).
 */
function runTeamDeterministic(
  teamInput: TeamSimInput,
  state: SimulationState,
): TeamRunResult {
  const stream = buildTeamOpportunityStream(teamInput, state);
  return simulateTeamRun(
    stream,
    teamInput.currentBatterComponents,
    teamInput.currentPitcherComponents,
    teamInput.gsUsed,
    state.gsCap,
    null, // deterministic
  );
}

/**
 * Compute per-category roto points for all teams, then return:
 * - rotoPoints map: teamId → total roto points
 * - categoryPoints map: teamId → categoryId → roto points
 */
function computeRotoPoints(
  allResults: Map<number, TeamRunResult>,
  categories: Category[],
  numTeams: number,
): {
  rotoPoints: Map<number, number>;
  categoryPoints: Map<number, CategoryDeltaMap>;
} {
  const rotoPoints = new Map<number, number>();
  const categoryPoints = new Map<number, CategoryDeltaMap>();

  for (const teamId of allResults.keys()) {
    rotoPoints.set(teamId, 0);
    categoryPoints.set(teamId, {});
  }

  for (const category of categories) {
    const values = Array.from(allResults.entries()).map(([teamId, result]) => ({
      teamId,
      value: computeCategoryValue(category, result),
    }));

    const lowerBetter = category.direction === "LOWER_BETTER";
    values.sort((a, b) =>
      lowerBetter ? a.value - b.value : b.value - a.value,
    );

    // Assign roto points: rank 1 = numTeams pts, rank numTeams = 1 pt
    // Handle ties: tied teams share average of the points they would have received
    let i = 0;
    while (i < values.length) {
      let j = i;
      while (j + 1 < values.length && values[j + 1].value === values[i].value) {
        j++;
      }
      // Tied ranks i+1 through j+1
      let totalPts = 0;
      for (let k = i; k <= j; k++) {
        totalPts += numTeams - k;
      }
      const avgPts = totalPts / (j - i + 1);

      for (let k = i; k <= j; k++) {
        const { teamId } = values[k];
        rotoPoints.set(teamId, (rotoPoints.get(teamId) ?? 0) + avgPts);
        const catMap = categoryPoints.get(teamId)!;
        catMap[category.category_id] = avgPts;
      }
      i = j + 1;
    }
  }

  return { rotoPoints, categoryPoints };
}

/**
 * Run full deterministic simulation for all teams and return indexed results.
 */
function runBaseline(state: SimulationState): Map<number, TeamRunResult> {
  const results = new Map<number, TeamRunResult>();
  for (const team of state.teams) {
    results.set(team.teamId, runTeamDeterministic(team, state));
  }
  return results;
}

/**
 * Compute delta overall roto points for a team given baseline and mutated run results.
 */
function computeDelta(
  baselineResults: Map<number, TeamRunResult>,
  mutatedResults: Map<number, TeamRunResult>,
  teamId: number,
  categories: Category[],
  numTeams: number,
): {
  deltaOverallPoints: number;
  categoryDeltas: CategoryDeltaMap;
} {
  // Merge: baseline for all teams except the mutated one(s)
  const combinedResults = new Map<number, TeamRunResult>(baselineResults);
  for (const [tid, result] of mutatedResults.entries()) {
    combinedResults.set(tid, result);
  }

  const { rotoPoints: baseRoto, categoryPoints: baseCatPoints } =
    computeRotoPoints(baselineResults, categories, numTeams);
  const { rotoPoints: mutRoto, categoryPoints: mutCatPoints } =
    computeRotoPoints(combinedResults, categories, numTeams);

  const deltaOverallPoints =
    (mutRoto.get(teamId) ?? 0) - (baseRoto.get(teamId) ?? 0);
  const categoryDeltas: CategoryDeltaMap = {};

  for (const cat of categories) {
    const before = baseCatPoints.get(teamId)?.[cat.category_id] ?? 0;
    const after = mutCatPoints.get(teamId)?.[cat.category_id] ?? 0;
    categoryDeltas[cat.category_id] = after - before;
  }

  return { deltaOverallPoints, categoryDeltas };
}

// ─── Legality helpers ─────────────────────────────────────────────────────────

/**
 * Apply a waiver mutation to a TeamSimInput, returning the mutated copy.
 * addPlayerPositions + addPlayerProjection must be supplied for the added player.
 */
function applyWaiverMutation(
  team: TeamSimInput,
  mutation: WaiverMutation,
): TeamSimInput {
  const newRoster: RosteredPlayer[] = team.roster
    .filter((p) => p.playerId !== mutation.dropPlayerId)
    .concat(
      mutation.addPlayerPositions.length > 0
        ? [
            {
              playerId: mutation.addPlayerId,
              positions: mutation.addPlayerPositions,
              rosterStatus: "active",
              rosterSlot: mutation.addPlayerPositions[0] ?? "BN",
              projectedComponents: mutation.addPlayerProjection ?? null,
            },
          ]
        : [],
    );

  const newProjections = new Map(team.playerProjections);
  newProjections.delete(mutation.dropPlayerId);
  if (mutation.addPlayerProjection) {
    newProjections.set(mutation.addPlayerId, mutation.addPlayerProjection);
  }

  return {
    ...team,
    roster: newRoster,
    playerProjections: newProjections,
  };
}

/**
 * Apply a trade mutation to user and partner teams, returning both mutated copies.
 */
function applyTradeMutation(
  userTeam: TeamSimInput,
  partnerTeam: TeamSimInput,
  mutation: TradeMutation,
): { mutatedUser: TeamSimInput; mutatedPartner: TeamSimInput } {
  const giveSet = new Set(mutation.givePlayerIds);
  const receiveSet = new Set(mutation.receivePlayerIds);

  // Players being given: extract from user team (they move to partner)
  const givenPlayers = userTeam.roster.filter((p) => giveSet.has(p.playerId));
  const givenProjections = new Map<number, StatComponents>();
  for (const p of givenPlayers) {
    const proj = userTeam.playerProjections.get(p.playerId);
    if (proj) givenProjections.set(p.playerId, proj);
  }

  // Players being received: extract from partner team (they move to user)
  const receivedPlayers = partnerTeam.roster.filter((p) =>
    receiveSet.has(p.playerId),
  );
  const receivedProjections = new Map<number, StatComponents>();
  for (const p of receivedPlayers) {
    const proj = partnerTeam.playerProjections.get(p.playerId);
    if (proj) receivedProjections.set(p.playerId, proj);
  }

  // Mutated user team
  const userRoster = userTeam.roster
    .filter((p) => !giveSet.has(p.playerId))
    .concat(receivedPlayers);
  const userProjections = new Map(userTeam.playerProjections);
  for (const id of giveSet) userProjections.delete(id);
  for (const [id, proj] of receivedProjections) userProjections.set(id, proj);

  // Mutated partner team
  const partnerRoster = partnerTeam.roster
    .filter((p) => !receiveSet.has(p.playerId))
    .concat(givenPlayers);
  const partnerProjections = new Map(partnerTeam.playerProjections);
  for (const id of receiveSet) partnerProjections.delete(id);
  for (const [id, proj] of givenProjections) partnerProjections.set(id, proj);

  return {
    mutatedUser: {
      ...userTeam,
      roster: userRoster,
      playerProjections: userProjections,
    },
    mutatedPartner: {
      ...partnerTeam,
      roster: partnerRoster,
      playerProjections: partnerProjections,
    },
  };
}

/**
 * Check whether the mutated roster can fill all required starting slots.
 * Uses allocateProjections to detect gaps.
 */
function checkLegality(
  mutatedTeam: TeamSimInput,
  state: SimulationState,
): { isLegal: boolean; blockingIssues: string[]; gaps: RosterGap[] } {
  const projectionsByPlayerId = new Map<number, StatComponents>(
    mutatedTeam.playerProjections,
  );

  const result = allocateProjections({
    roster: mutatedTeam.roster,
    rosterSlots: state.rosterSlots,
    projectionsByPlayerId,
    gsUsed: mutatedTeam.gsUsed,
    gsCap: state.gsCap,
    projectionAsOfDate: state.projectionAsOfDate,
    snapshotDate: state.snapshotDate,
    seasonEndDate: state.seasonEndDate,
  });

  const gaps = result.gaps.filter((g) => g.severity === "empty");
  const blockingIssues = gaps.map(
    (g) => `Cannot fill ${g.slot} slot: ${g.suggestion}`,
  );

  return {
    isLegal: gaps.length === 0,
    blockingIssues,
    gaps,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluate a waiver or trade scenario deterministically against a SimulationState.
 *
 * - Recomputes only affected teams while reusing baseline results for unaffected teams.
 * - Legality and blocking issues come from allocator / gap detection.
 * - Trade mutations return both user delta and partner delta.
 *
 * @param state  Canonical SimulationState (snapshot-bound, from SeasonSimulationAgent.buildState)
 * @param mutation  The waiver add/drop or trade mutation to evaluate
 */
export function evaluateDeterministicScenario(
  state: SimulationState,
  mutation: ScenarioMutation,
): ScenarioEvaluationResult {
  const degradedReasons: string[] = [];
  const numTeams = state.teams.length;

  if (numTeams === 0 || state.categories.length === 0) {
    return {
      isLegal: false,
      blockingIssues: ["Simulation state has no teams or categories"],
      gaps: [],
      deltaOverallPoints: 0,
      categoryDeltas: {},
      degradedReasons: ["state_not_viable"],
    };
  }

  // ── Baseline: run all teams deterministically ──────────────────────────────
  const baselineResults = runBaseline(state);

  if (mutation.type === "waiver") {
    const userTeam = state.teams.find((t) => t.teamId === mutation.teamId);
    if (!userTeam) {
      return {
        isLegal: false,
        blockingIssues: [`Team ${mutation.teamId} not found in state`],
        gaps: [],
        deltaOverallPoints: 0,
        categoryDeltas: {},
        degradedReasons: ["team_not_found"],
      };
    }

    const mutatedUser = applyWaiverMutation(userTeam, mutation);

    // Legality check on mutated roster
    const { isLegal, blockingIssues, gaps } = checkLegality(mutatedUser, state);

    // Compute new run result for mutated user team
    const mutatedResults = new Map<number, TeamRunResult>([
      [mutation.teamId, runTeamDeterministic(mutatedUser, state)],
    ]);

    const { deltaOverallPoints, categoryDeltas } = computeDelta(
      baselineResults,
      mutatedResults,
      mutation.teamId,
      state.categories,
      numTeams,
    );

    return {
      isLegal,
      blockingIssues,
      gaps,
      deltaOverallPoints,
      categoryDeltas,
      degradedReasons,
    };
  }

  // ── Trade mutation ────────────────────────────────────────────────────────
  const userTeam = state.teams.find((t) => t.teamId === mutation.userTeamId);
  const partnerTeam = state.teams.find(
    (t) => t.teamId === mutation.partnerTeamId,
  );

  if (!userTeam || !partnerTeam) {
    return {
      isLegal: false,
      blockingIssues: [
        `Team(s) not found: ${!userTeam ? mutation.userTeamId : ""} ${!partnerTeam ? mutation.partnerTeamId : ""}`.trim(),
      ],
      gaps: [],
      deltaOverallPoints: 0,
      categoryDeltas: {},
      degradedReasons: ["team_not_found"],
    };
  }

  const { mutatedUser, mutatedPartner } = applyTradeMutation(
    userTeam,
    partnerTeam,
    mutation,
  );

  // Legality check on user's post-trade roster
  const { isLegal, blockingIssues, gaps } = checkLegality(mutatedUser, state);

  // Compute mutated results for both teams
  const mutatedResults = new Map<number, TeamRunResult>([
    [mutation.userTeamId, runTeamDeterministic(mutatedUser, state)],
    [mutation.partnerTeamId, runTeamDeterministic(mutatedPartner, state)],
  ]);

  const userDelta = computeDelta(
    baselineResults,
    mutatedResults,
    mutation.userTeamId,
    state.categories,
    numTeams,
  );

  const partnerDelta = computeDelta(
    baselineResults,
    mutatedResults,
    mutation.partnerTeamId,
    state.categories,
    numTeams,
  );

  return {
    isLegal,
    blockingIssues,
    gaps,
    deltaOverallPoints: userDelta.deltaOverallPoints,
    categoryDeltas: userDelta.categoryDeltas,
    partnerDeltaOverallPoints: partnerDelta.deltaOverallPoints,
    partnerCategoryDeltas: partnerDelta.categoryDeltas,
    degradedReasons,
  };
}
