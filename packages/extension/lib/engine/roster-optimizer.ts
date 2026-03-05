/**
 * roster-optimizer.ts
 *
 * Greedy knapsack roster optimizer with position-aware slot assignment.
 *
 * Exported function:
 *   optimizeRoster — fills roster slots by SGP/$ efficiency, respecting position constraints
 *
 * Pure function: no Zustand reads, no DOM access, no side effects.
 */

import type { PoolPlayer, RosterOptimizationResult } from "./types";

// ============================================================
// Constants
// ============================================================

/**
 * Slot assignment priority: most-restrictive (dedicated) positions first,
 * then flex slots. This ensures a catcher fills C before UTIL.
 */
const SLOT_PRIORITY: string[] = [
  "C", "SS", "2B", "3B", "1B", "OF", "CI", "MI", "UTIL", "P", "BN",
];

/**
 * Flex slot eligibility: which player positions can fill each flex slot.
 * Dedicated slots (C, 1B, 2B, 3B, SS, OF) are handled by exact position match.
 */
const FLEX_ELIGIBILITY: Record<string, string[]> = {
  CI: ["1B", "3B"],
  MI: ["2B", "SS"],
  UTIL: ["C", "1B", "2B", "3B", "SS", "OF", "DH"],
  BN: ["C", "1B", "2B", "3B", "SS", "OF", "DH", "SP", "RP", "P"],
  P: ["SP", "RP"],
};

/** Dedicated (non-flex) slots — exact position match required */
const DEDICATED_SLOTS = new Set(["C", "SS", "2B", "3B", "1B", "OF", "SP", "RP"]);

// ============================================================
// normalizePosition — normalize player position string for matching
// ============================================================

function normalizePosition(pos: string): string {
  const upper = pos.toUpperCase();
  if (upper === "DH") return "DH";
  if (upper === "SP" || upper.includes("SP")) return "SP";
  if (upper === "RP" || upper.includes("RP")) return "RP";
  if (upper === "P") return "SP";
  if (upper.includes("OF")) return "OF";
  return upper;
}

// ============================================================
// findBestSlot — find the most-specific available slot for a player
// ============================================================

/**
 * Find the best (most-restrictive) available slot for a player.
 *
 * Iterates SLOT_PRIORITY in order. For each slot with remaining count > 0:
 *   - Dedicated slot: player must have that exact position
 *   - Flex slot (CI, MI, UTIL, BN, P): player must have any eligible position
 *
 * Returns slot name or null if no slot is available.
 */
function findBestSlot(
  playerPositions: string[],
  remainingSlots: Map<string, number>,
): string | null {
  const normalizedPositions = playerPositions.map(normalizePosition);

  for (const slot of SLOT_PRIORITY) {
    const count = remainingSlots.get(slot) ?? 0;
    if (count <= 0) continue;

    if (DEDICATED_SLOTS.has(slot)) {
      // Dedicated slot: exact position match required
      if (normalizedPositions.includes(slot)) {
        return slot;
      }
    } else {
      // Flex slot: player must have any of the eligible positions
      const eligible = FLEX_ELIGIBILITY[slot];
      if (!eligible) continue;
      const hasMatch = normalizedPositions.some(pos => eligible.includes(pos));
      if (hasMatch) {
        return slot;
      }
    }
  }

  return null;
}

// ============================================================
// optimizeRoster — greedy knapsack optimizer
// ============================================================

/**
 * Optimize roster selection using a greedy knapsack approach.
 *
 * Algorithm:
 * 1. Apply locked players (pre-assigned at a fixed cost), decrement their slots, subtract from budget
 * 2. Sort remaining players by SGP/$ efficiency (descending)
 * 3. Reserve $1 per unfilled slot (minimum bid reserve)
 * 4. Greedily iterate: for each player, if affordable and a slot exists, add to roster
 *
 * Complexity: O(n log n) for sort + O(n * slots) for slot assignment
 *
 * @param players        Available players to consider (sorted by SGP/$ internally)
 * @param sgpValues      Parallel array of SGP values for each player
 * @param budget         Total remaining budget
 * @param rosterSlots    Slot definitions (e.g. { C:1, OF:3, P:6, ... })
 * @param lockedPlayers  Pre-assigned players (optional) — already in roster at a cost
 */
export function optimizeRoster(
  players: PoolPlayer[],
  sgpValues: number[],
  budget: number,
  rosterSlots: Record<string, number>,
  lockedPlayers?: { player: PoolPlayer; cost: number }[],
): RosterOptimizationResult {
  // Initialize remaining slots as a mutable Map
  const remainingSlots = new Map<string, number>();
  for (const [slot, count] of Object.entries(rosterSlots)) {
    if (count > 0) remainingSlots.set(slot, count);
  }

  const roster: PoolPlayer[] = [];
  let totalSGPValue = 0;
  let budgetUsed = 0;

  // ------------------------------------------------------------------
  // Phase 1: Apply locked players
  // ------------------------------------------------------------------
  if (lockedPlayers) {
    for (const { player, cost } of lockedPlayers) {
      const slot = findBestSlot(player.positions, remainingSlots);
      if (slot !== null) {
        const slotCount = remainingSlots.get(slot)!;
        if (slotCount > 1) {
          remainingSlots.set(slot, slotCount - 1);
        } else {
          remainingSlots.delete(slot);
        }
      }
      roster.push(player);
      budgetUsed += cost;
      // SGP for locked players is 0 unless caller passes it via a different mechanism
      // (locked players are pre-assigned; their SGP is tracked externally)
    }
  }

  let remainingBudget = budget - budgetUsed;

  // ------------------------------------------------------------------
  // Phase 2: Sort players by SGP/$ efficiency (descending)
  // ------------------------------------------------------------------
  const indexed = players.map((player, i) => ({
    player,
    sgp: sgpValues[i] ?? 0,
    efficiency: sgpValues[i] !== undefined && sgpValues[i] >= 0
      ? sgpValues[i] / Math.max(1, player.dollars)
      : 0,
  }));

  // O(n log n) sort
  indexed.sort((a, b) => b.efficiency - a.efficiency);

  // ------------------------------------------------------------------
  // Phase 3: Greedy fill with $1 reserve per remaining unfilled slot
  // ------------------------------------------------------------------
  const totalSlots = Array.from(remainingSlots.values()).reduce((s, v) => s + v, 0);
  let slotsToFill = totalSlots;

  for (const { player, sgp } of indexed) {
    if (slotsToFill === 0) break;

    // Find the best slot for this player
    const slot = findBestSlot(player.positions, remainingSlots);
    if (slot === null) continue;

    // Budget check: reserve $1 per remaining unfilled slot (excluding this one)
    // maxSpend = remainingBudget - (slotsToFill - 1)
    const reserveAmount = slotsToFill - 1; // $1 per each slot we still need to fill after this
    const maxSpend = Math.max(1, remainingBudget - reserveAmount);

    if (player.dollars > maxSpend) continue;

    // Fill the slot
    const slotCount = remainingSlots.get(slot)!;
    if (slotCount > 1) {
      remainingSlots.set(slot, slotCount - 1);
    } else {
      remainingSlots.delete(slot);
    }

    roster.push(player);
    totalSGPValue += sgp;
    budgetUsed += player.dollars;
    remainingBudget -= player.dollars;
    slotsToFill--;
  }

  // Count unfilled slots
  const unfilledSlots = Array.from(remainingSlots.values()).reduce((s, v) => s + v, 0);

  return {
    roster,
    totalSGPValue,
    budgetUsed,
    unfilledSlots,
  };
}
