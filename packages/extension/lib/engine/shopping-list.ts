/**
 * shopping-list.ts
 *
 * Per-position shopping list computation for auction draft strategy.
 *
 * Exported functions:
 *   computeShoppingList     — builds position-grouped target lists with priority scoring
 *   computePositionPriority — helper for per-position priority score computation (exported for testability)
 *
 * Pure function: no Zustand reads, no DOM access, no side effects.
 */

import type {
  PoolPlayer,
  EnhancedScarcitySignal,
  OpponentModel,
  ShoppingListSignal,
  PositionGroup,
  PositionTarget,
} from "./types";
import { estimateMarketPrice, computePositionCompetition } from "./opponent-model";

// ============================================================
// computePositionPriority
// ============================================================

/**
 * Compute the combined priority score for a position group.
 *
 * Formula:
 *   priorityScore = scarcityIndex * 0.4 + slotWeight * 0.35 + budgetFit * 0.25
 *
 * Where:
 *   slotWeight = min(1.0, unfilledSlots / 3)   — 1 slot = 0.33, 2 = 0.67, 3+ = 1.0
 *   budgetFit  = affordableCount / totalTargets  — fraction of top-N targets affordable
 *
 * @param scarcityIndex    0-1 normalized scarcity score from EnhancedScarcitySignal
 * @param unfilledSlots    Number of unfilled slots for this position
 * @param affordableCount  Count of top-N targets with dollarValue <= budget * 0.4
 * @param totalTargets     Total number of top-N targets in this position group
 */
export function computePositionPriority(
  scarcityIndex: number,
  unfilledSlots: number,
  affordableCount: number,
  totalTargets: number,
): number {
  const slotWeight = Math.min(1.0, unfilledSlots / 3);
  const budgetFit = totalTargets > 0 ? affordableCount / totalTargets : 0;
  return scarcityIndex * 0.4 + slotWeight * 0.35 + budgetFit * 0.25;
}

// ============================================================
// computeShoppingList
// ============================================================

/**
 * Build per-position shopping lists grouped by position with combined priority scoring.
 *
 * Algorithm:
 * a. Build position-to-players mapping
 *    - For each player in allPlayers, look at player.positions
 *    - For each position that exists in needByPosition (unfilled > 0), add to that position's candidates
 *    - Also handles pitcher positions: if needByPosition has no SP/RP keys but remainingSlots has P > 0,
 *      map SP/RP players to a "P" group
 *    - Multi-position eligibility: a player with positions ["1B", "3B"] appears in both groups
 *
 * b. Score and sort players within each position
 *    - Base SGP from sgpValues[playerIndex] (parallel array)
 *    - Positional need boost: sgp * (1 + unfilledSlots * 0.5)
 *    - Weak category boost: 1 + 0.3 * (weak cat contributions), capped at 2.0
 *    - Sort by adjustedSgp descending, take top N (default 3)
 *
 * c. Compute per-target pricing
 *    - expectedMarketPrice via estimateMarketPrice() from opponent-model
 *    - maxBid = min(myBudget, expectedPrice, max(1, ceil(dollars * 2.0)))
 *    - valueSurplus = maxBid - expectedMarketPrice
 *
 * d. Compute position priority score via computePositionPriority()
 *
 * e. Exclude filled positions (only iterate positions in needByPosition)
 *
 * f. Sort groups by priority descending, return ShoppingListSignal
 *
 * Note: sgpValues[i] must correspond to allPlayers[i] — parallel arrays aligned by index.
 *
 * @param params.allPlayers        Available (undrafted) pool players
 * @param params.sgpValues         Parallel to allPlayers — sgpValues[i] is SGP for allPlayers[i]
 * @param params.needByPosition    Position -> unfilled slot count (CI/MI already expanded)
 * @param params.remainingSlots    Raw remaining slots (for UTIL/P check)
 * @param params.scarcitySignals   Enhanced scarcity signals per position
 * @param params.opponentModel     Opponent model for market price estimation
 * @param params.myBudget          User's remaining budget
 * @param params.weakCategories    Set of stat keys where user ranks in bottom 4
 * @param params.topN              Max targets per position group (default 3)
 */
