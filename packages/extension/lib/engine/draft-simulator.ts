/**
 * draft-simulator.ts
 *
 * Forward-looking draft simulator for Phase 28.
 *
 * Exported functions:
 *   simulateFullDraft — completes remaining draft for all teams using softmax-weighted selection
 *   cloneSimState     — deep clone of SimDraftState (independent copy for simulation)
 *   computeSimStandings — lightweight roto standings from simulated rosters (component-based rate stats)
 *   softmaxSelect     — weighted random player selection using softmax over SGP + need boost
 *   draftPlayerToTeam — mutates SimDraftState in-place: drafts a player to a team
 *
 * Design decisions:
 * - Uses Set<number> for available player tracking — O(1) delete (per Phase 23)
 * - Top-K filtering (top 15 by SGP) before softmax for speed
 * - Temperature controls selection determinism: low = more greedy, high = more random
 * - Slot matching mirrors roster-optimizer.ts FLEX_ELIGIBILITY priority order
 *
 * Pure function: no Zustand reads, no DOM access, no side effects.
 */

import type { Category } from "@espn-fantasy/shared";
import { calculateFinalRate } from "@espn-fantasy/shared";
import type { PoolPlayer, SimDraftState, SimTeamState } from "./types";

// ============================================================
// Constants
// ============================================================

/** Flex slot eligibility: mirrors roster-optimizer.ts for consistency */
const FLEX_ELIGIBILITY: Record<string, string[]> = {
  CI: ["1B", "3B"],
  MI: ["2B", "SS"],
  UTIL: ["C", "1B", "2B", "3B", "SS", "OF", "DH"],
  P: ["SP", "RP"],
  BN: ["C", "1B", "2B", "3B", "SS", "OF", "DH", "SP", "RP"],
};

/** Slot priority: most-restrictive first (mirrors roster-optimizer.ts) */
const SLOT_PRIORITY: string[] = [
  "C", "SS", "2B", "3B", "1B", "OF", "SP", "RP", "CI", "MI", "UTIL", "P", "BN",
];

/** Dedicated slots (exact position match required) */
const DEDICATED_SLOTS = new Set(["C", "SS", "2B", "3B", "1B", "OF", "SP", "RP"]);

/** Top-K candidates to consider in softmax (performance optimization) */
const SOFTMAX_TOP_K = 15;

// ============================================================
// Internal: findSlotForPlayer
// ============================================================

/**
 * Find the best available slot for a player given remaining slots.
 * Returns the slot name or null if no fit.
 */
function findSlotForPlayer(
  positions: string[],
  slotsRemaining: Record<string, number>,
): string | null {
  const upperPositions = positions.map(p => p.toUpperCase());

  for (const slot of SLOT_PRIORITY) {
    if ((slotsRemaining[slot] ?? 0) <= 0) continue;

    if (DEDICATED_SLOTS.has(slot)) {
      // Exact position match required
      if (upperPositions.includes(slot)) return slot;
    } else {
      // Flex slot: check eligibility list
      const eligible = FLEX_ELIGIBILITY[slot];
      if (!eligible) continue;
      if (upperPositions.some(pos => eligible.includes(pos))) return slot;
    }
  }

  return null;
}

// ============================================================
// cloneSimState
// ============================================================

/**
 * Deep clone a SimDraftState without cloning the read-only player pool.
 *
 * Uses new Set() for availableIndices and spread operators for team states
 * so mutations to the clone don't affect the original.
 */
export function cloneSimState(state: SimDraftState): SimDraftState {
  return {
    availableIndices: new Set(state.availableIndices),
    myTeamIndex: state.myTeamIndex,
    teamStates: state.teamStates.map(team => ({
      budget: team.budget,
      slotsRemaining: { ...team.slotsRemaining },
      categoryTotals: { ...team.categoryTotals },
      componentTotals: { ...team.componentTotals },
    })),
  };
}

// ============================================================
// draftPlayerToTeam
// ============================================================

/**
 * Mutate SimDraftState in-place: draft a player to a team.
 *
 * - Removes playerIdx from availableIndices
 * - Decrements team budget by player.dollars
 * - Decrements slotsRemaining for best matching slot
 * - Increments categoryTotals from player.stats (all keys)
 * - Increments componentTotals from player.stats (for rate stat computation)
 *
 * Called on cloned states during simulation.
 */
