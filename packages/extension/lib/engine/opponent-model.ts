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
 * Handles OF sub-position variants (LF/CF/RF → OF).
 */
function normalizePos(pos: string): string {
  const upper = pos.toUpperCase();
  if (upper === "LF" || upper === "CF" || upper === "RF") return "OF";
  return upper;
}

/**
 * Slot assignment priority: most restrictive first, flex/bench last.
 * When assigning a pick to a slot, we consume the most dedicated slot
 * before falling back to flex (CI/MI/UTIL) or bench (BN).
 */
const SLOT_ORDER = ["C", "SS", "2B", "3B", "1B", "OF", "SP", "RP", "CI", "MI", "UTIL", "P", "BN"];

/**
 * For each flex slot, which player positions can fill it.
 */
const FLEX_ELIGIBLE: Record<string, string[]> = {
  CI: ["1B", "3B"],
  MI: ["2B", "SS"],
  UTIL: ["C", "1B", "2B", "3B", "SS", "OF", "DH"],
  P: ["SP", "RP"],
  BN: ["C", "1B", "2B", "3B", "SS", "OF", "DH", "SP", "RP"],
};

/** Dedicated (non-flex) slots that require an exact position match. */
const DEDICATED_SLOTS = new Set(["C", "SS", "2B", "3B", "1B", "OF", "SP", "RP"]);

/**
 * Find the best slot for a player's positions, consuming the most restrictive
 * available slot first. Returns null if no slot is available.
 */
function findBestSlot(
  positions: string[],
  remaining: Map<string, number>,
): string | null {
  const normed = positions.map(normalizePos);

  for (const slot of SLOT_ORDER) {
    if ((remaining.get(slot) ?? 0) <= 0) continue;

    if (DEDICATED_SLOTS.has(slot)) {
      if (normed.includes(slot)) return slot;
    } else {
      const eligible = FLEX_ELIGIBLE[slot];
      if (eligible && normed.some(p => eligible.includes(p))) return slot;
    }
  }

  return null;
}

// ============================================================
// buildOpponentModel
// ============================================================

/**
 * Build an opponent model from current draft state.
 *
 * Algorithm:
 * 1. For each pick, use pick.positions directly (DraftPick carries positions[]).
 *    Assign each pick to the most restrictive available slot for the team.
 * 2. Compare filled slots to rosterSlots to determine still-needed positions.
 * 3. Compute competition factor per position = teamsNeedingPosition / totalTeams.
 * 4. Copy budgets into teamBudgets Map.
 *
 * @param teamRosters       Current team rosters from DraftState (teamId → roster info)
 * @param allTeamBudgets    Remaining budgets per team (from DOM scraping or initial budget tracking)
 * @param rosterSlots       Slot definitions for the league (e.g. { C:1, OF:3, P:6 })
 * @param playerPool        FG player pool (unused for position resolution — kept for API compatibility)
 * @param allPicks          All auction picks so far (with playerId, teamId, positions, cost)
 * @param inflationFactor   Current league inflation factor (from computeInflation)
 */
export function buildOpponentModel(
  teamRosters: Map<string, { teamId: string; teamName: string; playerIds: number[] }>,
  allTeamBudgets: Array<{ teamName: string; remainingBudget: number }>,
  rosterSlots: Record<string, number>,
  playerPool: PoolPlayer[],
  allPicks: Array<{
    playerId: number;
    teamId: string;
    teamName?: string;
    cost?: number;
    positions?: string[];
    playerName?: string;
    round?: number;
    pickNumber?: number;
    timestamp?: number;
  }>,
  inflationFactor: number,
): OpponentModel {
  const teamNeeds = new Map<string, Set<string>>();
  const teamBudgets = new Map<string, number>();

  // ------------------------------------------------------------------
  // Build teamBudgets Map
  // ------------------------------------------------------------------
  // Match budgets to team rosters by team name or key
  for (const budgetEntry of allTeamBudgets) {
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
  // Build per-team slot fill counts from pick.positions
  // ------------------------------------------------------------------
  // For each team, track how many of each slot have been consumed.
  // We process picks in order, assigning each pick to the most restrictive
  // available slot (dedicated before flex before bench).
  //
  // teamFilledSlots: teamId → slot → count consumed
  const teamFilledSlots = new Map<string, Map<string, number>>();

  // Group picks by team to process each team independently
  const picksByTeam = new Map<string, Array<{ positions: string[] }>>();
  for (const pick of allPicks) {
    const teamId = pick.teamId;
    if (!picksByTeam.has(teamId)) {
      picksByTeam.set(teamId, []);
    }
    picksByTeam.get(teamId)!.push({ positions: pick.positions ?? [] });
  }

  for (const [teamId, teamPicks] of picksByTeam) {
    // Start with a mutable copy of the team's slot capacity
    const remainingSlots = new Map<string, number>(
      Object.entries(rosterSlots).filter(([, v]) => v > 0),
    );
    const filledSlots = new Map<string, number>();

    for (const { positions } of teamPicks) {
      if (positions.length === 0) {
        // Unknown positions — skip slot assignment for this pick
        continue;
      }

      const slot = findBestSlot(positions, remainingSlots);
      if (slot) {
        // Consume the slot
        const remaining = remainingSlots.get(slot)!;
        if (remaining <= 1) {
          remainingSlots.delete(slot);
        } else {
          remainingSlots.set(slot, remaining - 1);
        }
        filledSlots.set(slot, (filledSlots.get(slot) ?? 0) + 1);
      }
    }

    teamFilledSlots.set(teamId, filledSlots);
  }

  // ------------------------------------------------------------------
  // Determine which positions each team still needs
  // ------------------------------------------------------------------
  const totalTeams = teamRosters.size;

  // Competition factor counter: position → number of teams that need it
  const needCount: Record<string, number> = {};

  for (const [teamId] of teamRosters) {
    const filled = teamFilledSlots.get(teamId) ?? new Map();
    const stillNeeds = new Set<string>();

    for (const [slot, required] of Object.entries(rosterSlots)) {
      if (required <= 0) continue;

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
