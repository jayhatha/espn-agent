/**
 * bid-optimizer.ts
 *
 * Binary-search max bid computation for auction draft strategy.
 *
 * Exported function:
 *   computeMaxBid — finds the highest profitable bid via binary search over optimizeRoster
 *
 * Algorithm: binary search on bid price. At each candidate price, simulate the roster
 * with the nominated player locked at that price. If the resulting team SGP >= baseline
 * (roster without nominated player), the price is still profitable.
 *
 * Pure function: no Zustand reads, no DOM access, no side effects.
 */

import type { PoolPlayer, BidOptimizerResult, OpponentModel } from "./types";
import { optimizeRoster } from "./roster-optimizer";
import { estimateMarketPrice, computePositionCompetition } from "./opponent-model";

// ============================================================
// computeMaxBid
// ============================================================

/**
 * Compute the maximum profitable bid for a nominated player.
 *
 * Binary search: find the highest bid price where
 *   roster(nominatedPlayer at price) >= baseline(roster without nominatedPlayer)
 *
 * Complexity: O(log(budget) * optimizeRoster) = O(log(n) * n log n)
 *
 * @param nominatedPlayer   The player currently nominated for bidding
 * @param availablePlayers  All undrafted players in the pool (including nominated player)
 * @param sgpValues         Parallel SGP array for availablePlayers
 * @param budget            My remaining budget
 * @param rosterSlots       Slot definitions for the league
 * @param opponentModel     Built opponent model for market price estimation
 */
export function computeMaxBid(
  nominatedPlayer: PoolPlayer,
  availablePlayers: PoolPlayer[],
  sgpValues: number[],
  budget: number,
  rosterSlots: Record<string, number>,
  opponentModel: OpponentModel,
): BidOptimizerResult {
  // ------------------------------------------------------------------
  // Step 1: Find nominated player's index in the available pool
  // ------------------------------------------------------------------
  const nominatedIndex = availablePlayers.indexOf(nominatedPlayer);

  // If player is not in the pool, can't compute a meaningful bid
  if (nominatedIndex === -1) {
    const competitionFactor = computePositionCompetition(
      nominatedPlayer.positions,
      opponentModel.competitionFactors,
    );
    const totalSGP = sgpValues.reduce((s, v) => s + v, 0);
    const totalBudget = Array.from(opponentModel.teamBudgets.values()).reduce((s, v) => s + v, budget);
    const marketPrice = estimateMarketPrice(
      sgpValues[0] ?? 0,
      totalSGP,
      totalBudget,
      competitionFactor,
      nominatedPlayer.dollars,
    );
    return {
      maxBid: 1,
      valueSurplus: 1 - marketPrice,
      baselineValue: 0,
      withPlayerValue: 0,
      expectedMarketPrice: marketPrice,
    };
  }

  // ------------------------------------------------------------------
  // Step 2: Compute baseline — optimize roster WITHOUT nominated player
  // ------------------------------------------------------------------
  const playersWithoutNominated = availablePlayers.filter((_, i) => i !== nominatedIndex);
  const sgpWithoutNominated = sgpValues.filter((_, i) => i !== nominatedIndex);

  const baseline = optimizeRoster(
    playersWithoutNominated,
    sgpWithoutNominated,
    budget,
    rosterSlots,
  );
  const baselineValue = baseline.totalSGPValue;

  // ------------------------------------------------------------------
  // Step 3: Compute upper bound for binary search
  // ------------------------------------------------------------------
  // Upper bound: player's dollar value * 3, capped at budget minus 1 reserve per unfilled slot
  const totalSlots = Object.values(rosterSlots).reduce((s, v) => s + v, 0);
  const minReserves = Math.max(0, totalSlots - 1); // at least $1 per other slot
  const maxReasonableBid = Math.max(1, Math.ceil(nominatedPlayer.dollars * 3));
  const hi_initial = Math.min(Math.max(1, budget - minReserves), maxReasonableBid);

  // ------------------------------------------------------------------
  // Step 4: Binary search for max profitable bid
  // ------------------------------------------------------------------
  // Invariant: lo is always a valid (profitable or equal) bid
  //            hi+1 is always an unprofitable bid
  let lo = 1;
  let hi = hi_initial;

  // Check if even lo=1 produces value >= baseline
  // If not, return maxBid=1 (replacement-level player)
  const checkAtPrice = (price: number): boolean => {
    if (price > budget) return false;
    const result = optimizeRoster(
      playersWithoutNominated,
      sgpWithoutNominated,
      budget - price,
      rosterSlots,
      [{ player: nominatedPlayer, cost: price }],
    );
    // Account for nominated player's SGP (locked players don't auto-add SGP)
    const totalSGP = result.totalSGPValue + (sgpValues[nominatedIndex] ?? 0);
    return totalSGP >= baselineValue;
  };

  // Quick check: if the player at price=1 doesn't improve on baseline, maxBid=1
  if (!checkAtPrice(1)) {
    const competitionFactor = computePositionCompetition(
      nominatedPlayer.positions,
      opponentModel.competitionFactors,
    );
    const totalSGP = sgpValues.reduce((s, v) => s + v, 0);
    const totalBudget = Array.from(opponentModel.teamBudgets.values()).reduce((s, v) => s + v, budget);
    const marketPrice = estimateMarketPrice(
      sgpValues[nominatedIndex],
      totalSGP,
      totalBudget,
      competitionFactor,
      nominatedPlayer.dollars,
    );
    return {
      maxBid: 1,
      valueSurplus: 1 - marketPrice,
      baselineValue,
      withPlayerValue: baselineValue,
      expectedMarketPrice: Math.max(1, marketPrice),
    };
  }

  // Binary search: find highest price where adding player >= baseline
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1; // round up to avoid infinite loop at lo=hi-1

    if (checkAtPrice(mid)) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  // lo is the max profitable bid
  const maxBid = lo;

  // ------------------------------------------------------------------
  // Step 5: Compute withPlayerValue at maxBid
  // ------------------------------------------------------------------
  const withPlayerResult = optimizeRoster(
    playersWithoutNominated,
    sgpWithoutNominated,
    budget - maxBid,
    rosterSlots,
    [{ player: nominatedPlayer, cost: maxBid }],
  );
  const withPlayerValue = withPlayerResult.totalSGPValue + (sgpValues[nominatedIndex] ?? 0);

  // ------------------------------------------------------------------
  // Step 6: Compute expected market price from opponent model
  // ------------------------------------------------------------------
  const competitionFactor = computePositionCompetition(
    nominatedPlayer.positions,
    opponentModel.competitionFactors,
  );
  const totalSGP = sgpValues.reduce((s, v) => s + v, 0);
  const totalBudget = Array.from(opponentModel.teamBudgets.values()).reduce((s, v) => s + v, budget);
  const expectedMarketPrice = Math.max(
    1,
    estimateMarketPrice(sgpValues[nominatedIndex], totalSGP, totalBudget, competitionFactor, nominatedPlayer.dollars),
  );

  return {
    maxBid,
    valueSurplus: maxBid - expectedMarketPrice,
    baselineValue,
    withPlayerValue,
    expectedMarketPrice,
  };
}
