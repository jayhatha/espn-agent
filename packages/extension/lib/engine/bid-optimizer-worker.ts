/**
 * bid-optimizer-worker.ts
 *
 * Web Worker entry point for bid optimization (Quick Task 58).
 *
 * Runs computeMaxBid (binary search) and runMonteCarlo off the main thread.
 * Previously these ran synchronously inside computeRosterOptimization() on every
 * nomination change, blocking the UI for 10-15 optimizeRoster calls plus 200
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

import type { PoolPlayer, OpponentModel } from "./types";
import type { SerializedOpponentModel } from "./simulation-worker";
import { computeMaxBid } from "./bid-optimizer";
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
}

/** Response payload posted back from the worker */
export interface BidOptimizerWorkerResponse {
  requestId: number;
  maxBid: number;
  expectedMarketPrice: number;
  valueSurplus: number;
  shouldBid: boolean;
  /** SGP breakeven from binary search (before ASV blend) */
  sgpBreakeven: number;
  /** Pre-cap blended value (40% SGP + 60% ASV) */
  rawBlendedValue: number;
  simulationEV: number;
  simulationStdDev: number;
  computeTimeMs: number;
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
  } = req;

  // Reconstruct OpponentModel Maps from plain objects
  const opponentModel = deserializeOpponentModel(serializedOpponentModel);

  // Step 1: Compute max bid via binary search
  const maxBidResult = computeMaxBid(
    nominatedPlayer,
    availablePlayers,
    sgpValues,
    budget,
    rosterSlots,
    opponentModel,
    inflationFactor,
    nominatedAsv ?? undefined,
  );

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
    nominatedBid: maxBidResult.maxBid,
    numSimulations,
  });

  const computeTimeMs = Math.round((Date.now() - t0) * 10) / 10;

  // Post response back to main thread
  const response: BidOptimizerWorkerResponse = {
    requestId,
    maxBid: maxBidResult.maxBid,
    expectedMarketPrice: maxBidResult.expectedMarketPrice,
    valueSurplus: maxBidResult.valueSurplus,
    shouldBid: monteCarloResult.shouldBid,
    sgpBreakeven: maxBidResult.sgpBreakeven,
    rawBlendedValue: maxBidResult.maxBid, // maxBid IS the blended value before strategy caps
    simulationEV: monteCarloResult.expectedTeamValue,
    simulationStdDev: monteCarloResult.valueStdDev,
    computeTimeMs,
  };

  (self as unknown as Worker).postMessage(response);
};
