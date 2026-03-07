/**
 * simulation-worker.ts
 *
 * Web Worker entry point for forward draft simulation (Phase 53).
 *
 * Runs the Monte Carlo forward simulation pipeline entirely off the main thread:
 *   - Baseline win probability (simsPerDecision simulations)
 *   - Decision comparison (bid vs pass) when a player is nominated
 *   - Nomination strategy (heuristic trap scoring)
 *   - Draft targets (top-5-by-SGP ranked by win probability)
 *
 * Message protocol:
 *   Receive: SimulationWorkerRequest (structured-cloneable — Sets/Maps converted to arrays/objects)
 *   Send:    SimulationWorkerResponse (with requestId echoed back for staleness detection)
 *
 * Design decisions:
 *   - Sets passed as number[] (converted back to Set<number> on receipt)
 *   - Maps passed as Record<string, V> or [string, V][] plain objects
 *   - All player data passed via message — worker does NOT import FanGraphs JSON
 *   - No Zustand reads, no DOM access, no side effects
 */

import type { Category } from "@espn-fantasy/shared";
import type {
  PoolPlayer,
  SimTeamState,
  SimDraftState,
  CandidateAction,
  ForwardSimulationSignal,
  DecisionComparison,
  NominationRecommendation,
  DraftTargetRecommendation,
  OpponentModel,
} from "./types";
import { simulateFullDraft, computeSimStandings } from "./draft-simulator";
import { compareDecisions, aggregateOutcomes } from "./decision-comparison";
import { recommendNomination } from "./nomination-strategy";

// ============================================================
// Message types (structured-cloneable)
// ============================================================

/** Plain-object representation of OpponentModel (Maps converted for structured clone) */
export interface SerializedOpponentModel {
  teamNeeds: Record<string, string[]>;   // Map<string, Set<string>> -> Record<string, string[]>
  teamBudgets: Record<string, number>;   // Map<string, number> -> Record<string, number>
  competitionFactors: Record<string, number>;
  leagueInflationFactor: number;
}

/** Input for nomination strategy — passed as structured-cloneable plain objects */
export interface SerializedNominationInput {
  myTeamIndex: number;
  opponentStates: SimTeamState[];
  availablePlayerIndices: number[];  // Indices into allPlayers for available players
  availableSgps: number[];
  opponentModel: SerializedOpponentModel;
}

/** Full request payload posted to the worker */
export interface SimulationWorkerRequest {
  requestId: number;

  // Player pool (serializable plain objects)
  allPlayers: PoolPlayer[];
  sgpValues: number[];
  categories: Category[];

  // Draft state (Sets converted to arrays)
  availableIndices: number[];    // Set<number> serialized as number[]
  teamStates: SimTeamState[];
  myTeamIndex: number;

  // Current nomination context
  currentAuctionPlayerIndex: number | null;  // Already resolved pool index, or null
  maxBid: number;

  // Nomination strategy input (null if skipped)
  nominationInput: SerializedNominationInput | null;

  // Draft targets (top candidates by SGP)
  topCandidates: Array<{ name: string; pos: string; idx: number; bid: number }>;

  // Simulation parameters
  simsPerDecision: number;
  temperature: number;
}

/** Response payload posted back from the worker */
export interface SimulationWorkerResponse {
  requestId: number;
  winProbability: ForwardSimulationSignal["winProbability"];
  currentDecision: DecisionComparison | null;
  nominationStrategy: NominationRecommendation[] | null;
  draftTargets: DraftTargetRecommendation[] | null;
  computeTimeMs: number;
}

// ============================================================
// Deserialization helpers
// ============================================================

/** Reconstruct SimDraftState from worker request (restore Set<number>) */
function deserializeSimState(req: SimulationWorkerRequest): SimDraftState {
  return {
    availableIndices: new Set(req.availableIndices),
    teamStates: req.teamStates,
    myTeamIndex: req.myTeamIndex,
  };
}

/** Reconstruct OpponentModel from serialized plain object (restore Maps) */
function deserializeOpponentModel(serialized: SerializedOpponentModel): OpponentModel {
  const teamNeeds = new Map<string, Set<string>>();
  for (const [teamId, positions] of Object.entries(serialized.teamNeeds)) {
    teamNeeds.set(teamId, new Set(positions));
  }

  const teamBudgets = new Map<string, number>(
    Object.entries(serialized.teamBudgets),
  );

  return {
    teamNeeds,
    teamBudgets,
    competitionFactors: serialized.competitionFactors,
    leagueInflationFactor: serialized.leagueInflationFactor,
  };
}

