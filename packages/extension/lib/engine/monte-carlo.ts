/**
 * monte-carlo.ts
 *
 * Monte Carlo draft simulation engine for auction strategy.
 *
 * Exported functions:
 *   runMonteCarlo — simulates N draft completions and returns expected team value,
 *                   stddev, and bid/pass recommendation for a nominated player
 *
 * Key design decisions:
 * - Uses index-set-based simulation (Set<number>) — NEVER splices arrays (Research pitfall 5)
 * - availablePlayers array is never mutated
 * - Math.random() used for production noise; mock in tests for reproducibility
 *
 * Pure function: no Zustand reads, no DOM access, no side effects.
 */

import type { PoolPlayer, MonteCarloResult } from "./types";
import { optimizeRoster } from "./roster-optimizer";

// ============================================================
// MonteCarloParams interface
// ============================================================

export interface MonteCarloParams {
  availablePlayers: PoolPlayer[];
  sgpValues: number[];
  myCurrentRoster: PoolPlayer[];
  myCurrentRosterSGP: number;         // Total SGP of players I've already drafted
  myBudget: number;
  opponentBudgets: number[];
  rosterSlots: Record<string, number>;  // REMAINING slots (already reduced by my drafted players)
  nominatedPlayer?: PoolPlayer;       // If present, simulate bid vs pass scenarios
  nominatedBid?: number;
  numSimulations?: number;            // Default 200
}

// ============================================================
// weightedShuffle — internal helper
// ============================================================

/**
 * Return indices sorted by sgpValues[i] * random jitter descending.
 *
 * This creates different orderings per simulation while keeping high-value
 * players near the top (soft shuffling, not uniform random).
 *
 * @param indices    Player indices to shuffle
 * @param sgpValues  SGP value parallel array for jitter weighting
 */
function weightedShuffle(indices: number[], sgpValues: number[]): number[] {
  // Each index gets a jitter weight: sgp * (0.8 + random * 0.4) in [0.8*sgp, 1.2*sgp]
  return [...indices].sort((a, b) => {
    const wA = (sgpValues[a] ?? 0) * (0.8 + Math.random() * 0.4);
    const wB = (sgpValues[b] ?? 0) * (0.8 + Math.random() * 0.4);
    return wB - wA; // descending
  });
}

// ============================================================
// simulateOneDraft — simulate a single draft completion
// ============================================================

/**
 * Simulate one draft completion starting from the current state.
 *
 * @param availablePlayers   Full player pool (never mutated)
 * @param sgpValues          SGP parallel array
 * @param myBudget           My remaining budget
 * @param opponentBudgets    Opponent remaining budgets
 * @param rosterSlots        Slot definitions
 * @param availableIndices   Indices of players still available (as Set)
 * @param myLockedPlayer     If non-null, this player is pre-locked for me at a cost
 * @param myLockedCost       Cost of the locked player
 * @returns                  My total SGP from the simulated draft
 */
