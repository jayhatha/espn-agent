import type { BaseLogger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import type {
  FaabSummary,
  FaabBidEntry,
  FaabSuggestedBid,
} from "../../../shared/dist/index.js";

/**
 * FAAB Tracker Agent
 *
 * Tracks FAAB budget usage, bid history with ROI scoring,
 * spend-rate projections, and suggested bid amounts.
 */

const DEFAULT_FAAB_BUDGET = 1000;
const MLB_SEASON_WEEKS = 26;

export class FaabTrackerAgent {
  constructor(
    private db: Kysely<Database>,
    private logger?: BaseLogger,
  ) {}

  /**
   * Get FAAB budget summary for a team
   */
  async getSummary(leagueId: number, teamId: number): Promise<FaabSummary> {
    this.logger?.info({ leagueId, teamId }, "Computing FAAB summary");

    // Get FAAB total budget from league settings
    const faabTotal = await this.getFaabBudget(leagueId);

    // Get all teams with FAAB spent from ESPN data (populated by snapshot)
    const teams = await this.db
      .selectFrom("team")
      .select(["id", "faab_spent"])
      .where("league_id", "=", leagueId)
      .execute();

    // Use ESPN-reported faab_spent directly (falls back to transaction-derived if null)
    const myTeam = teams.find((t) => t.id === teamId);
    let mySpent: number;

    if (myTeam?.faab_spent !== null && myTeam?.faab_spent !== undefined) {
      mySpent = Number(myTeam.faab_spent);
    } else {
      // Fallback: derive from transaction events (legacy path)
      const teamIds = teams.map((t) => t.id);
      const allBids = await this.getTeamBids(leagueId, teamIds);
      mySpent = allBids
        .filter((b) => b.teamId === teamId)
        .reduce((sum, b) => sum + b.bidAmount, 0);
    }

    const faabRemaining = faabTotal - mySpent;

    // League average remaining — use ESPN faab_spent where available
    let totalLeagueRemaining = 0;
    for (const t of teams) {
      const spent = t.faab_spent !== null && t.faab_spent !== undefined
        ? Number(t.faab_spent)
        : 0;
      totalLeagueRemaining += faabTotal - spent;
    }
    const leagueAvgRemaining =
      teams.length > 0 ? totalLeagueRemaining / teams.length : faabTotal;

    // Compute weeks elapsed from first snapshot
    const { weeksElapsed, weeksRemaining } = await this.getSeasonProgress(
      leagueId,
    );

    // Spend rate and projected runout
    const spendRate = weeksElapsed > 0 ? mySpent / weeksElapsed : 0;
    let projectedRunoutWeek: number | null = null;
    let willRunOut = false;

    if (spendRate > 0) {
      const weeksUntilRunout = faabRemaining / spendRate;
      projectedRunoutWeek = Math.round(weeksElapsed + weeksUntilRunout);
      willRunOut = weeksUntilRunout < weeksRemaining;
    }

    return {
      teamId,
      faabTotal,
      faabSpent: mySpent,
      faabRemaining,
      leagueAvgRemaining: Math.round(leagueAvgRemaining * 100) / 100,
      spendRate: Math.round(spendRate * 100) / 100,
      projectedRunoutWeek,
      weeksRemaining,
      weeksElapsed,
      willRunOut,
    } as any;
  }

  /**
   * Get bid history for a team
   */
  async getBidHistory(
    leagueId: number,
    teamId: number,
  ): Promise<FaabBidEntry[]> {
    this.logger?.info({ leagueId, teamId }, "Fetching bid history");

    // Get all waiver transactions with bid amounts for this team
    const transactions = await this.db
      .selectFrom("league_transaction_event")
      .select([
        "event_date",
        "players_added",
        "raw_event_json",
      ])
      .where("league_id", "=", leagueId)
      .where("team_id", "=", teamId)
      .where("event_type", "in", ["waiver", "add"])
      .orderBy("event_date", "desc")
      .execute();

    // Get latest projection run for ROI computation
    const latestRun = await this.db
      .selectFrom("projections_run")
      .select("id")
      .where("staleness", "=", "fresh")
      .orderBy("as_of_date", "desc")
      .executeTakeFirst();

    const entries: FaabBidEntry[] = [];

    for (const txn of transactions) {
      const rawJson = txn.raw_event_json as Record<string, unknown>;
      const bidAmount = (rawJson?.bidAmount as number) ?? null;

      if (bidAmount === null || bidAmount === undefined) continue;

      const playersAdded = txn.players_added as number[];
      const playerId = playersAdded?.[0];
      if (!playerId) continue;

      // Look up player name
      const player = await this.db
        .selectFrom("player")
        .select("name")
        .where("id", "=", playerId)
        .executeTakeFirst();

      // Compute ROI from projections
      let roi: number | null = null;
      if (latestRun && bidAmount > 0) {
        const projection = await this.db
          .selectFrom("player_projection")
          .select("stat_components_json")
          .where("projections_run_id", "=", latestRun.id)
          .where("player_id", "=", playerId)
          .executeTakeFirst();

        if (projection) {
          const components = projection.stat_components_json as Record<
            string,
            number
          >;
          const value = this.computePlayerValue(components);
          roi = Math.round((value / bidAmount) * 100) / 100;
        }
      }

      entries.push({
        date: txn.event_date,
        playerName: player?.name || `Player ${playerId}`,
        playerId,
        bidAmount,
        outcome: "won", // We only see our own successful claims
        roi,
      } as any);
    }

    return entries;
  }

  /**
   * Get suggested bid for a player
   */
  async getSuggestedBid(
    leagueId: number,
    teamId: number,
    playerId: number,
  ): Promise<FaabSuggestedBid> {
    this.logger?.info(
      { leagueId, teamId, playerId },
      "Computing suggested bid",
    );

    // Get player info
    const player = await this.db
      .selectFrom("player")
      .select("name")
      .where("id", "=", playerId)
      .executeTakeFirst();

    const playerName = player?.name || `Player ${playerId}`;

    // Get FAAB summary for context
    const summary = await this.getSummary(leagueId, teamId);

    // Get player projection
    const latestRun = await this.db
      .selectFrom("projections_run")
      .select("id")
      .where("staleness", "=", "fresh")
      .orderBy("as_of_date", "desc")
      .executeTakeFirst();

    let playerValue = 0;
    let totalPoolValue = 0;

    if (latestRun) {
      // Get this player's value
      const projection = await this.db
        .selectFrom("player_projection")
        .select("stat_components_json")
        .where("projections_run_id", "=", latestRun.id)
        .where("player_id", "=", playerId)
        .executeTakeFirst();

      if (projection) {
        playerValue = this.computePlayerValue(
          projection.stat_components_json as Record<string, number>,
        );
      }

      // Get total pool value (all free agent projections)
      const allProjections = await this.db
        .selectFrom("player_projection")
        .select("stat_components_json")
        .where("projections_run_id", "=", latestRun.id)
        .execute();

      for (const p of allProjections) {
        totalPoolValue += this.computePlayerValue(
          p.stat_components_json as Record<string, number>,
        );
      }
    }

    // Base bid: player's share of remaining budget
    let suggestedBid = 1;
    const reasons: string[] = [];

    if (totalPoolValue > 0 && (summary as any).faabRemaining > 0) {
      const valueShare = playerValue / totalPoolValue;
      suggestedBid = Math.max(1, Math.round(valueShare * (summary as any).faabRemaining));

      // Adjust for time pressure
      if (summary.weeksRemaining < 4) {
        suggestedBid = Math.round(suggestedBid * 1.5);
        reasons.push("Urgency premium (+50%) — less than 4 weeks remaining");
      } else if (summary.weeksRemaining > 15) {
        suggestedBid = Math.round(suggestedBid * 0.7);
        reasons.push("Patience discount (-30%) — more than 15 weeks remaining");
      }

      // Cap at remaining budget
      suggestedBid = Math.min(suggestedBid, (summary as any).faabRemaining);
    } else {
      reasons.push("No projection data available — minimum bid recommended");
    }

    const rationale =
      reasons.length > 0
        ? reasons.join(". ")
        : `Based on ${Math.round((playerValue / totalPoolValue) * 100)}% of remaining pool value`;

    return {
      playerId,
      playerName,
      suggestedBid,
      faabRemaining: summary.faabRemaining,
      rationale,
    };
  }

  // --- Private helpers ---

  private async getFaabBudget(leagueId: number): Promise<number> {
    const settings = await this.db
      .selectFrom("league_settings_version")
      .select("settings_json")
      .where("league_id", "=", leagueId)
      .orderBy("effective_date", "desc")
      .executeTakeFirst();

    if (settings?.settings_json) {
      const json = settings.settings_json as unknown as Record<string, unknown>;
      const acqRules = json.acquisition_rules as Record<string, unknown> | undefined;

      // Check multiple possible field names for FAAB budget
      const candidates: (unknown | undefined)[] = [
        acqRules?.acquisition_budget,
        acqRules?.acquisitionBudget,
        acqRules?.budget,
        acqRules?.faab_budget,
        (json as Record<string, unknown>).acquisitionBudget,
        (json as Record<string, unknown>).acquisition_budget,
      ];

      for (const val of candidates) {
        if (val !== undefined && val !== null && typeof val === "number" && val > 0) {
          return val;
        }
      }
    }

    this.logger?.warn({ leagueId }, "FAAB budget not found in settings, using default");
    return DEFAULT_FAAB_BUDGET;
  }

  private async getTeamBids(
    leagueId: number,
    teamIds: number[],
  ): Promise<Array<{ teamId: number; bidAmount: number }>> {
    if (teamIds.length === 0) return [];

    const transactions = await this.db
      .selectFrom("league_transaction_event")
      .select(["team_id", "raw_event_json"])
      .where("league_id", "=", leagueId)
      .where("team_id", "in", teamIds)
      .where("event_type", "in", ["waiver", "add"])
      .execute();

    const bids: Array<{ teamId: number; bidAmount: number }> = [];

    for (const txn of transactions) {
      const rawJson = txn.raw_event_json as Record<string, unknown>;
      const bidAmount = (rawJson?.bidAmount as number) ?? null;
      if (bidAmount !== null && bidAmount > 0) {
        bids.push({ teamId: txn.team_id, bidAmount });
      }
    }

    return bids;
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

  /**
   * Simple player value heuristic from projection components.
   * Sum of counting stat contributions, normalized.
   */
  private computePlayerValue(components: Record<string, number>): number {
    // Counting stats that contribute to roto value
    const hr = components.HR ?? 0;
    const rbi = components.RBI ?? 0;
    const r = components.R ?? 0;
    const sb = components.SB ?? 0;
    const k = components.K ?? 0;
    const w = components.W ?? 0;
    const sv = components.SV ?? 0;

    // Simple additive value — each stat weighted roughly equally
    return hr * 3 + rbi + r + sb * 2 + k * 0.5 + w * 5 + sv * 4;
  }
}
