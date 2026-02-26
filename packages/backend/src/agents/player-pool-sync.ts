import type { Logger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import { ESPNAdapter, ESPN_STAT_MAP } from "../adapters/espn.js";

/**
 * Player Pool Sync Agent
 *
 * Syncs ESPN player universe (top ~500 rostered players) to local player table
 * with current season stats and ownership percentages.
 *
 * Runs daily at 4 AM ET via cron worker.
 */

export interface SyncResult {
  success: boolean;
  playersUpdated: number;
  playersInserted: number;
  error?: string;
}

interface PlayerData {
  espnPlayerId: number;
  name: string;
  mlbTeam: string;
  positions: string[];
  pctOwned: number;
  currentSeasonStats: Record<string, number>;
}

export class PlayerPoolSyncAgent {
  constructor(
    private db: Kysely<Database>,
    private espnAdapter: ESPNAdapter,
    private logger?: Logger,
  ) {}

  /**
   * Sync player pool from ESPN
   *
   * Fetches top players by ownership, extracts current season stats,
   * and upserts to player table. Idempotent - can be run multiple times safely.
   */
  async syncPlayerPool(season: number): Promise<SyncResult> {
    this.logger?.info({ season }, "Starting player pool sync");
    const startTime = Date.now();

    try {
      // Fetch top 500 players by ownership from ESPN
      // Use a generic public league for free agent data (no auth needed for top players)
      const GENERIC_LEAGUE_ID = 1; // ESPN's generic league ID for public data

      const players = await this.espnAdapter.fetchLeague({
        leagueId: GENERIC_LEAGUE_ID,
        season,
        views: ["kona_player_info"],
        xFantasyFilter: {
          players: {
            filterStatus: {
              value: ["FREEAGENT", "WAIVERS", "ONTEAM"],
            },
            sortPercOwned: {
              sortPriority: 1,
              sortAsc: false,
            },
            limit: 500,
          },
        },
      });

      const rawPlayers = (players.data as any)?.players || [];

      if (rawPlayers.length === 0) {
        this.logger?.warn("No players returned from ESPN API");
        return {
          success: false,
          playersUpdated: 0,
          playersInserted: 0,
          error: "No players returned from ESPN API",
        };
      }

      this.logger?.info({ playerCount: rawPlayers.length }, "Fetched players from ESPN");

      // Parse player data
      const playerDataList: PlayerData[] = [];

      for (const entry of rawPlayers) {
        const player = entry.player;
        if (!player) continue;

        // Skip players with very low ownership (< 1%)
        const ownership = player.ownership || {};
        const pctOwned = ownership.percentOwned ?? 0;
        if (pctOwned < 1) continue;

        // Extract positions from eligibleSlots
        const eligibleSlots = (player.eligibleSlots || []) as number[];
        const positions = eligibleSlots
          .filter((slotId: number) => slotId <= 15 && slotId !== 12) // Exclude BE/IL/NA/UTIL
          .map((slotId: number) => this.mapSlotIdToPosition(slotId))
          .filter((pos): pos is string => pos !== null);

        // Extract current season stats (statSplitTypeId=0 for full season)
        const statsArray = player.stats || [];
        const seasonStats = statsArray.find(
          (s: any) => s.statSplitTypeId === 0 && s.seasonId === season
        );

        const currentSeasonStats: Record<string, number> = {};
        if (seasonStats && seasonStats.stats) {
          for (const [espnStatIdStr, value] of Object.entries(seasonStats.stats)) {
            const espnStatId = parseInt(espnStatIdStr, 10);
            const statInfo = ESPN_STAT_MAP[espnStatId];

            if (statInfo && statInfo.type === "COUNTING") {
              currentSeasonStats[statInfo.key] = typeof value === "number" ? value : 0;
            }
          }
        }

        // Extract MLB team
        const proTeamId = player.proTeamId as number | undefined;
        const mlbTeam = proTeamId ? this.mapProTeamId(proTeamId) : "FA";

        playerDataList.push({
          espnPlayerId: entry.id,
          name: player.fullName || `Player ${entry.id}`,
          mlbTeam,
          positions: [...new Set(positions)], // Deduplicate
          pctOwned,
          currentSeasonStats,
        });
      }

      this.logger?.info(
        { playerCount: playerDataList.length },
        "Parsed player data, starting upsert"
      );

      // Batch check which players already exist
      const espnPlayerIds = playerDataList.map((p) => p.espnPlayerId);
      const existingPlayers = espnPlayerIds.length > 0
        ? await this.db
            .selectFrom("player")
            .select(["id", "espn_player_id"])
            .where("espn_player_id", "in", espnPlayerIds)
            .execute()
        : [];

      const existingIdSet = new Set(existingPlayers.map((p) => p.espn_player_id));

      // Separate into inserts and updates
      const playersToInsert = playerDataList.filter(
        (p) => !existingIdSet.has(p.espnPlayerId)
      );
      const playersToUpdate = playerDataList.filter((p) =>
        existingIdSet.has(p.espnPlayerId)
      );

      // Batch insert new players
      let playersInserted = 0;
      if (playersToInsert.length > 0) {
        try {
          await this.db
            .insertInto("player")
            .values(
              playersToInsert.map((p) => ({
                espn_player_id: p.espnPlayerId,
                name: p.name,
                mlb_team: p.mlbTeam,
                positions: p.positions,
                bats_throws: null,
                pct_owned: p.pctOwned,
                current_season_stats_json: p.currentSeasonStats,
                last_synced_at: new Date(),
              }))
            )
            .execute();
          playersInserted = playersToInsert.length;
        } catch (error) {
          this.logger?.error({ error }, "Failed to batch insert players");
        }
      }

      // Batch update existing players
      let playersUpdated = 0;
      for (const playerData of playersToUpdate) {
        try {
          await this.db
            .updateTable("player")
            .set({
              pct_owned: playerData.pctOwned,
              current_season_stats_json: playerData.currentSeasonStats,
              last_synced_at: new Date(),
            })
            .where("espn_player_id", "=", playerData.espnPlayerId)
            .execute();
          playersUpdated++;
        } catch (error) {
          this.logger?.error(
            { error, playerId: playerData.espnPlayerId },
            "Failed to update player"
          );
        }
      }

      const duration = Date.now() - startTime;
      this.logger?.info(
        { playersUpdated, playersInserted, durationMs: duration },
        "Player pool sync completed successfully"
      );

      return {
        success: true,
        playersUpdated,
        playersInserted,
      };
    } catch (error) {
      this.logger?.error({ error }, "Player pool sync failed");

      return {
        success: false,
        playersUpdated: 0,
        playersInserted: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Map ESPN lineup slot ID to position string
   */
  private mapSlotIdToPosition(slotId: number): string | null {
    const map: Record<number, string> = {
      0: "C",
      1: "1B",
      2: "2B",
      3: "3B",
      4: "SS",
      5: "OF",
      6: "LF",
      7: "CF",
      8: "RF",
      9: "DH",
      10: "DH",
      11: "IF",
      13: "P",
      14: "SP",
      15: "RP",
    };

    return map[slotId] || null;
  }

  /**
   * Map ESPN pro team ID to MLB team abbreviation
   */
  private mapProTeamId(proTeamId: number): string {
    const map: Record<number, string> = {
      1: "BAL", 2: "BOS", 3: "LAA", 4: "CWS", 5: "CLE",
      6: "DET", 7: "KC", 8: "MIL", 9: "MIN", 10: "NYY",
      11: "OAK", 12: "SEA", 13: "TEX", 14: "TOR", 15: "ATL",
      16: "CHC", 17: "CIN", 18: "HOU", 19: "LAD", 20: "WSH",
      21: "NYM", 22: "PHI", 23: "PIT", 24: "STL", 25: "SD",
      26: "SF", 27: "COL", 28: "MIA", 29: "ARI", 30: "TB",
    };

    return map[proTeamId] || `TEAM_${proTeamId}`;
  }
}
