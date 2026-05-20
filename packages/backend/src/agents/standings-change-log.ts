import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { BaseLogger } from "pino";
import type { Database } from "../db/schema.js";

export interface StandingsChangeEventPayload {
  league_id: number;
  team_id: number;
  snapshot_date: string;
  category_id: string;
  category_name: string;
  prev_roto_pts: number;
  curr_roto_pts: number;
  roto_delta: number;
  passed_team_id: number | null;
  passed_team_name: string | null;
  direction: "gained" | "lost";
  event_source: string;
  proximate_cause: {
    playerName: string;
    stat: string;
    value: number;
    description: string;
  } | null;
}

export class StandingsChangeLogAgent {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly logger: BaseLogger,
  ) {}

  async generateEvents(
    leagueId: number,
    snapshotDate: string,
    eventSource: "live" | "snapshot" = "snapshot",
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

    // 2. Fetch teams for this league (needed by both paths)
    const teams = await this.db
      .selectFrom("team")
      .select(["id", "name"])
      .where("league_id", "=", leagueId)
      .execute();

    const teamMap = new Map(teams.map((t) => [t.id, t.name]));
    const numTeams = teams.length;

    // 3. Fetch category settings for display names
    const settingsVersion = await this.db
      .selectFrom("league_settings_version")
      .select("settings_json")
      .where("league_id", "=", leagueId)
      .where("effective_date", "<=", currDate)
      .orderBy("effective_date", "desc")
      .executeTakeFirst();

    const categories =
      (settingsVersion?.settings_json as any)?.categories ?? [];

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

    // 4. Pre-fetch existing events for currDate so we can detect intraday delta changes
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

    let totalInserted = 0;

    // Helper: build payload and upsert a single change event
    const upsertEvent = async (
      categoryId: string,
      categoryName: string,
      team: { id: number; name: string },
      prevP: number,
      currP: number,
      prevRank: number,
      currRank: number,
      prevCatRankMap: Map<number, number>,
      currCatRankMap: Map<number, number>,
    ): Promise<void> => {
      const rotoDelta = currP - prevP;
      if (Math.abs(rotoDelta) < 0.5) return;

      const directionLabel: "gained" | "lost" =
        rotoDelta > 0 ? "gained" : "lost";

      let passedTeamId: number | null = null;
      let passedTeamName: string | null = null;

      if (directionLabel === "gained" && currRank < prevRank) {
        for (const [otherId, otherPrevRank] of prevCatRankMap.entries()) {
          if (otherId === team.id) continue;
          const otherCurrRank = currCatRankMap.get(otherId) ?? numTeams;
          if (otherPrevRank <= prevRank && otherCurrRank >= currRank) {
            passedTeamId = otherId;
            passedTeamName = teamMap.get(otherId) ?? null;
            break;
          }
        }
      } else if (directionLabel === "lost" && currRank > prevRank) {
        for (const [otherId, otherPrevRank] of prevCatRankMap.entries()) {
          if (otherId === team.id) continue;
          const otherCurrRank = currCatRankMap.get(otherId) ?? numTeams;
          if (otherPrevRank >= prevRank && otherCurrRank <= currRank) {
            passedTeamId = otherId;
            passedTeamName = teamMap.get(otherId) ?? null;
            break;
          }
        }
      }

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
        event_source: eventSource,
        proximate_cause: proximateCause,
      };

      const eventKey = `${team.id}:${categoryId}`;
      const existingDelta = existingDeltaMap.get(eventKey);
      const isNewOrChanged =
        existingDelta === undefined ||
        Math.abs(existingDelta - rotoDelta) >= 0.01;

      const result = await this.db
        .insertInto("standings_change_event")
        .values(payload)
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
        existingDeltaMap.set(eventKey, rotoDelta);
      }
    };

    if (eventSource === "live") {
      // Live path: compare actual current category roto_points (team_daily_category_ranks).
      // Projected season-end values barely move during a single game; actual roto standings
      // reflect real rank changes as live stats accumulate today vs yesterday's baseline.
      const [prevRankRows, currRankRows] = await Promise.all([
        this.db
          .selectFrom("team_daily_category_ranks")
          .select(["team_id", "category_id", "rank", "roto_points"])
          .where("league_id", "=", leagueId)
          .where("snapshot_date", "=", prevDate)
          .execute(),
        this.db
          .selectFrom("team_daily_category_ranks")
          .select(["team_id", "category_id", "rank", "roto_points"])
          .where("league_id", "=", leagueId)
          .where("snapshot_date", "=", currDate)
          .execute(),
      ]);

      if (prevRankRows.length === 0 || currRankRows.length === 0) {
        this.logger.info(
          { leagueId },
          "StandingsChangeLogAgent: no category rank data for live events, skipping",
        );
        return 0;
      }

      type RankEntry = { rank: number; pts: number };
      const prevRankByCat = new Map<string, Map<number, RankEntry>>();
      for (const row of prevRankRows) {
        if (!prevRankByCat.has(row.category_id))
          prevRankByCat.set(row.category_id, new Map());
        prevRankByCat
          .get(row.category_id)!
          .set(row.team_id, { rank: row.rank, pts: Number(row.roto_points ?? 0) });
      }

      const currRankByCat = new Map<string, Map<number, RankEntry>>();
      for (const row of currRankRows) {
        if (!currRankByCat.has(row.category_id))
          currRankByCat.set(row.category_id, new Map());
        currRankByCat
          .get(row.category_id)!
          .set(row.team_id, { rank: row.rank, pts: Number(row.roto_points ?? 0) });
      }

      const allCategoryIds = new Set([
        ...prevRankByCat.keys(),
        ...currRankByCat.keys(),
      ]);

      for (const categoryId of allCategoryIds) {
        const prevCat = prevRankByCat.get(categoryId);
        const currCat = currRankByCat.get(categoryId);
        if (!prevCat || !currCat) continue;

        const categoryName = categoryNameMap.get(categoryId) ?? categoryId;

        // Build rank-only maps for the passed-team helper
        const prevCatRankMap = new Map(
          [...prevCat.entries()].map(([tid, e]) => [tid, e.rank]),
        );
        const currCatRankMap = new Map(
          [...currCat.entries()].map(([tid, e]) => [tid, e.rank]),
        );

        for (const team of teams) {
          const prevEntry = prevCat.get(team.id);
          const currEntry = currCat.get(team.id);
          if (!prevEntry || !currEntry) continue;

          await upsertEvent(
            categoryId,
            categoryName,
            team,
            prevEntry.pts,
            currEntry.pts,
            prevEntry.rank,
            currEntry.rank,
            prevCatRankMap,
            currCatRankMap,
          );
        }
      }
    } else {
      // Snapshot path: use projected season-end values to detect projection changes
      // between daily snapshots.
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

      const allCategoryIds = new Set([
        ...prevByCat.keys(),
        ...currByCat.keys(),
      ]);

      for (const categoryId of allCategoryIds) {
        const prevValues = prevByCat.get(categoryId);
        const currValues = currByCat.get(categoryId);
        if (!prevValues || !currValues) continue;

        const catDirection = directionMap.get(categoryId) ?? "HIGHER_BETTER";
        const categoryName = categoryNameMap.get(categoryId) ?? categoryId;

        const prevPts = rankTeams(prevValues, catDirection, numTeams);
        const currPts = rankTeams(currValues, catDirection, numTeams);

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
          await upsertEvent(
            categoryId,
            categoryName,
            team,
            prevPts.get(team.id) ?? 0,
            currPts.get(team.id) ?? 0,
            prevRankMap.get(team.id) ?? numTeams,
            currRankMap.get(team.id) ?? numTeams,
            prevRankMap,
            currRankMap,
          );
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
      const absStatDelta = statDelta !== null ? Math.abs(statDelta) : null;

      let description: string;
      if (topPlayer && absStatDelta !== null && absStatDelta >= 0.5) {
        const deltaStr = Number.isInteger(absStatDelta)
          ? absStatDelta.toString()
          : absStatDelta.toFixed(1);
        description = `${topPlayer} led a ${deltaStr}-${categoryName} ${gained ? "gain" : "drop"} today`;
      } else if (topPlayer) {
        description = `${topPlayer} drove ${categoryName} ${gained ? "up" : "down"}`;
      } else if (absStatDelta !== null && absStatDelta >= 0.5) {
        const deltaStr = Number.isInteger(absStatDelta)
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
