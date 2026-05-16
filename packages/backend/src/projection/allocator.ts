import type { StatComponents } from "../../../shared/dist/index.js";
import {
  combineComponents,
  extractBatterComponents,
  extractPitcherComponents,
} from "../../../shared/dist/index.js";
import { computeProrateFactor, prorateComponents } from "./staleness.js";
import { allocateLineup } from "./hitter-allocation.js";
import { applyGsCap } from "./pitcher-scaling.js";
import { computeConfidenceIntervals } from "./variance.js";
import type {
  AllocationInput,
  AllocationResult,
  RosteredPlayer,
  RosterGap,
} from "./types.js";

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
 * Check if a slot is a pitcher slot (SP, RP, or generic P).
 */
function isPitcherSlot(slotType: string): boolean {
  return slotType === "SP" || slotType === "RP" || slotType === "P";
}

/**
 * Determine if a pitcher in a given slot should be treated as an SP (subject to GS cap).
 * SP slot = always SP. P slot = SP if projected GS > 0. RP slot = never SP.
 */
function shouldTreatAsSP(
  slotType: string,
  components: StatComponents | null,
): boolean {
  if (slotType === "SP") return true;
  if (slotType === "RP") return false;
  // "P" slot: classify by projected GS or IP threshold
  if (slotType === "P" && components) {
    if ((components.GS ?? 0) > 0) return true;
    // Fallback: high IP without GS data suggests starter
    if ((components.IP ?? 0) > 80 && components.GS === undefined) return true;
  }
  return false;
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
    const prorated = prorateComponents(
      components as Record<string, number | undefined>,
      prorateFactor,
    );
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
      batterConfidence: {},
      pitcherConfidence: {},
    };
  }

  const playersWithProjections: RosteredPlayer[] = roster.map((player) => ({
    ...player,
    projectedComponents: proratedProjections.get(player.playerId) ?? null,
  }));

  // ── 4. Allocate lineup via greedy slot assignment ────────────────────────────
  const assignments = allocateLineup(playersWithProjections, rosterSlots);

  // ── 5. Split assignments into starters (weight > 0) ─────────────────────────
  const starterAssignments = assignments.filter(
    (a) => a.contributionWeight > 0,
  );

  // Build lookup: playerId -> player with prorated projections
  const playerMap = new Map<number, RosteredPlayer>(
    playersWithProjections.map((p) => [p.playerId, p]),
  );

  // ── 6. Collect SP projections for GS cap scaling ─────────────────────────────
  // Pitchers in SP, RP, or P slots are classified:
  //   - SP slot or P-slot with GS > 0 → SP (subject to GS cap)
  //   - RP slot or P-slot with no GS → RP (never scaled)
  const spProjections: Array<{
    playerId: number;
    components: StatComponents;
    projectedGS: number | null;
  }> = [];
  const rpStarterIds = new Set<number>();

  for (const assignment of starterAssignments) {
    const slotType = assignment.slot;
    const player = playerMap.get(assignment.playerId);
    if (!player || !player.projectedComponents) continue;

    if (!isPitcherSlot(slotType)) continue;

    if (shouldTreatAsSP(slotType, player.projectedComponents)) {
      const gs = player.projectedComponents.GS ?? null;
      spProjections.push({
        playerId: player.playerId,
        components: player.projectedComponents,
        projectedGS: gs,
      });
    } else {
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
  const perPlayerBatterProjections: StatComponents[] = [];

  for (const assignment of starterAssignments) {
    const player = playerMap.get(assignment.playerId);
    if (!player || !player.projectedComponents) continue;

    const components = player.projectedComponents;

    // Skip pitcher-only players in batter summation
    if (isPitcherOnly(components)) continue;

    const batComponents = extractBatterComponents(components);

    if (Object.keys(batComponents).length > 0) {
      batterComponents = combineComponents(batterComponents, batComponents);
      perPlayerBatterProjections.push(batComponents);
    }
  }

  // ── 9. Sum pitcher components ─────────────────────────────────────────────────
  let pitcherComponents: StatComponents = {};
  const perPlayerPitcherProjections: StatComponents[] = [];

  // Add scaled SP components
  for (const { scaledComponents } of scaledProjections) {
    const pitchComponents = extractPitcherComponents(scaledComponents);
    if (Object.keys(pitchComponents).length > 0) {
      pitcherComponents = combineComponents(pitcherComponents, pitchComponents);
      perPlayerPitcherProjections.push(pitchComponents);
    }
  }

  // Add unscaled RP components
  for (const assignment of starterAssignments) {
    if (!rpStarterIds.has(assignment.playerId)) continue;
    const player = playerMap.get(assignment.playerId);
    if (!player || !player.projectedComponents) continue;

    const pitchComponents = extractPitcherComponents(
      player.projectedComponents,
    );
    if (Object.keys(pitchComponents).length > 0) {
      pitcherComponents = combineComponents(pitcherComponents, pitchComponents);
      perPlayerPitcherProjections.push(pitchComponents);
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
      const pitchComponents = extractPitcherComponents(
        player.projectedComponents,
      );
      if (Object.keys(pitchComponents).length > 0) {
        pitcherComponents = combineComponents(
          pitcherComponents,
          pitchComponents,
        );
        perPlayerPitcherProjections.push(pitchComponents);
      }
    }
  }

  // ── 9b. Compute confidence intervals from per-player data ─────────────────────
  const BATTER_COUNTING_KEYS = [
    "HR",
    "R",
    "RBI",
    "SB",
    "H",
    "AB",
    "BB",
    "HBP",
    "SF",
    "TB",
  ];
  const PITCHER_COUNTING_KEYS = [
    "K",
    "W",
    "SV",
    "HLD",
    "QS",
    "IP",
    "ER",
    "HA",
    "BBA",
  ];

  const batterConfidence = computeConfidenceIntervals(
    perPlayerBatterProjections,
    BATTER_COUNTING_KEYS,
  );
  const pitcherConfidence = computeConfidenceIntervals(
    perPlayerPitcherProjections,
    PITCHER_COUNTING_KEYS,
  );

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
    batterConfidence,
    pitcherConfidence,
  };
}
