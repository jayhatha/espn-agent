import type { Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import { SnapshotRepository } from "../../db/snapshot-repository.js";

export interface EnrichedRosterEntry {
  playerId: number;
  espnPlayerId: number;
  playerName: string;
  mlbTeam: string | null;
  positions: string[];
  rosterStatus: string;
  rosterSlot: string | null;
  projections: unknown | null;
}

export interface RosterPairResult {
  snapshotDate: string;
  userTeam: {
    id: number;
    name: string;
    roster: EnrichedRosterEntry[];
  };
  partnerTeam: {
    id: number;
    name: string;
    roster: EnrichedRosterEntry[];
  };
}

/**
 * TradeView
 *
 * Owns DB query orchestration for assembling trade-builder domain objects.
 * Routes are thin HTTP facades: parse input → call view → format output.
 *
 * Per ARCHITECTURE-OPPORTUNITIES.md §2.
 */
export class TradeView {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Fetch both teams' rosters enriched with projections for manual trade building.
   */
  async getRosterPair(
    leagueId: number,
    teamId: number,
    partnerTeamId: number,
    snapshotDate: string,
  ): Promise<RosterPairResult | null> {
    const [userTeam, partnerTeam] = await Promise.all([
      this.db
        .selectFrom("team")
        .selectAll()
        .where("league_id", "=", leagueId)
        .where("id", "=", teamId)
        .executeTakeFirst(),
      this.db
        .selectFrom("team")
        .selectAll()
        .where("league_id", "=", leagueId)
        .where("id", "=", partnerTeamId)
        .executeTakeFirst(),
    ]);

    if (!userTeam || !partnerTeam) {
      return null;
    }

    const repo = new SnapshotRepository(this.db);
    const [userRosterRaw, partnerRosterRaw] = await Promise.all([
      repo.getRosterForSnapshot(leagueId, snapshotDate, teamId),
      repo.getRosterForSnapshot(leagueId, snapshotDate, partnerTeamId),
    ]);

    const userRoster = userRosterRaw
      .filter(
        (r) => r.roster_status === "active" || r.roster_status === "bench",
      )
      .sort((a, b) => a.player_name.localeCompare(b.player_name));
    const partnerRoster = partnerRosterRaw
      .filter(
        (r) => r.roster_status === "active" || r.roster_status === "bench",
      )
      .sort((a, b) => a.player_name.localeCompare(b.player_name));

    // Fetch projections for all players on both rosters
    const allPlayerIds = [
      ...userRoster.map((p) => p.player_id),
      ...partnerRoster.map((p) => p.player_id),
    ];

    const projections =
      allPlayerIds.length > 0
        ? await this.db
            .selectFrom("player_projection as proj")
            .innerJoin(
              "projections_run as run",
              "proj.projections_run_id",
              "run.id",
            )
            .select([
              "proj.player_id",
              "proj.stat_components_json",
              "run.as_of_date",
            ])
            .where("run.as_of_date", "<=", snapshotDate)
            .where("proj.player_id", "in", allPlayerIds)
            .orderBy("run.as_of_date", "desc")
            .execute()
        : [];

    // Most-recent projection per player
    const projectionMap = new Map<number, unknown>();
    for (const proj of projections) {
      if (!projectionMap.has(proj.player_id)) {
        projectionMap.set(proj.player_id, proj.stat_components_json);
      }
    }

    const enrich = (roster: typeof userRoster): EnrichedRosterEntry[] =>
      roster.map((player) => ({
        playerId: player.player_id,
        espnPlayerId: player.player_id,
        playerName: player.player_name,
        mlbTeam: player.mlb_team,
        positions: player.positions,
        rosterStatus: player.roster_status,
        rosterSlot: player.roster_slot,
        projections: projectionMap.get(player.player_id) ?? null,
      }));

    return {
      snapshotDate,
      userTeam: {
        id: userTeam.id,
        name: userTeam.name,
        roster: enrich(userRoster),
      },
      partnerTeam: {
        id: partnerTeam.id,
        name: partnerTeam.name,
        roster: enrich(partnerRoster),
      },
    };
  }
}
