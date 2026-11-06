import type { Category, StatComponents } from "../../../shared/dist/index.js";
import { calculateFinalRate } from "../../../shared/dist/index.js";
import {
  canFillSlot,
  canonicalSlotName,
} from "../projection/slot-eligibility.js";
import { findMaximumWeightAssignment } from "../projection/maximum-weight-assignment.js";

export interface DraftValuePlayer {
  playerId: number;
  positions: string[];
  projectedStats: StatComponents;
}

export interface DraftValueResult {
  playerId: number;
  positions: string[];
  primaryPosition: string;
  categorySGPs: Record<string, number>;
  sgpTotal: number;
}

interface Assignment {
  player: DraftValuePlayer;
  slot: string;
}

const INACTIVE_SLOTS = new Set(["IL", "NA"]);
const BENCH_SLOTS = new Set(["BN"]);

export function canonicalEligiblePositions(
  positions: string[],
  components: StatComponents,
): string[] {
  const eligible = new Set(positions.map((position) => position.toUpperCase()));
  if ((components.AB ?? 0) > 0 || (components.PA ?? 0) > 0)
    eligible.add("UTIL");
  if ((components.IP ?? 0) > 0 || (components.GS ?? 0) > 0) eligible.add("P");
  return [...eligible];
}

export function getDraftableRosterSlots(
  rosterSlots: Record<string, number>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [rawSlot, count] of Object.entries(rosterSlots)) {
    const slot = canonicalSlotName(rawSlot);
    if (INACTIVE_SLOTS.has(slot) || count <= 0) continue;
    result[slot] = (result[slot] ?? 0) + count;
  }
  return result;
}

export function selectRosterFeasiblePlayers<T extends DraftValuePlayer>(
  players: T[],
  rosterSlots: Record<string, number>,
  totalTeams: number,
  score: (player: T) => number,
): T[] {
  return distributePlayers(players, rosterSlots, totalTeams, score)
    .flat()
    .map((assignment) => assignment.player as T);
}

export function calculateRosterBasedValues(
  players: DraftValuePlayer[],
  categories: Category[],
  rosterSlots: Record<string, number>,
  totalTeams: number,
): DraftValueResult[] {
  const normalizedPlayers = players.map((player) => ({
    ...player,
    positions: canonicalEligiblePositions(
      player.positions,
      player.projectedStats,
    ),
  }));
  const categoryMaximums = new Map<string, number>();
  for (const category of categories) {
    if (category.type !== "COUNTING") continue;
    categoryMaximums.set(
      category.category_id,
      Math.max(
        1,
        ...normalizedPlayers.map((player) =>
          Math.abs(player.projectedStats[category.stat_key] ?? 0),
        ),
      ),
    );
  }
  const seedScore = (player: DraftValuePlayer): number =>
    categories.reduce((sum, category) => {
      const direction = category.direction === "LOWER_BETTER" ? -1 : 1;
      if (category.type === "COUNTING") {
        return (
          sum +
          (direction * (player.projectedStats[category.stat_key] ?? 0)) /
            (categoryMaximums.get(category.category_id) ?? 1)
        );
      }
      if (category.type === "RATE" && category.formula_id) {
        try {
          return (
            sum +
            direction *
              calculateFinalRate(category.formula_id, {}, player.projectedStats)
          );
        } catch {
          return sum;
        }
      }
      return sum;
    }, 0);

  const distributions = distributePlayers(
    normalizedPlayers,
    rosterSlots,
    totalTeams,
    seedScore,
  );
  const activeDistributions = distributions.map((assignments) =>
    assignments.filter((assignment) => !BENCH_SLOTS.has(assignment.slot)),
  );
  const teamComponents = activeDistributions.map((assignments) =>
    assignments.reduce(
      (totals, assignment) =>
        addComponents(totals, assignment.player.projectedStats),
      {} as StatComponents,
    ),
  );
  const averageTeamComponents = scaleComponents(
    teamComponents.reduce(addComponents, {} as StatComponents),
    teamComponents.length > 0 ? 1 / teamComponents.length : 1,
  );
  const denominators = calculateStandingsDenominators(
    teamComponents,
    categories,
  );
  const replacementBySlot = new Map<string, DraftValuePlayer>();
  for (const assignment of activeDistributions.flat()) {
    const current = replacementBySlot.get(assignment.slot);
    if (!current || seedScore(assignment.player) < seedScore(current)) {
      replacementBySlot.set(assignment.slot, assignment.player);
    }
  }
  const activeSlots = Object.keys(getDraftableRosterSlots(rosterSlots)).filter(
    (slot) => !BENCH_SLOTS.has(slot),
  );

  return normalizedPlayers.map((player) => {
    let bestTotal = Number.NEGATIVE_INFINITY;
    let bestPosition = player.positions[0] ?? "UTIL";
    let bestCategories: Record<string, number> = {};

    for (const slot of activeSlots) {
      if (!canFillSlot(player.positions, slot)) continue;
      const replacement = replacementBySlot.get(slot);
      if (!replacement) continue;
      const replacementRoster = subtractComponents(
        averageTeamComponents,
        replacement.projectedStats,
      );
      const candidateRoster = addComponents(
        replacementRoster,
        player.projectedStats,
      );
      const categorySGPs: Record<string, number> = {};
      let total = 0;

      for (const category of categories) {
        const before = categoryValue(category, averageTeamComponents);
        const after = categoryValue(category, candidateRoster);
        const direction = category.direction === "LOWER_BETTER" ? -1 : 1;
        const sgp =
          (direction * (after - before)) /
          (denominators.get(category.category_id) ??
            defaultDenominator(category));
        categorySGPs[category.category_id] = Number.isFinite(sgp) ? sgp : 0;
        total += categorySGPs[category.category_id];
      }

      if (total > bestTotal) {
        bestTotal = total;
        bestPosition = slot;
        bestCategories = categorySGPs;
      }
    }

    return {
      playerId: player.playerId,
      positions: player.positions,
      primaryPosition: bestPosition,
      categorySGPs: bestCategories,
      sgpTotal: Number.isFinite(bestTotal) ? bestTotal : 0,
    };
  });
}