export function draftPlayerToTeam(
  state: SimDraftState,
  teamIdx: number,
  playerIdx: number,
  players: PoolPlayer[],
): void {
  const player = players[playerIdx];
  if (!player) return;

  const team = state.teamStates[teamIdx];
  if (!team) return;

  // Remove from available pool
  state.availableIndices.delete(playerIdx);

  // Deduct budget
  team.budget -= player.dollars;

  // Decrement matching slot
  const slot = findSlotForPlayer(player.positions, team.slotsRemaining);
  if (slot !== null) {
    if (team.slotsRemaining[slot] > 1) {
      team.slotsRemaining[slot]--;
    } else {
      delete team.slotsRemaining[slot];
    }
  }

  // Accumulate all stats into categoryTotals and componentTotals
  for (const [key, value] of Object.entries(player.stats)) {
    if (typeof value !== "number" || !isFinite(value)) continue;
    team.categoryTotals[key] = (team.categoryTotals[key] ?? 0) + value;
    team.componentTotals[key] = (team.componentTotals[key] ?? 0) + value;
  }
}

// ============================================================
// softmaxSelect
// ============================================================

/**
 * Select a player using softmax-weighted random selection.
 *
 * Algorithm:
 * 1. Filter candidates by budget (maxSpend = budget - max(0, totalSlots - 1)) and slot fit
 * 2. Take top-K by SGP for speed
 * 3. Compute composite score = max(0.01, sgp + needBoost)
 *    - needBoost: +2.0 * slotsRemaining per matching position
 * 4. Apply softmax: exp((score - maxScore) / temperature)
 * 5. Weighted random selection
 *
 * Returns -1 if no valid candidates.
 */
export function softmaxSelect(
  available: Set<number>,
  players: PoolPlayer[],
  sgpValues: number[],
  team: SimTeamState,
  temperature: number,
): number {
  if (available.size === 0) return -1;

  const totalSlotsRemaining = Object.values(team.slotsRemaining).reduce((s, v) => s + v, 0);
  if (totalSlotsRemaining <= 0) return -1;

  // Budget reserve: keep $1 per remaining slot after this pick
  const reserve = Math.max(0, totalSlotsRemaining - 1);
  const maxSpend = Math.max(1, team.budget - reserve);

  // Filter candidates by budget and slot fit, collecting index + score
  const candidates: Array<{ idx: number; score: number }> = [];

  for (const idx of available) {
    const player = players[idx];
    if (!player) continue;

    // Budget check
    if (player.dollars > maxSpend) continue;

    // Slot fit check
    const slot = findSlotForPlayer(player.positions, team.slotsRemaining);
    if (slot === null) continue;

    // Compute composite score: SGP + position need boost
    const sgp = sgpValues[idx] ?? 0;
    let needBoost = 0;
    for (const pos of player.positions) {
      const upper = pos.toUpperCase();
      const slotCount = team.slotsRemaining[upper] ?? 0;
      if (slotCount > 0) {
        needBoost += 2.0 * slotCount;
        break; // one boost per player
      }
    }

    const score = Math.max(0.01, sgp + needBoost);
    candidates.push({ idx, score });
  }

  if (candidates.length === 0) return -1;

  // Top-K filtering by score for speed
  if (candidates.length > SOFTMAX_TOP_K) {
    candidates.sort((a, b) => b.score - a.score);
    candidates.length = SOFTMAX_TOP_K;
  }

  // Softmax with numerical stability (subtract maxScore)
  const maxScore = candidates.reduce((m, c) => Math.max(m, c.score), -Infinity);
  const weights = candidates.map(c => Math.exp((c.score - maxScore) / temperature));
  const totalWeight = weights.reduce((s, w) => s + w, 0);

  // Weighted random selection
  let rand = Math.random() * totalWeight;
  for (let i = 0; i < candidates.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return candidates[i].idx;
  }

  // Fallback: return last candidate (floating-point rounding edge case)
  return candidates[candidates.length - 1].idx;
}

// ============================================================
// computeSimStandings
// ============================================================

/**
 * Compute roto points per team from simulated roster state.
 *
 * For each category:
 * - COUNTING: read directly from categoryTotals
 * - RATE: compute from componentTotals using calculateFinalRate
 *
 * Assigns roto points: rank 1 = N pts (best), rank N = 1 pt (worst).
 * LOWER_BETTER: ascending sort, zeros pushed to bottom.
 * HIGHER_BETTER: descending sort, zeros naturally fall to bottom.
 *
 * Returns parallel array of roto points [team0Pts, team1Pts, ...].
 */
