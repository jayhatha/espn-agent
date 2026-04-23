import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { BaseLogger } from "pino";
import type { Database } from "../db/schema.js";
import type {
  NotificationBus,
  StandingsChangeEventPayload,
} from "../utils/notification-bus.js";

export class StandingsChangeLogAgent {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly logger: BaseLogger,
    private readonly bus: NotificationBus,
  ) {}

  async generateEvents(
    leagueId: number,
    snapshotDate: string,
  ): Promise<number> {
    // 1. Find two most recent snapshots
    const snapshots = await this.db
      .selectFrom("league_daily_snapshot")
      .select(["snapshot_date", "projections_run_id"])
      .where("league_id", "=", leagueId)
      .orderBy("snapshot_date", "desc")
      .limit(2)
      .execute();

    if (snapshots.length < 2) {
      this.logger.info(
        { leagueId },
        "StandingsChangeLogAgent: fewer than 2 snapshots, skipping",
      );
      return 0;
    }

    const normDate = (d: unknown): string => {
      if (d instanceof Date) return d.toISOString().split("T")[0];
      return String(d).split("T")[0];
    };

    const currDate = normDate(snapshots[0].snapshot_date);
    const prevDate = normDate(snapshots[1].snapshot_date);

    // 2. Fetch all projected category values for both snapshots
    const [prevRows, currRows] = await Promise.all([
      this.db
        .selectFrom("team_daily_projected_category")
        .select(["team_id", "category_id", "projected_value"])
        .where("league_id", "=", leagueId)
        .where("snapshot_date", "=", prevDate)
        .execute(),
      this.db
        .selectFrom("team_daily_projected_category")
        .select(["team_id", "category_id", "projected_value"])
        .where("league_id", "=", leagueId)
        .where("snapshot_date", "=", currDate)
        .execute(),
    ]);

    if (prevRows.length === 0 || currRows.length === 0) {
      this.logger.info(
        { leagueId },
        "StandingsChangeLogAgent: no projected category data, skipping",
      );
      return 0;
    }

    // 3. Fetch teams for this league
    const teams = await this.db
      .selectFrom("team")
      .select(["id", "name"])
      .where("league_id", "=", leagueId)
      .execute();

    const teamMap = new Map(teams.map((t) => [t.id, t.name]));
    const numTeams = teams.length;

    // 4. Fetch category settings to know direction (HIGHER_BETTER or LOWER_BETTER)
    const settingsVersion = await this.db
      .selectFrom("league_settings_version")
      .select("settings_json")
      .where("league_id", "=", leagueId)
      .where("effective_date", "<=", currDate)
      .orderBy("effective_date", "desc")
      .executeTakeFirst();

    const categories =
      (settingsVersion?.settings_json as any)?.categories ?? [];

    // Build direction map
    const directionMap = new Map<string, "HIGHER_BETTER" | "LOWER_BETTER">();
    const categoryNameMap = new Map<string, string>();
    for (const cat of categories) {
      const dir = cat.lowerIsBetter ? "LOWER_BETTER" : "HIGHER_BETTER";
      directionMap.set(cat.statKey ?? cat.id, dir);
      categoryNameMap.set(
        cat.statKey ?? cat.id,
        cat.displayName ?? cat.statKey ?? cat.id,
      );
    }

    // 5. Group projected values by category
    const prevByCat = new Map<string, Map<number, number>>();
    for (const row of prevRows) {
      if (!prevByCat.has(row.category_id))
        prevByCat.set(row.category_id, new Map());
      prevByCat
        .get(row.category_id)!
        .set(row.team_id, Number(row.projected_value));
    }

    const currByCat = new Map<string, Map<number, number>>();
    for (const row of currRows) {
      if (!currByCat.has(row.category_id))
        currByCat.set(row.category_id, new Map());
      currByCat
        .get(row.category_id)!
        .set(row.team_id, Number(row.projected_value));
    }

    // Helper: assign roto points (numTeams - rank + 1), rank 1 = best
    function rankTeams(
      valueMap: Map<number, number>,
      direction: "HIGHER_BETTER" | "LOWER_BETTER",
      n: number,
    ): Map<number, number> {
      const sorted = [...valueMap.entries()].sort((a, b) =>
        direction === "HIGHER_BETTER" ? b[1] - a[1] : a[1] - b[1],
      );
      const pts = new Map<number, number>();
      sorted.forEach(([teamId], idx) => {
        pts.set(teamId, n - idx);
      });
      return pts;
    }

    // 5b. Pre-fetch existing events for currDate so we can detect intraday delta changes
    const existingEventsToday = await this.db
      .selectFrom("standings_change_event")
      .select(["team_id", "category_id", "roto_delta"])
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", currDate)
      .execute();

    const existingDeltaMap = new Map<string, number>(
      existingEventsToday.map((e) => [
        `${e.team_id}:${e.category_id}`,
        Number(e.roto_delta),
      ]),
    );

    // 6. For each category, compute roto delta per team, emit events for significant changes
    let totalInserted = 0;
    const allCategoryIds = new Set([...prevByCat.keys(), ...currByCat.keys()]);

    for (const categoryId of allCategoryIds) {
      const prevValues = prevByCat.get(categoryId);
      const currValues = currByCat.get(categoryId);
      if (!prevValues || !currValues) continue;

      const catDirection = directionMap.get(categoryId) ?? "HIGHER_BETTER";
      const categoryName = categoryNameMap.get(categoryId) ?? categoryId;

      const prevPts = rankTeams(prevValues, catDirection, numTeams);
      const currPts = rankTeams(currValues, catDirection, numTeams);

      // Rank maps (1 = best)
      const prevRankSorted = [...prevValues.entries()].sort((a, b) =>
        catDirection === "HIGHER_BETTER" ? b[1] - a[1] : a[1] - b[1],
      );
      const currRankSorted = [...currValues.entries()].sort((a, b) =>
        catDirection === "HIGHER_BETTER" ? b[1] - a[1] : a[1] - b[1],
      );
      const prevRankMap = new Map(
        prevRankSorted.map(([tid], idx) => [tid, idx + 1]),
      );
      const currRankMap = new Map(
        currRankSorted.map(([tid], idx) => [tid, idx + 1]),
      );

      for (const team of teams) {
        const prevP = prevPts.get(team.id) ?? 0;
        const currP = currPts.get(team.id) ?? 0;
        const rotoDelta = currP - prevP;

        if (Math.abs(rotoDelta) < 0.5) continue;

        const directionLabel: "gained" | "lost" =
          rotoDelta > 0 ? "gained" : "lost";

        // Find passed team
        let passedTeamId: number | null = null;
        let passedTeamName: string | null = null;

        const prevRank = prevRankMap.get(team.id) ?? numTeams;
        const currRank = currRankMap.get(team.id) ?? numTeams;

        if (directionLabel === "gained" && currRank < prevRank) {
          // We moved up — find team we passed
          for (const [otherId, otherPrevRank] of prevRankMap.entries()) {
            if (otherId === team.id) continue;
            const otherCurrRank = currRankMap.get(otherId) ?? numTeams;
            // We passed them: their prev rank was above ours, now below
            if (otherPrevRank <= prevRank && otherCurrRank >= currRank) {
              passedTeamId = otherId;
              passedTeamName = teamMap.get(otherId) ?? null;
              break;
            }
          }
        } else if (directionLabel === "lost" && currRank > prevRank) {
          // We moved down — find team that passed us
          for (const [otherId, otherPrevRank] of prevRankMap.entries()) {
            if (otherId === team.id) continue;
            const otherCurrRank = currRankMap.get(otherId) ?? numTeams;
            if (otherPrevRank >= prevRank && otherCurrRank <= currRank) {
              passedTeamId = otherId;
              passedTeamName = teamMap.get(otherId) ?? null;
              break;
            }
          }
        }

        // Build proximate cause (best effort)
        const proximateCause = await this.buildProximateCause(
          leagueId,
          team.id,
          categoryId,
          categoryName,
          currDate,
          rotoDelta,
        );

        const payload: StandingsChangeEventPayload = {
          league_id: leagueId,
          team_id: team.id,
          snapshot_date: currDate,
          category_id: categoryId,
          category_name: categoryName,
          prev_roto_pts: prevP,
          curr_roto_pts: currP,
          roto_delta: rotoDelta,
          passed_team_id: passedTeamId,
          passed_team_name: passedTeamName,
          direction: directionLabel,
          proximate_cause: proximateCause,
        };

        // Upsert: insert new events or update existing ones when the delta changes intraday.
        // isNewOrChanged drives SSE emission — only signal clients when data actually changed.
        const eventKey = `${team.id}:${categoryId}`;
        const existingDelta = existingDeltaMap.get(eventKey);
        const isNewOrChanged =
          existingDelta === undefined || Math.abs(existingDelta - rotoDelta) >= 0.01;

        const result = await this.db
          .insertInto("standings_change_event")
          .values({
            league_id: leagueId,
            team_id: team.id,
            snapshot_date: currDate,
            category_id: categoryId,
            category_name: categoryName,
            prev_roto_pts: prevP,
            curr_roto_pts: currP,
            roto_delta: rotoDelta,
            passed_team_id: passedTeamId,
            passed_team_name: passedTeamName,
            direction: directionLabel,
            proximate_cause: proximateCause,
          })
          .onConflict((oc) =>
            oc.constraint("sce_unique_event").doUpdateSet({
              curr_roto_pts: sql`EXCLUDED.curr_roto_pts`,
              roto_delta: sql`EXCLUDED.roto_delta`,
              direction: sql`EXCLUDED.direction`,
              passed_team_id: sql`EXCLUDED.passed_team_id`,
              passed_team_name: sql`EXCLUDED.passed_team_name`,
              proximate_cause: sql`EXCLUDED.proximate_cause`,
              occurred_at: sql`NOW()`,
            }),
          )
          .returning("id")
          .executeTakeFirst();

        if (result && isNewOrChanged) {
          totalInserted++;
          // Update the local map so subsequent categories in this same call don't re-emit
          existingDeltaMap.set(eventKey, rotoDelta);
          await this.bus.emit(payload);
        }
      }
    }

    this.logger.info(
      { leagueId, snapshotDate, totalInserted },
      "StandingsChangeLogAgent: events generated",
    );
    return totalInserted;
  }

  private async buildProximateCause(
    leagueId: number,
    teamId: number,
    categoryId: string,
    categoryName: string,
    snapshotDate: string,
    rotoDelta: number,
  ): Promise<{
    playerName: string;
    stat: string;
    value: number;
    description: string;
  } | null> {
    try {
      // 1. Get today's and yesterday's team category total for stat delta
      const [todayRow, yesterdayRow] = await Promise.all([
        this.db
          .selectFrom("team_daily_category_totals")
          .select("value")
          .where("league_id", "=", leagueId)
          .where("team_id", "=", teamId)
          .where("snapshot_date", "=", snapshotDate)
          .where("category_id", "=", categoryId)
          .executeTakeFirst(),
        this.db
          .selectFrom("team_daily_category_totals")
          .select(["value", "snapshot_date"])
          .where("league_id", "=", leagueId)
          .where("team_id", "=", teamId)
          .where("snapshot_date", "<", snapshotDate)
          .where("category_id", "=", categoryId)
          .orderBy("snapshot_date", "desc")
          .executeTakeFirst(),
      ]);

      const statDelta =
        todayRow && yesterdayRow
          ? Number(todayRow.value) - Number(yesterdayRow.value)
          : null;

      // 2. Find the top RoS-projected contributor (best available proxy for player attribution)
      const rosterEntries = await this.db
        .selectFrom("team_roster_snapshot")
        .innerJoin("player", "player.id", "team_roster_snapshot.player_id")
        .select(["player.id", "player.name"])
        .where("team_roster_snapshot.league_id", "=", leagueId)
        .where("team_roster_snapshot.team_id", "=", teamId)
        .where("team_roster_snapshot.snapshot_date", "=", snapshotDate)
        .limit(30)
        .execute();

      if (rosterEntries.length === 0) return null;

      const playerIds = rosterEntries.map((r) => r.id);

      const latestRun = await this.db
        .selectFrom("projections_run")
        .select("id")
        .where("as_of_date", "<=", snapshotDate)
        .orderBy("as_of_date", "desc")
        .limit(1)
        .executeTakeFirst();

      let topPlayer: string | null = null;
      if (latestRun && playerIds.length > 0) {
        const projections = await this.db
          .selectFrom("player_projection")
          .select(["player_id", "stat_components_json"])
          .where("projections_run_id", "=", latestRun.id)
          .where("player_id", "in", playerIds)
          .execute();

        let topValue = 0;
        for (const proj of projections) {
          const stats = proj.stat_components_json as Record<
            string,
            number
          > | null;
          if (!stats) continue;
          const val = stats[categoryId] ?? 0;
          if (Math.abs(val) > Math.abs(topValue)) {
            topValue = val;
            const entry = rosterEntries.find((r) => r.id === proj.player_id);
            topPlayer = entry?.name ?? null;
          }
        }
      }

      // 3. Build vivid description from stat delta + top player
      const gained = rotoDelta > 0;
      const absStatDelta =
        statDelta !== null ? Math.abs(statDelta) : null;

      let description: string;
      if (topPlayer && absStatDelta !== null && absStatDelta >= 0.5) {
        const deltaStr =
          Number.isInteger(absStatDelta)
            ? absStatDelta.toString()
            : absStatDelta.toFixed(1);
        description = `${topPlayer} led a ${deltaStr}-${categoryName} ${gained ? "gain" : "drop"} today`;
      } else if (topPlayer) {
        description = `${topPlayer} drove ${categoryName} ${gained ? "up" : "down"}`;
      } else if (absStatDelta !== null && absStatDelta >= 0.5) {
        const deltaStr =
          Number.isInteger(absStatDelta)
            ? absStatDelta.toString()
            : absStatDelta.toFixed(1);
        description = `${deltaStr} ${categoryName} ${gained ? "added" : "lost"} today`;
      } else {
        description = `${categoryName} projections ${gained ? "improved" : "declined"}`;
      }

      return {
        playerName: topPlayer ?? "Unknown",
        stat: categoryName,
        value: statDelta ?? 0,
        description,
      };
    } catch {
      return null; // best effort — never block event insertion
    }
  }
}
