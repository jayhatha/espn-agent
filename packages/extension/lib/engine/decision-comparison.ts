/**
 * decision-comparison.ts
 *
 * Standings-based bid vs pass evaluation using forward draft simulation.
 *
 * Exported functions:
 *   aggregateOutcomes — compute SimulationOutcome from per-simulation roto point arrays
 *   compareDecisions  — run N simulations per candidate action, return DecisionComparison
 *
 * Design notes:
 * - Uses 200 simsPerDecision by default (per Phase 28 research)
 * - Temperature default: 1.0 (normal diversity, per research recommendation)
 * - For "bid" actions: deduct bidPrice from myTeam budget, draft player to myTeam, then simulate
 * - For "pass" actions: remove player from pool (simulates opponent winning), then simulate
 * - recommendedAction = label with highest winProbability (tie-break: highest expectedRotoPts)
 *
 * Pure function: no Zustand reads, no DOM access, no side effects.
 */

import type { Category } from "@espn-fantasy/shared";
import type {
  PoolPlayer,
  SimDraftState,
  CandidateAction,
  SimulationOutcome,
  DecisionComparison,
} from "./types";
import {
  cloneSimState,
  draftPlayerToTeam,
  simulateFullDraft,
  computeSimStandings,
} from "./draft-simulator";

// ============================================================
// aggregateOutcomes
// ============================================================

/**
 * Aggregate per-simulation roto point arrays into a SimulationOutcome.
 *
 * Rank is computed by counting teams with strictly more roto pts than myTeam.
 * Ties: if two teams share max roto pts, both get rank 1 (favorable to user).
 *
 * @param myTeamIndex    Index of user's team in each sim's roto point array
 * @param allSimRotoPts  allSimRotoPts[sim][team] = roto points for that team in that sim
 * @param teamCount      Total number of teams
 */
export function aggregateOutcomes(
  myTeamIndex: number,
  allSimRotoPts: number[][],
  teamCount: number,
): SimulationOutcome {
  const simCount = allSimRotoPts.length;

  if (simCount === 0) {
    return {
      expectedFinish: 0,
      winProbability: 0,
      top3Probability: 0,
      top6Probability: 0,
      expectedRotoPts: 0,
      stdDevRotoPts: 0,
      simCount: 0,
    };
  }

  const ranks: number[] = [];
  const myRotoPtsArr: number[] = [];

  for (const simPts of allSimRotoPts) {
    const myPts = simPts[myTeamIndex] ?? 0;
    myRotoPtsArr.push(myPts);

    // Rank = number of teams with strictly MORE roto pts + 1
    // (ties produce shared rank — favorable interpretation)
    let rank = 1;
    for (let i = 0; i < simPts.length; i++) {
      if (i !== myTeamIndex && (simPts[i] ?? 0) > myPts) {
        rank++;
      }
    }
    ranks.push(rank);
  }

  // Win probability: fraction where myTeam is rank 1
  const winCount = ranks.filter(r => r === 1).length;
  const top3Count = ranks.filter(r => r <= 3).length;
  const top6Count = ranks.filter(r => r <= 6).length;

  const expectedFinish = ranks.reduce((s, r) => s + r, 0) / simCount;
  const winProbability = winCount / simCount;
  const top3Probability = top3Count / simCount;
  const top6Probability = top6Count / simCount;

  const expectedRotoPts = myRotoPtsArr.reduce((s, v) => s + v, 0) / simCount;
  const variance = myRotoPtsArr.reduce((s, v) => s + Math.pow(v - expectedRotoPts, 2), 0) / simCount;
  const stdDevRotoPts = Math.sqrt(variance);

  return {
    expectedFinish,
    winProbability,
    top3Probability,
    top6Probability,
    expectedRotoPts,
    stdDevRotoPts,
    simCount,
  };
}

// ============================================================
// compareDecisions
// ============================================================

/**
 * Compare candidate actions using forward draft simulation.
 *
 * For each candidate action:
 * 1. Clone base state
 * 2. Apply action:
 *    - "bid": draft player to myTeam at bidPrice (deduct from budget, fill slot)
 *    - "pass": remove player from available indices (opponent wins them)
 * 3. Run simsPerDecision full-draft simulations
 * 4. Collect myTeam roto points per sim
 * 5. Call aggregateOutcomes to get SimulationOutcome
 *
 * recommendedAction = label of decision with highest winProbability.
 * Tie-break: highest expectedRotoPts.
 *
 * @param candidateActions  List of actions to compare
 * @param baseState         Starting draft state (will be cloned per action)
 * @param players           Full player pool (read-only)
 * @param sgpValues         Parallel SGP array (read-only)
 * @param categories        League scoring categories
 * @param simsPerDecision   Number of simulations per action (default 200)
 * @param temperature       Softmax temperature (default 1.0)
 */
export function compareDecisions(
  candidateActions: CandidateAction[],
  baseState: SimDraftState,
  players: PoolPlayer[],
  sgpValues: number[],
  categories: Category[],
  simsPerDecision: number = 200,
  temperature: number = 1.0,
): DecisionComparison {
  const startTime = Date.now();

  if (candidateActions.length === 0) {
    return {
      decisions: [],
      recommendedAction: "",
      computeTimeMs: Date.now() - startTime,
    };
  }

  const decisions: Array<{ label: string; outcome: SimulationOutcome }> = [];

  for (const action of candidateActions) {
    // Clone state for this action
    const actionState = cloneSimState(baseState);
    const myTeamIndex = actionState.myTeamIndex;

    // Apply action to the cloned state
    if (action.type === "bid" && action.playerIndex !== undefined && action.bidPrice !== undefined) {
      // Bid: draft player to myTeam at bidPrice
      // Override player.dollars for this state to reflect the actual bid price
      const originalDollars = players[action.playerIndex]?.dollars;
      if (players[action.playerIndex]) {
        // Temporarily set dollars to bidPrice for the draft call
        const playerForBid: PoolPlayer = {
          ...players[action.playerIndex],
          dollars: action.bidPrice,
        };
        // Build a modified players array for the bid scenario
        const modifiedPlayers = [...players];
        modifiedPlayers[action.playerIndex] = playerForBid;

        draftPlayerToTeam(actionState, myTeamIndex, action.playerIndex, modifiedPlayers);
      }
    } else if (action.type === "pass" && action.playerIndex !== undefined) {
      // Pass: remove player from available (opponent wins them)
      actionState.availableIndices.delete(action.playerIndex);
    }

    // Run simsPerDecision simulations
    const allSimRotoPts: number[][] = [];

    for (let s = 0; s < simsPerDecision; s++) {
      const completed = simulateFullDraft(players, sgpValues, categories, actionState, temperature);
      const rotoPts = computeSimStandings(completed.teamStates, categories);
      allSimRotoPts.push(rotoPts);
    }

    const outcome = aggregateOutcomes(myTeamIndex, allSimRotoPts, actionState.teamStates.length);
    decisions.push({ label: action.label, outcome });
  }

  // Find recommended action: highest winProbability, tie-break by expectedRotoPts
  let bestDecision = decisions[0];
  for (const d of decisions) {
    if (
      d.outcome.winProbability > bestDecision.outcome.winProbability ||
      (d.outcome.winProbability === bestDecision.outcome.winProbability &&
        d.outcome.expectedRotoPts > bestDecision.outcome.expectedRotoPts)
    ) {
      bestDecision = d;
    }
  }

  return {
    decisions,
    recommendedAction: bestDecision?.label ?? "",
    computeTimeMs: Date.now() - startTime,
  };
}
