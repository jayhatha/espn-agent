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
import { getSpTierCap } from "./draft-constants";

// ============================================================
// Constants
// ============================================================

/**
 * Slot assignment priority: most-restrictive (dedicated) positions first,
 * then flex slots. This ensures a catcher fills C before UTIL.
 */
const SLOT_PRIORITY: string[] = [
  "C", "SS", "2B", "3B", "1B", "OF", "SP", "RP", "DH", "CI", "MI", "UTIL", "P", "BN",
];

/**
 * Flex slot eligibility: which player positions can fill each flex slot.
 * Dedicated slots (C, 1B, 2B, 3B, SS, OF) are handled by exact position match.
 */
const FLEX_ELIGIBILITY: Record<string, string[]> = {
  CI: ["1B", "3B"],
  MI: ["2B", "SS"],
  DH: ["C", "1B", "2B", "3B", "SS", "OF", "DH"],
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
  if (upper === "LF" || upper === "CF" || upper === "RF" || upper.includes("OF")) return "OF";
  return upper;
}

// ============================================================
// canFillSlot — check if a player can fill a specific slot
// ============================================================

/**
 * Check if a player can fill a specific slot.
 * Reverse of findBestSlot: given a target slot, can this player occupy it?
 *
 * Used by the backfill pass, which iterates slots and looks for eligible players.
 * Do NOT reuse findBestSlot here — its API is inverted (player → best slot vs slot → can player fill it).
 */
