/**
 * bid-optimizer-worker.ts
 *
 * Web Worker entry point for bid optimization (Quick Task 58).
 *
 * Runs EV-based priority scoring (Phase 62) and runMonteCarlo off the main thread.
 * Previously ran computeMaxBid (binary search) synchronously inside computeRosterOptimization()
 * on every nomination change, blocking the UI for 10-15 optimizeRoster calls plus 200
 * Monte Carlo simulations.
 *
 * Message protocol:
 *   Receive: BidOptimizerWorkerRequest (structured-cloneable -- Maps converted to plain objects)
 *   Send:    BidOptimizerWorkerResponse (with requestId echoed back for staleness detection)
 *
 * Design decisions:
 *   - Maps passed as Record<string, V> plain objects (same pattern as simulation-worker)
 *   - All player data passed via message -- worker does NOT import FanGraphs JSON
 *   - No Zustand reads, no DOM access, no side effects
 */

import type { PoolPlayer, OpponentModel, CategoryState } from "./types";
import type { SerializedOpponentModel } from "./simulation-worker";
import { computePriorityScore, computeEVMaxBid, tagPlayer } from "./priority-scorer";
import { runMonteCarlo } from "./monte-carlo";

// ============================================================
// Message types (structured-cloneable)
// ============================================================

/** Input payload posted to the worker */
export interface BidOptimizerWorkerRequest {
  requestId: number;
  // Nominated player data
  nominatedPlayer: PoolPlayer;
  nominatedAsv: number | null; // ESPN ASV market price override
  // Player pool
  availablePlayers: PoolPlayer[];
  sgpValues: number[];
  // Budget and roster
  budget: number;
  rosterSlots: Record<string, number>; // remainingSlots
  inflationFactor: number;
  // Opponent model (serialized -- Maps converted to plain objects)
  opponentModel: SerializedOpponentModel;
  // Monte Carlo params
  myCurrentRosterSGP: number;
  opponentBudgets: number[];
  numSimulations: number; // 200
  /** FanGraphs auction dollar value for the nominated player */
  fgDollars: number;
  /** Category state computed by computeCategoryState in computeDraftEngine */
  categoryState: CategoryState;
}

/** Response payload posted back from the worker */
export interface BidOptimizerWorkerResponse {
  requestId: number;
  maxBid: number;
  expectedMarketPrice: number;
  valueSurplus: number;
  shouldBid: boolean;
  /** Priority score stored here for UI display (repurposed from SGP breakeven) */
  sgpBreakeven: number;
  /** EV-based max bid (pre-strategy-cap) */
  rawBlendedValue: number;
  simulationEV: number;
  simulationStdDev: number;
  computeTimeMs: number;
  /** EV-based priority score (EV × weights product) */
  priorityScore: number;
  /** $ added to inflated FG$ for EV+ players */
  evBuffer: number;
  /** $ added for scarce-category contributors */
  categoryBonus: number;
  /** Player classification tags */
  playerTags: string[];
}

// ============================================================
// Deserialization helper
// ============================================================

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

self.onmessage = (event: MessageEvent<BidOptimizerWorkerRequest>) => {
  const req = event.data;
  const t0 = Date.now();

  const {
    requestId,
    nominatedPlayer,
    nominatedAsv,
    availablePlayers,
    sgpValues,
    budget,
    rosterSlots,
    inflationFactor,
    opponentModel: serializedOpponentModel,
    myCurrentRosterSGP,
    opponentBudgets,
    numSimulations,
    fgDollars,
    categoryState,
  } = req;

  // Reconstruct OpponentModel Maps from plain objects
  const opponentModel = deserializeOpponentModel(serializedOpponentModel);
  void opponentModel; // used by Monte Carlo via runMonteCarlo params below

  // Debug: log FG$ for the nominated player
  if (fgDollars === 0 || fgDollars == null) {
    console.warn(`[BidWorker] fgDollars=0 for ${nominatedPlayer.name ?? nominatedPlayer.normalizedName}. ASV=${nominatedAsv}`);
  }

  // Step 1: Compute EV-based priority score and max bid
  const isEndgame = budget <= 20;
  const priorityResult = computePriorityScore(
    nominatedPlayer,
    fgDollars,
    nominatedAsv ?? undefined,
    categoryState,
  );
  const evMaxBid = computeEVMaxBid(
    fgDollars,
    priorityResult.evBuffer,
    priorityResult.categoryBonus,
    inflationFactor,
    budget,
    isEndgame,
  );
  const playerTags = tagPlayer(nominatedPlayer);

  // Step 2: Run Monte Carlo simulation
  const monteCarloResult = runMonteCarlo({
    availablePlayers,
    sgpValues,
    myCurrentRoster: [],
    myCurrentRosterSGP,
    myBudget: budget,
    opponentBudgets,
    rosterSlots,
    nominatedPlayer,
    nominatedBid: evMaxBid,
    numSimulations,
  });

  const computeTimeMs = Math.round((Date.now() - t0) * 10) / 10;

  // Post response back to main thread
  const response: BidOptimizerWorkerResponse = {
    requestId,
    maxBid: evMaxBid,
    expectedMarketPrice: nominatedAsv != null ? Math.max(1, Math.round(nominatedAsv)) : fgDollars,
    valueSurplus: evMaxBid - (nominatedAsv != null ? Math.max(1, Math.round(nominatedAsv)) : fgDollars),
    // BID whenever maxBid is positive — let the player bid up to their
    // FG$-based max regardless of EV. The maxBid cap (FG$ × 1.25) already
    // prevents overpaying. Negative-EV just means we won't win most of
    // the time (market bids higher), but if they fall to our price, great.
    shouldBid: evMaxBid > 0,
    sgpBreakeven: fgDollars, // FG$ value for UI display
    rawBlendedValue: evMaxBid, // EV-based max bid (pre-strategy-cap)
    simulationEV: monteCarloResult.expectedTeamValue,
    simulationStdDev: monteCarloResult.valueStdDev,
    computeTimeMs,
    priorityScore: priorityResult.priorityScore,
    evBuffer: priorityResult.evBuffer,
    categoryBonus: priorityResult.categoryBonus,
    playerTags,
  };

  (self as unknown as Worker).postMessage(response);
};