export function computeShoppingList(params: {
  allPlayers: PoolPlayer[];
  sgpValues: number[];
  needByPosition: Record<string, number>;
  remainingSlots: Record<string, number>;
  scarcitySignals: EnhancedScarcitySignal[];
  opponentModel: OpponentModel;
  myBudget: number;
  weakCategories: Set<string>;
  topN?: number;
}): ShoppingListSignal {
  const t0 = performance.now();

  const {
    allPlayers,
    sgpValues,
    needByPosition,
    remainingSlots,
    scarcitySignals,
    opponentModel,
    myBudget,
    weakCategories,
    topN = 3,
  } = params;

  // Build scarcity lookup map: position -> scarcityIndex
  const scarcityMap = new Map<string, number>();
  for (const signal of scarcitySignals) {
    scarcityMap.set(signal.position.toUpperCase(), signal.scarcityIndex);
  }

  // Compute total SGP and total budget for market price estimation
  const totalSGP = sgpValues.reduce((s, v) => s + v, 0);
  const totalBudget =
    Array.from(opponentModel.teamBudgets.values()).reduce((s, v) => s + v, myBudget);

  // ----------------------------------------------------------------
  // Step a: Determine which positions to build groups for
  // ----------------------------------------------------------------

  // Collect the set of positions to generate groups for.
  // Positions come from needByPosition (already expanded for CI/MI by the caller).
  const positionsToGroup = new Set<string>(
    Object.entries(needByPosition)
      .filter(([, count]) => count > 0)
      .map(([pos]) => pos.toUpperCase()),
  );

  // Handle pitcher consolidation: if no SP/RP in needByPosition but P slot exists
  const hasPitcherP = (remainingSlots["P"] ?? 0) > 0;
  const hasSP = positionsToGroup.has("SP");
  const hasRP = positionsToGroup.has("RP");
  if (hasPitcherP && !hasSP && !hasRP) {
    positionsToGroup.add("P");
  }

  if (positionsToGroup.size === 0 || allPlayers.length === 0) {
    return {
      positionGroups: [],
      totalTargets: 0,
      computeTimeMs: Math.round((performance.now() - t0) * 10) / 10,
    };
  }

  // ----------------------------------------------------------------
  // Step b: Build position -> candidate player entries
  // ----------------------------------------------------------------

  // Keyed by position string -> array of { player, sgp, adjustedSgp, index }
  const positionCandidates = new Map<
    string,
    Array<{ player: PoolPlayer; sgp: number; adjustedSgp: number; index: number }>
  >();

  for (const pos of positionsToGroup) {
    positionCandidates.set(pos, []);
  }

  for (let i = 0; i < allPlayers.length; i++) {
    const player = allPlayers[i];
    const sgp = sgpValues[i] ?? 0;

    // Normalize player positions to uppercase
    const playerPositions = player.positions.map(p => p.toUpperCase());

    // Weak category boost — same formula as index.ts
    let weakBoost = 1.0;
    if (weakCategories.size > 0) {
      for (const statKey of weakCategories) {
        if ((player.stats[statKey] ?? 0) > 0) {
          weakBoost += 0.3;
        }
      }
      weakBoost = Math.min(weakBoost, 2.0);
    }

    // Check each position this player is eligible for
    for (const pos of positionsToGroup) {
      let eligible = false;

      if (pos === "P") {
        // Pitcher consolidation: SP or RP players map to "P"
        eligible = playerPositions.some(p => p === "SP" || p === "RP");
      } else {
        eligible = playerPositions.includes(pos);
      }

      if (!eligible) continue;

      // Positional need boost: 50% per unfilled slot at this specific position
      const unfilledSlots = needByPosition[pos] ?? 0;
      const positionalAdjustedSgp = sgp * (1 + unfilledSlots * 0.5);

      const adjustedSgp = positionalAdjustedSgp * weakBoost;

      positionCandidates.get(pos)!.push({ player, sgp, adjustedSgp, index: i });
    }
  }

  // ----------------------------------------------------------------
  // Steps c & d: Build position groups with targets and priority scores
  // ----------------------------------------------------------------

  const positionGroups: PositionGroup[] = [];

  for (const [pos, candidates] of positionCandidates) {
    // Skip positions with no candidates
    if (candidates.length === 0) continue;

    // Sort candidates by adjustedSgp descending
    candidates.sort((a, b) => b.adjustedSgp - a.adjustedSgp);

    // Take top N
    const topCandidates = candidates.slice(0, topN);

    // Build targets with pricing
    const targets: PositionTarget[] = topCandidates.map(({ player, sgp, adjustedSgp }) => {
      const competitionFactor = computePositionCompetition(
        player.positions,
        opponentModel.competitionFactors,
      );
      const expectedMarketPrice = Math.max(
        1,
        estimateMarketPrice(sgp, totalSGP, totalBudget, competitionFactor, player.dollars),
      );

      // Quick max bid heuristic (NOT binary search computeMaxBid)
      const maxBid = Math.min(
        myBudget,
        expectedMarketPrice,
        Math.max(1, Math.ceil(player.dollars * 2.0)),
      );

      const valueSurplus = maxBid - expectedMarketPrice;

      return {
        playerName: player.name,
        normalizedName: player.normalizedName,
        positions: player.positions,
        sgpValue: Math.round(sgp * 100) / 100,
        adjustedSgp: Math.round(adjustedSgp * 100) / 100,
        dollarValue: player.dollars,
        maxBid,
        expectedMarketPrice,
        valueSurplus,
        isPitcher: player.isPitcher,
      };
    });

    // Compute budget fit: fraction of targets where dollarValue <= myBudget * 0.4
    const budgetThreshold = myBudget * 0.4;
    const affordableCount = targets.filter(t => t.dollarValue <= budgetThreshold).length;

    // Unfileld slots for this position (use needByPosition, or P slot count if "P" group)
    const unfilledSlots =
      pos === "P" ? (remainingSlots["P"] ?? 0) : (needByPosition[pos] ?? 0);

    // Scarcity index: check the position itself, or for "P" check max(SP, RP)
    let scarcityIndex = 0;
    if (pos === "P") {
      scarcityIndex = Math.max(
        scarcityMap.get("SP") ?? 0,
        scarcityMap.get("RP") ?? 0,
      );
    } else {
      scarcityIndex = scarcityMap.get(pos) ?? 0;
    }

    const priorityScore = computePositionPriority(
      scarcityIndex,
      unfilledSlots,
      affordableCount,
      targets.length,
    );

    positionGroups.push({
      position: pos,
      priorityScore,
      unfilledSlots,
      scarcityIndex,
      budgetFit: targets.length > 0 ? affordableCount / targets.length : 0,
      targets,
    });
  }

  // Sort groups by priorityScore descending
  positionGroups.sort((a, b) => b.priorityScore - a.priorityScore);

  const totalTargets = positionGroups.reduce((s, g) => s + g.targets.length, 0);

  return {
    positionGroups,
    totalTargets,
    computeTimeMs: Math.round((performance.now() - t0) * 10) / 10,
  };
}