// ============================================================
// Worker message handler
// ============================================================

self.onmessage = (event: MessageEvent<SimulationWorkerRequest>) => {
  const req = event.data;
  const simT0 = Date.now();

  // Reconstruct structured types from plain objects
  const simState = deserializeSimState(req);

  const {
    allPlayers,
    sgpValues,
    categories,
    currentAuctionPlayerIndex,
    maxBid,
    nominationInput,
    topCandidates,
    simsPerDecision,
    temperature,
    requestId,
    myTeamIndex,
  } = req;

  // ------------------------------------------------------------------
  // Step 1: Baseline win probability
  // ------------------------------------------------------------------
  let winProbability: ForwardSimulationSignal["winProbability"] = null;
  try {
    const baselineSimResults: number[][] = [];
    for (let s = 0; s < simsPerDecision; s++) {
      const completed = simulateFullDraft(allPlayers, sgpValues, categories, simState, temperature);
      baselineSimResults.push(computeSimStandings(completed.teamStates, categories));
    }
    winProbability = aggregateOutcomes(myTeamIndex, baselineSimResults, simState.teamStates.length);
  } catch {
    winProbability = null;
  }

  // ------------------------------------------------------------------
  // Step 2: Decision comparison (bid vs pass) when player is nominated
  // ------------------------------------------------------------------
  let currentDecision: DecisionComparison | null = null;
  try {
    if (currentAuctionPlayerIndex !== null && maxBid > 0) {
      const candidateActions: CandidateAction[] = [
        {
          type: "bid",
          label: `Bid $${maxBid}`,
          playerIndex: currentAuctionPlayerIndex,
          bidPrice: maxBid,
        },
        {
          type: "pass",
          label: "Pass",
          playerIndex: currentAuctionPlayerIndex,
        },
      ];
      currentDecision = compareDecisions(
        candidateActions,
        simState,
        allPlayers,
        sgpValues,
        categories,
        simsPerDecision,
        temperature,
      );
    }
  } catch {
    currentDecision = null;
  }

  // ------------------------------------------------------------------
  // Step 3: Nomination strategy (heuristic trap scoring)
  // ------------------------------------------------------------------
  let nominationStrategy: NominationRecommendation[] | null = null;
  try {
    if (nominationInput !== null) {
      const opponentModel = deserializeOpponentModel(nominationInput.opponentModel);

      // Reconstruct available players and sgps from indices
      const availablePlayers = nominationInput.availablePlayerIndices
        .map(i => allPlayers[i])
        .filter((p): p is PoolPlayer => p !== undefined);
      const availableSgps = nominationInput.availableSgps;

      const myTeamState = simState.teamStates[nominationInput.myTeamIndex];
      if (myTeamState) {
        nominationStrategy = recommendNomination(
          availablePlayers,
          availableSgps,
          myTeamState,
          opponentModel,
          nominationInput.opponentStates,
          5,
        );
      }
    }
  } catch {
    nominationStrategy = null;
  }

  // ------------------------------------------------------------------
  // Step 4: Draft targets — top candidates ranked by win probability
  // ------------------------------------------------------------------
  let draftTargets: DraftTargetRecommendation[] | null = null;
  try {
    if (topCandidates.length > 0) {
      const targetActions: CandidateAction[] = topCandidates.map(c => ({
        type: "bid" as const,
        label: c.name,
        playerIndex: c.idx,
        bidPrice: c.bid,
      }));

      const targetComparison = compareDecisions(
        targetActions,
        simState,
        allPlayers,
        sgpValues,
        categories,
        simsPerDecision,
        temperature,
      );

      draftTargets = targetComparison.decisions
        .map((d, i) => ({
          playerName: topCandidates[i]?.name ?? "",
          position: topCandidates[i]?.pos ?? "",
          playerIndex: topCandidates[i]?.idx ?? 0,
          bidPrice: topCandidates[i]?.bid ?? 0,
          expectedFinish: d.outcome.expectedFinish,
          winProbability: d.outcome.winProbability,
          top3Probability: d.outcome.top3Probability,
        }))
        .sort((a, b) => b.winProbability - a.winProbability);
    }
  } catch {
    draftTargets = null;
  }

  const computeTimeMs = Math.round((Date.now() - simT0) * 10) / 10;

  // Post response back to main thread
  const response: SimulationWorkerResponse = {
    requestId,
    winProbability,
    currentDecision,
    nominationStrategy,
    draftTargets,
    computeTimeMs,
  };

  (self as unknown as Worker).postMessage(response);
};
