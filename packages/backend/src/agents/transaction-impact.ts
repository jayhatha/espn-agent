import type { Logger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import type { MoveType } from "../../../shared/dist/index.js";
import { calculateFinalRate } from "../../../shared/dist/index.js";
import { assignRanksWithTies, computeOverallRotoPoints } from "../utils/roto-ranking.js";

/**
 * Transaction Impact Agent
 * Per Phase 9 PLAN.md
 *
 * Derives roster moves from weekly snapshot diffs and computes
 * counterfactual roto-points impact for each move.
 */

interface CategoryConfig {
  statKey: string;
  type: "COUNTING" | "RATE";
  direction: "HIGHER_BETTER" | "LOWER_BETTER";
  formulaId?: string;
}

export class TransactionImpactAgent {
  constructor(
    private db: Kysely<Database>,
    private logger?: Logger,
  ) {}

  /**
   * Derive roster moves from weekly snapshot diffs.
   * Week 1 roster → all players are "draft" moves.
   * Subsequent weeks: players appearing/disappearing → add/drop/trade.
   */
  async deriveRosterMoves(leagueId: number, season: number): Promise<number> {
    this.logger?.info({ leagueId, season }, "Deriving roster moves from snapshot diffs");

    // Get all snapshot dates for this league/season, ordered chronologically
    const startDate = `${season}-04-01`;
    const endDate = `${season}-10-31`;

    const snapshotDates = await this.db
      .selectFrom("team_roster_snapshot")
      .select("snapshot_date")
      .where("league_id", "=", leagueId)
      .where("snapshot_date", ">=", startDate)
      .where("snapshot_date", "<=", endDate)
      .groupBy("snapshot_date")
      .orderBy("snapshot_date", "asc")
      .execute();

    if (snapshotDates.length === 0) {
      this.logger?.warn({ leagueId, season }, "No snapshots found for season");
      return 0;
    }

    // Clear existing moves for this league (idempotent re-run)
    await this.db
      .deleteFrom("roster_move")
      .where("league_id", "=", leagueId)
      .execute();

    let totalMoves = 0;

    // Process each snapshot pair
    for (let i = 0; i < snapshotDates.length; i++) {
      const currentDate = snapshotDates[i].snapshot_date;

      // Get current week's roster: { teamId → Set<playerId> }
      const currentRoster = await this.getRosterByTeam(leagueId, currentDate);

      if (i === 0) {
        // Week 1: all players are draft picks
        for (const [teamId, playerIds] of currentRoster) {
          for (const playerId of playerIds) {
            await this.db
              .insertInto("roster_move")
              .values({
                league_id: leagueId,
                team_id: teamId,
                move_type: "draft",
                player_id: playerId,
                effective_date: currentDate,
              })
              .onConflict((oc) =>
                oc.columns(["league_id", "team_id", "player_id", "effective_date", "move_type"]).doNothing(),
              )
              .execute();
            totalMoves++;
          }
        }
        this.logger?.info(
          { leagueId, date: currentDate, draftPicks: totalMoves },
          "Draft picks recorded",
        );
        continue;
      }

      // Subsequent weeks: compare with previous
      const previousDate = snapshotDates[i - 1].snapshot_date;
      const previousRoster = await this.getRosterByTeam(leagueId, previousDate);

      // For each team, find adds and drops
      const allTeamIds = new Set([...currentRoster.keys(), ...previousRoster.keys()]);

      // Track all player movements this week to detect trades
      const gained: Array<{ teamId: number; playerId: number }> = [];
      const lost: Array<{ teamId: number; playerId: number }> = [];

      for (const teamId of allTeamIds) {
        const current = currentRoster.get(teamId) || new Set();
        const previous = previousRoster.get(teamId) || new Set();

        // Players gained by this team
        for (const playerId of current) {
          if (!previous.has(playerId)) {
            gained.push({ teamId, playerId });
          }
        }

        // Players lost by this team
        for (const playerId of previous) {
          if (!current.has(playerId)) {
            lost.push({ teamId, playerId });
          }
        }
      }

      // Detect trades: player lost by team A and gained by team B in the same week
      const tradeGains = new Set<string>(); // "teamId-playerId"
      const tradeLosses = new Set<string>();

      for (const g of gained) {
        // Check if this player was lost by another team
        const lostByAnother = lost.find(
          (l) => l.playerId === g.playerId && l.teamId !== g.teamId,
        );
        if (lostByAnother) {
          tradeGains.add(`${g.teamId}-${g.playerId}`);
          tradeLosses.add(`${lostByAnother.teamId}-${lostByAnother.playerId}`);
        }
      }

      // Insert moves
      for (const g of gained) {
        const key = `${g.teamId}-${g.playerId}`;
        const moveType: MoveType = tradeGains.has(key) ? "trade_in" : "add";
        await this.db
          .insertInto("roster_move")
          .values({
            league_id: leagueId,
            team_id: g.teamId,
            move_type: moveType,
            player_id: g.playerId,
            effective_date: currentDate,
          })
          .onConflict((oc) =>
            oc.columns(["league_id", "team_id", "player_id", "effective_date", "move_type"]).doNothing(),
          )
          .execute();
        totalMoves++;
      }

      for (const l of lost) {
        const key = `${l.teamId}-${l.playerId}`;
        const moveType: MoveType = tradeLosses.has(key) ? "trade_out" : "drop";
        await this.db
          .insertInto("roster_move")
          .values({
            league_id: leagueId,
            team_id: l.teamId,
            move_type: moveType,
            player_id: l.playerId,
            effective_date: currentDate,
          })
          .onConflict((oc) =>
            oc.columns(["league_id", "team_id", "player_id", "effective_date", "move_type"]).doNothing(),
          )
          .execute();
        totalMoves++;
      }

      // Pair add↔drop moves on same team/date
      await this.pairMoves(leagueId, currentDate);

      this.logger?.debug(
        { leagueId, date: currentDate, gained: gained.length, lost: lost.length },
        "Week roster diff processed",
      );
    }

    this.logger?.info(
      { leagueId, season, totalMoves, weeks: snapshotDates.length },
      "Roster move derivation complete",
    );

    return totalMoves;
  }

  // ─── Private helpers ────────────────────────────────────────

  private async getRosterByTeam(
    leagueId: number,
    snapshotDate: string,
  ): Promise<Map<number, Set<number>>> {
    const rows = await this.db
      .selectFrom("team_roster_snapshot")
      .select(["team_id", "player_id"])
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .execute();

    const result = new Map<number, Set<number>>();
    for (const row of rows) {
      if (!result.has(row.team_id)) result.set(row.team_id, new Set());
      result.get(row.team_id)!.add(row.player_id);
    }
    return result;
  }

  private async pairMoves(leagueId: number, date: string): Promise<void> {
    // For each team, pair adds with drops on the same date
    const teamMoves = await this.db
      .selectFrom("roster_move")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("effective_date", "=", date)
      .where("paired_move_id", "is", null)
      .execute();

    const byTeam = new Map<number, typeof teamMoves>();
    for (const m of teamMoves) {
      if (!byTeam.has(m.team_id)) byTeam.set(m.team_id, []);
      byTeam.get(m.team_id)!.push(m);
    }

    for (const [, moves] of byTeam) {
      const adds = moves.filter((m) => m.move_type === "add" || m.move_type === "trade_in");
      const drops = moves.filter((m) => m.move_type === "drop" || m.move_type === "trade_out");

      // Pair them in order (first add with first drop, etc.)
      const pairCount = Math.min(adds.length, drops.length);
      for (let i = 0; i < pairCount; i++) {
        await this.db
          .updateTable("roster_move")
          .set({ paired_move_id: drops[i].id })
          .where("id", "=", adds[i].id)
          .execute();
        await this.db
          .updateTable("roster_move")
          .set({ paired_move_id: adds[i].id })
          .where("id", "=", drops[i].id)
          .execute();
      }
    }
  }

  private async getLeagueCategories(leagueId: number): Promise<CategoryConfig[]> {
    const settings = await this.db
      .selectFrom("league_settings_version")
      .select("settings_json")
      .where("league_id", "=", leagueId)
      .orderBy("effective_date", "desc")
      .executeTakeFirst();

    if (!settings) return [];

    const json = settings.settings_json as any;
    const cats = json?.categories || [];
    return cats.map((c: any) => ({
      statKey: c.stat_key || c.statKey,
      type: c.type,
      direction: c.direction,
      formulaId: c.formula_id || c.formulaId,
    }));
  }

  private async getFinalSnapshotDate(leagueId: number, season: number): Promise<string | null> {
    const row = await this.db
      .selectFrom("team_daily_category_totals")
      .select("snapshot_date")
      .where("league_id", "=", leagueId)
      .where("snapshot_date", ">=", `${season}-04-01`)
      .where("snapshot_date", "<=", `${season}-10-31`)
      .orderBy("snapshot_date", "desc")
      .executeTakeFirst();
    return row?.snapshot_date ?? null;
  }

  private async getTeamFinalComponents(
    leagueId: number,
    snapshotDate: string,
  ): Promise<Map<number, Record<string, number>>> {
    const rows = await this.db
      .selectFrom("team_daily_category_totals")
      .select(["team_id", "category_id", "value", "components_json"])
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .execute();

    const result = new Map<number, Record<string, number>>();
    for (const row of rows) {
      if (!result.has(row.team_id)) result.set(row.team_id, {});
      const components = result.get(row.team_id)!;
      // Store the category value directly (includes corrected counting stats)
      components[`_val_${row.category_id}`] = row.value;
      // Also store raw components for rate stat recomputation
      if (row.components_json) {
        const comps = row.components_json as Record<string, number>;
        for (const [key, val] of Object.entries(comps)) {
          if (typeof val === "number") {
            components[key] = val;
          }
        }
      }
    }
    return result;
  }

  private computeRotoPointsFromComponents(
    teamComponents: Map<number, Record<string, number>>,
    categories: CategoryConfig[],
    numTeams: number,
  ): Map<number, number> {
    const categoryRankings: Array<{ teamId: number; rotoPoints: number }>[] = [];

    for (const cat of categories) {
      const teamValues: Array<{ teamId: number; value: number }> = [];

      for (const [teamId, components] of teamComponents) {
        let value = components[`_val_${cat.statKey}`] ?? 0;

        // For rate stats, recompute from components if we need counterfactual values
        if (cat.type === "RATE" && cat.formulaId && !(`_val_${cat.statKey}` in components)) {
          const isPitchingRate = ["era", "whip", "k9"].includes(cat.formulaId.toLowerCase());
          if (isPitchingRate) {
            const pitchingComponents = {
              H: components.HA || 0,
              BB: components.BBA || 0,
              IP: components.IP || 0,
              ER: components.ER || 0,
              K: components.K || 0,
            };
            if (pitchingComponents.IP > 0) {
              value = calculateFinalRate(cat.formulaId, {}, pitchingComponents);
            }
          } else {
            value = calculateFinalRate(cat.formulaId, {}, components);
          }
        }

        teamValues.push({ teamId, value });
      }

      teamValues.sort((a, b) =>
        cat.direction === "LOWER_BETTER" ? a.value - b.value : b.value - a.value,
      );

      const ranked = assignRanksWithTies(teamValues, numTeams);
      categoryRankings.push(ranked);
    }

    return computeOverallRotoPoints(categoryRankings);
  }

  private groupMovesIntoPairs(
    moves: Array<{
      id: number;
      move_type: string;
      player_id: number;
      effective_date: string;
      paired_move_id: number | null;
    }>,
  ): Array<{
    type: "draft" | "add_drop" | "trade";
    gainedPlayerId: number;
    lostPlayerId: number | null;
    effectiveDate: string;
  }> {
    const pairs: Array<{
      type: "draft" | "add_drop" | "trade";
      gainedPlayerId: number;
      lostPlayerId: number | null;
      effectiveDate: string;
    }> = [];

    const processed = new Set<number>();

    for (const move of moves) {
      if (processed.has(move.id)) continue;

      if (move.move_type === "draft") {
        pairs.push({
          type: "draft",
          gainedPlayerId: move.player_id,
          lostPlayerId: null,
          effectiveDate: move.effective_date,
        });
        processed.add(move.id);
      } else if (move.move_type === "add" || move.move_type === "trade_in") {
        // Find paired drop
        const pairedDrop = move.paired_move_id
          ? moves.find((m) => m.id === move.paired_move_id)
          : null;

        pairs.push({
          type: move.move_type === "trade_in" ? "trade" : "add_drop",
          gainedPlayerId: move.player_id,
          lostPlayerId: pairedDrop?.player_id ?? null,
          effectiveDate: move.effective_date,
        });
        processed.add(move.id);
        if (pairedDrop) processed.add(pairedDrop.id);
      }
      // Drops without pairs are processed as part of add_drop or ignored
    }

    return pairs;
  }

  /**
   * Sum a player's per-period stats while on a specific team's active roster
   */
  private async sumPlayerContribution(
    leagueId: number,
    playerId: number,
    teamId: number,
    fromDate: string,
    toDate: string,
  ): Promise<Record<string, number>> {
    const rows = await this.db
      .selectFrom("player_period_stats")
      .select("components_json")
      .where("league_id", "=", leagueId)
      .where("player_id", "=", playerId)
      .where("team_id", "=", teamId)
      .where("lineup_slot_id", "<=", 15) // Active roster only
      .where("snapshot_date", ">=", fromDate)
      .where("snapshot_date", "<=", toDate)
      .execute();

    return this.sumComponents(rows.map((r) => r.components_json as Record<string, number>));
  }

  /**
   * Sum a player's per-period stats on ANY team (for counterfactual of dropped players)
   */
  private async sumPlayerContributionAnywhere(
    leagueId: number,
    playerId: number,
    fromDate: string,
    toDate: string,
  ): Promise<Record<string, number>> {
    const rows = await this.db
      .selectFrom("player_period_stats")
      .select("components_json")
      .where("league_id", "=", leagueId)
      .where("player_id", "=", playerId)
      .where("lineup_slot_id", "<=", 15) // Active roster only (would have played)
      .where("snapshot_date", ">=", fromDate)
      .where("snapshot_date", "<=", toDate)
      .execute();

    return this.sumComponents(rows.map((r) => r.components_json as Record<string, number>));
  }

  private sumComponents(componentsList: Record<string, number>[]): Record<string, number> {
    const result: Record<string, number> = {};
    for (const components of componentsList) {
      for (const [key, val] of Object.entries(components)) {
        if (typeof val === "number") {
          result[key] = (result[key] || 0) + val;
        }
      }
    }
    return result;
  }

  private computeCategoryImpacts(
    teamId: number,
    actualComponents: Record<string, number>,
    counterfactualComponents: Record<string, number>,
    categories: CategoryConfig[],
    numTeams: number,
    actualTeamComponents: Map<number, Record<string, number>>,
    counterfactualTeamComponents: Map<number, Record<string, number>>,
  ): Array<{
    categoryId: string;
    actualValue: number;
    counterfactualValue: number;
    deltaRotoPoints: number;
  }> {
    const result: Array<{
      categoryId: string;
      actualValue: number;
      counterfactualValue: number;
      deltaRotoPoints: number;
    }> = [];

    for (const cat of categories) {
      const actualValue = actualComponents[`_val_${cat.statKey}`] ?? 0;
      const counterfactualValue = counterfactualComponents[`_val_${cat.statKey}`] ?? 0;

      // Compute roto points for this single category in both scenarios
      const actualCatPoints = this.computeSingleCategoryPoints(
        teamId, cat, actualTeamComponents, numTeams,
      );
      const counterfactualCatPoints = this.computeSingleCategoryPoints(
        teamId, cat, counterfactualTeamComponents, numTeams,
      );

      result.push({
        categoryId: cat.statKey,
        actualValue: Math.round(actualValue * 1000) / 1000,
        counterfactualValue: Math.round(counterfactualValue * 1000) / 1000,
        deltaRotoPoints: Math.round((actualCatPoints - counterfactualCatPoints) * 100) / 100,
      });
    }

    return result;
  }

  private computeSingleCategoryPoints(
    teamId: number,
    cat: CategoryConfig,
    teamComponents: Map<number, Record<string, number>>,
    numTeams: number,
  ): number {
    const teamValues: Array<{ teamId: number; value: number }> = [];

    for (const [tid, components] of teamComponents) {
      const value = components[`_val_${cat.statKey}`] ?? 0;
      teamValues.push({ teamId: tid, value });
    }

    teamValues.sort((a, b) =>
      cat.direction === "LOWER_BETTER" ? a.value - b.value : b.value - a.value,
    );

    const ranked = assignRanksWithTies(teamValues, numTeams);
    const teamRank = ranked.find((r) => r.teamId === teamId);
    return teamRank?.rotoPoints ?? 0;
  }

  /**
   * Compute SGP (Standings Gain Points) factors from league standings distribution.
   * For counting stats: average absolute gap between adjacent teams.
   * For rate stats: standard deviation of team values.
   */
  private computeSGPFactors(
    teamFinalComponents: Map<number, Record<string, number>>,
    categories: CategoryConfig[],
  ): Record<string, number> {
    const sgpFactors: Record<string, number> = {};

    for (const cat of categories) {
      const teamValues: number[] = [];

      for (const [, components] of teamFinalComponents) {
        let value = components[`_val_${cat.statKey}`] ?? 0;

        // For rate stats, recompute if needed
        if (cat.type === "RATE" && cat.formulaId && !(`_val_${cat.statKey}` in components)) {
          const isPitchingRate = ["era", "whip", "k9"].includes(cat.formulaId.toLowerCase());
          if (isPitchingRate) {
            const pitchingComponents = {
              H: components.HA || 0,
              BB: components.BBA || 0,
              IP: components.IP || 0,
              ER: components.ER || 0,
              K: components.K || 0,
            };
            if (pitchingComponents.IP > 0) {
              value = calculateFinalRate(cat.formulaId, {}, pitchingComponents);
            }
          } else {
            value = calculateFinalRate(cat.formulaId, {}, components);
          }
        }

        teamValues.push(value);
      }

      if (teamValues.length === 0) {
        sgpFactors[cat.statKey] = 1.0;
        continue;
      }

      if (cat.type === "COUNTING") {
        // For counting stats: average absolute gap between adjacent teams
        const sorted = [...teamValues].sort((a, b) => b - a);
        let sumGaps = 0;
        for (let i = 0; i < sorted.length - 1; i++) {
          sumGaps += Math.abs(sorted[i] - sorted[i + 1]);
        }
        const avgGap = sorted.length > 1 ? sumGaps / (sorted.length - 1) : 1.0;
        sgpFactors[cat.statKey] = Math.max(1.0, avgGap);
      } else if (cat.type === "RATE") {
        // For rate stats: standard deviation
        const mean = teamValues.reduce((a, b) => a + b, 0) / teamValues.length;
        const squaredDiffs = teamValues.map((v) => Math.pow(v - mean, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / teamValues.length;
        const stdDev = Math.sqrt(variance);
        sgpFactors[cat.statKey] = Math.max(0.001, stdDev);
      } else {
        sgpFactors[cat.statKey] = 1.0;
      }
    }

    return sgpFactors;
  }

  /**
   * Compute replacement-level production for a position.
   * Replacement level = average production of players just outside rostered pool.
   */
  private async computeReplacementLevel(
    leagueId: number,
    season: number,
    finalSnapshotDate: string,
    position: string,
  ): Promise<Record<string, number>> {
    // Get league settings to determine roster size at this position
    const settings = await this.db
      .selectFrom("league_settings_version")
      .select("settings_json")
      .where("league_id", "=", leagueId)
      .orderBy("effective_date", "desc")
      .executeTakeFirst();

    if (!settings) return {};

    const json = settings.settings_json as any;
    const rosterSlots = json?.roster_slots || {};
    const numTeams = await this.db
      .selectFrom("team")
      .where("league_id", "=", leagueId)
      .execute()
      .then((teams) => teams.length);

    // Estimate rostered players at this position
    const slotsPerTeam = rosterSlots[position] || 1;
    const totalRostered = slotsPerTeam * numTeams;

    // Get all players at this position from player_period_stats
    const startDate = `${season}-04-01`;

    const playerTotals = await this.db
      .selectFrom("player_period_stats as pps")
      .innerJoin("player as p", "p.id", "pps.player_id")
      .select(["pps.player_id", "pps.components_json"])
      .where("pps.league_id", "=", leagueId)
      .where("pps.snapshot_date", ">=", startDate)
      .where("pps.snapshot_date", "<=", finalSnapshotDate)
      .execute();

    // Sum each player's total production
    const playerProductionMap = new Map<number, Record<string, number>>();
    for (const row of playerTotals) {
      if (!playerProductionMap.has(row.player_id)) {
        playerProductionMap.set(row.player_id, {});
      }
      const total = playerProductionMap.get(row.player_id)!;
      const components = row.components_json as Record<string, number>;
      for (const [key, val] of Object.entries(components)) {
        if (typeof val === "number") {
          total[key] = (total[key] || 0) + val;
        }
      }
    }

    if (playerProductionMap.size === 0) return {};

    // Sort players by counting stat production (R+HR+RBI for hitters, K+W+SV for pitchers)
    const playerProduction = Array.from(playerProductionMap.entries()).map(([playerId, components]) => {
      const isPitcher = (components.IP || 0) > 0;
      const score = isPitcher
        ? (components.K || 0) + (components.W || 0) + (components.SV || 0)
        : (components.R || 0) + (components.HR || 0) + (components.RBI || 0);
      return { playerId, components, score };
    });

    playerProduction.sort((a, b) => b.score - a.score);

    // Replacement level = average of players ranked just outside rostered pool
    const replacementStart = Math.floor(totalRostered);
    const replacementEnd = Math.min(replacementStart + 3, playerProduction.length);

    if (replacementEnd <= replacementStart) return {};

    const replacementPlayers = playerProduction.slice(replacementStart, replacementEnd);
    const replacementComponents: Record<string, number> = {};

    for (const player of replacementPlayers) {
      for (const [key, val] of Object.entries(player.components)) {
        if (typeof val === "number") {
          replacementComponents[key] = (replacementComponents[key] || 0) + val;
        }
      }
    }

    // Average the components
    const count = replacementPlayers.length;
    for (const key of Object.keys(replacementComponents)) {
      replacementComponents[key] /= count;
    }

    return replacementComponents;
  }

  /**
   * Compute Shapley-attributed impacts for all moves in a season.
   * Uses Monte Carlo sampling to estimate Shapley values.
   */
  async computeShapleyImpacts(leagueId: number, season: number, numSamples = 500): Promise<number> {
    this.logger?.info({ leagueId, season }, "Computing Shapley-based transaction impacts");

    // Clear existing impacts (idempotent re-run)
    await this.db
      .deleteFrom("transaction_impact")
      .where("league_id", "=", leagueId)
      .execute();

    // Get league categories
    const categories = await this.getLeagueCategories(leagueId);
    if (categories.length === 0) {
      this.logger?.warn({ leagueId }, "No categories found for league");
      return 0;
    }

    // Get final snapshot date
    const finalSnapshotDate = await this.getFinalSnapshotDate(leagueId, season);
    if (!finalSnapshotDate) {
      this.logger?.warn({ leagueId, season }, "No final snapshot found");
      return 0;
    }

    // Get final team components
    const teamFinalComponents = await this.getTeamFinalComponents(leagueId, finalSnapshotDate);
    const teamIds = Array.from(teamFinalComponents.keys());
    const numTeams = teamIds.length;

    // Compute actual roto points
    const actualRotoPoints = this.computeRotoPointsFromComponents(
      teamFinalComponents, categories, numTeams,
    );

    // Compute SGP factors
    const sgpFactors = this.computeSGPFactors(teamFinalComponents, categories);

    // Get all roster moves
    const startDate = `${season}-04-01`;
    const endDate = `${season}-10-31`;

    const moves = await this.db
      .selectFrom("roster_move")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("effective_date", ">=", startDate)
      .where("effective_date", "<=", endDate)
      .orderBy("effective_date", "asc")
      .execute();

    let impactsComputed = 0;

    // Process each team
    for (const teamId of teamIds) {
      const teamMoves = moves.filter((m) => m.team_id === teamId);
      const movePairs = this.groupMovesIntoPairs(teamMoves);

      if (movePairs.length === 0) continue;

      // Get draft-day components for this team
      const draftPicks = movePairs.filter((p) => p.type === "draft");
      const draftComponents: Record<string, number> = {};
      for (const pick of draftPicks) {
        const contribution = await this.sumPlayerContributionAnywhere(
          leagueId, pick.gainedPlayerId, startDate, finalSnapshotDate,
        );
        for (const [key, val] of Object.entries(contribution)) {
          if (typeof val === "number") {
            draftComponents[key] = (draftComponents[key] || 0) + val;
          }
        }
      }

      // Compute Shapley values for this team
      const shapleyValues = await this.computeTeamShapleyValues(
        leagueId,
        teamId,
        movePairs,
        draftComponents,
        teamFinalComponents,
        categories,
        numTeams,
        actualRotoPoints,
        finalSnapshotDate,
        numSamples,
      );

      // Insert impacts
      for (let i = 0; i < movePairs.length; i++) {
        const pair = movePairs[i];
        const shapleyImpact = shapleyValues.get(i) || 0;

        // Get gained and lost components for this move
        const gainedContribution = await this.sumPlayerContribution(
          leagueId, pair.gainedPlayerId, teamId, pair.effectiveDate, finalSnapshotDate,
        );

        let lostCounterfactual: Record<string, number> | null = null;
        let isIncomplete = false;
        if (pair.lostPlayerId) {
          lostCounterfactual = await this.sumPlayerContributionAnywhere(
            leagueId, pair.lostPlayerId, pair.effectiveDate, finalSnapshotDate,
          );
          if (!lostCounterfactual || Object.keys(lostCounterfactual).length === 0) {
            isIncomplete = true;
            lostCounterfactual = {};
          }
        }

        // Compute SGP category impacts
        const sgpCategoryImpacts = this.computeSGPCategoryImpacts(
          gainedContribution,
          lostCounterfactual || {},
          categories,
          sgpFactors,
        );

        // Compute replacement-level impact for draft picks
        let replacementLevelComponents: Record<string, number> | null = null;
        let replacementLevelImpact: number | null = null;

        if (pair.type === "draft") {
          // Get player's primary position
          const player = await this.db
            .selectFrom("player")
            .select("positions")
            .where("id", "=", pair.gainedPlayerId)
            .executeTakeFirst();

          if (player && player.positions && player.positions.length > 0) {
            const position = player.positions[0];
            replacementLevelComponents = await this.computeReplacementLevel(
              leagueId, season, finalSnapshotDate, position,
            );

            if (Object.keys(replacementLevelComponents).length > 0) {
              // Build counterfactual with replacement level instead of this player
              const replacementTeamComponents = { ...teamFinalComponents.get(teamId)! };

              // Subtract gained player
              for (const [key, val] of Object.entries(gainedContribution || {})) {
                if (key in replacementTeamComponents && typeof replacementTeamComponents[key] === "number") {
                  replacementTeamComponents[key] -= val;
                }
              }

              // Add replacement level
              for (const [key, val] of Object.entries(replacementLevelComponents)) {
                if (typeof val === "number") {
                  replacementTeamComponents[key] = (replacementTeamComponents[key] || 0) + val;
                }
              }

              // Recompute rate stats
              for (const cat of categories) {
                if (cat.type === "RATE" && cat.formulaId) {
                  const isPitchingRate = ["era", "whip", "k9"].includes(cat.formulaId.toLowerCase());
                  let value = 0;
                  if (isPitchingRate) {
                    const pitchingComponents = {
                      H: replacementTeamComponents.HA || 0,
                      BB: replacementTeamComponents.BBA || 0,
                      IP: replacementTeamComponents.IP || 0,
                      ER: replacementTeamComponents.ER || 0,
                      K: replacementTeamComponents.K || 0,
                    };
                    if (pitchingComponents.IP > 0) {
                      value = calculateFinalRate(cat.formulaId, {}, pitchingComponents);
                    }
                  } else {
                    value = calculateFinalRate(cat.formulaId, {}, replacementTeamComponents);
                  }
                  replacementTeamComponents[`_val_${cat.statKey}`] = value;
                } else if (cat.type === "COUNTING") {
                  replacementTeamComponents[`_val_${cat.statKey}`] = replacementTeamComponents[cat.statKey] ?? 0;
                }
              }

              // Compute roto points with replacement level
              const replacementLeagueComponents = new Map(teamFinalComponents);
              replacementLeagueComponents.set(teamId, replacementTeamComponents);
              const replacementRotoPoints = this.computeRotoPointsFromComponents(
                replacementLeagueComponents, categories, numTeams,
              );

              const actualTeamPoints = actualRotoPoints.get(teamId) || 0;
              const replacementTeamPoints = replacementRotoPoints.get(teamId) || 0;
              replacementLevelImpact = actualTeamPoints - replacementTeamPoints;
            }
          }
        }

        // Compute category impacts (legacy format for backward compat)
        const actualComponents = teamFinalComponents.get(teamId)!;
        const counterfactualComponents = { ...actualComponents };
        if (gainedContribution) {
          for (const [key, val] of Object.entries(gainedContribution)) {
            if (key in counterfactualComponents && typeof counterfactualComponents[key] === "number") {
              counterfactualComponents[key] -= val;
            }
          }
        }
        if (lostCounterfactual) {
          for (const [key, val] of Object.entries(lostCounterfactual)) {
            if (typeof val === "number") {
              counterfactualComponents[key] = (counterfactualComponents[key] || 0) + val;
            }
          }
        }
        for (const cat of categories) {
          if (cat.type === "RATE" && cat.formulaId) {
            const isPitchingRate = ["era", "whip", "k9"].includes(cat.formulaId.toLowerCase());
            let value = 0;
            if (isPitchingRate) {
              const pitchingComponents = {
                H: counterfactualComponents.HA || 0,
                BB: counterfactualComponents.BBA || 0,
                IP: counterfactualComponents.IP || 0,
                ER: counterfactualComponents.ER || 0,
                K: counterfactualComponents.K || 0,
              };
              if (pitchingComponents.IP > 0) {
                value = calculateFinalRate(cat.formulaId, {}, pitchingComponents);
              }
            } else {
              value = calculateFinalRate(cat.formulaId, {}, counterfactualComponents);
            }
            counterfactualComponents[`_val_${cat.statKey}`] = value;
          } else if (cat.type === "COUNTING") {
            counterfactualComponents[`_val_${cat.statKey}`] = counterfactualComponents[cat.statKey] ?? 0;
          }
        }

        const counterfactualTeamComponents = new Map(teamFinalComponents);
        counterfactualTeamComponents.set(teamId, counterfactualComponents);
        const categoryImpacts = this.computeCategoryImpacts(
          teamId, actualComponents, counterfactualComponents, categories, numTeams,
          teamFinalComponents, counterfactualTeamComponents,
        );

        // Insert into database
        const insertValues = {
          league_id: leagueId,
          team_id: teamId,
          move_type: pair.type,
          player_gained_id: pair.gainedPlayerId,
          player_lost_id: pair.lostPlayerId,
          effective_date: pair.effectiveDate,
          gained_components: gainedContribution ? JSON.stringify(gainedContribution) : null,
          lost_components: lostCounterfactual ? JSON.stringify(lostCounterfactual) : null,
          impact_roto_points: Math.round(shapleyImpact * 100) / 100,
          shapley_impact: Math.round(shapleyImpact * 100) / 100,
          category_impacts: JSON.stringify(categoryImpacts),
          sgp_category_impacts: JSON.stringify(sgpCategoryImpacts),
          replacement_level_components: replacementLevelComponents ? JSON.stringify(replacementLevelComponents) : null,
          replacement_level_impact: replacementLevelImpact !== null ? Math.round(replacementLevelImpact * 100) / 100 : null,
          is_incomplete: isIncomplete,
          ci_low: null,
          ci_high: null,
          is_uncertain: false,
        };

        await this.db
          .insertInto("transaction_impact")
          .values(insertValues as any)
          .onConflict((oc) =>
            oc.columns(["league_id", "team_id", "player_gained_id", "effective_date"]).doUpdateSet({
              gained_components: insertValues.gained_components as any,
              lost_components: insertValues.lost_components as any,
              impact_roto_points: insertValues.impact_roto_points,
              shapley_impact: insertValues.shapley_impact,
              category_impacts: insertValues.category_impacts as any,
              sgp_category_impacts: insertValues.sgp_category_impacts as any,
              replacement_level_components: insertValues.replacement_level_components as any,
              replacement_level_impact: insertValues.replacement_level_impact,
              is_incomplete: insertValues.is_incomplete,
              computed_at: new Date(),
            }),
          )
          .execute();

        impactsComputed++;
      }
    }

    this.logger?.info(
      { leagueId, season, impactsComputed, numSamples },
      "Shapley-based transaction impact computation complete",
    );

    return impactsComputed;
  }

  /**
   * Compute Shapley values for a team's moves using Monte Carlo sampling.
   */
  private async computeTeamShapleyValues(
    leagueId: number,
    teamId: number,
    movePairs: Array<{
      type: "draft" | "add_drop" | "trade";
      gainedPlayerId: number;
      lostPlayerId: number | null;
      effectiveDate: string;
    }>,
    draftComponents: Record<string, number>,
    teamFinalComponents: Map<number, Record<string, number>>,
    categories: CategoryConfig[],
    numTeams: number,
    _actualRotoPoints: Map<number, number>,
    finalSnapshotDate: string,
    numSamples: number,
  ): Promise<Map<number, number>> {
    // Pre-load all player contributions to avoid N*samples DB queries
    const playerContributions = new Map<string, Record<string, number>>();

    for (const pair of movePairs) {
      // Gained player contribution (on this team only)
      const gainedKey = `gained_${pair.gainedPlayerId}_${pair.effectiveDate}`;
      if (!playerContributions.has(gainedKey)) {
        const contribution = await this.sumPlayerContribution(
          leagueId, pair.gainedPlayerId, teamId, pair.effectiveDate, finalSnapshotDate,
        );
        playerContributions.set(gainedKey, contribution);
      }

      // Lost player contribution (anywhere)
      if (pair.lostPlayerId) {
        const lostKey = `lost_${pair.lostPlayerId}_${pair.effectiveDate}`;
        if (!playerContributions.has(lostKey)) {
          const contribution = await this.sumPlayerContributionAnywhere(
            leagueId, pair.lostPlayerId, pair.effectiveDate, finalSnapshotDate,
          );
          playerContributions.set(lostKey, contribution);
        }
      }
    }

    // Track marginal contributions for each move
    const marginalContributions = new Map<number, number[]>();
    for (let i = 0; i < movePairs.length; i++) {
      marginalContributions.set(i, []);
    }

    // Monte Carlo sampling
    for (let sample = 0; sample < numSamples; sample++) {
      // Random permutation (Fisher-Yates shuffle)
      const indices = Array.from({ length: movePairs.length }, (_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }

      // Walk through permutation, tracking marginal contribution of each move
      const coalitionComponents: Record<string, number> = { ...draftComponents };

      for (let k = 0; k < indices.length; k++) {
        const moveIndex = indices[k];
        const move = movePairs[moveIndex];

        // Compute roto points WITHOUT this move (just coalition so far)
        const withoutComponents = { ...coalitionComponents };
        for (const cat of categories) {
          if (cat.type === "RATE" && cat.formulaId) {
            const isPitchingRate = ["era", "whip", "k9"].includes(cat.formulaId.toLowerCase());
            let value = 0;
            if (isPitchingRate) {
              const pitchingComponents = {
                H: withoutComponents.HA || 0,
                BB: withoutComponents.BBA || 0,
                IP: withoutComponents.IP || 0,
                ER: withoutComponents.ER || 0,
                K: withoutComponents.K || 0,
              };
              if (pitchingComponents.IP > 0) {
                value = calculateFinalRate(cat.formulaId, {}, pitchingComponents);
              }
            } else {
              value = calculateFinalRate(cat.formulaId, {}, withoutComponents);
            }
            withoutComponents[`_val_${cat.statKey}`] = value;
          } else if (cat.type === "COUNTING") {
            withoutComponents[`_val_${cat.statKey}`] = withoutComponents[cat.statKey] ?? 0;
          }
        }

        const withoutLeague = new Map(teamFinalComponents);
        withoutLeague.set(teamId, withoutComponents);
        const withoutRotoPoints = this.computeRotoPointsFromComponents(withoutLeague, categories, numTeams);
        const withoutPoints = withoutRotoPoints.get(teamId) || 0;

        // Add this move to coalition
        const gainedKey = `gained_${move.gainedPlayerId}_${move.effectiveDate}`;
        const gainedContribution = playerContributions.get(gainedKey) || {};
        for (const [key, val] of Object.entries(gainedContribution)) {
          if (typeof val === "number") {
            coalitionComponents[key] = (coalitionComponents[key] || 0) + val;
          }
        }

        if (move.lostPlayerId) {
          const lostKey = `lost_${move.lostPlayerId}_${move.effectiveDate}`;
          const lostContribution = playerContributions.get(lostKey) || {};
          for (const [key, val] of Object.entries(lostContribution)) {
            if (typeof val === "number") {
              coalitionComponents[key] = (coalitionComponents[key] || 0) - val;
            }
          }
        }

        // Compute roto points WITH this move
        const withComponents = { ...coalitionComponents };
        for (const cat of categories) {
          if (cat.type === "RATE" && cat.formulaId) {
            const isPitchingRate = ["era", "whip", "k9"].includes(cat.formulaId.toLowerCase());
            let value = 0;
            if (isPitchingRate) {
              const pitchingComponents = {
                H: withComponents.HA || 0,
                BB: withComponents.BBA || 0,
                IP: withComponents.IP || 0,
                ER: withComponents.ER || 0,
                K: withComponents.K || 0,
              };
              if (pitchingComponents.IP > 0) {
                value = calculateFinalRate(cat.formulaId, {}, pitchingComponents);
              }
            } else {
              value = calculateFinalRate(cat.formulaId, {}, withComponents);
            }
            withComponents[`_val_${cat.statKey}`] = value;
          } else if (cat.type === "COUNTING") {
            withComponents[`_val_${cat.statKey}`] = withComponents[cat.statKey] ?? 0;
          }
        }

        const withLeague = new Map(teamFinalComponents);
        withLeague.set(teamId, withComponents);
        const withRotoPoints = this.computeRotoPointsFromComponents(withLeague, categories, numTeams);
        const withPoints = withRotoPoints.get(teamId) || 0;

        // Marginal contribution = with - without
        const marginal = withPoints - withoutPoints;
        marginalContributions.get(moveIndex)!.push(marginal);
      }
    }

    // Average marginal contributions to get Shapley values
    const shapleyValues = new Map<number, number>();
    for (let i = 0; i < movePairs.length; i++) {
      const contributions = marginalContributions.get(i)!;
      const avg = contributions.length > 0
        ? contributions.reduce((a, b) => a + b, 0) / contributions.length
        : 0;
      shapleyValues.set(i, avg);
    }

    return shapleyValues;
  }

  /**
   * Compute SGP-normalized category impacts for a move.
   */
  private computeSGPCategoryImpacts(
    gainedComponents: Record<string, number> | null,
    lostComponents: Record<string, number>,
    categories: CategoryConfig[],
    sgpFactors: Record<string, number>,
  ): Array<{
    categoryId: string;
    sgpDelta: number;
    rawDelta: number;
    sgpFactor: number;
  }> {
    const result: Array<{
      categoryId: string;
      sgpDelta: number;
      rawDelta: number;
      sgpFactor: number;
    }> = [];

    for (const cat of categories) {
      const gained = (gainedComponents && gainedComponents[cat.statKey]) || 0;
      const lost = lostComponents[cat.statKey] || 0;
      const rawDelta = gained - lost;
      const sgpFactor = sgpFactors[cat.statKey] || 1.0;
      const sgpDelta = rawDelta / sgpFactor;

      result.push({
        categoryId: cat.statKey,
        sgpDelta: Math.round(sgpDelta * 1000) / 1000,
        rawDelta: Math.round(rawDelta * 1000) / 1000,
        sgpFactor: Math.round(sgpFactor * 1000) / 1000,
      });
    }

    return result;
  }

  /**
   * Public API: Compute transaction impacts.
   * Delegates to Shapley-based implementation.
   */
  async computeImpacts(leagueId: number, season: number): Promise<number> {
    return this.computeShapleyImpacts(leagueId, season);
  }

  /**
   * Compute Net Roster Management Value:
   * The single counterfactual delta comparing actual final roto points vs. draft-only roster.
   *
   * This answers: "What would my roto points be if I kept ONLY my draft-day roster all season?"
   * Unlike summing per-move impacts (which double-count), this is ONE computation with no overlap.
   */
  async computeNetRosterValue(
    leagueId: number,
    season: number,
    teamId: number,
  ): Promise<{ netRosterValue: number; draftOnlyRotoPoints: number; actualRotoPoints: number } | null> {
    // 1. Get league categories
    const categories = await this.getLeagueCategories(leagueId);
    if (categories.length === 0) {
      this.logger?.warn({ leagueId }, "No categories found for league");
      return null;
    }

    // 2. Get final snapshot date
    const finalSnapshotDate = await this.getFinalSnapshotDate(leagueId, season);
    if (!finalSnapshotDate) {
      this.logger?.warn({ leagueId, season }, "No final snapshot found");
      return null;
    }

    // 3. Get actual team final components for ALL teams
    const teamFinalComponents = await this.getTeamFinalComponents(leagueId, finalSnapshotDate);
    const teamIds = Array.from(teamFinalComponents.keys());
    const numTeams = teamIds.length;

    // 4. Compute actual roto points for all teams
    const actualRotoPoints = this.computeRotoPointsFromComponents(
      teamFinalComponents, categories, numTeams,
    );

    const actualTeamPoints = actualRotoPoints.get(teamId) || 0;

    // 5. Get draft-day roster for the target team
    const draftPicks = await this.db
      .selectFrom("roster_move")
      .select("player_id")
      .where("league_id", "=", leagueId)
      .where("team_id", "=", teamId)
      .where("move_type", "=", "draft")
      .execute();

    if (draftPicks.length === 0) {
      this.logger?.warn({ leagueId, teamId }, "No draft picks found for team");
      return null;
    }

    // 6. Sum each draft pick's full-season contribution (on any team)
    const startDate = `${season}-04-01`;
    const draftOnlyComponents: Record<string, number> = {};

    for (const pick of draftPicks) {
      const contribution = await this.sumPlayerContributionAnywhere(
        leagueId, pick.player_id, startDate, finalSnapshotDate,
      );
      // Sum contributions from all draft picks
      for (const [key, val] of Object.entries(contribution)) {
        if (typeof val === "number") {
          draftOnlyComponents[key] = (draftOnlyComponents[key] || 0) + val;
        }
      }
    }

    // 7. Recompute rate stat values from draft-only components
    for (const cat of categories) {
      if (cat.type === "RATE" && cat.formulaId) {
        const isPitchingRate = ["era", "whip", "k9"].includes(cat.formulaId.toLowerCase());
        let value = 0;
        if (isPitchingRate) {
          const pitchingComponents = {
            H: draftOnlyComponents.HA || 0,
            BB: draftOnlyComponents.BBA || 0,
            IP: draftOnlyComponents.IP || 0,
            ER: draftOnlyComponents.ER || 0,
            K: draftOnlyComponents.K || 0,
          };
          if (pitchingComponents.IP > 0) {
            value = calculateFinalRate(cat.formulaId, {}, pitchingComponents);
          }
        } else {
          value = calculateFinalRate(cat.formulaId, {}, draftOnlyComponents);
        }
        draftOnlyComponents[`_val_${cat.statKey}`] = value;
      } else if (cat.type === "COUNTING") {
        draftOnlyComponents[`_val_${cat.statKey}`] = draftOnlyComponents[cat.statKey] ?? 0;
      }
    }

    // 8. Build counterfactual league: replace target team's components with draft-only
    const counterfactualTeamComponents = new Map(teamFinalComponents);
    counterfactualTeamComponents.set(teamId, draftOnlyComponents);

    // 9. Compute roto points with draft-only roster
    const counterfactualRotoPoints = this.computeRotoPointsFromComponents(
      counterfactualTeamComponents, categories, numTeams,
    );

    const draftOnlyTeamPoints = counterfactualRotoPoints.get(teamId) || 0;

    // 10. Net roster value = actual - draft-only (positive = roster management helped)
    const netRosterValue = actualTeamPoints - draftOnlyTeamPoints;

    return {
      netRosterValue: Math.round(netRosterValue * 100) / 100,
      draftOnlyRotoPoints: Math.round(draftOnlyTeamPoints * 100) / 100,
      actualRotoPoints: Math.round(actualTeamPoints * 100) / 100,
    };
  }
}
