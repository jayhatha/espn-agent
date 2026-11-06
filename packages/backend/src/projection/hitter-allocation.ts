import type { StatComponents } from "../../../shared/dist/index.js";
import type { RosteredPlayer, SlotAssignment } from "./types.js";
import {
  canFillSlot,
  SPECIFIC_SLOT_TYPES,
  FLEX_SLOT_TYPES,
  OVERFLOW_SLOT_TYPES,
  BENCH_SLOT_TYPES,
} from "./slot-eligibility.js";
import { findMaximumWeightAssignment } from "./maximum-weight-assignment.js";

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

function canAssignPlayer(player: RosteredPlayer, slotType: string): boolean {
  if (isPitcherSlot(slotType)) {
    return canFillSlot(player.positions, slotType);
  }
  if (
    isPitcherOnly(player.projectedComponents) &&
    player.positions.every((pos) => pos === "SP" || pos === "RP")
  ) {
    return false;
  }
  return canFillSlot(player.positions, slotType);
}

/**
 * Deterministic maximum-weight feasible assignment across projected RoS slots.
 * Active, bench, and projected IL players compete; NA/unknown and unprojected
 * IL players are unavailable.
 */
export function allocateLineup(
  players: RosteredPlayer[],
  rosterSlots: Record<string, number>,
): SlotAssignment[] {
  if (players.length === 0) return [];

  const assignments: SlotAssignment[] = [];
  const assignedPlayerIds = new Set<number>();

  const unavailablePlayers = players.filter(
    (p) =>
      (p.rosterStatus === "il" && p.projectedComponents === null) ||
      p.rosterStatus === "na" ||
      p.rosterStatus === "unknown",
  );
  const availablePlayers = players.filter(
    (p) =>
      p.rosterStatus === "active" ||
      p.rosterStatus === "bench" ||
      (p.rosterStatus === "il" && p.projectedComponents !== null),
  );

  for (const player of unavailablePlayers) {
    const slot = player.rosterStatus === "na" ? "NA" : "IL";
    assignments.push({
      playerId: player.playerId,
      slot,
      contributionWeight: 0.0,
    });
    assignedPlayerIds.add(player.playerId);
  }

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

  const playerScores = new Map<number, number>();
  for (const player of availablePlayers) {
    const pitcherOnly = isPitcherOnly(player.projectedComponents);
    const score = scorePlayer(player.projectedComponents, pitcherOnly);
    playerScores.set(player.playerId, score);
  }

  const sortedActivePlayers = [...availablePlayers].sort(
    (a, b) =>
      (playerScores.get(b.playerId) ?? 0) -
        (playerScores.get(a.playerId) ?? 0) || a.playerId - b.playerId,
  );

  const startingSlots = orderedStartingSlots.flatMap((slotType) =>
    Array.from({ length: rosterSlots[slotType] ?? 0 }, () => slotType),
  );
  const assignedPlayerBySlot = findMaximumWeightAssignment(
    sortedActivePlayers,
    startingSlots,
    (player) => playerScores.get(player.playerId) ?? 0,
    canAssignPlayer,
  );
  for (let slotIndex = 0; slotIndex < startingSlots.length; slotIndex++) {
    const playerIndex = assignedPlayerBySlot.get(slotIndex);
    if (playerIndex === undefined) continue;
    const player = sortedActivePlayers[playerIndex];
    assignments.push({
      playerId: player.playerId,
      slot: startingSlots[slotIndex],
      contributionWeight: 1.0,
    });
    assignedPlayerIds.add(player.playerId);
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
