import type { BaseLogger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import type {
  FaabSummary,
  FaabBidEntry,
  FaabSuggestedBid,
} from "../../../shared/dist/index.js";
import { getFaabBudget } from "../utils/league-settings.js";

/**
 * FAAB Tracker Agent
 *
 * Tracks FAAB budget usage, bid history with ROI scoring,
 * spend-rate projections, and suggested bid amounts.
 */

const MLB_SEASON_WEEKS = 26;

export interface FaabBidModelInput {
  leagueBudget: number;
  teamRemaining: number;
  playerValueAboveReplacement: number;
  maxValueAboveReplacement: number;
  categoryLeverage: number;
  competitorRemaining: number[];
  weeksRemaining: number;
}

export function calculateSuggestedFaabBid(input: FaabBidModelInput): number {
  if (input.leagueBudget <= 0 || input.teamRemaining <= 0) return 0;

  const valuePercentile =
    input.maxValueAboveReplacement > 0
      ? Math.min(
          1,
          input.playerValueAboveReplacement / input.maxValueAboveReplacement,
        )
      : 0;
  const baseBudgetShare =
    input.playerValueAboveReplacement > 0
      ? 0.02 + 0.28 * valuePercentile ** 1.5
      : 0.01;
  const sortedCompetitors = [...input.competitorRemaining].sort(
    (a, b) => a - b,
  );
  const competitorP75 =
    sortedCompetitors.length > 0
      ? sortedCompetitors[
          Math.min(
            sortedCompetitors.length - 1,
            Math.floor(sortedCompetitors.length * 0.75),
          )
        ]
      : 0;
  const marketPressure = Math.min(
    1.25,
    Math.max(0.8, competitorP75 / input.leagueBudget + 0.5),
  );
  const timePressure =
    input.weeksRemaining < 4 ? 1.25 : input.weeksRemaining > 15 ? 0.8 : 1;
  const modeledBid = Math.round(
    input.leagueBudget *
      baseBudgetShare *
      Math.min(1.75, Math.max(0.75, input.categoryLeverage)) *
      marketPressure *
      timePressure,
  );

  return Math.min(input.teamRemaining, Math.max(1, modeledBid));
}

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
      const spent =
        t.faab_spent !== null && t.faab_spent !== undefined
          ? Number(t.faab_spent)
          : 0;
      totalLeagueRemaining += faabTotal - spent;
    }
    const leagueAvgRemaining =
      teams.length > 0 ? totalLeagueRemaining / teams.length : faabTotal;

    // Compute weeks elapsed from first snapshot
    const { weeksElapsed, weeksRemaining } =
      await this.getSeasonProgress(leagueId);

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
      .select(["event_date", "players_added", "raw_event_json"])
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
    let replacementValue = 0;
    let maxValueAboveReplacement = 0;
    let categoryLeverage = 1;
    let availablePoolSize = 0;

    if (latestRun) {
      const latestFreeAgentSnapshot = await this.db
        .selectFrom("league_free_agent_snapshot")
        .select("snapshot_date")
        .where("league_id", "=", leagueId)
        .orderBy("snapshot_date", "desc")
        .executeTakeFirst();
      const availableIds = latestFreeAgentSnapshot
        ? (
            await this.db
              .selectFrom("league_free_agent_snapshot")
              .select("player_id")
              .where("league_id", "=", leagueId)
              .where(
                "snapshot_date",
                "=",
                latestFreeAgentSnapshot.snapshot_date,
              )
              .execute()
          ).map((row) => row.player_id)
        : [];

      if (availableIds.includes(playerId)) {
        const [poolProjections, latestProjectedDate, settings] =
          await Promise.all([
            this.db
              .selectFrom("player_projection")
              .select(["player_id", "stat_components_json"])
              .where("projections_run_id", "=", latestRun.id)
              .where("player_id", "in", availableIds)
              .execute(),
            this.db
              .selectFrom("team_daily_projected_category")
              .select("snapshot_date")
              .where("league_id", "=", leagueId)
              .orderBy("snapshot_date", "desc")
              .executeTakeFirst(),
            this.db
              .selectFrom("league_settings_version")
              .select("settings_json")
              .where("league_id", "=", leagueId)
              .orderBy("effective_date", "desc")
              .executeTakeFirst(),
          ]);
        const categories = (settings?.settings_json as any)?.categories ?? [];
        const standings = latestProjectedDate
          ? await this.db
              .selectFrom("team_daily_projected_category")
              .select(["team_id", "category_id", "projected_roto_points"])
              .where("league_id", "=", leagueId)
              .where("snapshot_date", "=", latestProjectedDate.snapshot_date)
              .execute()
          : [];
        const targetProjection = poolProjections.find(
          (row) => row.player_id === playerId,
        );
        if (targetProjection) {
          const targetComponents =
            targetProjection.stat_components_json as Record<string, number>;
          categoryLeverage = this.computeCategoryLeverage(
            teamId,
            targetComponents,
            categories,
            standings,
          );
          const targetIsPitcher = (targetComponents.IP ?? 0) > 0;
          const comparableValues = poolProjections
            .filter((row) => {
              const components = row.stat_components_json as Record<
                string,
                number
              >;
              return (components.IP ?? 0) > 0 === targetIsPitcher;
            })
            .map((row) => ({
              playerId: row.player_id,
              value: this.computePlayerValue(
                row.stat_components_json as Record<string, number>,
              ),
            }));
          const replacementValues = comparableValues
            .filter((row) => row.playerId !== playerId)
            .map((row) => row.value)
            .sort((a, b) => a - b);
          availablePoolSize = comparableValues.length;
          playerValue = this.computePlayerValue(targetComponents);
          replacementValue = this.percentile(replacementValues, 0.6);
          const maxPoolValue = Math.max(
            playerValue,
            ...comparableValues.map((row) => row.value),
          );
          maxValueAboveReplacement = Math.max(
            0,
            maxPoolValue - replacementValue,
          );
        }
      }
    }

    const teamRows = await this.db
      .selectFrom("team")
      .select(["id", "faab_spent"])
      .where("league_id", "=", leagueId)
      .execute();
    const leagueBudget = Number(summary.faabTotal);
    const teamRemaining = Number(summary.faabRemaining);
    const competitorRemaining = teamRows
      .filter((team) => team.id !== teamId)
      .map((team) => Math.max(0, leagueBudget - Number(team.faab_spent ?? 0)));
    const valueAboveReplacement = Math.max(0, playerValue - replacementValue);
    const suggestedBid =
      availablePoolSize > 0
        ? calculateSuggestedFaabBid({
            leagueBudget,
            teamRemaining,
            playerValueAboveReplacement: valueAboveReplacement,
            maxValueAboveReplacement,
            categoryLeverage,
            competitorRemaining,
            weeksRemaining: summary.weeksRemaining,
          })
        : 0;
    const reasons: string[] = [];
    if (availablePoolSize === 0) {
      reasons.push("Player is not in latest league free-agent pool");
    } else if (valueAboveReplacement <= 0) {
      reasons.push("Projection is at or below available replacement level");
    } else {
      reasons.push(
        `${Math.round(valueAboveReplacement)} value above replacement among ${availablePoolSize} comparable free agents`,
      );
      reasons.push(`${categoryLeverage.toFixed(2)}x standings leverage`);
      reasons.push(
        `competitor median remaining ${Math.round(this.percentile(competitorRemaining, 0.5))}/${leagueBudget}`,
      );
    }

    const rationale = reasons.join(". ");

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
      const budget = getFaabBudget(settings.settings_json);
      if (budget !== null) return budget;
    }

    this.logger?.warn({ leagueId }, "FAAB budget not enabled or unavailable");
    return 0;
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

  private computeCategoryLeverage(
    teamId: number,
    components: Record<string, number>,
    categories: Array<{ category_id: string; stat_key: string }>,
    standings: Array<{
      team_id: number;
      category_id: string;
      projected_roto_points: unknown;
    }>,
  ): number {
    const isPitcher = (components.IP ?? 0) > 0;
    const relevant = categories.filter((category) => {
      const pitchingKeys = new Set([
        "K",
        "W",
        "SV",
        "HLD",
        "QS",
        "ERA",
        "WHIP",
      ]);
      return pitchingKeys.has(category.stat_key) === isPitcher;
    });
    if (relevant.length === 0) return 1;
    const numTeams = new Set(standings.map((row) => row.team_id)).size;
    if (numTeams === 0) return 1;
    const leverage = relevant.map((category) => {
      const row = standings.find(
        (standing) =>
          standing.team_id === teamId &&
          standing.category_id === category.category_id,
      );
      const points = Number(row?.projected_roto_points ?? numTeams / 2);
      return 0.75 + (numTeams - points) / numTeams;
    });
    return leverage.reduce((sum, value) => sum + value, 0) / leverage.length;
  }

  private percentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[
      Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * percentile))
    ];
  }
}
