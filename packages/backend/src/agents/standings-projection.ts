import type { Logger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import type { Category, StatComponents } from "../../../shared/dist/index.js";
import { calculateFinalRate, combineComponents } from "../../../shared/dist/index.js";

/**
 * Standings Projection Agent
 * Per AGENTS.md §4
 *
 * Computes projected final totals, ranks, and overall standings
 * using component-based math for rate stats
 */

interface TeamProjection {
  teamId: number;
  categoryProjections: Map<
    string,
    {
      value: number;
      components: StatComponents;
      isDegraded: boolean;
    }
  >;
}

/** Stat keys that belong to pitching categories */
const PITCHING_STAT_KEYS = new Set([
  // Pitching counting stats
  "K", "W", "L", "SV", "HLD", "QS", "CG", "BLSV", "SVO",
  "ER", "OUTS", "HA", "BBA", "HRA",
  // Pitching rate stats
  "ERA", "WHIP", "K9", "WPCT",
]);

/** Detect whether a projection is for a pitcher based on its components */
function isPitcherProjection(components: StatComponents): boolean {
  return (components.IP ?? 0) > 0 || (components.ER !== undefined);
}

export class StandingsProjectionAgent {
  constructor(
    private db: Kysely<Database>,
    private logger?: Logger,
  ) {}

  /**
   * Compute projected standings for a snapshot
   */
  async computeProjectedStandings(
    leagueId: number,
    snapshotDate: string,
    projectionsRunId: number,
  ): Promise<void> {
    this.logger?.info(
      { leagueId, snapshotDate, projectionsRunId },
      "Computing projected standings",
    );

    // Get snapshot and settings
    const snapshot = await this.db
      .selectFrom("league_daily_snapshot")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .executeTakeFirstOrThrow();

    const settings = await this.db
      .selectFrom("league_settings_version")
      .selectAll()
      .where("id", "=", snapshot.settings_version_id)
      .executeTakeFirstOrThrow();

    const categories = (settings.settings_json as any).categories as Category[];

    // Get all teams
    const teams = await this.db
      .selectFrom("team")
      .selectAll()
      .where("league_id", "=", leagueId)
      .execute();

    // Compute projections for each team in parallel
    const teamProjections = await Promise.all(
      teams.map(team =>
        this.computeTeamProjection(leagueId, snapshotDate, team.id, projectionsRunId, categories)
      )
    );

    // Rank teams by category and compute roto points
    await this.rankAndStore(
      leagueId,
      snapshotDate,
      teamProjections,
      categories,
    );

    this.logger?.info(
      { leagueId, snapshotDate },
      "Projected standings computed",
    );
  }

  /**
   * Compute projected totals for a single team
   */
  private async computeTeamProjection(
    leagueId: number,
    snapshotDate: string,
    teamId: number,
    projectionsRunId: number,
    categories: Category[],
  ): Promise<TeamProjection> {
    // Get current totals with components
    const currentTotals = await this.db
      .selectFrom("team_daily_category_totals")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .where("team_id", "=", teamId)
      .execute();

    // Get roster
    const roster = await this.db
      .selectFrom("team_roster_snapshot")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .where("team_id", "=", teamId)
      .execute();

    // Get projections for roster players
    const playerIds = roster.map((r) => r.player_id);
    const projections =
      playerIds.length > 0
        ? await this.db
            .selectFrom("player_projection")
            .selectAll()
            .where("projections_run_id", "=", projectionsRunId)
            .where("player_id", "in", playerIds)
            .execute()
        : [];

    const categoryProjections = new Map<
      string,
      {
        value: number;
        components: StatComponents;
        isDegraded: boolean;
      }
    >();

    for (const category of categories) {
      const currentTotal = currentTotals.find(
        (t) => t.category_id === category.category_id,
      );

      // Filter projections by category type to avoid cross-contamination
      // (e.g., batter H/BB inflating pitcher WHIP, pitcher BB inflating batter BB)
      const isPitchingCat = PITCHING_STAT_KEYS.has(category.stat_key);
      const relevantProjections = projections.filter((proj) => {
        const components = proj.stat_components_json as StatComponents;
        const isPitcher = isPitcherProjection(components);
        return isPitchingCat ? isPitcher : !isPitcher;
      });

      if (category.type === "COUNTING") {
        // Sum projected counting stats
        const projectedSum = relevantProjections.reduce((sum, proj) => {
          const components = proj.stat_components_json as StatComponents;
          return sum + (components[category.stat_key] || 0);
        }, 0);

        const finalValue = (currentTotal?.value || 0) + projectedSum;

        categoryProjections.set(category.category_id, {
          value: finalValue,
          components: {},
          isDegraded: false,
        });
      } else if (category.type === "RATE") {
        // Component-based rate calculation
        const currentComponents = (currentTotal?.components_json ||
          {}) as StatComponents;

        // Sum projected components
        const projectedComponents = relevantProjections.reduce((acc, proj) => {
          const components = proj.stat_components_json as StatComponents;
          return combineComponents(acc, components);
        }, {} as StatComponents);

        try {
          const finalValue = calculateFinalRate(
            category.formula_id || category.stat_key.toLowerCase(),
            currentComponents,
            projectedComponents,
          );

          categoryProjections.set(category.category_id, {
            value: finalValue,
            components: combineComponents(
              currentComponents,
              projectedComponents,
            ),
            isDegraded: false,
          });
        } catch (error) {
          this.logger?.warn(
            { category: category.category_id, error },
            "Failed to calculate rate stat, marking degraded",
          );

          categoryProjections.set(category.category_id, {
            value: currentTotal?.value || 0,
            components: currentComponents,
            isDegraded: true,
          });
        }
      }
    }

    return {
      teamId,
      categoryProjections,
    };
  }

  /**
   * Rank teams and store projected standings
   */
  private async rankAndStore(
    leagueId: number,
    snapshotDate: string,
    teamProjections: TeamProjection[],
    categories: Category[],
  ): Promise<void> {
    // Delete existing projected standings for this snapshot
    await this.db
      .deleteFrom("team_daily_projected_category")
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .execute();

    await this.db
      .deleteFrom("team_daily_projected_overall")
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .execute();

    // Rank by category
    const teamOverallPoints = new Map<number, number>();

    for (const category of categories) {
      const values = teamProjections.map((tp) => ({
        teamId: tp.teamId,
        value: tp.categoryProjections.get(category.category_id)?.value || 0,
        components:
          tp.categoryProjections.get(category.category_id)?.components || {},
      }));

      // Sort by direction
      values.sort((a, b) => {
        if (category.direction === "HIGHER_BETTER") {
          return b.value - a.value;
        } else {
          return a.value - b.value;
        }
      });

      // Assign ranks and roto points
      const numTeams = values.length;

      // Build array for batch insert
      const categoryRows = [];
      for (let i = 0; i < values.length; i++) {
        const rank = i + 1;
        const rotoPoints = numTeams - rank + 1;

        const currentPoints = teamOverallPoints.get(values[i].teamId) || 0;
        teamOverallPoints.set(values[i].teamId, currentPoints + rotoPoints);

        categoryRows.push({
          league_id: leagueId,
          snapshot_date: snapshotDate,
          team_id: values[i].teamId,
          category_id: category.category_id,
          projected_value: values[i].value,
          projected_rank: rank,
          projected_roto_points: rotoPoints,
          projected_components_json: values[i].components,
        });
      }

      // Batch insert category projections
      if (categoryRows.length > 0) {
        await this.db
          .insertInto("team_daily_projected_category")
          .values(categoryRows)
          .execute();
      }
    }

    // Rank overall
    const overallRankings = Array.from(teamOverallPoints.entries())
      .map(([teamId, points]) => ({ teamId, points }))
      .sort((a, b) => b.points - a.points);

    // Batch insert overall projections
    if (overallRankings.length > 0) {
      await this.db
        .insertInto("team_daily_projected_overall")
        .values(
          overallRankings.map((ranking, i) => ({
            league_id: leagueId,
            snapshot_date: snapshotDate,
            team_id: ranking.teamId,
            projected_overall_points: ranking.points,
            projected_overall_rank: i + 1,
          })),
        )
        .execute();
    }
  }
}
