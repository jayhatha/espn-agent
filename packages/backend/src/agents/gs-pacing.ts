import type { Logger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import type {
  GsSeasonSummary,
  GsWeeklySummary,
  GsStartPlan,
  GsStartRecommendation,
  PaceStatus,
} from "../../../shared/dist/index.js";

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
    private logger?: Logger,
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

    // Try to get GS from category totals first
    let gsUsed = await this.getGsFromCategoryTotals(leagueId, teamId);

    // Fallback: estimate from IP
    if (gsUsed === null) {
      gsUsed = await this.estimateGsFromIP(leagueId, teamId);
    }

    gsUsed = gsUsed ?? 0;

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
    let paceStatus: PaceStatus = "on_track";
    const paceRatio = targetPacePerWeek > 0 ? pacePerWeek / targetPacePerWeek : 1;

    if (paceRatio > 1.1) {
      paceStatus = "burning_fast";
    } else if (paceRatio < 0.9) {
      paceStatus = "too_slow";
    }

    return {
      gsUsed,
      gsCap,
      gsRemaining,
      projectedFinal,
      pacePerWeek: Math.round(pacePerWeek * 10) / 10,
      targetPacePerWeek: Math.round(targetPacePerWeek * 10) / 10,
      paceStatus,
      weeksElapsed,
      weeksRemaining,
    };
  }

  /**
   * Get weekly GS breakdown
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

    // Determine week boundaries
    const now = new Date();
    const weekStart = weekStartDate
      ? new Date(weekStartDate)
      : this.getMonday(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const weekStartStr = weekStart.toISOString().split("T")[0];
    const weekEndStr = weekEnd.toISOString().split("T")[0];

    // Get roster snapshots for this week's dates
    const snapshots = await this.db
      .selectFrom("team_roster_snapshot as trs")
      .innerJoin("player as p", "p.id", "trs.player_id")
      .select([
        "trs.snapshot_date",
        "trs.player_id",
        "p.name as player_name",
        "trs.roster_slot",
      ])
      .where("trs.league_id", "=", leagueId)
      .where("trs.team_id", "=", teamId)
      .where("trs.snapshot_date", ">=", weekStartStr)
      .where("trs.snapshot_date", "<=", weekEndStr)
      .where("trs.roster_status", "=", "active")
      .where("trs.roster_slot", "in", SP_ROSTER_SLOTS)
      .execute();

    // Group by pitcher
    const pitcherMap = new Map<
      number,
      { playerName: string; dates: Set<string> }
    >();

    for (const snap of snapshots) {
      const existing = pitcherMap.get(snap.player_id);
      if (existing) {
        existing.dates.add(snap.snapshot_date);
      } else {
        pitcherMap.set(snap.player_id, {
          playerName: snap.player_name,
          dates: new Set([snap.snapshot_date]),
        });
      }
    }

    const pitcherStarts = Array.from(pitcherMap.entries()).map(
      ([playerId, data]) => ({
        playerId,
        playerName: data.playerName,
        dates: Array.from(data.dates).sort(),
      }),
    );

    const startsUsed = pitcherStarts.reduce(
      (sum, p) => sum + p.dates.length,
      0,
    );

    // Get target pace
    const season = await this.getSeasonSummary(leagueId, teamId);
    const targetPerWeek = season.targetPacePerWeek;

    return {
      weekStart: weekStartStr,
      weekEnd: weekEndStr,
      startsUsed,
      startsRemaining: Math.max(
        0,
        Math.round(targetPerWeek) - startsUsed,
      ),
      targetPerWeek: Math.round(targetPerWeek),
      pitcherStarts,
    };
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
      return (b.kPerGs ?? 0) - (a.kPerGs ?? 0);
    });

    // Generate alert
    let alert: string | null = null;
    const paceRatio =
      season.targetPacePerWeek > 0
        ? season.pacePerWeek / season.targetPacePerWeek
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

  private async getGsFromCategoryTotals(
    leagueId: number,
    teamId: number,
  ): Promise<number | null> {
    // Look for GS stat in category totals
    const latest = await this.db
      .selectFrom("team_daily_category_totals")
      .select("value")
      .where("league_id", "=", leagueId)
      .where("team_id", "=", teamId)
      .where("category_id", "=", "GS")
      .orderBy("snapshot_date", "desc")
      .executeTakeFirst();

    return latest ? latest.value : null;
  }

  private async estimateGsFromIP(
    leagueId: number,
    teamId: number,
  ): Promise<number | null> {
    // Estimate GS from IP: roughly 1 GS per 6 IP
    const ipTotal = await this.db
      .selectFrom("team_daily_category_totals")
      .select("value")
      .where("league_id", "=", leagueId)
      .where("team_id", "=", teamId)
      .where("category_id", "=", "IP")
      .orderBy("snapshot_date", "desc")
      .executeTakeFirst();

    if (ipTotal) {
      return Math.round(ipTotal.value / 6);
    }

    return null;
  }

  private async getSeasonProgress(
    leagueId: number,
  ): Promise<{ weeksElapsed: number; weeksRemaining: number }> {
    const firstSnapshot = await this.db
      .selectFrom("league_daily_snapshot")
      .select("snapshot_date")
      .where("league_id", "=", leagueId)
      .orderBy("snapshot_date", "asc")
      .executeTakeFirst();

    if (!firstSnapshot) {
      return { weeksElapsed: 0, weeksRemaining: MLB_SEASON_WEEKS };
    }

    const seasonStart = new Date(firstSnapshot.snapshot_date);
    const now = new Date();
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const weeksElapsed = Math.max(
      1,
      Math.floor((now.getTime() - seasonStart.getTime()) / msPerWeek),
    );
    const weeksRemaining = Math.max(0, MLB_SEASON_WEEKS - weeksElapsed);

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
