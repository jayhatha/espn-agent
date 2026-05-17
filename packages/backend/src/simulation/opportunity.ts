import type { StatComponents } from "../../../shared/dist/index.js";
import {
  computeProrateFactor,
  prorateComponents,
} from "../projection/staleness.js";
import { allocateLineup } from "../projection/hitter-allocation.js";
import type { RosteredPlayer } from "../projection/types.js";
import { STAT_CV } from "../projection/variance.js";
import type { Rng } from "./prng.js";
import type {
  SimulationState,
  TeamSimInput,
  TeamOpportunityStream,
  PlayerOpportunity,
} from "./types.js";
import { DEFAULT_SEASON_END } from "./types.js";

function hasPitchingComponents(components: StatComponents | null): boolean {
  return !!components && (components.IP ?? 0) > 0;
}

function isSPSlot(
  slot: string | null,
  components: StatComponents | null,
): boolean {
  if (slot === "SP") return true;
  if (slot === "RP") return false;
  if (slot === "P" && components) {
    if ((components.GS ?? 0) > 0) return true;
    if ((components.IP ?? 0) > 80 && components.GS === undefined) return true;
  }
  return false;
}

/**
 * Phase 104: Build per-player opportunity streams for one team.
 *
 * - Prorates FanGraphs RoS projections by staleness factor (OPP-01)
 * - Uses lineup allocator to determine active vs bench assignment
 * - Preserves GS metadata for GS cap enforcement in Phase 105
 */
export function buildTeamOpportunityStream(
  teamInput: TeamSimInput,
  state: SimulationState,
): TeamOpportunityStream {
  const prorateFactor = computeProrateFactor(
    state.projectionAsOfDate,
    state.snapshotDate,
    DEFAULT_SEASON_END,
  );

  // Prorate all player projections to remaining season
  const proratedProjections = new Map<number, StatComponents>();
  for (const [playerId, proj] of teamInput.playerProjections.entries()) {
    proratedProjections.set(
      playerId,
      prorateComponents(proj, prorateFactor) as StatComponents,
    );
  }

  // Assign players to slots (greedy, most-constrained first)
  const playersWithProj: RosteredPlayer[] = teamInput.roster.map((r) => ({
    ...r,
    projectedComponents: proratedProjections.get(r.playerId) ?? null,
  }));
  const assignments = allocateLineup(playersWithProj, state.rosterSlots);
  const assignmentMap = new Map(assignments.map((a) => [a.playerId, a]));

  const gsCapRemaining = Math.max(0, state.gsCap - teamInput.gsUsed);

  const hitters: PlayerOpportunity[] = [];
  const pitchers: PlayerOpportunity[] = [];
  const bench: PlayerOpportunity[] = [];

  for (const player of teamInput.roster) {
    const assignment = assignmentMap.get(player.playerId);
    const prorated = proratedProjections.get(player.playerId) ?? {};
    const isActive = (assignment?.contributionWeight ?? 0) > 0;
    const slot = assignment?.slot ?? player.rosterSlot;
    const isPitcher = hasPitchingComponents(prorated);

    const opp: PlayerOpportunity = {
      playerId: player.playerId,
      rosComponents: prorated,
      activeSlot: slot,
      isActive,
      isSP: isActive && isSPSlot(slot, prorated),
      availabilityRate: 1.0, // Phase 106 will modify this
    };

    if (!isActive) {
      bench.push(opp);
    } else if (isPitcher) {
      pitchers.push(opp);
    } else {
      hitters.push(opp);
    }
  }

  return {
    teamId: teamInput.teamId,
    hitters,
    pitchers,
    bench,
    gsCapRemaining,
    daysRemaining: state.daysRemaining,
  };
}

/**
 * Phase 104: Sample one player's remaining-season components with tunable variance.
 *
 * Counting stats and rate-stat components are sampled from Normal(μ, σ=μ*CV)
 * clamped at 0. Rate stats are derived from perturbed components at the team level,
 * satisfying VAR-01 (no independent ERA/WHIP/OPS noise models).
 *
 * When rng is null (deterministic mode): returns expected values unchanged (SIM-02).
 */
export function samplePlayerComponents(
  components: StatComponents,
  rng: Rng | null,
): StatComponents {
  if (!rng) return { ...components };

  const result: StatComponents = {};
  for (const [key, value] of Object.entries(components)) {
    if (typeof value !== "number" || value === 0) {
      result[key] = value;
      continue;
    }
    const cv = STAT_CV[key] ?? 0.25;
    const sigma = value * cv;
    const sampled = value + sigma * rng.normal();
    result[key] = Math.max(0, sampled);
  }
  return result;
}

/**
 * Build opportunity streams for all teams in the simulation state.
 */
export function buildAllOpportunityStreams(
  state: SimulationState,
): TeamOpportunityStream[] {
  return state.teams.map((team) => buildTeamOpportunityStream(team, state));
}
