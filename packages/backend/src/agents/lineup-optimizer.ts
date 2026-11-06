import type { BaseLogger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import type { Category, StatComponents } from "../../../shared/dist/index.js";
import { calculateFinalRate } from "../../../shared/dist/index.js";
import {
  MLBStatsAPIAdapter,
  type MLBTeamBattingContext,
} from "../adapters/mlb-statsapi.js";
import { normalizeName } from "./sit-start-advisor.js";
import {
  canFillSlot,
  canonicalSlotName,
} from "../projection/slot-eligibility.js";
import { findMaximumWeightAssignment } from "../projection/maximum-weight-assignment.js";

/**
 * Lineup Optimizer Agent
 *
 * Recommends start/sit swaps that maximize projected value per roster slot.
 * Uses deterministic maximum-weight assignment across all active slots.
 */

export interface LineupRecommendation {
  slotId: string;
  slotName: string;
  currentPlayerId: number;
  currentPlayerName: string;
  recommendedPlayerId: number;
  recommendedPlayerName: string;
  reason: string;
  projectedValueGain: number; // SGP gain from the swap
  currentPlayerValue: number;
  recommendedPlayerValue: number;
}

export interface LineupOptimizationResult {
  recommendations: LineupRecommendation[];
  totalProjectedGain: number;
  snapshotDate: string;
  isOptimal: boolean; // true if no swaps recommended
  isDegraded: boolean;
  degradedReasons: string[];
}

interface RosterSlot {
  slotId: string;
  slotName: string;
  eligiblePositions: string[];
  isActive: boolean;
  currentPlayerId?: number;
}

interface PlayerCandidate {
  playerId: number;
  playerName: string;
  positions: string[];
  projectedValue: number;
  hasGameToday: boolean;
}

interface CategoryValueContext {
  denominator: number;
  baselineComponents: StatComponents;
}

const MLB_TEAM_ABBREVIATIONS: Record<number, string> = {
  108: "LAA",
  109: "ARI",
  110: "BAL",
  111: "BOS",
  112: "CHC",
  113: "CIN",
  114: "CLE",
  115: "COL",
  116: "DET",
  117: "HOU",
  118: "KC",
  119: "LAD",
  120: "WSH",
  121: "NYM",
  133: "OAK",
  134: "PIT",
  135: "SD",
  136: "SEA",
  137: "SF",
  138: "STL",
  139: "TB",
  140: "TEX",
  141: "TOR",
  142: "MIN",
  143: "PHI",
  144: "ATL",
  145: "CWS",
  146: "MIA",
  147: "NYY",
  158: "MIL",
};

export class LineupOptimizerAgent {
  constructor(
    private db: Kysely<Database>,
    private mlbAdapter: MLBStatsAPIAdapter,
    private logger?: BaseLogger,
  ) {}

  async getRecommendations(
    leagueId: number,
    teamId: number,
    snapshotDate: string,
  ): Promise<LineupOptimizationResult> {
    this.logger?.info(
      { leagueId, teamId, snapshotDate },
      "Generating lineup optimization recommendations",
    );

    // 1. Load league settings
    const settings = await this.loadLeagueSettings(leagueId, snapshotDate);
    if (!settings) {
      this.logger?.error({ leagueId }, "League settings not found");
      return {
        recommendations: [],
        totalProjectedGain: 0,
        snapshotDate,
        isOptimal: false,
        isDegraded: true,
        degradedReasons: ["league_settings_unavailable"],
      };
    }

    // 2. Load team roster
    const roster = await this.db
      .selectFrom("team_roster_snapshot as trs")
      .innerJoin("player as p", "p.id", "trs.player_id")
      .select([
        "p.id as player_id",
        "p.name as player_name",
        "p.positions",
        "p.mlb_team",
        "p.bats_throws",
        "trs.roster_slot",
        "trs.roster_status",
      ])
      .where("trs.league_id", "=", leagueId)
      .where("trs.team_id", "=", teamId)
      .where("trs.snapshot_date", "=", snapshotDate)
      .execute();

    if (roster.length === 0) {
      this.logger?.warn({ leagueId, teamId }, "No roster found for team");
      return {
        recommendations: [],
        totalProjectedGain: 0,
        snapshotDate,
        isOptimal: false,
        isDegraded: true,
        degradedReasons: ["roster_unavailable"],
      };
    }

    // 3. Load projections for all rostered players
    const latestProjection = await this.db
      .selectFrom("projections_run")
      .select("id")
      .where("staleness", "=", "fresh")
      .orderBy("as_of_date", "desc")
      .executeTakeFirst();

    if (!latestProjection) {
      this.logger?.warn("No fresh projections available");
      return {
        recommendations: [],
        totalProjectedGain: 0,
        snapshotDate,
        isOptimal: false,
        isDegraded: true,
        degradedReasons: ["projections_unavailable"],
      };
    }

    const projections = await this.db
      .selectFrom("player_projection")
      .selectAll()
      .where("projections_run_id", "=", latestProjection.id)
      .where(
        "player_id",
        "in",
        roster.map((r) => r.player_id),
      )
      .execute();

    // 4. Load today's MLB schedule
    const schedule = await this.mlbAdapter.getSchedule(
      snapshotDate,
      snapshotDate,
    );
    const battingContext = await this.mlbAdapter.getDailyBattingContext(
      snapshotDate,
      schedule,
    );
    const seasonEndDate =
      settings.settings_json.season_end_date ??
      `${snapshotDate.slice(0, 4)}-10-01`;
    const remainingSchedule = await this.mlbAdapter.getSchedule(
      snapshotDate,
      seasonEndDate < snapshotDate ? snapshotDate : seasonEndDate,
    );
    const battingContextByTeam = indexBattingContexts(battingContext.teams);
    const teamsPlayingToday = new Set(
      schedule.flatMap((game) =>
        [
          game.teams.home.team.abbreviation,
          MLB_TEAM_ABBREVIATIONS[game.teams.home.team.id],
          game.teams.home.team.name,
          game.teams.away.team.abbreviation,
          MLB_TEAM_ABBREVIATIONS[game.teams.away.team.id],
          game.teams.away.team.name,
        ]
          .filter((team): team is string => Boolean(team))
          .map((team) => normalizeName(team)),
      ),
    );
    const probablePitcherNames = new Set(
      schedule
        .flatMap((game) => [
          game.teams.home.probablePitcher?.fullName,
          game.teams.away.probablePitcher?.fullName,
        ])
        .filter((name): name is string => Boolean(name))
        .map(normalizeName),
    );
    const remainingTeamGames = countScheduledTeamGames(remainingSchedule);
    const categoryContexts = await this.loadCategoryValueContexts(
      leagueId,
      snapshotDate,
      settings.settings_json.categories,
    );

    // 5. Build player candidates with projected values
    const candidates: PlayerCandidate[] = roster.map((r) => {
      const projection = projections.find((p) => p.player_id === r.player_id);
      const hasGameToday = r.mlb_team
        ? teamsPlayingToday.has(normalizeName(r.mlb_team))
        : false;
      const components = projection?.stat_components_json;
      const isPitcher = Boolean(
        components && ((components.IP ?? 0) > 0 || (components.GS ?? 0) > 0),
      );
      const dailyProjection = components
        ? projectDailyComponents(components, {
            positions: r.positions,
            hasTeamGame: hasGameToday,
            isProbableStarter: probablePitcherNames.has(
              normalizeName(r.player_name),
            ),
            projectedTeamGames: r.mlb_team
              ? (remainingTeamGames.get(normalizeName(r.mlb_team)) ?? 0)
              : 0,
            ...buildHitterContextOptions(
              r.player_id,
              r.player_name,
              r.bats_throws,
              components,
              r.mlb_team
                ? battingContextByTeam.get(normalizeName(r.mlb_team))
                : undefined,
            ),
          })
        : { components: {}, hasAppearance: false };
      const projectedValue =
        components && dailyProjection.hasAppearance
          ? this.calculatePlayerValue(
              dailyProjection.components,
              settings.settings_json.categories,
              categoryContexts,
            )
          : 0;

      return {
        playerId: r.player_id,
        playerName: r.player_name,
        positions: r.positions,
        projectedValue,
        hasGameToday: isPitcher ? dailyProjection.hasAppearance : hasGameToday,
      };
    });

    // 6. Parse roster slots from settings
    const rosterSlots = this.parseRosterSlots(
      settings.settings_json.roster_slots,
      roster,
    );

    // 7. Run maximum-weight lineup optimization
    const optimizedLineup = this.optimizeLineup(candidates, rosterSlots);

    // 8. Generate a complete atomic diff, including bench and empty-slot legs
    const { recommendations, totalProjectedGain } =
      buildLineupRecommendationDiff(candidates, rosterSlots, optimizedLineup);

    this.logger?.info(
      {
        recommendations: recommendations.length,
        totalProjectedGain,
        battingContextStatus: battingContext.status,
      },
      "Lineup optimization complete",
    );

    const degradedReasons =
      battingContext.status === "available"
        ? ([] as string[])
        : battingContext.status === "partial"
          ? ["batting_lineups_partial"]
          : ["batting_lineups_unavailable"];
    if (remainingSchedule.length === 0 && schedule.length > 0) {
      degradedReasons.push("remaining_schedule_unavailable");
    }
    if (
      battingContext.teams.some((context) => !context.opponentProbablePitcher)
    ) {
      degradedReasons.push("opponent_probable_pitchers_partial");
    }
    if (
      battingContext.teams.some((context) => context.parkFactor === undefined)
    ) {
      degradedReasons.push("park_factors_partial");
    }

    return {
      recommendations,
      totalProjectedGain,
      snapshotDate,
      isOptimal: recommendations.length === 0,
      isDegraded: degradedReasons.length > 0,
      degradedReasons,
    };
  }

  private async loadLeagueSettings(leagueId: number, snapshotDate: string) {
    return await this.db
      .selectFrom("league_settings_version")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("effective_date", "<=", snapshotDate)
      .orderBy("effective_date", "desc")
      .executeTakeFirst();
  }

  private calculatePlayerValue(
    components: StatComponents,
    categories: Category[],
    contexts: Map<string, CategoryValueContext>,
  ): number {
    let value = 0;

    for (const category of categories) {
      const context = contexts.get(category.category_id) ?? {
        denominator: category.type === "RATE" ? 0.001 : 1,
        baselineComponents: {},
      };
      const direction = category.direction === "LOWER_BETTER" ? -1 : 1;
      if (category.type === "COUNTING") {
        value +=
          (direction * (components[category.stat_key] ?? 0)) /
          context.denominator;
      } else if (category.type === "RATE" && category.formula_id) {
        try {
          const baseline = calculateFinalRate(
            category.formula_id,
            {},
            context.baselineComponents,
          );
          const withPlayer = calculateFinalRate(
            category.formula_id,
            {},
            addComponents(context.baselineComponents, components),
          );
          value += (direction * (withPlayer - baseline)) / context.denominator;
        } catch {
          continue;
        }
      }
    }

    return value;
  }

  private async loadCategoryValueContexts(
    leagueId: number,
    snapshotDate: string,
    categories: Category[],
  ): Promise<Map<string, CategoryValueContext>> {
    const rows = await this.db
      .selectFrom("team_daily_projected_category")
      .select(["category_id", "projected_value", "projected_components_json"])
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .execute();
    const contexts = new Map<string, CategoryValueContext>();

    for (const category of categories) {
      const categoryRows = rows.filter(
        (row) => row.category_id === category.category_id,
      );
      const values = categoryRows
        .map((row) => Number(row.projected_value))
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
      const gaps = values
        .slice(1)
        .map((value, index) => Math.abs(value - values[index]));
      const positiveGaps = gaps.filter((gap) => gap > 0);
      const denominator =
        positiveGaps.length > 0
          ? positiveGaps.reduce((sum, gap) => sum + gap, 0) /
            positiveGaps.length
          : category.type === "RATE"
            ? 0.001
            : 1;
      const componentRows = categoryRows
        .map((row) => row.projected_components_json)
        .filter(
          (components): components is StatComponents => components !== null,
        );
      const totals = componentRows.reduce(addComponents, {} as StatComponents);
      const baselineComponents = scaleComponents(
        totals,
        componentRows.length > 0 ? 1 / componentRows.length : 1,
      );
      contexts.set(category.category_id, { denominator, baselineComponents });
    }
    return contexts;
  }

  private parseRosterSlots(
    rosterSlotsConfig: Record<string, number>,
    roster: Array<{ player_id: number; roster_slot: string | null }>,
  ): RosterSlot[] {
    const slots: RosterSlot[] = [];

    const occupants = groupRosterSlotOccupants(roster);

    // Create slots based on roster config
    for (const [slotName, count] of Object.entries(rosterSlotsConfig)) {
      const canonicalName = canonicalSlotName(slotName);
      const isActive =
        canonicalName !== "BN" &&
        canonicalName !== "IL" &&
        canonicalName !== "NA";

      for (let i = 0; i < count; i++) {
        const slotId =
          count === 1 ? canonicalName : `${canonicalName}_${i + 1}`;

        slots.push({
          slotId,
          slotName: canonicalName,
          eligiblePositions: [],
          isActive,
          currentPlayerId: occupants.get(canonicalName)?.[i],
        });
      }
    }

    return slots;
  }

  private optimizeLineup(
    candidates: PlayerCandidate[],
    slots: RosterSlot[],
  ): Map<string, number> {
    return optimizeDailyLineup(candidates, slots);
  }
}

function addComponents(
  left: StatComponents,
  right: StatComponents,
): StatComponents {
  const result: StatComponents = { ...left };
  for (const [key, value] of Object.entries(right)) {
    if (value !== undefined) result[key] = (result[key] ?? 0) + value;
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

export function scaleProjectionToAppearance(
  components: StatComponents,
  isPitcher: boolean,
): StatComponents {
  const opportunities = isPitcher
    ? (components.GS ??
      components.G ??
      ((components.IP ?? 0) > 0 ? (components.IP ?? 0) / 5.5 : 1))
    : (components.G ??
      ((components.PA ?? 0) > 0
        ? (components.PA ?? 0) / 4.2
        : (components.AB ?? 0) / 4));
  return scaleComponents(components, 1 / Math.max(1, opportunities));
}

interface DailyProjectionOptions {
  positions: string[];
  hasTeamGame: boolean;
  isProbableStarter: boolean;
  projectedTeamGames: number;
  hitterLineupStatus?: "confirmed" | "unavailable";
  isConfirmedHitterStarter?: boolean;
  parkFactor?: number;
  platoonFactor?: number;
}

export function projectDailyComponents(
  components: StatComponents,
  options: DailyProjectionOptions,
): { components: StatComponents; hasAppearance: boolean } {
  if (!options.hasTeamGame) return { components: {}, hasAppearance: false };

  const positions = new Set(options.positions.map(canonicalSlotName));
  const isPitcher =
    positions.has("SP") ||
    positions.has("RP") ||
    positions.has("P") ||
    (components.IP ?? 0) > 0 ||
    (components.GS ?? 0) > 0;
  if (!isPitcher) {
    if (
      options.hitterLineupStatus === "confirmed" &&
      !options.isConfirmedHitterStarter
    ) {
      return { components: {}, hasAppearance: false };
    }
    const projectedGames =
      components.G ??
      Math.min(
        options.projectedTeamGames,
        (components.PA ?? 0) > 0
          ? (components.PA ?? 0) / 4.2
          : (components.AB ?? 0) / 4,
      );
    const appearanceProbability =
      options.hitterLineupStatus === "unavailable"
        ? Math.min(
            1,
            Math.max(
              0,
              projectedGames / Math.max(1, options.projectedTeamGames),
            ),
          )
        : 1;
    const adjusted = applyHitterGameContext(
      scaleProjectionToAppearance(components, false),
      options.parkFactor,
      options.platoonFactor,
    );
    return {
      components: scaleComponents(adjusted, appearanceProbability),
      hasAppearance: appearanceProbability > 0,
    };
  }

  if (options.isProbableStarter && (components.GS ?? 0) > 0) {
    return {
      components: scaleProjectionToAppearance(components, true),
      hasAppearance: true,
    };
  }

  const canRelieve = positions.has("RP") || positions.has("P");
  if (!canRelieve) return { components: {}, hasAppearance: false };

  const projectedAppearances = Math.max(
    0,
    (components.G ?? 0) - (components.GS ?? 0),
  );
  if (projectedAppearances === 0 || options.projectedTeamGames <= 0) {
    return { components: {}, hasAppearance: false };
  }
  const appearanceProbability = Math.min(
    1,
    projectedAppearances / options.projectedTeamGames,
  );
  return {
    components: scaleComponents(
      scaleComponents(components, 1 / projectedAppearances),
      appearanceProbability,
    ),
    hasAppearance: true,
  };
}

export function applyHitterGameContext(
  components: StatComponents,
  parkFactor?: number,
  platoonFactor?: number,
): StatComponents {
  const normalizedParkFactor =
    parkFactor === undefined
      ? 1
      : parkFactor > 10
        ? parkFactor / 100
        : parkFactor;
  const park =
    Number.isFinite(normalizedParkFactor) && normalizedParkFactor > 0
      ? normalizedParkFactor
      : 1;
  const platoon =
    platoonFactor !== undefined &&
    Number.isFinite(platoonFactor) &&
    platoonFactor > 0
      ? platoonFactor
      : 1;
  const result = { ...components };
  for (const key of ["H", "BB", "HBP", "TB", "R", "HR", "RBI"] as const) {
    if (result[key] !== undefined) result[key] *= park * platoon;
  }
  return result;
}

function indexBattingContexts(
  contexts: MLBTeamBattingContext[],
): Map<string, MLBTeamBattingContext> {
  const indexed = new Map<string, MLBTeamBattingContext>();
  for (const context of contexts) {
    for (const alias of [context.teamName, context.teamAbbreviation]) {
      if (alias) indexed.set(normalizeName(alias), context);
    }
  }
  return indexed;
}

function buildHitterContextOptions(
  playerId: number,
  playerName: string,
  batsThrows: string | null,
  components: StatComponents,
  context?: MLBTeamBattingContext,
): Pick<
  DailyProjectionOptions,
  | "hitterLineupStatus"
  | "isConfirmedHitterStarter"
  | "parkFactor"
  | "platoonFactor"
> {
  if (!context) return { hitterLineupStatus: "unavailable" };
  const starter = context.starters.some(
    (candidate) =>
      candidate.mlbPlayerId === playerId ||
      normalizeName(candidate.fullName) === normalizeName(playerName),
  );
  const pitcherHand = context.opponentProbablePitcher?.throws;
  const splitKey = pitcherHand ? `PLATOON_VS_${pitcherHand}_FACTOR` : null;
  const splitFactor = splitKey ? components[splitKey] : undefined;
  const batterHand = batsThrows?.split("/")[0]?.toUpperCase();
  const platoonFactor =
    pitcherHand &&
    (batterHand === "L" || batterHand === "R" || batterHand === "S") &&
    typeof splitFactor === "number"
      ? splitFactor
      : undefined;
  return {
    hitterLineupStatus: context.lineupStatus,
    isConfirmedHitterStarter: starter,
    parkFactor: context.parkFactor,
    platoonFactor,
  };
}

function countScheduledTeamGames(
  schedule: Awaited<ReturnType<MLBStatsAPIAdapter["getSchedule"]>>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const game of schedule) {
    for (const side of [game.teams.home, game.teams.away]) {
      const aliases = new Set(
        [
          side.team.abbreviation,
          MLB_TEAM_ABBREVIATIONS[side.team.id],
          side.team.name,
        ]
          .filter((team): team is string => Boolean(team))
          .map(normalizeName),
      );
      for (const alias of aliases) {
        counts.set(alias, (counts.get(alias) ?? 0) + 1);
      }
    }
  }
  return counts;
}

export function optimizeDailyLineup(
  candidates: PlayerCandidate[],
  slots: RosterSlot[],
): Map<string, number> {
  const sortedPlayers = candidates
    .filter((candidate) => candidate.projectedValue > 0)
    .sort(
      (a, b) => b.projectedValue - a.projectedValue || a.playerId - b.playerId,
    );
  const activeSlots = slots.filter((slot) => slot.isActive);
  const assignedPlayerBySlot = findMaximumWeightAssignment(
    sortedPlayers,
    activeSlots,
    (player) => player.projectedValue,
    (player, slot) => canFillSlot(player.positions, slot.slotName),
  );
  const lineup = new Map<string, number>();
  for (let slotIndex = 0; slotIndex < activeSlots.length; slotIndex++) {
    const playerIndex = assignedPlayerBySlot.get(slotIndex);
    if (playerIndex !== undefined) {
      lineup.set(
        activeSlots[slotIndex].slotId,
        sortedPlayers[playerIndex].playerId,
      );
    }
  }
  const currentLineup = new Map<string, number>();
  const candidateById = new Map(
    candidates.map((candidate) => [candidate.playerId, candidate]),
  );
  for (const slot of activeSlots) {
    const current =
      slot.currentPlayerId === undefined
        ? undefined
        : candidateById.get(slot.currentPlayerId);
    if (current && canFillSlot(current.positions, slot.slotName)) {
      currentLineup.set(slot.slotId, current.playerId);
    }
  }
  if (currentLineup.size === lineup.size) {
    const total = (assignment: Map<string, number>) =>
      [...assignment.values()].reduce(
        (sum, playerId) =>
          sum + (candidateById.get(playerId)?.projectedValue ?? 0),
        0,
      );
    if (total(currentLineup) >= total(lineup)) return currentLineup;
  }
  return preserveEquivalentSlotOccupants(lineup, activeSlots);
}

function preserveEquivalentSlotOccupants(
  lineup: Map<string, number>,
  activeSlots: RosterSlot[],
): Map<string, number> {
  const stabilized = new Map(lineup);
  const slotsByName = new Map<string, RosterSlot[]>();
  for (const slot of activeSlots) {
    const group = slotsByName.get(slot.slotName) ?? [];
    group.push(slot);
    slotsByName.set(slot.slotName, group);
  }

  for (const group of slotsByName.values()) {
    const assigned = group
      .map((slot) => lineup.get(slot.slotId))
      .filter((playerId): playerId is number => playerId !== undefined);
    const remaining = new Set(assigned);

    for (const slot of group) {
      if (
        slot.currentPlayerId !== undefined &&
        remaining.delete(slot.currentPlayerId)
      ) {
        stabilized.set(slot.slotId, slot.currentPlayerId);
      } else {
        stabilized.delete(slot.slotId);
      }
    }
    for (const slot of group) {
      if (stabilized.has(slot.slotId)) continue;
      const playerId = remaining.values().next().value as number | undefined;
      if (playerId === undefined) break;
      stabilized.set(slot.slotId, playerId);
      remaining.delete(playerId);
    }
  }

  return stabilized;
}

export function buildLineupRecommendationDiff(
  candidates: PlayerCandidate[],
  slots: RosterSlot[],
  optimizedLineup: Map<string, number>,
): { recommendations: LineupRecommendation[]; totalProjectedGain: number } {
  const candidateById = new Map(
    candidates.map((candidate) => [candidate.playerId, candidate]),
  );
  const targetBySlot = new Map(optimizedLineup);
  const activePlayerIds = new Set(optimizedLineup.values());
  const remainingPlayerIds = new Set(
    candidates
      .map((candidate) => candidate.playerId)
      .filter((playerId) => !activePlayerIds.has(playerId)),
  );

  for (const slot of slots.filter((candidateSlot) => !candidateSlot.isActive)) {
    if (
      slot.currentPlayerId !== undefined &&
      remainingPlayerIds.delete(slot.currentPlayerId)
    ) {
      targetBySlot.set(slot.slotId, slot.currentPlayerId);
    }
  }
  for (const slot of slots.filter((candidateSlot) => !candidateSlot.isActive)) {
    if (targetBySlot.has(slot.slotId)) continue;
    const playerId = remainingPlayerIds.values().next().value as
      | number
      | undefined;
    if (playerId === undefined) break;
    targetBySlot.set(slot.slotId, playerId);
    remainingPlayerIds.delete(playerId);
  }

  const recommendations: LineupRecommendation[] = [];
  let totalProjectedGain = 0;
  for (const slot of slots) {
    const currentPlayerId = slot.currentPlayerId ?? 0;
    const recommendedPlayerId = targetBySlot.get(slot.slotId) ?? 0;
    if (currentPlayerId === recommendedPlayerId) continue;

    const currentPlayer = candidateById.get(currentPlayerId);
    const recommendedPlayer = candidateById.get(recommendedPlayerId);
    const currentPlayerValue = currentPlayer?.projectedValue ?? 0;
    const recommendedPlayerValue = recommendedPlayer?.projectedValue ?? 0;
    const gain = slot.isActive
      ? recommendedPlayerValue - currentPlayerValue
      : 0;
    if (slot.isActive) totalProjectedGain += gain;

    recommendations.push({
      slotId: slot.slotId,
      slotName: slot.slotName,
      currentPlayerId,
      currentPlayerName: currentPlayer?.playerName ?? "Empty slot",
      recommendedPlayerId,
      recommendedPlayerName: recommendedPlayer?.playerName ?? "Empty slot",
      reason: slot.isActive
        ? recommendedPlayer
          ? `${recommendedPlayer.playerName} is optimized for ${slot.slotName}`
          : `Leave ${slot.slotName} empty`
        : recommendedPlayer
          ? `Move ${recommendedPlayer.playerName} to ${slot.slotName}`
          : `Vacate ${slot.slotName}`,
      projectedValueGain: gain,
      currentPlayerValue,
      recommendedPlayerValue,
    });
  }

  if (totalProjectedGain <= 0) {
    return { recommendations: [], totalProjectedGain: 0 };
  }

  return { recommendations, totalProjectedGain };
}

export function groupRosterSlotOccupants(
  roster: Array<{ player_id: number; roster_slot: string | null }>,
): Map<string, number[]> {
  const occupants = new Map<string, number[]>();
  for (const player of roster) {
    const slot = canonicalSlotName(player.roster_slot ?? "BN");
    const grouped = occupants.get(slot) ?? [];
    grouped.push(player.player_id);
    occupants.set(slot, grouped);
  }
  return occupants;
}