function distributePlayers<T extends DraftValuePlayer>(
  players: T[],
  rosterSlots: Record<string, number>,
  totalTeams: number,
  score: (player: T) => number,
): Assignment[][] {
  const slots = getDraftableRosterSlots(rosterSlots);
  const rosters = Array.from(
    { length: Math.max(0, totalTeams) },
    () => [] as Assignment[],
  );
  const teamSlots = rosters.flatMap((_, teamIndex) =>
    Object.entries(slots).flatMap(([slot, count]) =>
      Array.from({ length: count }, () => ({ teamIndex, slot })),
    ),
  );
  const sortedPlayers = [...players].sort(
    (left, right) =>
      score(right) - score(left) || left.playerId - right.playerId,
  );
  const assignedPlayerBySlot = findMaximumWeightAssignment(
    sortedPlayers,
    teamSlots,
    (player) => score(player),
    (player, teamSlot) => canFillSlot(player.positions, teamSlot.slot),
  );

  for (let slotIndex = 0; slotIndex < teamSlots.length; slotIndex++) {
    const playerIndex = assignedPlayerBySlot.get(slotIndex);
    if (playerIndex !== undefined) {
      const { teamIndex, slot } = teamSlots[slotIndex];
      rosters[teamIndex].push({ player: sortedPlayers[playerIndex], slot });
    }
  }
  return rosters;
}

function calculateStandingsDenominators(
  teamComponents: StatComponents[],
  categories: Category[],
): Map<string, number> {
  const denominators = new Map<string, number>();
  for (const category of categories) {
    const values = teamComponents
      .map((components) => categoryValue(category, components))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    const gaps = values
      .slice(1)
      .map((value, index) => Math.abs(value - values[index]))
      .filter((gap) => gap > 0);
    denominators.set(
      category.category_id,
      gaps.length > 0
        ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length
        : defaultDenominator(category),
    );
  }
  return denominators;
}

function categoryValue(category: Category, components: StatComponents): number {
  if (category.type === "COUNTING") return components[category.stat_key] ?? 0;
  if (category.type === "RATE" && category.formula_id) {
    try {
      return calculateFinalRate(category.formula_id, {}, components);
    } catch {
      return 0;
    }
  }
  return 0;
}

function defaultDenominator(category: Category): number {
  return category.type === "RATE" ? 0.001 : 1;
}

function addComponents(
  left: StatComponents,
  right: StatComponents,
): StatComponents {
  const result = { ...left };
  for (const [key, value] of Object.entries(right)) {
    if (value !== undefined) result[key] = (result[key] ?? 0) + value;
  }
  return result;
}

function subtractComponents(
  left: StatComponents,
  right: StatComponents,
): StatComponents {
  const result = { ...left };
  for (const [key, value] of Object.entries(right)) {
    if (value !== undefined) result[key] = (result[key] ?? 0) - value;
  }
  return result;
}

function scaleComponents(
  components: StatComponents,
  factor: number,
): StatComponents {
  return Object.fromEntries(
    Object.entries(components).map(([key, value]) => [
      key,
      value === undefined ? undefined : value * factor,
    ]),
  ) as StatComponents;
}
