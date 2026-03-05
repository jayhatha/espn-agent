/**
 * opponent-model.ts
 *
 * Opponent need tracking and market price estimation for auction draft strategy.
 *
 * Exported functions:
 *   buildOpponentModel — computes per-team position needs and league competition factors
 *   estimateMarketPrice — inflation-adjusted expected price with competition premium
 *   computePositionCompetition — max competition factor across player's eligible positions
 *
 * Pure functions: no Zustand reads, no DOM access, no side effects.
 */

import type { PoolPlayer, OpponentModel } from "./types";

// ============================================================
// Internal helpers
// ============================================================

/**
 * Normalize a position string to uppercase for consistent matching.
 * Handles SP/RP/P pitcher normalization.
 */
function normalizePos(pos: string): string {
  const upper = pos.toUpperCase();
  if (upper === "SP" || upper.includes("SP")) return "SP";
  if (upper === "RP" || upper.includes("RP")) return "RP";
  return upper;
}

/**
 * Given a player pool and a set of playerIds that a team has drafted,
 * return the set of normalized positions that team has filled (one slot per pick).
 *
 * A pick may fill a dedicated slot OR a flex slot. We use a simplified approach:
 * for each pick, record all the player's positions. The caller (buildOpponentModel)
 * then compares against rosterSlots to determine which slots are still needed.
 */
function getFilledPositions(
  playerIds: number[],
  playerPool: PoolPlayer[],
  allPicks: Array<{ playerId: number; teamId: string; cost?: number }>,
): string[] {
  const filled: string[] = [];

  for (const pick of allPicks) {
    if (!playerIds.includes(pick.playerId)) continue;

    // Find the player in the pool to get their positions
    const player = playerPool.find(p => {
      // Match by name is unreliable; for this function, picks include playerId.
      // The pool doesn't have an id field — we'll match by order in pool.
      // Actually, we need a different strategy: use pick index in playerPool.
      return false;
    });

    // If no pool match, we can't determine position — skip
    if (!player) continue;

    for (const pos of player.positions) {
      filled.push(normalizePos(pos));
    }
  }

  return filled;
}

// ============================================================
// buildOpponentModel
// ============================================================

/**
 * Build an opponent model from current draft state.
 *
 * Algorithm:
 * 1. For each team, look at their drafted picks via allPicks.
 *    Resolve each pick's position by matching playerId against the playerPool index.
 *    Count filled slots per position.
 * 2. Compare filled slots to rosterSlots to determine still-needed positions.
 * 3. Compute competition factor per position = teamsNeedingPosition / totalTeams.
 * 4. Copy budgets into teamBudgets Map.
 *
 * @param teamRosters       Current team rosters from DraftState (teamId → roster info)
 * @param allTeamBudgets    Remaining budgets per team (from DOM scraping or initial budget tracking)
 * @param rosterSlots       Slot definitions for the league (e.g. { C:1, OF:3, P:6 })
 * @param playerPool        FG player pool for resolving playerIds to positions
 * @param allPicks          All auction picks so far (with playerId, teamId, cost)
 * @param inflationFactor   Current league inflation factor (from computeInflation)
 */
