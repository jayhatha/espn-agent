import type { BaseLogger } from "pino";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { Database } from "../db/schema.js";
import type {
  GsSeasonSummary,
  GsWeeklySummary,
  GsStartPlan,
  GsStartRecommendation,
  PaceStatus,
} from "../../../shared/dist/index.js";
import { MLBStatsAPIAdapter } from "../adapters/mlb-statsapi.js";

/**
 * GS Pacing Agent
 *
 * Tracks Games Started usage against the season cap,
 * provides weekly breakdowns, and recommends SP start/sit
 * decisions to optimize GS pacing.
 */

const DEFAULT_GS_CAP = 200;
const MLB_SEASON_WEEKS = 26;

/** Roster slot names that indicate an active SP */
const SP_ROSTER_SLOTS = ["SP", "P"];

export class GsPacingAgent {
  constructor(
    private db: Kysely<Database>,
    private logger?: BaseLogger,
  ) {}

  /**
   * Get season GS pacing summary
   */
  async getSeasonSummary(
    leagueId: number,
    teamId: number,
  ): Promise<GsSeasonSummary> {
    this.logger?.info({ leagueId, teamId }, "Computing GS season summary");

    const gsCap = await this.getGsCap(leagueId);

    // Count GS from roster snapshots: each day an SP-eligible pitcher is
    // in an SP or P slot with active status counts as one game start.
    // ESPN does not expose GS as a tracked stat, so roster presence is
    // the only reliable signal available.
    const gsUsed = await this.countGsFromRosterAndStats(leagueId, teamId);

    const { weeksElapsed, weeksRemaining } =
      await this.getSeasonProgress(leagueId);

    const gsRemaining = Math.max(0, gsCap - gsUsed);
    const pacePerWeek = weeksElapsed > 0 ? gsUsed / weeksElapsed : 0;
    const targetPacePerWeek =
      weeksElapsed + weeksRemaining > 0
        ? gsCap / (weeksElapsed + weeksRemaining)
        : gsCap / MLB_SEASON_WEEKS;
    const projectedFinal = Math.round(pacePerWeek * (weeksElapsed + weeksRemaining));

    // Determine pace status
    // Pre-season (no weeks elapsed or no starts used): always "on_track"
    let paceStatus: PaceStatus = "on_track" as any;
    if (weeksElapsed > 0 && gsUsed > 0) {
      const paceRatio = targetPacePerWeek > 0 ? pacePerWeek / targetPacePerWeek : 1;
      if (paceRatio > 1.1) {
        paceStatus = "burning_fast";
      } else if (paceRatio < 0.9) {
        paceStatus = "too_slow";
      }
    }

    return {
      gsUsed,
      gsCap,
      gsRemaining,
      projectedTotal: projectedFinal,
      projectedFinal,
      pacePerWeek: Math.round(pacePerWeek * 10) / 10,
      targetPacePerWeek: Math.round(targetPacePerWeek * 10) / 10,
      paceStatus,
      weeksElapsed,
      weeksRemaining,
    } as any;
  }