function canFillSlot(playerPositions: string[], slot: string): boolean {
  const normalizedPositions = playerPositions.map(normalizePosition);

  if (DEDICATED_SLOTS.has(slot)) {
    // Dedicated slot: player must have exact position match
    return normalizedPositions.includes(slot);
  }

  // Flex slot: player must have a position in FLEX_ELIGIBILITY[slot]
  const eligible = FLEX_ELIGIBILITY[slot];
  if (!eligible) return false;
  return normalizedPositions.some(pos => eligible.includes(pos));
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
  const slotAssignments: string[] = [];
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
      slotAssignments.push(slot ?? "BN");
      budgetUsed += cost;
    }
  }

  let remainingBudget = budget - budgetUsed;

  // Count SP/P slots already filled by locked players (for tier cap enforcement)
  let spCount = 0;
  for (const assignment of slotAssignments) {
    if (assignment === "SP" || assignment === "P") spCount++;
  }

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

  // Track bench composition: max 2 hitter bench, 3 pitcher bench.
  // Without this, hitters (with higher SGP from the split multiplier) fill
  // all bench spots, leaving no room for RP ratio/saves help.
  const MAX_BENCH_HITTERS = 2;
  const MAX_BENCH_PITCHERS = 3;
  let benchHitters = 0;
  let benchPitchers = 0;

  for (const { player, sgp } of indexed) {
    if (slotsToFill === 0) break;

    // Find the best slot for this player
    const slot = findBestSlot(player.positions, remainingSlots);
    if (slot === null) continue;

    // Enforce bench composition: 2 hitter bench + 3 pitcher bench
    if (slot === "BN") {
      if (player.isPitcher) {
        if (benchPitchers >= MAX_BENCH_PITCHERS) continue;
      } else {
        if (benchHitters >= MAX_BENCH_HITTERS) continue;
      }
    }

    // SP tier cap enforcement: skip SPs that exceed the tier cap for their slot
    if (slot === "SP" || slot === "P") {
      const tierCap = getSpTierCap(spCount);
      if (player.dollars > tierCap) continue;
    }

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
    slotAssignments.push(slot);
    if (slot === "SP" || slot === "P") spCount++;
    if (slot === "BN") {
      if (player.isPitcher) benchPitchers++;
      else benchHitters++;
    }
    totalSGPValue += sgp;
    budgetUsed += player.dollars;
    remainingBudget -= player.dollars;
    slotsToFill--;
  }

  // ------------------------------------------------------------------
  // Phase 3b: Backfill pass
  // ------------------------------------------------------------------
  // After greedy fill, some slots may still be unfilled because the $1/slot reserve
  // prevented affordable picks. Backfill force-places the cheapest eligible player
  // into each remaining slot regardless of budget — the ideal roster MUST be complete.
  if (slotsToFill > 0) {
    const usedInRoster = new Set(roster);

    // Iterate SLOT_PRIORITY order so dedicated slots backfill before flex
    for (const slot of SLOT_PRIORITY) {
      const count = remainingSlots.get(slot) ?? 0;
      for (let s = 0; s < count; s++) {
        const isSpSlot = slot === "SP" || slot === "P";
        const tierCap = isSpSlot ? getSpTierCap(spCount) : Infinity;

        // Find cheapest eligible player not already in roster
        // Prefer players within SP tier cap; fall back to cheapest if none qualify.
        let cheapest: { player: PoolPlayer; sgp: number } | null = null;
        let cheapestFallback: { player: PoolPlayer; sgp: number } | null = null;
        for (const entry of indexed) {
          if (usedInRoster.has(entry.player)) continue;
          if (!canFillSlot(entry.player.positions, slot)) continue;

          // Track cheapest regardless of tier cap for fallback
          if (
            !cheapestFallback ||
            entry.player.dollars < cheapestFallback.player.dollars ||
            (entry.player.dollars === cheapestFallback.player.dollars && entry.sgp > cheapestFallback.sgp)
          ) {
            cheapestFallback = { player: entry.player, sgp: entry.sgp };
          }

          // Skip SPs over tier cap for primary selection
          if (isSpSlot && entry.player.dollars > tierCap) continue;

          if (
            !cheapest ||
            entry.player.dollars < cheapest.player.dollars ||
            (entry.player.dollars === cheapest.player.dollars && entry.sgp > cheapest.sgp)
          ) {
            cheapest = { player: entry.player, sgp: entry.sgp };
          }
        }

        // Use tier-cap-compliant pick if available, otherwise fall back to cheapest
        const pick = cheapest ?? cheapestFallback;
        if (pick) {
          // Place regardless of budget (fill is mandatory)
          roster.push(pick.player);
          slotAssignments.push(slot);
          if (isSpSlot) spCount++;
          usedInRoster.add(pick.player);
          totalSGPValue += pick.sgp;
          budgetUsed += pick.player.dollars;
          remainingBudget -= pick.player.dollars;
          slotsToFill--;

          // Decrement slot count in remainingSlots so outer loop doesn't double-count
          const c = remainingSlots.get(slot)!;
          if (c > 1) remainingSlots.set(slot, c - 1);
          else remainingSlots.delete(slot);
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // Phase 4: Budget upgrade pass
  // ------------------------------------------------------------------
  // The greedy fill picks by SGP/$ efficiency, which favors cheap players.
  // This can leave significant budget unspent. Iterate through the roster
  // and try to swap cheap players for more expensive (higher SGP) alternatives
  // until the budget is fully utilized.
  //
  // For each roster slot (cheapest first), find the best available upgrade:
  // a player with higher SGP who costs more but fits within remaining budget.
  {
    const usedNames = new Set(roster.map(p => p.normalizedName));

    // Sort roster indices by cost ascending (upgrade cheapest first)
    const upgradeOrder = roster
      .map((_, i) => i)
      .filter(i => !lockedPlayers?.some(lp => lp.player.normalizedName === roster[i].normalizedName))
      .sort((a, b) => roster[a].dollars - roster[b].dollars);

    for (const rosterIdx of upgradeOrder) {
      if (remainingBudget <= 0) break;

      const currentPlayer = roster[rosterIdx];
      const currentSlot = slotAssignments[rosterIdx];
      const currentSgpIdx = players.indexOf(currentPlayer);
      const currentSgp = currentSgpIdx >= 0 ? (sgpValues[currentSgpIdx] ?? 0) : 0;

      // Find best upgrade: higher SGP, fits the slot, affordable
      let bestUpgrade: { player: PoolPlayer; sgp: number; cost: number } | null = null;

      for (const entry of indexed) {
        if (usedNames.has(entry.player.normalizedName)) continue;
        if (!canFillSlot(entry.player.positions, currentSlot)) continue;

        const extraCost = entry.player.dollars - currentPlayer.dollars;
        if (extraCost <= 0) continue; // Not an upgrade in cost
        if (extraCost > remainingBudget) continue; // Can't afford
        if (entry.sgp <= currentSgp) continue; // Not an SGP upgrade

        // SP tier cap check for pitcher slots
        if (currentSlot === "SP" || currentSlot === "P") {
          // Find this slot's tier position
          const slotSpIndex = slotAssignments
            .filter((s, i) => (s === "SP" || s === "P") && i < rosterIdx)
            .length;
          const tierCap = getSpTierCap(slotSpIndex);
          if (entry.player.dollars > tierCap) continue;
        }

        if (!bestUpgrade || entry.sgp > bestUpgrade.sgp) {
          bestUpgrade = { player: entry.player, sgp: entry.sgp, cost: entry.player.dollars };
        }
      }

      if (bestUpgrade) {
        const extraCost = bestUpgrade.cost - currentPlayer.dollars;
        const sgpGain = bestUpgrade.sgp - currentSgp;

        usedNames.delete(currentPlayer.normalizedName);
        usedNames.add(bestUpgrade.player.normalizedName);
        roster[rosterIdx] = bestUpgrade.player;
        totalSGPValue += sgpGain;
        budgetUsed += extraCost;
        remainingBudget -= extraCost;
      }
    }
  }

  // Count unfilled slots
  const unfilledSlots = Array.from(remainingSlots.values()).reduce((s, v) => s + v, 0);

  return {
    roster,
    slotAssignments,
    totalSGPValue,
    budgetUsed,
    unfilledSlots,
  };
}