function simulateOneDraft(
  availablePlayers: PoolPlayer[],
  sgpValues: number[],
  myBudget: number,
  opponentBudgets: number[],
  rosterSlots: Record<string, number>,
  availableIndices: Set<number>,
  myLockedPlayer: PoolPlayer | null,
  myLockedCost: number,
  myExistingRosterSGP: number,
): number {
  // Work with a copy of the available set — do NOT mutate the input
  const remaining = new Set(availableIndices);

  const totalSlots = Object.values(rosterSlots).reduce((s, v) => s + v, 0);

  // ------------------------------------------------------------------
  // Simulate opponent picks first (they pick from the available pool)
  // Each opponent fills their remaining slots using SGP-weighted random selection
  // ------------------------------------------------------------------
  for (const oppBudget of opponentBudgets) {
    if (remaining.size === 0) break;

    // Create shuffled order for this opponent's picks (jitter simulates different valuations)
    const orderedIndices = weightedShuffle(Array.from(remaining), sgpValues);

    let oppBudgetLeft = oppBudget;
    let oppSlotsLeft = totalSlots;
    const oppSlotMap = { ...rosterSlots };

    for (const idx of orderedIndices) {
      if (oppSlotsLeft <= 0 || remaining.size === 0) break;

      const player = availablePlayers[idx];
      if (!player) continue;

      // Budget check (simplified — $1 reserve per remaining slot)
      const reserve = Math.max(0, oppSlotsLeft - 1);
      const maxSpend = Math.max(1, oppBudgetLeft - reserve);
      if (player.dollars > maxSpend) continue;

      // Check if player fits any slot (simplified: just check slot count > 0)
      // For Monte Carlo speed, we use a simplified slot check rather than
      // the full position-aware findBestSlot logic
      const hasSlot = player.positions.some(pos => {
        const upper = pos.toUpperCase();
        if (oppSlotMap[upper] && oppSlotMap[upper] > 0) return true;
        // Flex checks
        if ((pos === "1B" || pos === "3B") && oppSlotMap["CI"] && oppSlotMap["CI"] > 0) return true;
        if ((pos === "2B" || pos === "SS") && oppSlotMap["MI"] && oppSlotMap["MI"] > 0) return true;
        if (oppSlotMap["UTIL"] && oppSlotMap["UTIL"] > 0) {
          const utilPositions = ["C", "1B", "2B", "3B", "SS", "OF", "DH"];
          if (utilPositions.includes(upper)) return true;
        }
        if ((pos === "SP" || pos === "RP") && oppSlotMap["P"] && oppSlotMap["P"] > 0) return true;
        if (oppSlotMap["BN"] && oppSlotMap["BN"] > 0) return true;
        return false;
      });

      if (!hasSlot) continue;

      // Opponent takes this player — remove from available set
      remaining.delete(idx);
      oppBudgetLeft -= player.dollars;
      oppSlotsLeft--;

      // Update opponent's slot map (simplified: decrement first matching slot)
      for (const pos of player.positions) {
        const upper = pos.toUpperCase();
        if (oppSlotMap[upper] && oppSlotMap[upper] > 0) {
          oppSlotMap[upper]--;
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // My picks: use optimizeRoster on remaining available players
  // ------------------------------------------------------------------
  const remainingPlayers: PoolPlayer[] = [];
  const remainingSGPs: number[] = [];

  for (const idx of remaining) {
    if (availablePlayers[idx]) {
      remainingPlayers.push(availablePlayers[idx]);
      remainingSGPs.push(sgpValues[idx] ?? 0);
    }
  }

  // If I have a locked player (bid scenario), apply them
  const lockedPlayers = myLockedPlayer
    ? [{ player: myLockedPlayer, cost: myLockedCost }]
    : undefined;

  const result = optimizeRoster(
    remainingPlayers,
    remainingSGPs,
    myBudget,
    rosterSlots,
    lockedPlayers,
  );

  // Add locked player's SGP (not auto-tracked in optimizeRoster)
  let totalSGP = result.totalSGPValue;
  if (myLockedPlayer) {
    // Find the locked player's SGP from the original sgpValues
    const lockedIdx = availablePlayers.findIndex(p => p.normalizedName === myLockedPlayer.normalizedName);
    totalSGP += lockedIdx >= 0 ? (sgpValues[lockedIdx] ?? 0) : 0;
  }

  // Add SGP from players already on my roster (drafted before this simulation)
  totalSGP += myExistingRosterSGP;

  return totalSGP;
}

// ============================================================
// runMonteCarlo — main export
// ============================================================

/**
 * Run N Monte Carlo simulations of the remaining draft.
 *
 * For each simulation:
 * 1. Create an index Set of available players (no array mutation)
 * 2. If nominatedPlayer provided: run two scenarios per sim:
 *    - "bid": lock nominated player into my roster at nominatedBid, remove from available
 *    - "pass": nominated player goes to an opponent (remove from available)
 * 3. Simulate remaining draft: opponents pick by jittered SGP order, I pick via optimizeRoster
 * 4. Compute mean and stddev across all simulations
 *
 * @param params  MonteCarloParams
 */
export function runMonteCarlo(params: MonteCarloParams): MonteCarloResult {
  const startTime = Date.now();

  const {
    availablePlayers,
    sgpValues,
    myCurrentRoster,
    myCurrentRosterSGP = 0,
    myBudget,
    opponentBudgets,
    rosterSlots,
    nominatedPlayer,
    nominatedBid = 1,
    numSimulations = 200,
  } = params;

  // Edge case: empty pool
  if (availablePlayers.length === 0) {
    return {
      expectedTeamValue: 0,
      valueStdDev: 0,
      bidEV: 0,
      passEV: 0,
      shouldBid: false,
      simCount: numSimulations,
      computeTimeMs: Date.now() - startTime,
    };
  }

  // Build base available index set (all players initially available)
  const allIndices = new Set(availablePlayers.map((_, i) => i));

  // Find nominated player's index (if provided)
  // Use name matching — not reference equality — because the worker
  // receives structured-cloned objects (new references).
  const nominatedIndex = nominatedPlayer
    ? availablePlayers.findIndex(p => p.normalizedName === nominatedPlayer.normalizedName)
    : -1;

  const bidValues: number[] = [];
  const passValues: number[] = [];

  // ------------------------------------------------------------------
  // Run simulations
  // ------------------------------------------------------------------
  for (let sim = 0; sim < numSimulations; sim++) {
    if (nominatedPlayer && nominatedIndex >= 0) {
      // BID scenario: I win the nominated player at nominatedBid
      const bidAvailable = new Set(allIndices);
      bidAvailable.delete(nominatedIndex); // Remove from pool (I have them)

      const bidSGP = simulateOneDraft(
        availablePlayers,
        sgpValues,
        myBudget - nominatedBid, // reduced budget
        opponentBudgets,
        rosterSlots,
        bidAvailable,
        nominatedPlayer,
        nominatedBid,
        myCurrentRosterSGP,
      );
      bidValues.push(bidSGP);

      // PASS scenario: nominated player goes to an opponent (removed from pool)
      const passAvailable = new Set(allIndices);
      passAvailable.delete(nominatedIndex); // Opponent wins, remove from available

      const passSGP = simulateOneDraft(
        availablePlayers,
        sgpValues,
        myBudget, // full budget since I didn't bid
        opponentBudgets,
        rosterSlots,
        passAvailable,
        null,
        0,
        myCurrentRosterSGP,
      );
      passValues.push(passSGP);
    } else {
      // No nominated player: just simulate the draft as-is
      const baseSGP = simulateOneDraft(
        availablePlayers,
        sgpValues,
        myBudget,
        opponentBudgets,
        rosterSlots,
        new Set(allIndices),
        null,
        0,
        myCurrentRosterSGP,
      );
      bidValues.push(baseSGP);
      passValues.push(baseSGP);
    }
  }

  // ------------------------------------------------------------------
  // Compute statistics
  // ------------------------------------------------------------------
  const meanSGP = (values: number[]) =>
    values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;

  const stddevSGP = (values: number[], mean: number) => {
    if (values.length < 2) return 0;
    const variance =
      values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  };

  const bidEV = meanSGP(bidValues);
  const passEV = meanSGP(passValues);

  // When no nominated player, bidValues === passValues, so use them for overall stats
  const allValues = nominatedPlayer ? [...bidValues, ...passValues] : bidValues;
  const expectedTeamValue = meanSGP(allValues);
  const valueStdDev = stddevSGP(allValues, expectedTeamValue);

  return {
    expectedTeamValue,
    valueStdDev,
    bidEV,
    passEV,
    shouldBid: bidEV > passEV,
    simCount: numSimulations,
    computeTimeMs: Date.now() - startTime,
  };
}