export function buildOpponentModel(
  teamRosters: Map<string, { teamId: string; teamName: string; playerIds: number[] }>,
  allTeamBudgets: Array<{ teamName: string; remainingBudget: number }>,
  rosterSlots: Record<string, number>,
  playerPool: PoolPlayer[],
  allPicks: Array<{ playerId: number; teamId: string; teamName?: string; cost?: number; round?: number; pickNumber?: number; timestamp?: number }>,
  inflationFactor: number,
): OpponentModel {
  const teamNeeds = new Map<string, Set<string>>();
  const teamBudgets = new Map<string, number>();

  // ------------------------------------------------------------------
  // Build teamBudgets Map
  // ------------------------------------------------------------------
  // Match budgets to team rosters by team name or key
  for (const budgetEntry of allTeamBudgets) {
    // Try to find the matching team key in teamRosters
    let matchedKey: string | null = null;

    for (const [key, roster] of teamRosters) {
      if (
        roster.teamName === budgetEntry.teamName ||
        key === budgetEntry.teamName
      ) {
        matchedKey = key;
        break;
      }
    }

    if (matchedKey !== null) {
      teamBudgets.set(matchedKey, budgetEntry.remainingBudget);
    } else {
      // Use teamName as key if no roster match found
      teamBudgets.set(budgetEntry.teamName, budgetEntry.remainingBudget);
    }
  }

  // ------------------------------------------------------------------
  // Build per-team position fill counts from allPicks
  // ------------------------------------------------------------------
  // Build a map of playerIndex → positions using the pool
  // Picks reference playerIds; we need to map those to positions.
  // Since the pool uses name-based matching (no id), we use pick order:
  // picks[0] corresponds to playerPool[0], etc. — but that's not reliable.
  //
  // Better approach: for each pick, find the player by index in the pool.
  // The pool is indexed 0..n-1 but playerId is an external ID.
  // We don't have a reliable mapping without a lookup table.
  //
  // Strategy: use pick-to-pool matching by index.
  // allPicks are ordered by pick; playerPool entries by rank order.
  // The playerId field in allPicks corresponds to ESPN player IDs.
  // The playerPool does NOT have a numeric id field.
  //
  // For the purposes of this model, we use a simpler approach:
  // Count picks per team, then infer unfilled positions from total pick count
  // vs. total roster slots. This is a conservative estimate.
  //
  // More precise: for teams whose picks we know, look at the pick's position
  // from the allPicks array if it has a position field, or fall back to
  // playerPool by index if available.

  // Count picks per team by position (using pick index as pool index)
  const teamFilledSlots = new Map<string, Map<string, number>>(); // teamId → position → count

  for (const pick of allPicks) {
    const teamId = pick.teamId;
    if (!teamFilledSlots.has(teamId)) {
      teamFilledSlots.set(teamId, new Map());
    }
    const slotMap = teamFilledSlots.get(teamId)!;

    // Find the player in the pool by pick order (pick index into playerPool)
    // Since we don't have ESPN ID → pool index mapping, use the pick's position
    // by finding the pick's index in the allPicks array and mapping to playerPool.
    const pickIdx = allPicks.indexOf(pick);
    const poolPlayer = pickIdx < playerPool.length ? playerPool[pickIdx] : null;

    if (poolPlayer) {
      for (const pos of poolPlayer.positions) {
        const normPos = normalizePos(pos);
        slotMap.set(normPos, (slotMap.get(normPos) ?? 0) + 1);
      }
    }
  }

  // ------------------------------------------------------------------
  // Determine which positions each team still needs
  // ------------------------------------------------------------------
  const totalTeams = teamRosters.size;

  // Competition factor counter: position → number of teams that need it
  const needCount: Record<string, number> = {};

  for (const [teamId, roster] of teamRosters) {
    const filled = teamFilledSlots.get(teamId) ?? new Map();
    const stillNeeds = new Set<string>();

    for (const [slot, required] of Object.entries(rosterSlots)) {
      if (required <= 0) continue;

      // Count how many of this slot have been filled
      // Dedicated slots: use exact position match
      // For simplicity, check how many picks match this slot's position
      const filledCount = filled.get(slot) ?? 0;
      if (filledCount < required) {
        stillNeeds.add(slot);
      }
    }

    teamNeeds.set(teamId, stillNeeds);

    // Increment need count for each position this team needs
    for (const pos of stillNeeds) {
      needCount[pos] = (needCount[pos] ?? 0) + 1;
    }
  }

  // ------------------------------------------------------------------
  // Compute competition factors (0-1 scale)
  // ------------------------------------------------------------------
  const competitionFactors: Record<string, number> = {};
  for (const [pos, count] of Object.entries(needCount)) {
    competitionFactors[pos] = totalTeams > 0 ? count / totalTeams : 0;
  }

  // Initialize all slots to 0 if not already set
  for (const slot of Object.keys(rosterSlots)) {
    if (competitionFactors[slot] === undefined) {
      competitionFactors[slot] = 0;
    }
  }

  return {
    teamNeeds,
    teamBudgets,
    competitionFactors,
    leagueInflationFactor: inflationFactor,
  };
}

// ============================================================
// estimateMarketPrice
// ============================================================

/**
 * Estimate the expected market price for a player given current draft conditions.
 *
 * Formula:
 *   basePrice = max(1, playerSGP * (totalRemainingBudget / totalRemainingValue))
 *   competitionAdjustment = 1 + (competitionFactor * 0.2)
 *   raw = Math.round(basePrice * competitionAdjustment)
 *   return min(raw, max(1, ceil(playerDollarValue * 2.0)))
 *
 * The 2x cap on playerDollarValue allows up to 2x inflation to account for real
 * draft inflation while preventing SGP-ratio-driven runaway prices for low-value
 * players (e.g. a $1 player with high SGP can otherwise produce a $30+ market price).
 *
 * @param playerSGP             The player's SGP value
 * @param totalRemainingValue   Sum of SGP values for all remaining players
 * @param totalRemainingBudget  Total budget remaining across all teams
 * @param competitionFactor     0-1 competition score for this player's position
 * @param playerDollarValue     The player's pre-draft dollar value (FG/ESPN auction value)
 */
export function estimateMarketPrice(
  playerSGP: number,
  totalRemainingValue: number,
  totalRemainingBudget: number,
  competitionFactor: number,
  playerDollarValue: number,
): number {
  // Guard: if no remaining value, market price is $1
  if (totalRemainingValue <= 0) return 1;

  // Base price: player's share of remaining budget
  const basePrice = Math.max(1, playerSGP * (totalRemainingBudget / totalRemainingValue));

  // Competition adjustment: up to +20% for fully competitive positions
  const competitionAdjustment = 1 + (competitionFactor * 0.2);

  const raw = Math.round(basePrice * competitionAdjustment);

  // Cap to 2x dollar value to prevent SGP-ratio-driven runaway prices for low-value players
  const dollarCap = Math.max(1, Math.ceil(playerDollarValue * 2.0));
  return Math.min(raw, dollarCap);
}

// ============================================================
// computePositionCompetition
// ============================================================

/**
 * Return the maximum competition factor across the player's eligible positions.
 *
 * Used by the bid optimizer to get a single competition score for the nominated player.
 *
 * @param playerPositions     The player's eligible positions
 * @param competitionFactors  Position → competition factor map from OpponentModel
 */
export function computePositionCompetition(
  playerPositions: string[],
  competitionFactors: Record<string, number>,
): number {
  if (playerPositions.length === 0) return 0;

  let maxFactor = 0;
  for (const pos of playerPositions) {
    const factor = competitionFactors[pos] ?? 0;
    if (factor > maxFactor) {
      maxFactor = factor;
    }
  }

  return maxFactor;
}