  /**
   * Get weekly GS breakdown using MLB StatsAPI probable pitchers.
   *
   * Fetches the week's probable starters from MLB, matches them to
   * the team's rostered SPs, and shows projected start dates.
   */
  async getWeeklySummary(
    leagueId: number,
    teamId: number,
    weekStartDate?: string,
  ): Promise<GsWeeklySummary> {
    this.logger?.info(
      { leagueId, teamId, weekStartDate },
      "Computing weekly GS summary",
    );

    // Determine week boundaries (ESPN scoring weeks are Mon-Sun)
    const now = new Date();
    const weekStart = weekStartDate
      ? new Date(weekStartDate)
      : this.getMonday(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const weekStartStr = weekStart.toISOString().split("T")[0];
    const weekEndStr = weekEnd.toISOString().split("T")[0];

    // Get team's rostered SPs
    const latestSnapshot = await this.db
      .selectFrom("league_daily_snapshot")
      .select("snapshot_date")
      .where("league_id", "=", leagueId)
      .orderBy("snapshot_date", "desc")
      .executeTakeFirst();

    const snapshotDate = latestSnapshot?.snapshot_date ?? weekStartStr;

    const rosterSPs = await this.db
      .selectFrom("team_roster_snapshot as trs")
      .innerJoin("player as p", "p.id", "trs.player_id")
      .select([
        "trs.player_id",
        "p.name as player_name",
        "p.mlb_team",
        "trs.roster_status",
        "trs.roster_slot",
      ])
      .where("trs.league_id", "=", leagueId)
      .where("trs.team_id", "=", teamId)
      .where("trs.snapshot_date", "=", snapshotDate)
      .where(({ eb }) => eb(sql`p.positions @> ARRAY['SP']::text[]`, "=", sql`true`))
      .execute();

    // Fetch probable pitchers for the week from MLB StatsAPI
    const mlbAdapter = new MLBStatsAPIAdapter(this.logger);
    const probables = await mlbAdapter.getSchedule(weekStartStr, weekEndStr);

    // Build a map of MLB team -> probable pitcher name -> game dates
    const probableByTeamAndName = new Map<string, Map<string, string[]>>();
    for (const game of probables) {
      for (const side of ["away", "home"] as const) {
        const teamData = game.teams[side];
        const pitcher = teamData.probablePitcher;
        if (!pitcher) continue;

        const teamName = teamData.team.abbreviation || teamData.team.name;
        if (!probableByTeamAndName.has(teamName)) {
          probableByTeamAndName.set(teamName, new Map());
        }
        const pitcherMap = probableByTeamAndName.get(teamName)!;
        const gameDate = game.gameDate.split("T")[0];
        const nameKey = pitcher.fullName.toLowerCase();
        if (!pitcherMap.has(nameKey)) {
          pitcherMap.set(nameKey, []);
        }
        pitcherMap.get(nameKey)!.push(gameDate);
      }
    }

    // Match roster SPs to probable pitcher schedule
    const pitcherStarts: Array<{
      playerId: number;
      playerName: string;
      dates: string[];
      starts: number;
    }> = [];

    for (const sp of rosterSPs) {
      const mlbTeam = sp.mlb_team;
      const nameKey = sp.player_name.toLowerCase();

      // Try matching by name within the player's MLB team
      let matchedDates: string[] = [];
      if (mlbTeam) {
        const teamPitchers = probableByTeamAndName.get(mlbTeam);
        if (teamPitchers) {
          // Exact name match first
          matchedDates = teamPitchers.get(nameKey) || [];

          // Fuzzy: try last name match if exact fails
          if (matchedDates.length === 0) {
            const lastName = nameKey.split(" ").pop() || "";
            for (const [probName, dates] of teamPitchers) {
              if (probName.includes(lastName) && lastName.length > 2) {
                matchedDates = dates;
                break;
              }
            }
          }
        }
      }

      if (matchedDates.length > 0) {
        pitcherStarts.push({
          playerId: sp.player_id,
          playerName: sp.player_name,
          dates: matchedDates.sort(),
          starts: matchedDates.length,
        });
      }
    }

    const startsUsed = pitcherStarts.reduce((sum, p) => sum + p.starts, 0);

    // Get target pace
    const season = await this.getSeasonSummary(leagueId, teamId);
    const targetPerWeek = season.targetPacePerWeek as number;

    return {
      weekStart: weekStartStr,
      weekEnd: weekEndStr,
      startsUsed,
      startsRemaining: Math.max(0, Math.round(targetPerWeek) - startsUsed),
      targetPerWeek: Math.round(targetPerWeek),
      pitcherStarts,
    } as any;
  }

  /**
   * Get SP start/sit recommendations
   */
  async getStartPlan(
    leagueId: number,
    teamId: number,
  ): Promise<GsStartPlan> {
    this.logger?.info({ leagueId, teamId }, "Generating SP start plan");

    const season = await this.getSeasonSummary(leagueId, teamId);

    // Get current roster SPs
    const latestSnapshot = await this.db
      .selectFrom("league_daily_snapshot")
      .select("snapshot_date")
      .where("league_id", "=", leagueId)
      .orderBy("snapshot_date", "desc")
      .executeTakeFirst();

    if (!latestSnapshot) {
      return {
        paceStatus: season.paceStatus,
        recommendations: [],
        alert: "No snapshot data available",
      };
    }

    // Get SPs on roster
    const rosterPitchers = await this.db
      .selectFrom("team_roster_snapshot as trs")
      .innerJoin("player as p", "p.id", "trs.player_id")
      .select([
        "trs.player_id",
        "p.name as player_name",
        "p.positions",
        "trs.roster_slot",
        "trs.roster_status",
      ])
      .where("trs.league_id", "=", leagueId)
      .where("trs.team_id", "=", teamId)
      .where("trs.snapshot_date", "=", latestSnapshot.snapshot_date)
      .where("trs.roster_slot", "in", ["SP", "P", "BENCH"])
      .execute();

    // Get latest projection run
    const latestRun = await this.db
      .selectFrom("projections_run")
      .select("id")
      .where("staleness", "=", "fresh")
      .orderBy("as_of_date", "desc")
      .executeTakeFirst();

    // Build recommendations
    const recommendations: GsStartRecommendation[] = [];

    for (const pitcher of rosterPitchers) {
      // Only include pitchers with SP eligibility
      const positions = (pitcher.positions as string[]) ?? [];
      if (!positions.includes("SP")) continue;

      let projectedK: number | null = null;
      let projectedIP: number | null = null;
      let kPerGs: number | null = null;

      if (latestRun) {
        const projection = await this.db
          .selectFrom("player_projection")
          .select("stat_components_json")
          .where("projections_run_id", "=", latestRun.id)
          .where("player_id", "=", pitcher.player_id)
          .executeTakeFirst();

        if (projection) {
          const components = projection.stat_components_json as Record<
            string,
            number
          >;
          projectedK = components.K ?? null;
          projectedIP = components.IP ?? null;

          // Approximate K/GS: assume ~6 IP per GS
          if (projectedIP && projectedIP > 0) {
            const estimatedGS = projectedIP / 6;
            kPerGs =
              estimatedGS > 0 && projectedK
                ? Math.round((projectedK / estimatedGS) * 10) / 10
                : null;
          }
        }
      }

      // Skip low-IP pitchers (likely RPs/bulk relievers even with SP eligibility)
      if (projectedIP !== null && projectedIP < 80) continue;

      let action: GsStartRecommendation["action"];
      let reason: string;

      if (season.paceStatus === "burning_fast") {
        // Recommend sitting low-value SPs
        if (kPerGs !== null && kPerGs < 5) {
          action = "sit";
          reason = `Low K/GS ratio (${kPerGs}) — sit to conserve starts`;
        } else if (pitcher.roster_status !== "active") {
          action = "sit";
          reason = "Already benched — keep benched to conserve GS pace";
        } else {
          action = "start";
          reason =
            kPerGs !== null
              ? `Good K/GS ratio (${kPerGs}) — worth the start`
              : "Starting pitcher with no projection data";
        }
      } else if (season.paceStatus === "too_slow") {
        if (pitcher.roster_slot === "BENCH") {
          action = "start";
          reason = "Activate to increase GS pace — currently underutilizing starts";
        } else {
          action = "start";
          reason = "Start all SPs to catch up on GS pace";
        }
      } else {
        // On track — rank by efficiency
        if (kPerGs !== null && kPerGs >= 6) {
          action = "start";
          reason = `High K/GS efficiency (${kPerGs}) — priority start`;
        } else if (kPerGs !== null && kPerGs < 4) {
          action = "sit";
          reason = `Low K/GS ratio (${kPerGs}) — consider sitting for better matchup`;
        } else {
          action = "start";
          reason = "Standard start — pace is on track";
        }
      }

      recommendations.push({
        playerId: pitcher.player_id,
        playerName: pitcher.player_name,
        action,
        reason,
        projectedK,
        projectedIP,
        kPerGs,
      });
    }

    // Sort: starts first, then by K/GS desc
    recommendations.sort((a, b) => {
      if (a.action === "start" && b.action !== "start") return -1;
      if (a.action !== "start" && b.action === "start") return 1;
      return ((b as any).kPerGs ?? 0) - ((a as any).kPerGs ?? 0);
    });

    // Generate alert
    let alert: string | null = null;
    const paceRatio =
      (season as any).targetPacePerWeek > 0
        ? (season as any).pacePerWeek / (season as any).targetPacePerWeek
        : 1;

    if (Math.abs(paceRatio - 1) > 0.1) {
      if (season.paceStatus === "burning_fast") {
        alert = `GS pace is ${Math.round((paceRatio - 1) * 100)}% above target. Projected to hit ${season.projectedFinal} GS (cap: ${season.gsCap}). Consider sitting low-value SPs.`;
      } else if (season.paceStatus === "too_slow") {
        alert = `GS pace is ${Math.round((1 - paceRatio) * 100)}% below target. ${season.gsRemaining} starts remaining with ${season.weeksRemaining} weeks left. Activate benched SPs or stream.`;
      }
    }

    return {
      paceStatus: season.paceStatus,
      recommendations,
      alert,
    };
  }

  // --- Private helpers ---

  private async getGsCap(leagueId: number): Promise<number> {
    const settings = await this.db
      .selectFrom("league_settings_version")
      .select("settings_json")
      .where("league_id", "=", leagueId)
      .orderBy("effective_date", "desc")
      .executeTakeFirst();

    if (settings?.settings_json) {
      const json = settings.settings_json as unknown as Record<string, unknown>;
      // Check for GS cap in settings
      const rosterSlots = json.roster_slots as Record<string, number> | undefined;
      if (rosterSlots?.GS_LIMIT !== undefined) {
        return rosterSlots.GS_LIMIT;
      }
    }

    return DEFAULT_GS_CAP;
  }

  /**
   * Count GS used this season for this team.
   *
   * Primary source: ESPN team statValues[33] (GS) from the latest raw
   * payload — this is the same number shown on ESPN's standings page and
   * already accounts for roster tenure (ESPN only counts starts made
   * while the pitcher was on your team).
   *
   * Fallback: sum GS from player_period_stats (tenure-scoped).
   * Last resort: estimate from roster days.
   */
  private async countGsFromRosterAndStats(
    leagueId: number,
    teamId: number,
  ): Promise<number> {
    // 1. Try ESPN raw payload — team.valuesByStat[33] is GS
    const team = await this.db
      .selectFrom("team")
      .select(["espn_team_id"])
      .where("id", "=", teamId)
      .executeTakeFirst();

    if (team) {
      const latestPayload = await this.db
        .selectFrom("league_raw_payload")
        .select(["response_json"])
        .where("league_id", "=", leagueId)
        .orderBy("fetched_at", "desc")
        .executeTakeFirst();

      if (latestPayload) {
        const raw = latestPayload.response_json as any;
        const espnTeam = raw?.teams?.find(
          (t: any) => t.id === team.espn_team_id,
        );
        const gsFromEspn = espnTeam?.valuesByStat?.[33];
        if (typeof gsFromEspn === "number" && gsFromEspn >= 0) {
          this.logger?.info(
            { teamId, gsFromEspn },
            "GS count from ESPN statValues[33]",
          );
          return gsFromEspn;
        }
      }
    }

    // 2. Fallback: sum GS from tenure-scoped player_period_stats
    const tenureRows = await this.db
      .selectFrom("player_period_stats")
      .select(["player_id", "components_json"])
      .where("league_id", "=", leagueId)
      .where("team_id", "=", teamId)
      .execute();

    if (tenureRows.length > 0) {
      let totalGS = 0;
      for (const row of tenureRows) {
        const components = row.components_json as Record<string, number> | null;
        const gs = components?.GS;
        if (typeof gs === "number" && gs > 0) {
          totalGS += gs;
        }
      }
      if (totalGS > 0) {
        this.logger?.info({ teamId, totalGS }, "GS count from tenure stats");
        return totalGS;
      }
    }

    // 3. Last resort: estimate from roster days
    const league = await this.db
      .selectFrom("league")
      .select("season")
      .where("id", "=", leagueId)
      .executeTakeFirst();

    if (!league) return 0;

    const seasonStart = `${league.season}-01-01`;
    const seasonEnd = `${league.season}-12-31`;

    const pitcherDays = await this.db
      .selectFrom("team_roster_snapshot as trs")
      .innerJoin("player as p", "p.id", "trs.player_id")
      .select([
        "trs.player_id",
        (eb) => eb.fn.count<number>("trs.snapshot_date").as("days_rostered"),
      ])
      .where("trs.league_id", "=", leagueId)
      .where("trs.team_id", "=", teamId)
      .where("trs.snapshot_date", ">=", seasonStart)
      .where("trs.snapshot_date", "<=", seasonEnd)
      .where("trs.roster_status", "=", "active")
      .where("trs.roster_slot", "in", SP_ROSTER_SLOTS)
      .where(({ eb }) => eb(sql`p.positions @> ARRAY['SP']::text[]`, "=", sql`true`))
      .groupBy(["trs.player_id"])
      .execute();

    let totalGS = 0;
    for (const row of pitcherDays) {
      const daysRostered = Number(row.days_rostered);
      totalGS += Math.round(daysRostered / 5) || (daysRostered > 0 ? 1 : 0);
    }

    this.logger?.info({ teamId, totalGS, source: "roster-estimate" }, "GS count estimated from roster days");
    return totalGS;
  }

  private async getSeasonProgress(
    leagueId: number,
  ): Promise<{ weeksElapsed: number; weeksRemaining: number }> {
    // Use the league's season year to determine the current season window
    const league = await this.db
      .selectFrom("league")
      .select("season")
      .where("id", "=", leagueId)
      .executeTakeFirst();

    if (!league) {
      return { weeksElapsed: 0, weeksRemaining: MLB_SEASON_WEEKS };
    }

    // MLB season typically runs late March through late September
    const seasonOpeningDay = new Date(`${league.season}-03-27`);
    const seasonEnd = new Date(`${league.season}-09-28`);
    const now = new Date();

    // If before opening day, season hasn't started
    if (now < seasonOpeningDay) {
      return { weeksElapsed: 0, weeksRemaining: MLB_SEASON_WEEKS };
    }

    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const weeksElapsed = Math.max(
      1,
      Math.floor((now.getTime() - seasonOpeningDay.getTime()) / msPerWeek),
    );
    const totalSeasonWeeks = Math.ceil(
      (seasonEnd.getTime() - seasonOpeningDay.getTime()) / msPerWeek,
    );
    const weeksRemaining = Math.max(0, totalSeasonWeeks - weeksElapsed);

    return { weeksElapsed, weeksRemaining };
  }

  private getMonday(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }
}
