import axios from "axios";
import type { AxiosInstance } from "axios";
import type { BaseLogger } from "pino";

/**
 * MLB StatsAPI Adapter
 *
 * Fetches game schedules, probable pitchers, and team schedules
 * from MLB's official public API (no auth required).
 */

export interface MLBGame {
  gamePk: number;
  gameDate: string;
  teams: {
    away: {
      team: { id: number; name: string; abbreviation?: string };
      probablePitcher?: { id: number; fullName: string };
    };
    home: {
      team: { id: number; name: string; abbreviation?: string };
      probablePitcher?: { id: number; fullName: string };
    };
  };
  venue: { id: number; name: string };
  status: { detailedState: string };
}

export interface TeamScheduleEntry {
  date: string;
  opponent: string;
  isHome: boolean;
  venue: string;
  gamePk: number;
}

export interface ProbablePitcherInfo {
  mlbPlayerId: number;
  fullName: string;
  opponent: string;
  opponentId: number;
  isHome: boolean;
  venue: string;
  gameDate: string;
  gamePk: number;
  opponentWoba?: number;
  parkFactor?: number;
  platoonAdvantage?: number;
}

export interface MLBLineupPlayer {
  mlbPlayerId: number;
  fullName: string;
  battingOrder: number;
}

export interface MLBTeamBattingContext {
  teamId: number;
  teamName: string;
  teamAbbreviation?: string;
  gamePk: number;
  lineupStatus: "confirmed" | "unavailable";
  starters: MLBLineupPlayer[];
  opponentProbablePitcher?: {
    mlbPlayerId: number;
    fullName: string;
    throws?: "L" | "R";
  };
  venue: string;
  parkFactor?: number;
}

export interface MLBDailyBattingContext {
  status: "available" | "partial" | "unavailable";
  teams: MLBTeamBattingContext[];
  unavailableGamePks: number[];
}

export class MLBStatsAPIAdapter {
  private client: AxiosInstance;

  constructor(private logger?: BaseLogger) {
    this.client = axios.create({
      baseURL: "https://statsapi.mlb.com/api/v1",
      timeout: 10000,
    });
  }

  /**
   * Get MLB schedule for a date range
   */
  async getSchedule(startDate: string, endDate: string): Promise<MLBGame[]> {
    try {
      this.logger?.debug({ startDate, endDate }, "Fetching MLB schedule");

      const response = await this.client.get("/schedule", {
        params: {
          sportId: 1,
          startDate,
          endDate,
          hydrate: "probablePitcher",
        },
      });

      const games: MLBGame[] =
        response.data.dates?.flatMap(
          (dateEntry: any) => dateEntry.games || [],
        ) || [];

      this.logger?.info(
        { startDate, endDate, gameCount: games.length },
        "Fetched MLB schedule",
      );

      return games;
    } catch (error: any) {
      this.logger?.error(
        { error: error.message, startDate, endDate },
        "Failed to fetch MLB schedule",
      );
      // Return empty array on error (graceful degradation)
      return [];
    }
  }

  /**
   * Get probable pitchers for a specific date
   */
  async getProbablePitchers(date: string): Promise<ProbablePitcherInfo[]> {
    const schedule = await this.getSchedule(date, date);
    const pitchers: ProbablePitcherInfo[] = [];

    for (const game of schedule) {
      // Away pitcher
      if (game.teams.away.probablePitcher) {
        pitchers.push({
          mlbPlayerId: game.teams.away.probablePitcher.id,
          fullName: game.teams.away.probablePitcher.fullName,
          opponent: game.teams.home.team.name,
          opponentId: game.teams.home.team.id,
          isHome: false,
          venue: game.venue.name,
          gameDate: game.gameDate,
          gamePk: game.gamePk,
        });
      }

      // Home pitcher
      if (game.teams.home.probablePitcher) {
        pitchers.push({
          mlbPlayerId: game.teams.home.probablePitcher.id,
          fullName: game.teams.home.probablePitcher.fullName,
          opponent: game.teams.away.team.name,
          opponentId: game.teams.away.team.id,
          isHome: true,
          venue: game.venue.name,
          gameDate: game.gameDate,
          gamePk: game.gamePk,
        });
      }
    }

    this.logger?.debug(
      { date, pitcherCount: pitchers.length },
      "Extracted probable pitchers",
    );

    return pitchers;
  }

  async getDailyBattingContext(
    date: string,
    suppliedSchedule?: MLBGame[],
  ): Promise<MLBDailyBattingContext> {
    const schedule = suppliedSchedule ?? (await this.getSchedule(date, date));
    if (schedule.length === 0) {
      return { status: "unavailable", teams: [], unavailableGamePks: [] };
    }

    const feeds = new Map<number, Record<string, any>>();
    const unavailableGamePks: number[] = [];
    await Promise.all(
      schedule.map(async (game) => {
        try {
          const response = await this.client.get(
            `/game/${game.gamePk}/feed/live`,
          );
          feeds.set(game.gamePk, response.data as Record<string, any>);
        } catch (error: any) {
          unavailableGamePks.push(game.gamePk);
          this.logger?.warn(
            { error: error.message, gamePk: game.gamePk },
            "MLB batting lineup context unavailable",
          );
        }
      }),
    );

    const teams = parseDailyBattingContexts(schedule, feeds);
    const confirmedCount = teams.filter(
      (team) => team.lineupStatus === "confirmed",
    ).length;
    const status =
      confirmedCount === teams.length && unavailableGamePks.length === 0
        ? "available"
        : confirmedCount > 0 || teams.length > 0
          ? confirmedCount > 0
            ? "partial"
            : "unavailable"
          : "unavailable";
    return { status, teams, unavailableGamePks };
  }

