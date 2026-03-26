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
      this.logger?.debug(
        { startDate, endDate },
        "Fetching MLB schedule",
      );

      const response = await this.client.get("/schedule", {
        params: {
          sportId: 1,
          startDate,
          endDate,
        },
      });

      const games: MLBGame[] = response.data.dates?.flatMap(
        (dateEntry: any) => dateEntry.games || []
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

  /**
   * Get schedule for a specific team
   */
  async getTeamSchedule(
    teamId: number,
    startDate: string,
    endDate: string
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
    endDate: string
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
}
