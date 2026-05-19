import type { Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import { SnapshotRepository } from "../../db/snapshot-repository.js";
import type { ESPNAdapter, ESPNAuthCookies } from "../../adapters/espn.js";
import type { PitcherlistAdapter } from "../../adapters/pitcherlist.js";
import { normalizePitcherName } from "../../adapters/pitcherlist.js";
import type { AdvancedStatsAdapter } from "../../adapters/advanced-stats.js";
import type { StatComponents } from "../../../../shared/dist/index.js";
import { combineComponents } from "../../../../shared/dist/index.js";

export interface EnrichedFreeAgent {
  playerId: number;
  espnPlayerId: number;
  playerName: string;
  mlbTeam: string;
  positions: string[];
  pctOwned: number;
  pctStarted: number;
  projections: unknown | null;
  currentStats: Record<string, number> | null;
  advancedStats: unknown | null;
  pitcherlistRank: number | null;
  blendedProjections: StatComponents | null;
}

export interface FreeAgentViewResult {
  freeAgents: EnrichedFreeAgent[];
  snapshotDate: string | null;
}

export interface FreeAgentViewOptions {
  leagueId: number;
  espnLeagueId: number;
  season: number;
  espnAuth?: ESPNAuthCookies;
  snapshotDate?: string;
  maxPlayers?: number;
  positions?: string[];
}

/**
 * FreeAgentView
 *
 * Owns DB query orchestration and adapter calls for the free agent domain object.
 * Routes are thin HTTP facades: parse input → call view → format output.
 *
 * Per ARCHITECTURE-OPPORTUNITIES.md §2.
 */
export class FreeAgentView {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly espnAdapter: ESPNAdapter,
    private readonly pitcherlistAdapter: PitcherlistAdapter,
    private readonly advancedStatsAdapter: AdvancedStatsAdapter,
  ) {}

  async fetch(options: FreeAgentViewOptions): Promise<FreeAgentViewResult> {
    const {
      leagueId,
      espnLeagueId,
      season,
      espnAuth,
      snapshotDate,
      maxPlayers = 300,
      positions,
    } = options;

    // Fetch live free agents from ESPN (includes pctOwned, pctStarted)
    const freeAgentData = await this.espnAdapter.fetchFreeAgents({
      leagueId: espnLeagueId,
      season,
      auth: espnAuth,
      limit: maxPlayers,
      positions,
    });

    if (freeAgentData.length === 0) {
      return { freeAgents: [], snapshotDate: snapshotDate ?? null };
    }

    // Enrich with projections from DB if snapshot available
    const snapshot = snapshotDate
      ? await this.db
          .selectFrom("league_daily_snapshot")
          .selectAll()
          .where("league_id", "=", leagueId)
          .where("snapshot_date", "=", snapshotDate)
          .executeTakeFirst()
      : undefined;

    // ESPN player IDs — player.id IS the ESPN player ID (migration 016)
    const espnPlayerIds = freeAgentData.map((fa) => fa.playerId);

    const playerStats =
      espnPlayerIds.length > 0
        ? await this.db
            .selectFrom("player")
            .select(["id", "current_season_stats_json"])
            .where("id", "in", espnPlayerIds)
            .execute()
        : [];

    const currentStatsMap = new Map<number, Record<string, number> | null>(
      playerStats.map((player) => [
        player.id,
        (player.current_season_stats_json as Record<string, number> | null) ??
          null,
      ]),
    );

    let projMap = new Map<number, unknown>();
    if (snapshot?.projections_run_id && espnPlayerIds.length > 0) {
      const repo = new SnapshotRepository(this.db);
      const projections = await repo.getPlayerProjections(
        snapshot.projections_run_id,
        espnPlayerIds,
      );

      projMap = new Map(
        projections.map((p) => [p.player_id, p.stat_components_json]),
      );
    }

    // Full-season stats for blending with RoS projections
    const seasonStart = `${new Date().getFullYear()}-01-01`;
    const periodStatsRows =
      espnPlayerIds.length > 0
        ? await this.db
            .selectFrom("player_period_stats")
            .select(["player_id", "components_json"])
            .where("league_id", "=", leagueId)
            .where("player_id", "in", espnPlayerIds)
            .where("snapshot_date", ">=", seasonStart)
            .execute()
        : [];

    const seasonStatsMap = new Map<number, StatComponents>();
    for (const row of periodStatsRows) {
      const existing =
        seasonStatsMap.get(row.player_id) ?? ({} as StatComponents);
      const components = row.components_json as StatComponents;
      for (const [key, value] of Object.entries(components)) {
        if (typeof value === "number") {
          (existing as Record<string, number>)[key] =
            ((existing as Record<string, number>)[key] ?? 0) + value;
        }
      }
      seasonStatsMap.set(row.player_id, existing);
    }

    // Fetch PitcherList Top 100 SP rankings (graceful degradation)
    const top100 = await this.pitcherlistAdapter
      .getTop100Rankings()
      .catch(() => []);
    const plRankMap = new Map(
      top100.map((entry) => [
        normalizePitcherName(entry.playerName),
        entry.rank,
      ]),
    );

    const advancedStatsMap =
      await this.advancedStatsAdapter.getAdvancedStatsForPlayers(
        season,
        freeAgentData.map((player) => ({
          playerId: player.playerId,
          playerName: player.name,
          mlbTeam: player.mlbTeam,
          positions: player.positions,
          currentStats: currentStatsMap.get(player.playerId) ?? null,
        })),
      );

    const freeAgents = freeAgentData.map((fa) => ({
      playerId: fa.playerId,
      espnPlayerId: fa.playerId,
      playerName: fa.name,
      mlbTeam: fa.mlbTeam,
      positions: fa.positions,
      pctOwned: fa.pctOwned,
      pctStarted: fa.pctStarted,
      projections: projMap.get(fa.playerId) ?? null,
      currentStats: currentStatsMap.get(fa.playerId) ?? null,
      advancedStats: advancedStatsMap.get(fa.playerId) ?? null,
      pitcherlistRank: plRankMap.get(normalizePitcherName(fa.name)) ?? null,
      blendedProjections: (() => {
        const ros = projMap.get(fa.playerId) as StatComponents | undefined;
        const current = seasonStatsMap.get(fa.playerId);
        if (!ros && !current) return null;
        return combineComponents(
          current ?? ({} as StatComponents),
          ros ?? ({} as StatComponents),
        );
      })(),
    }));

    return { freeAgents, snapshotDate: snapshotDate ?? null };
  }
}