  /**
   * Get schedule for a specific team
   */
  async getTeamSchedule(
    teamId: number,
    startDate: string,
    endDate: string,
  ): Promise<TeamScheduleEntry[]> {
    const schedule = await this.getSchedule(startDate, endDate);
    const teamSchedule: TeamScheduleEntry[] = [];

    for (const game of schedule) {
      const isHome = game.teams.home.team.id === teamId;
      const isAway = game.teams.away.team.id === teamId;

      if (isHome) {
        teamSchedule.push({
          date: game.gameDate,
          opponent: game.teams.away.team.name,
          isHome: true,
          venue: game.venue.name,
          gamePk: game.gamePk,
        });
      } else if (isAway) {
        teamSchedule.push({
          date: game.gameDate,
          opponent: game.teams.home.team.name,
          isHome: false,
          venue: game.venue.name,
          gamePk: game.gamePk,
        });
      }
    }

    this.logger?.debug(
      { teamId, startDate, endDate, gameCount: teamSchedule.length },
      "Fetched team schedule",
    );

    return teamSchedule;
  }

  /**
   * Detect multi-start pitchers by counting games per team in a date range
   * Teams with 7+ games in a week indicate potential 2-start pitchers
   */
  async getMultiStartPitchers(
    startDate: string,
    endDate: string,
  ): Promise<Map<string, number>> {
    const schedule = await this.getSchedule(startDate, endDate);
    const teamGameCounts = new Map<string, number>();

    for (const game of schedule) {
      // Count games for home team
      const homeName = game.teams.home.team.name;
      teamGameCounts.set(homeName, (teamGameCounts.get(homeName) || 0) + 1);

      // Count games for away team
      const awayName = game.teams.away.team.name;
      teamGameCounts.set(awayName, (teamGameCounts.get(awayName) || 0) + 1);
    }

    this.logger?.debug(
      { startDate, endDate, teamCount: teamGameCounts.size },
      "Calculated team game counts for multi-start detection",
    );

    return teamGameCounts;
  }

  /**
   * Get the max games played by any MLB team this season.
   * Uses the MLB standings endpoint — returns the highest GP across all 30 teams.
   */
  async getSeasonGamesPlayed(season: number): Promise<number | null> {
    try {
      const response = await this.client.get("/standings", {
        params: {
          leagueId: "103,104", // AL + NL
          season,
          standingsTypes: "regularSeason",
        },
      });

      let maxGP = 0;
      for (const record of response.data.records || []) {
        for (const team of record.teamRecords || []) {
          const gp = (team.wins ?? 0) + (team.losses ?? 0);
          if (gp > maxGP) maxGP = gp;
        }
      }

      this.logger?.debug({ season, maxGP }, "Fetched season games played");
      return maxGP > 0 ? maxGP : null;
    } catch (error: any) {
      this.logger?.warn(
        { error: error.message, season },
        "Failed to fetch MLB standings for games played",
      );
      return null;
    }
  }
}

export function parseDailyBattingContexts(
  schedule: MLBGame[],
  feeds: Map<number, Record<string, any>>,
): MLBTeamBattingContext[] {
  const contexts: MLBTeamBattingContext[] = [];
  for (const game of schedule) {
    const feed = feeds.get(game.gamePk);
    for (const side of ["away", "home"] as const) {
      const opponentSide = side === "home" ? "away" : "home";
      const team = game.teams[side].team;
      const boxscorePlayers =
        feed?.liveData?.boxscore?.teams?.[side]?.players ?? {};
      const starters = Object.values(boxscorePlayers)
        .map((entry: any) => ({
          mlbPlayerId: Number(entry?.person?.id),
          fullName: String(entry?.person?.fullName ?? ""),
          battingOrder: Number(entry?.battingOrder),
        }))
        .filter(
          (player) =>
            Number.isFinite(player.mlbPlayerId) &&
            player.fullName.length > 0 &&
            Number.isFinite(player.battingOrder) &&
            player.battingOrder > 0,
        )
        .sort((left, right) => left.battingOrder - right.battingOrder);
      const probablePitcher = game.teams[opponentSide].probablePitcher;
      const probablePlayer = probablePitcher
        ? feed?.gameData?.players?.[`ID${probablePitcher.id}`]
        : undefined;
      const throws = probablePlayer?.pitchHand?.code;
      const rawParkFactor =
        feed?.gameData?.venue?.parkFactor ??
        feed?.gameData?.venue?.parkFactors?.overall;
      const parkFactor =
        typeof rawParkFactor === "number" && Number.isFinite(rawParkFactor)
          ? rawParkFactor
          : undefined;

      contexts.push({
        teamId: team.id,
        teamName: team.name,
        teamAbbreviation: team.abbreviation ?? MLB_TEAM_ABBREVIATIONS[team.id],
        gamePk: game.gamePk,
        lineupStatus: starters.length > 0 ? "confirmed" : "unavailable",
        starters,
        opponentProbablePitcher: probablePitcher
          ? {
              mlbPlayerId: probablePitcher.id,
              fullName: probablePitcher.fullName,
              throws: throws === "L" || throws === "R" ? throws : undefined,
            }
          : undefined,
        venue: game.venue.name,
        parkFactor,
      });
    }
  }
  return contexts;
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
