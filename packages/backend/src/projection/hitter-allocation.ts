import type { StatComponents } from "../../../shared/dist/index.js";
import type { RosteredPlayer, SlotAssignment } from "./types.js";
import {
  canFillSlot,
  SPECIFIC_SLOT_TYPES,
  FLEX_SLOT_TYPES,
  OVERFLOW_SLOT_TYPES,
  BENCH_SLOT_TYPES,
} from "./slot-eligibility.js";

/**
 * Slot processing tiers: most constrained first.
 * Re-exported from slot-eligibility for reference.
 */
const SPECIFIC_SLOTS = SPECIFIC_SLOT_TYPES;
const FLEX_SLOTS = FLEX_SLOT_TYPES;
const OVERFLOW_SLOTS = OVERFLOW_SLOT_TYPES;
const BENCH_SLOTS = BENCH_SLOT_TYPES;

/**
 * Score a player for slot assignment priority.
 * Higher score = assigned first to starting slots.
 * Hitters: HR + RBI + R + SB
 * Pitchers: K + W*5 + SV*5
 */
export function scorePlayer(
  components: StatComponents | null,
  isPitcher: boolean,
): number {
  if (!components) return 0;
  if (isPitcher) {
    return (
      (components.K ?? 0) + (components.W ?? 0) * 5 + (components.SV ?? 0) * 5
    );
  }
  return (
    (components.HR ?? 0) +
    (components.RBI ?? 0) +
    (components.R ?? 0) +
    (components.SB ?? 0)
  );
}

/**
 * Detect if a player is pitcher-only (no batting contribution).
 * Two-way players like Ohtani have BOTH AB > 0 and IP > 0.
 */
function isPitcherOnly(components: StatComponents | null): boolean {
  if (!components) return false;
  const hasIP = (components.IP ?? 0) > 0;
  const hasAB = (components.AB ?? 0) > 0;
  return hasIP && !hasAB;
}

/**
 * Check if a slot is a pitcher slot.
 */
function isPitcherSlot(slotType: string): boolean {
  return slotType === "SP" || slotType === "RP" || slotType === "P";
}

/**
 * Greedy lineup allocation: fills most-constrained slots first.
 *
 * Slot processing order:
 *   Tier 1 (specific): C, 1B, 2B, 3B, SS, LF, CF, RF, OF, SP, RP
 *   Tier 2 (flex): MI, CI, P, DH
 *   Tier 3 (universal): UTIL
 *   Tier 4 (overflow): BN, BE, IL
 *
 * Within each slot, pick the eligible player with the HIGHEST
 * scorePlayer() who has not been assigned yet.
 *
 * Players with rosterStatus="bench" or "il" are immediately assigned
 * to their bench/IL slot with contributionWeight=0.0 without competing
 * for starting slots.
 */
export function allocateLineup(
  players: RosteredPlayer[],
  rosterSlots: Record<string, number>,
): SlotAssignment[] {
  if (players.length === 0) return [];

  const assignments: SlotAssignment[] = [];
  const assignedPlayerIds = new Set<number>();

  // Separate bench/IL players — they never compete for starting slots
  const benchPlayers = players.filter(
    (p) => p.rosterStatus === "bench" || p.rosterStatus === "il",
  );
  const activePlayers = players.filter((p) => p.rosterStatus === "active");

  // Handle bench/IL players immediately
  for (const player of benchPlayers) {
    const slot = player.rosterStatus === "il" ? "IL" : "BN";
    assignments.push({
      playerId: player.playerId,
      slot,
      contributionWeight: 0.0,
    });
    assignedPlayerIds.add(player.playerId);
  }

  // Build ordered list of starting slot types (tier 1 → 2 → 3)
  const slotKeys = Object.keys(rosterSlots);

  const specificSlotKeys = slotKeys.filter((s) => SPECIFIC_SLOTS.has(s));
  const flexSlotKeys = slotKeys.filter((s) => FLEX_SLOTS.has(s));
  const overflowSlotKeys = slotKeys.filter((s) => OVERFLOW_SLOTS.has(s));
  const benchSlotKeys = slotKeys.filter((s) => BENCH_SLOTS.has(s));

  const orderedStartingSlots = [
    ...specificSlotKeys,
    ...flexSlotKeys,
    ...overflowSlotKeys,
  ];

  // Score active players for sorting
  const playerScores = new Map<number, number>();
  for (const player of activePlayers) {
    const pitcherOnly = isPitcherOnly(player.projectedComponents);
    const score = scorePlayer(player.projectedComponents, pitcherOnly);
    playerScores.set(player.playerId, score);
  }

  // Sort players by score descending (higher scored players fill slots first)
  const sortedActivePlayers = [...activePlayers].sort(
    (a, b) =>
      (playerScores.get(b.playerId) ?? 0) - (playerScores.get(a.playerId) ?? 0),
  );

  // Greedy assignment: for each starting slot type, fill N slots
  for (const slotType of orderedStartingSlots) {
    const count = rosterSlots[slotType] ?? 0;
    const isSlotPitcherOnly = isPitcherSlot(slotType);

    for (let i = 0; i < count; i++) {
      // Find best unassigned eligible player for this slot
      const eligible = sortedActivePlayers.filter((p) => {
        if (assignedPlayerIds.has(p.playerId)) return false;

        // Pitcher-only slots: only pitcher-only players (or players with pitcher positions)
        // Hitter slots: pitcher-only players should not fill hitter slots
        if (isSlotPitcherOnly) {
          // SP/RP/P slots: player must have SP or RP position
          return canFillSlot(p.positions, slotType);
        } else {
          // Hitter slots: pitcher-only players should not fill them
          // (Two-way players with both AB and IP can fill hitter slots)
          if (
            isPitcherOnly(p.projectedComponents) &&
            p.positions.every((pos) => pos === "SP" || pos === "RP")
          ) {
            return false;
          }
          return canFillSlot(p.positions, slotType);
        }
      });

      if (eligible.length > 0) {
        const best = eligible[0]; // already sorted by score descending
        assignments.push({
          playerId: best.playerId,
          slot: slotType,
          contributionWeight: 1.0,
        });
        assignedPlayerIds.add(best.playerId);
      }
    }
  }

  // Handle bench slot overflow (BN/BE/IL capacity)
  for (const slotType of benchSlotKeys) {
    const count = rosterSlots[slotType] ?? 0;
    // Fill remaining unassigned active players into bench slots
    const unassigned = sortedActivePlayers.filter(
      (p) => !assignedPlayerIds.has(p.playerId),
    );
    const toAssign = unassigned.slice(0, count);
    for (const player of toAssign) {
      assignments.push({
        playerId: player.playerId,
        slot: slotType,
        contributionWeight: 0.0,
      });
      assignedPlayerIds.add(player.playerId);
    }
  }

  // Any remaining unassigned active players go to BN with weight 0.0
  for (const player of sortedActivePlayers) {
    if (!assignedPlayerIds.has(player.playerId)) {
      assignments.push({
        playerId: player.playerId,
        slot: "BN",
        contributionWeight: 0.0,
      });
      assignedPlayerIds.add(player.playerId);
    }
  }

  return assignments;
}
