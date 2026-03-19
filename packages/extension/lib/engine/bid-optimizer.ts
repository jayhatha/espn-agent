/**
 * bid-optimizer.ts
 *
 * SGP-dollar valuation for auction draft bidding.
 *
 * Exported function:
 *   computeMaxBid — converts player SGP to dollar value, blends with ASV
 *
 * Algorithm: each player's adjusted SGP is converted to a dollar value
 * proportional to their share of the total pool SGP × total league budget.
 * This is then blended with ESPN ASV (market price) to produce a competitive
 * bid that reflects both our model's valuation and market consensus.
 *
 * Pure function: no Zustand reads, no DOM access, no side effects.
 */

import type { PoolPlayer, OpponentModel } from "./types";
import { estimateMarketPrice, computePositionCompetition } from "./opponent-model";

// ============================================================
// computeMaxBid
// ============================================================

/**
 * Compute the maximum bid for a nominated player using SGP-dollar valuation.
 *
 * Steps:
 * 1. Compute the player's SGP dollar value = (playerSGP / totalPoolSGP) × leagueBudget
 * 2. Blend with ESPN ASV: weighted average of SGP dollars and market price
 * 3. Clamp to budget constraints
 *
 * @param nominatedPlayer  The player currently nominated for bidding
 * @param availablePlayers All undrafted players in the pool (including nominated player)
 * @param sgpValues        Parallel SGP array for availablePlayers (already adjusted by pitcher/hitter split)
 * @param budget           My remaining budget
 * @param rosterSlots      Slot definitions for the league
 * @param opponentModel    Built opponent model for market price estimation
 * @param inflationFactor  Current draft inflation multiplier
 * @param asvMarketPrice   ESPN Average Salary override
 */
export function computeMaxBid(
  nominatedPlayer: PoolPlayer,
  availablePlayers: PoolPlayer[],
  sgpValues: number[],
  budget: number,
  rosterSlots: Record<string, number>,
  opponentModel: OpponentModel,
  inflationFactor: number = 1.0,
  asvMarketPrice?: number,
) {
  // ------------------------------------------------------------------
  // Step 1: Find nominated player in pool
  // ------------------------------------------------------------------
  const nominatedIndex = availablePlayers.findIndex(
    p => p.normalizedName === nominatedPlayer.normalizedName,
  );

  const totalSlots = Object.values(rosterSlots).reduce((s, v) => s + v, 0);
  const minReserves = Math.max(0, totalSlots - 1);

  // If player is not in the pool, can't compute SGP value
  if (nominatedIndex === -1) {
    const marketPrice = asvMarketPrice != null
      ? Math.max(1, Math.round(asvMarketPrice))
      : Math.max(1, nominatedPlayer.dollars);
    return {
      maxBid: 1,
      sgpBreakeven: 0,
      rawBlendedValue: 0,
      valueSurplus: 1 - marketPrice,
      baselineValue: 0,
      withPlayerValue: 0,
      expectedMarketPrice: marketPrice,
    };
  }

  // ------------------------------------------------------------------
  // Step 2: Compute SGP dollar value
  // ------------------------------------------------------------------
  // Player's share of total positive SGP × total league budget.
  // This gives a dollar value proportional to how much SGP this player
  // contributes relative to the entire available pool.
  const playerSGP = Math.max(0, sgpValues[nominatedIndex]);
  const totalPositiveSGP = sgpValues.reduce((s, v) => s + Math.max(0, v), 0);

  // Total league budget across all teams (for SGP-to-dollar conversion)
  const totalLeagueBudget = Array.from(opponentModel.teamBudgets.values())
    .reduce((s, v) => s + v, budget);

  let sgpDollars = 0;
  if (totalPositiveSGP > 0) {
    sgpDollars = Math.round((playerSGP / totalPositiveSGP) * totalLeagueBudget);
  }

  // ------------------------------------------------------------------
  // Step 3: Blend with ASV (or skip blend when SGP is higher)
  // ------------------------------------------------------------------
  // When our model says a player is worth more than the market (sgpDollars >
  // asvMarketPrice), trust the model — use SGP directly without ASV dilution.
  // When ASV is higher than SGP, blend toward market to avoid overpaying on
  // players whose projection we may be undervaluing.
  const SGP_WEIGHT = 0.4;
  let rawBlendedValue = sgpDollars;

  if (asvMarketPrice != null && asvMarketPrice > 0) {
    if (sgpDollars > asvMarketPrice) {
      // SGP exceeds market — trust the model, skip blend
      rawBlendedValue = sgpDollars;
    } else {
      // ASV >= SGP — blend toward market consensus
      rawBlendedValue = Math.max(1, Math.round(
        sgpDollars * SGP_WEIGHT + asvMarketPrice * (1 - SGP_WEIGHT),
      ));
    }
  }

  // Clamp to budget constraints, floor at $1
  const maxBid = Math.max(1, Math.min(rawBlendedValue, Math.max(1, budget - minReserves)));

  // ------------------------------------------------------------------
  // Step 4: Compute expected market price
  // ------------------------------------------------------------------
  const expectedMarketPrice = asvMarketPrice != null
    ? Math.max(1, Math.round(asvMarketPrice))
    : (() => {
        const competitionFactor = computePositionCompetition(
          nominatedPlayer.positions,
          opponentModel.competitionFactors,
        );
        return Math.max(
          1,
          estimateMarketPrice(
            sgpValues[nominatedIndex],
            totalPositiveSGP,
            totalLeagueBudget,
            competitionFactor,
            nominatedPlayer.dollars,
          ),
        );
      })();

  return {
    maxBid,
    sgpBreakeven: sgpDollars, // renamed: SGP dollar value (not binary search breakeven)
    rawBlendedValue,
    valueSurplus: maxBid - expectedMarketPrice,
    baselineValue: 0, // no longer computed (no binary search)
    withPlayerValue: 0, // no longer computed
    expectedMarketPrice,
  };
}
