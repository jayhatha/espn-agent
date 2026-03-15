/**
 * nomination-strategy.ts
 *
 * Overpricing-based nomination strategy for auction drafts.
 *
 * Exported functions:
 *   recommendNomination — returns top N players to nominate, ranked by nomination score
 *
 * Algorithm: overpricing-based scoring.
 * Primary factor: ESPN average salary minus model dollar value (overpriced players
 * force opponents to overspend, increasing inflation in our favor).
 * Secondary/tertiary factors: opponent need and my non-need for tiebreaking.
 *
 * Formula:
 *   nominationScore = normalizedOverpricing * 0.6 + opponentNeedFactor * 0.2 + myNonNeedFactor * 0.2
 *
 * Pure function: no Zustand reads, no DOM access, all data accepted as parameters.
 */

import type { PoolPlayer, SimTeamState, OpponentModel, NominationRecommendation } from "./types";

/** Max overpricing delta used for normalization (dollars) */
const MAX_OVERPRICING = 30;

// ============================================================
// recommendNomination
// ============================================================

/**
 * Recommend top N players to nominate based on overpricing scoring.
 *
 * For each available player, computes a nominationScore (0-1) using:
 *   1. Overpricing factor (60%): (espnAvgSalary - modelDollars) normalized 0-1
 *      Fallback when no ESPN ASV: budget drain heuristic (dollars / 50)
 *   2. Opponent need factor (20%): normalized count of opponents needing this position
 *   3. My non-need factor (20%): reward positions I've already filled
 *
 * @param availablePlayers  Undrafted player pool
 * @param sgpValues         Parallel SGP values (same indices as availablePlayers)
 * @param myTeamState       My team's current SimTeamState (budget + slotsRemaining)
 * @param opponentModel     Opponent need/budget model (unused here; see opponentStates)
 * @param opponentStates    Per-opponent SimTeamState array for slot analysis
 * @param topN              Number of recommendations to return (default 5)
 * @returns                 Array of NominationRecommendation sorted by nominationScore descending
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
    // Factor 1: Overpricing (0-1, weight 0.6)
    // ESPN avg salary minus model dollar value — positive = overpriced.
    // When ESPN ASV unavailable, fall back to budget drain heuristic.
    // ------------------------------------------------------------------
    let overpricingRaw: number;
    let hasEspnAsv = false;
    let espnPrice = 0;
    let modelValue = player.dollars;

    if (player.espnAvgSalary != null && player.espnAvgSalary > 0) {
      hasEspnAsv = true;
      espnPrice = player.espnAvgSalary;
      overpricingRaw = espnPrice - modelValue;
    } else {
      // Fallback: budget drain heuristic (expensive players drain budgets)
      overpricingRaw = player.dollars / 50 * MAX_OVERPRICING;
    }

    const normalizedOverpricing = Math.max(0, Math.min(1, overpricingRaw / MAX_OVERPRICING));

    // ------------------------------------------------------------------
    // Factor 2: Opponent need factor (0-1, weight 0.2)
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
      ? opponentNeedCount / Math.max(1, opponentStates.length)
      : 0;

    // ------------------------------------------------------------------
    // Factor 3: My non-need factor (0-1, weight 0.2)
    // Nominate players I don't need (position already filled)
    // ------------------------------------------------------------------
    const playerPositionsUpper = player.positions.map(p => p.toUpperCase());
    const iNeedThisPosition = playerPositionsUpper.some(
      pos => (myTeamState.slotsRemaining[pos] ?? 0) > 0,
    );
    const myNonNeedFactor = iNeedThisPosition ? 0.0 : 1.0;

    // ------------------------------------------------------------------
    // nominationScore = weighted sum, floored at 0.01
    // ------------------------------------------------------------------
    const rawScore = normalizedOverpricing * 0.6 + opponentNeedFactor * 0.2 + myNonNeedFactor * 0.2;
    const trapScore = Math.max(0.01, Math.min(1.0, rawScore));

    // ------------------------------------------------------------------
    // Reason generation: build human-readable explanation
    // ------------------------------------------------------------------
    const reasons: string[] = [];

    if (hasEspnAsv && overpricingRaw > 5) {
      reasons.push(
        `Overpriced by $${Math.round(overpricingRaw)} (ESPN $${espnPrice} vs model $${Math.round(modelValue)})`,
      );
    } else if (hasEspnAsv && overpricingRaw > 0) {
      reasons.push(`Slightly overpriced (ESPN $${espnPrice} vs model $${Math.round(modelValue)})`);
    } else if (!hasEspnAsv && player.dollars > 15) {
      reasons.push(`Expensive ($${player.dollars}) -- drains opponent budget`);
    }

    if (opponentNeedFactor > 0.5) {
      reasons.push(`${opponentNeedCount} opponents need this position`);
    }
    if (myNonNeedFactor > 0.5) {
      reasons.push("You don't need this position");
    }
    if (reasons.length === 0) {
      reasons.push("Low-value nomination");
    }

    const reason = reasons.join(" + ");

    // ------------------------------------------------------------------
    // expectedDrain: rough estimate of opponent spend
    // ------------------------------------------------------------------
    const expectedDrain = (hasEspnAsv ? espnPrice : player.dollars) * opponentNeedFactor;

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
