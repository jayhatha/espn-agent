import type { StatComponents } from "../../../shared/dist/index.js";
import { combineComponents } from "../../../shared/dist/index.js";
import { computeProrateFactor, prorateComponents } from "./staleness.js";
import { allocateLineup } from "./hitter-allocation.js";
import { applyGsCap } from "./pitcher-scaling.js";
import type { AllocationInput, AllocationResult, RosteredPlayer, RosterGap } from "./types.js";

/**
 * Stat keys that belong to batting statistics.
 */
const BATTER_COMPONENT_KEYS = new Set([
  "AB", "H", "R", "HR", "RBI", "SB", "BB", "HBP", "SF", "TB",
  "1B", "2B", "3B", "CS", "PA", "G",
]);

/**
 * Stat keys that belong to pitching statistics.
 */
const PITCHER_COMPONENT_KEYS = new Set([
  "IP", "ER", "HA", "BBA", "K", "SO", "W", "SV", "HLD", "QS", "GS", "G",
]);

/**
 * Non-contributing slot types (bench/injured list).
 */
const BENCH_SLOT_TYPES = new Set(["BN", "BE", "IL"]);

/**
 * Detect if a player's projection indicates pitcher-only (no batting contribution).
 * Two-way players have BOTH AB > 0 and IP > 0.
 */
function isPitcherOnly(components: StatComponents | null): boolean {
  if (!components) return false;
  return (components.IP ?? 0) > 0 && (components.AB ?? 0) === 0;
}

/**
 * Detect if a player is a two-way player (contributes both batting and pitching).
 * Example: Ohtani with AB=300 and IP=100.
 */
function isTwoWayPlayer(components: StatComponents | null): boolean {
  if (!components) return false;
  return (components.IP ?? 0) > 0 && (components.AB ?? 0) > 0;
}

/**
 * Extract only batter-relevant components from a stat object.
 */
function extractBatterComponents(components: StatComponents): StatComponents {
  const result: StatComponents = {};
  for (const key of BATTER_COMPONENT_KEYS) {
    if (components[key] !== undefined) result[key] = components[key];
  }
  return result;
}

/**
 * Extract only pitcher-relevant components from a stat object.
 */
function extractPitcherComponents(components: StatComponents): StatComponents {
  const result: StatComponents = {};
  for (const key of PITCHER_COMPONENT_KEYS) {
    if (components[key] !== undefined) result[key] = components[key];
  }
  return result;
}

/**
 * Check if a slot is a starting pitcher slot.
 */
function isSpSlot(slotType: string): boolean {
  return slotType === "SP";
}

/**
 * Check if a slot is a relief pitcher slot.
 */
function isRpSlot(slotType: string): boolean {
  return slotType === "RP";
}

/**
 * Unified projection allocator pipeline.
 *
 * Execution order:
 *   1. Prorate: Apply staleness prorate factor to all player projections
 *   2. Prepare roster: Attach prorated projections to each RosteredPlayer
 *   3. Allocate lineup: Greedy assignment of players to starting slots
 *   4. Detect two-way players: Split batting/pitching components
 *   5. Split pitchers: Separate SP and RP by position
 *   6. Apply GS cap: Scale SP components by remaining GS budget
 *   7. Sum batter components: Aggregate batting stats from all starters
 *   8. Sum pitcher components: Aggregate pitching stats from SP (scaled) + RP (unscaled)
 *   9. Detect roster gaps: Flag empty starting slots
 *  10. Return AllocationResult
 */