export function computeSimStandings(
  teamStates: SimTeamState[],
  categories: Category[],
): number[] {
  const n = teamStates.length;
  const rotoPts = new Array<number>(n).fill(0);

  for (const cat of categories) {
    const isLowerBetter = cat.direction === "LOWER_BETTER";

    // Extract category value for each team
    const teamValues: Array<{ teamIdx: number; value: number }> = teamStates.map((team, i) => {
      let value = 0;

      if (cat.type === "COUNTING") {
        value = team.categoryTotals[cat.stat_key] ?? 0;
      } else if (cat.type === "RATE" && cat.formula_id) {
        // Guard against IP=0 for pitcher rate stats
        if ((cat.stat_key === "ERA" || cat.formula_id === "era" || cat.formula_id === "whip") &&
            (team.componentTotals["IP"] ?? 0) <= 0) {
          value = 0;
        } else {
          try {
            const rate = calculateFinalRate(cat.formula_id, {}, team.componentTotals);
            value = isFinite(rate) ? rate : 0;
          } catch {
            value = 0;
          }
        }
      }

      return { teamIdx: i, value };
    });

    // Sort: push zero values to bottom (worst rank) regardless of direction
    if (isLowerBetter) {
      // ERA/WHIP: lower is better, but zero means no data → push to bottom
      teamValues.sort((a, b) => {
        if (a.value === 0 && b.value === 0) return 0;
        if (a.value === 0) return 1;   // Zero data → worst
        if (b.value === 0) return -1;
        return a.value - b.value;       // Ascending: lowest value ranks best
      });
    } else {
      // HIGHER_BETTER: descending, zeros fall to bottom naturally
      teamValues.sort((a, b) => b.value - a.value);
    }

    // Assign roto points: rank 1 → N pts, rank N → 1 pt
    // Tie-aware: tied teams share the average of the positions they span
    let i = 0;
    while (i < teamValues.length) {
      let j = i;
      while (j < teamValues.length && teamValues[j].value === teamValues[i].value) {
        j++;
      }
      // Average the roto points across the tied group
      let totalPts = 0;
      for (let k = i; k < j; k++) {
        totalPts += n - k;
      }
      const avgPts = totalPts / (j - i);
      for (let k = i; k < j; k++) {
        rotoPts[teamValues[k].teamIdx] += avgPts;
      }
      i = j;
    }
  }

  return rotoPts;
}

// ============================================================
// simulateFullDraft
// ============================================================

/**
 * Simulate the remaining draft to completion for all teams.
 *
 * Algorithm:
 * 1. Clone state (do NOT mutate input)
 * 2. Round-robin: for each team that still has slots remaining, call softmaxSelect
 *    and draftPlayerToTeam
 * 3. Continue until a full round passes with zero picks (all teams done or pool empty)
 *
 * @param players      Full player pool (read-only, never mutated)
 * @param sgpValues    Parallel SGP array (read-only)
 * @param categories   League scoring categories (used only for context; standings computed separately)
 * @param initialState Starting state (will be cloned)
 * @param temperature  Softmax temperature (1.0 = normal, 0.1 = near-greedy)
 * @returns            Completed SimDraftState with all rosters filled
 */
export function simulateFullDraft(
  players: PoolPlayer[],
  sgpValues: number[],
  categories: Category[],
  initialState: SimDraftState,
  temperature: number,
): SimDraftState {
  const state = cloneSimState(initialState);

  while (true) {
    let picksThisRound = 0;

    for (let teamIdx = 0; teamIdx < state.teamStates.length; teamIdx++) {
      const team = state.teamStates[teamIdx];

      // Skip teams with no remaining slots
      const totalRemaining = Object.values(team.slotsRemaining).reduce((s, v) => s + v, 0);
      if (totalRemaining <= 0) continue;

      // Skip if pool is empty
      if (state.availableIndices.size === 0) continue;

      // Pick a player using softmax selection
      const selected = softmaxSelect(
        state.availableIndices,
        players,
        sgpValues,
        team,
        temperature,
      );

      if (selected === -1) continue; // No valid pick for this team

      draftPlayerToTeam(state, teamIdx, selected, players);
      picksThisRound++;
    }

    // If no picks were made this round, we're done (all teams full or pool empty)
    if (picksThisRound === 0) break;
  }

  return state;
}
