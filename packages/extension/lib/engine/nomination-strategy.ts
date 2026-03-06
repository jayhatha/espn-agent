/**
 * nomination-strategy.ts
 *
 * Heuristic trap nomination strategy for auction drafts.
 *
 * Exported functions:
 *   recommendNomination — returns top N players to nominate, ranked by trapScore
 *
 * Algorithm: heuristic trap scoring (not simulation-based).
 * Three factors combine into a trapScore (0-1):
 *   1. Budget drain factor (0-0.4):   expensive players drain opponent budget
 *   2. Opponent need factor (0-0.3):  many opponents need this position = bidding wars
 *   3. My non-need factor (0-0.3):    nominate players at positions I've already filled
 *
 * Pure function: no Zustand reads, no DOM access, all data accepted as parameters.
 */

import type { PoolPlayer, SimTeamState, OpponentModel, NominationRecommendation } from "./types";

// ============================================================
// recommendNomination
// ============================================================

/**
 * Recommend top N players to nominate based on trap scoring heuristics.
 *
 * For each available player, computes a trapScore (0-1) using:
 *   1. Budget drain factor (0-0.4): min(0.4, player.dollars / 50)
 *   2. Opponent need factor (0-0.3): normalized count of opponents needing this position
 *   3. My non-need factor (0-0.3): reward positions I've already filled
 *
 * @param availablePlayers  Undrafted player pool
 * @param sgpValues         Parallel SGP values (same indices as availablePlayers)
 * @param myTeamState       My team's current SimTeamState (budget + slotsRemaining)
 * @param opponentModel     Opponent need/budget model (unused here; see opponentStates)
 * @param opponentStates    Per-opponent SimTeamState array for slot analysis
 * @param topN              Number of recommendations to return (default 5)
 * @returns                 Array of NominationRecommendation sorted by trapScore descending
 */
export function recommendNomination(
  availablePlayers: PoolPlayer[],
  sgpValues: number[],
  myTeamState: SimTeamState,
  opponentModel: OpponentModel,
  opponentStates: SimTeamState[],
  topN: number = 5,
): NominationRecommendation[] {
  if (availablePlayers.length === 0) return [];

  const recommendations: NominationRecommendation[] = [];

  for (let idx = 0; idx < availablePlayers.length; idx++) {
    const player = availablePlayers[idx];
    if (!player) continue;

    // ------------------------------------------------------------------
    // Factor 1: Budget drain (0-0.4)
    // Expensive players force opponents to spend big or lose them
    // ------------------------------------------------------------------
    const budgetDrainFactor = Math.min(0.4, player.dollars / 50);

    // ------------------------------------------------------------------
    // Factor 2: Opponent need factor (0-0.3)
    // Count opponents who have remaining slots at any of this player's positions
    // ------------------------------------------------------------------
    let opponentNeedCount = 0;
    if (opponentStates.length > 0) {
      for (const opp of opponentStates) {
        const playerPositionsUpper = player.positions.map(p => p.toUpperCase());
        const oppNeedsPosition = playerPositionsUpper.some(
          pos => (opp.slotsRemaining[pos] ?? 0) > 0,
        );
        if (oppNeedsPosition) opponentNeedCount++;
      }
    }

    const opponentNeedFactor = opponentStates.length > 0
      ? Math.min(0.3, 0.3 * opponentNeedCount / Math.max(1, opponentStates.length))
      : 0;

    // ------------------------------------------------------------------
    // Factor 3: My non-need factor (0-0.3)
    // Nominate players I don't need (position already filled)
    // ------------------------------------------------------------------
    const playerPositionsUpper = player.positions.map(p => p.toUpperCase());
    const myNeedScore = playerPositionsUpper.some(
      pos => (myTeamState.slotsRemaining[pos] ?? 0) > 0,
    ) ? 1.0 : 0.0;
    const myNonNeedFactor = 0.3 * (1 - myNeedScore);

    // ------------------------------------------------------------------
    // trapScore = sum of three factors, floored at 0.01
    // ------------------------------------------------------------------
    const rawTrapScore = budgetDrainFactor + opponentNeedFactor + myNonNeedFactor;
    const trapScore = Math.max(0.01, rawTrapScore);

    // ------------------------------------------------------------------
    // Reason generation: build human-readable explanation
    // ------------------------------------------------------------------
    const reasons: string[] = [];

    if (budgetDrainFactor > 0.2) {
      reasons.push(`Expensive ($${player.dollars}) -- drains opponent budget`);
    }
    if (opponentNeedFactor > 0.15) {
      reasons.push(`${opponentNeedCount} opponents need this position`);
    }
    if (myNonNeedFactor > 0.15) {
      reasons.push("You don't need this position");
    }
    if (reasons.length === 0) {
      reasons.push("Low-value nomination");
    }

    const reason = reasons.join(" + ");

    // ------------------------------------------------------------------
    // expectedDrain: rough estimate of opponent spend
    // Derived from opponentNeedFactor scaling back to fraction (0-1)
    // ------------------------------------------------------------------
    const expectedDrain = player.dollars * (opponentNeedFactor / 0.3);

    recommendations.push({
      playerIndex: idx,
      playerName: player.name,
      reason,
      expectedDrain,
      trapScore,
    });
  }

  // Sort by trapScore descending, return top N
  recommendations.sort((a, b) => b.trapScore - a.trapScore);
  return recommendations.slice(0, topN);
}