export function allocateProjections(input: AllocationInput): AllocationResult {
  const {
    roster,
    rosterSlots,
    projectionsByPlayerId,
    gsUsed,
    gsCap,
    projectionAsOfDate,
    snapshotDate,
    seasonEndDate,
  } = input;

  // ── 1. Prorate ──────────────────────────────────────────────────────────────
  const prorateFactor = computeProrateFactor(
    projectionAsOfDate,
    snapshotDate,
    seasonEndDate,
  );

  // ── 2. Build prorated projection map ────────────────────────────────────────
  const proratedProjections = new Map<number, StatComponents>();
  for (const [playerId, components] of projectionsByPlayerId) {
    const prorated = prorateComponents(components as Record<string, number | undefined>, prorateFactor);
    proratedProjections.set(playerId, prorated as StatComponents);
  }

  // ── 3. Prepare roster players with prorated projections ──────────────────────
  if (roster.length === 0) {
    return {
      batterComponents: {},
      pitcherComponents: {},
      assignments: [],
      gaps: [],
      gsScaleFactor: 1.0,
      prorateFactor,
    };
  }

  const playersWithProjections: RosteredPlayer[] = roster.map((player) => ({
    ...player,
    projectedComponents: proratedProjections.get(player.playerId) ?? null,
  }));

  // ── 4. Allocate lineup via greedy slot assignment ────────────────────────────
  const assignments = allocateLineup(playersWithProjections, rosterSlots);

  // ── 5. Split assignments into starters (weight > 0) ─────────────────────────
  const starterAssignments = assignments.filter((a) => a.contributionWeight > 0);

  // Build lookup: playerId -> player with prorated projections
  const playerMap = new Map<number, RosteredPlayer>(
    playersWithProjections.map((p) => [p.playerId, p]),
  );

  // ── 6. Collect SP projections for GS cap scaling ─────────────────────────────
  const spProjections: Array<{ playerId: number; components: StatComponents; projectedGS: number | null }> = [];
  const rpStarterIds = new Set<number>();

  for (const assignment of starterAssignments) {
    const slotType = assignment.slot;
    const player = playerMap.get(assignment.playerId);
    if (!player || !player.projectedComponents) continue;

    if (isSpSlot(slotType)) {
      const gs = player.projectedComponents.GS ?? null;
      spProjections.push({
        playerId: player.playerId,
        components: player.projectedComponents,
        projectedGS: gs,
      });
    } else if (isRpSlot(slotType)) {
      rpStarterIds.add(player.playerId);
    }
  }

  // ── 7. Apply GS cap to SP projections ────────────────────────────────────────
  const { scaledProjections, scaleFactor: gsScaleFactor } = applyGsCap(
    gsUsed,
    gsCap,
    spProjections,
  );

  // ── 8. Sum batter components ──────────────────────────────────────────────────
  let batterComponents: StatComponents = {};

  for (const assignment of starterAssignments) {
    const player = playerMap.get(assignment.playerId);
    if (!player || !player.projectedComponents) continue;

    const components = player.projectedComponents;

    // Skip pitcher-only players in batter summation
    if (isPitcherOnly(components)) continue;

    // For two-way players (like Ohtani), extract only batting components
    const batComponents = isTwoWayPlayer(components)
      ? extractBatterComponents(components)
      : extractBatterComponents(components);

    if (Object.keys(batComponents).length > 0) {
      batterComponents = combineComponents(batterComponents, batComponents);
    }
  }

  // ── 9. Sum pitcher components ─────────────────────────────────────────────────
  let pitcherComponents: StatComponents = {};

  // Add scaled SP components
  for (const { scaledComponents } of scaledProjections) {
    const pitchComponents = extractPitcherComponents(scaledComponents);
    if (Object.keys(pitchComponents).length > 0) {
      pitcherComponents = combineComponents(pitcherComponents, pitchComponents);
    }
  }

  // Add unscaled RP components
  for (const assignment of starterAssignments) {
    if (!rpStarterIds.has(assignment.playerId)) continue;
    const player = playerMap.get(assignment.playerId);
    if (!player || !player.projectedComponents) continue;

    const pitchComponents = extractPitcherComponents(player.projectedComponents);
    if (Object.keys(pitchComponents).length > 0) {
      pitcherComponents = combineComponents(pitcherComponents, pitchComponents);
    }
  }

  // Also add two-way player pitching contributions (they fill hitter slots but have IP)
  for (const assignment of starterAssignments) {
    const player = playerMap.get(assignment.playerId);
    if (!player || !player.projectedComponents) continue;
    if (!isTwoWayPlayer(player.projectedComponents)) continue;

    // Only add if not already counted as SP or RP
    const isAlreadyCounted =
      scaledProjections.some((sp) => sp.playerId === player.playerId) ||
      rpStarterIds.has(player.playerId);

    if (!isAlreadyCounted) {
      const pitchComponents = extractPitcherComponents(player.projectedComponents);
      if (Object.keys(pitchComponents).length > 0) {
        pitcherComponents = combineComponents(pitcherComponents, pitchComponents);
      }
    }
  }

  // ── 10. Detect roster gaps ─────────────────────────────────────────────────────
  const gaps: RosterGap[] = [];

  // Count assignments per starting slot type
  const slotFillCount = new Map<string, number>();
  for (const assignment of starterAssignments) {
    slotFillCount.set(
      assignment.slot,
      (slotFillCount.get(assignment.slot) ?? 0) + 1,
    );
  }

  for (const [slotType, count] of Object.entries(rosterSlots)) {
    // Only check starting slots (not bench/IL)
    if (BENCH_SLOT_TYPES.has(slotType)) continue;
    if (count <= 0) continue;

    const filled = slotFillCount.get(slotType) ?? 0;
    if (filled < count) {
      gaps.push({
        slot: slotType,
        severity: "empty",
        suggestion: `Team needs a ${slotType} -- consider waiver pickup`,
      });
    }
  }

  return {
    batterComponents,
    pitcherComponents,
    assignments,
    gaps,
    gsScaleFactor,
    prorateFactor,
  };
}
