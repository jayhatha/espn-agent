import type { Logger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import type { Category, StatComponents } from "../../../shared/dist/index.js";
import { MLBStatsAPIAdapter } from "../adapters/mlb-statsapi.js";

/**
 * Lineup Optimizer Agent
 *
 * Recommends start/sit swaps that maximize projected value per roster slot.
 * Uses greedy algorithm: fills most restrictive slots (C, 1B) before flexible slots (UTIL).
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

export class LineupOptimizerAgent {
  constructor(
    private db: Kysely<Database>,
    private mlbAdapter: MLBStatsAPIAdapter,
    private logger?: Logger,
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
      };
    }

    const projections = await this.db
      .selectFrom("player_projection")
      .selectAll()
      .where("projections_run_id", "=", latestProjection.id)
      .where(
        "player_id",
        "in",
        roster.map(r => r.player_id)
      )
      .execute();

    // 4. Load today's MLB schedule
    const schedule = await this.mlbAdapter.getSchedule(snapshotDate, snapshotDate);
    const teamsPlayingToday = new Set(
      schedule.flatMap(game => [
        game.teams.home.team.abbreviation || game.teams.home.team.name,
        game.teams.away.team.abbreviation || game.teams.away.team.name,
      ])
    );

    // 5. Build player candidates with projected values
    const candidates: PlayerCandidate[] = roster.map(r => {
      const projection = projections.find(p => p.player_id === r.player_id);
      const hasGameToday = r.mlb_team ? teamsPlayingToday.has(r.mlb_team) : false;

      // Calculate today value: if player has no game, value = 0
      const baseValue = projection
        ? this.calculatePlayerValue(projection.stat_components_json, settings.settings_json.categories)
        : 0;

      const projectedValue = hasGameToday ? baseValue : 0;

      return {
        playerId: r.player_id,
        playerName: r.player_name,
        positions: r.positions,
        projectedValue,
        hasGameToday,
      };
    });

    // 6. Parse roster slots from settings
    const rosterSlots = this.parseRosterSlots(
      settings.settings_json.roster_slots,
      roster
    );

    // 7. Run greedy lineup optimization
    const optimizedLineup = this.optimizeLineup(candidates, rosterSlots);

    // 8. Generate recommendations for changed slots
    const recommendations: LineupRecommendation[] = [];
    let totalProjectedGain = 0;

    for (const slot of rosterSlots.filter(s => s.isActive)) {
      const recommended = optimizedLineup.get(slot.slotId);
      const current = slot.currentPlayerId;

      if (recommended && current && recommended !== current) {
        const currentPlayer = candidates.find(c => c.playerId === current);
        const recommendedPlayer = candidates.find(c => c.playerId === recommended);

        if (currentPlayer && recommendedPlayer) {
          const gain = recommendedPlayer.projectedValue - currentPlayer.projectedValue;

          // Only recommend if there's a positive gain
          if (gain > 0) {
            const reason = !currentPlayer.hasGameToday
              ? `${currentPlayer.playerName} has no game today`
              : `${recommendedPlayer.playerName} has higher projected value`;

            recommendations.push({
              slotId: slot.slotId,
              slotName: slot.slotName,
              currentPlayerId: current,
              currentPlayerName: currentPlayer.playerName,
              recommendedPlayerId: recommended,
              recommendedPlayerName: recommendedPlayer.playerName,
              reason,
              projectedValueGain: gain,
              currentPlayerValue: currentPlayer.projectedValue,
              recommendedPlayerValue: recommendedPlayer.projectedValue,
            });

            totalProjectedGain += gain;
          }
        }
      }
    }

    this.logger?.info(
      { recommendations: recommendations.length, totalProjectedGain },
      "Lineup optimization complete",
    );

    return {
      recommendations,
      totalProjectedGain,
      snapshotDate,
      isOptimal: recommendations.length === 0,
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
    categories: Category[]
  ): number {
    // Simplified value calculation: sum of normalized category contributions
    // In practice, this should use SGP (Standings Gain Points)
    // For now, use a basic heuristic based on projected counting stats
    let value = 0;

    for (const category of categories) {
      if (category.type === "COUNTING") {
        const statValue = components[category.stat_key] || 0;
        // Normalize by typical per-game contribution
        value += statValue / 162; // Assume 162-game season
      }
    }

    return value;
  }

  private parseRosterSlots(
    rosterSlotsConfig: Record<string, number>,
    roster: Array<{ player_id: number; roster_slot: string | null }>
  ): RosterSlot[] {
    const slots: RosterSlot[] = [];

    // Map roster slot names to eligible positions
    const slotEligibility: Record<string, string[]> = {
      C: ["C"],
      "1B": ["1B"],
      "2B": ["2B"],
      "3B": ["3B"],
      SS: ["SS"],
      OF: ["OF", "LF", "CF", "RF"],
      UTIL: ["C", "1B", "2B", "3B", "SS", "OF", "LF", "CF", "RF", "DH"],
      P: ["SP", "RP"],
      SP: ["SP"],
      RP: ["RP"],
      BE: [], // Bench - not active
      IL: [], // Injured list - not active
    };

    // Create slots based on roster config
    for (const [slotName, count] of Object.entries(rosterSlotsConfig)) {
      const isActive = slotName !== "BE" && slotName !== "IL";
      const eligiblePositions = slotEligibility[slotName] || [];

      for (let i = 0; i < count; i++) {
        const slotId = count === 1 ? slotName : `${slotName}_${i + 1}`;

        // Find current player in this slot
        const currentPlayer = roster.find(r => r.roster_slot === slotId);

        slots.push({
          slotId,
          slotName,
          eligiblePositions,
          isActive,
          currentPlayerId: currentPlayer?.player_id,
        });
      }
    }

    return slots;
  }

  private optimizeLineup(
    candidates: PlayerCandidate[],
    slots: RosterSlot[]
  ): Map<string, number> {
    const lineup = new Map<string, number>();
    const assigned = new Set<number>();

    // Sort players by projected value (descending)
    const sortedPlayers = [...candidates].sort(
      (a, b) => b.projectedValue - a.projectedValue
    );

    // Sort slots by restrictiveness (fewer eligible positions first)
    // This ensures C gets filled before UTIL, preventing waste
    const activeSlots = slots
      .filter(s => s.isActive)
      .sort((a, b) => a.eligiblePositions.length - b.eligiblePositions.length);

    // Greedy assignment: fill most restrictive slots first with best available player
    for (const slot of activeSlots) {
      for (const player of sortedPlayers) {
        if (assigned.has(player.playerId)) continue;

        // Check eligibility
        const eligible = player.positions.some(pos =>
          slot.eligiblePositions.includes(pos)
        );

        if (eligible) {
          lineup.set(slot.slotId, player.playerId);
          assigned.add(player.playerId);
          break;
        }
      }
    }

    return lineup;
  }
}
