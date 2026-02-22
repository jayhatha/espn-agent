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

  /**
   * Compute roto-points impact for all moves in a season.
   *
   * For each add/drop pair (or draft pick):
   * 1. Sum gained player's per-period stats from join → season end
   * 2. Sum lost player's per-period stats from drop → season end (counterfactual)
   * 3. Compute counterfactual team season totals: actual - gained + lost
   * 4. Re-rank league with counterfactual → compute roto points delta
   */
  async computeImpacts(leagueId: number, season: number): Promise<number> {
    this.logger?.info({ leagueId, season }, "Computing transaction impacts");

    // Clear existing impacts (idempotent re-run)
    await this.db
      .deleteFrom("transaction_impact")
      .where("league_id", "=", leagueId)
      .execute();

    // Get league categories from league_settings_version
    const categories = await this.getLeagueCategories(leagueId);
    if (categories.length === 0) {
      this.logger?.warn({ leagueId }, "No categories found for league");
      return 0;
    }

    // Get final season team totals (components) for all teams
    const finalSnapshotDate = await this.getFinalSnapshotDate(leagueId, season);
    if (!finalSnapshotDate) {
      this.logger?.warn({ leagueId, season }, "No final snapshot found");
      return 0;
    }

    const teamFinalComponents = await this.getTeamFinalComponents(leagueId, finalSnapshotDate);
    const teamIds = Array.from(teamFinalComponents.keys());
    const numTeams = teamIds.length;

    // Get actual final roto points
    const actualRotoPoints = await this.computeRotoPointsFromComponents(
      teamFinalComponents, categories, numTeams,
    );

    // Get all roster moves grouped by team
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

    // Process each team's moves
    for (const teamId of teamIds) {
      const teamMoves = moves.filter((m) => m.team_id === teamId);

      // Group adds with their paired drops
      const addDropPairs = this.groupMovesIntoPairs(teamMoves);

      for (const pair of addDropPairs) {
        const impact = await this.computeSingleMoveImpact(
          leagueId, teamId, pair, finalSnapshotDate,
          teamFinalComponents, categories, numTeams, actualRotoPoints,
        );

        if (impact) {
          // JSONB columns must be JSON.stringify'd for Kysely/pg
          const insertValues = {
            ...impact,
            gained_components: impact.gained_components ? JSON.stringify(impact.gained_components) : null,
            lost_components: impact.lost_components ? JSON.stringify(impact.lost_components) : null,
            category_impacts: JSON.stringify(impact.category_impacts),
          };
          await this.db
            .insertInto("transaction_impact")
            .values(insertValues as any)
            .onConflict((oc) =>
              oc.columns(["league_id", "team_id", "player_gained_id", "effective_date"]).doUpdateSet({
                gained_components: insertValues.gained_components as any,
                lost_components: insertValues.lost_components as any,
                impact_roto_points: impact.impact_roto_points,
                category_impacts: insertValues.category_impacts as any,
                is_incomplete: impact.is_incomplete,
                computed_at: new Date(),
              }),
            )
            .execute();
          impactsComputed++;
        }
      }
    }

    this.logger?.info(
      { leagueId, season, impactsComputed, totalMoves: moves.length },
      "Transaction impact computation complete",
    );

    return impactsComputed;
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

  private async computeSingleMoveImpact(
    leagueId: number,
    teamId: number,
    pair: {
      type: "draft" | "add_drop" | "trade";
      gainedPlayerId: number;
      lostPlayerId: number | null;
      effectiveDate: string;
    },
    finalSnapshotDate: string,
    teamFinalComponents: Map<number, Record<string, number>>,
    categories: CategoryConfig[],
    numTeams: number,
    actualRotoPoints: Map<number, number>,
  ): Promise<{
    league_id: number;
    team_id: number;
    move_type: string;
    player_gained_id: number | null;
    player_lost_id: number | null;
    effective_date: string;
    gained_components: Record<string, number> | null;
    lost_components: Record<string, number> | null;
    impact_roto_points: number;
    category_impacts: any;
    is_incomplete: boolean;
  } | null> {
    // Sum gained player's per-period stats from join date to season end
    // Only count stats while on THIS team's active roster
    const gainedContribution = await this.sumPlayerContribution(
      leagueId, pair.gainedPlayerId, teamId, pair.effectiveDate, finalSnapshotDate,
    );

    // Sum lost player's per-period stats from drop date to season end (on ANY team)
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

    // For draft picks, there's no "lost" player — the counterfactual is simply
    // "what if this player hadn't been on your team" → team loses all their production
    // Impact = counterfactual roto points - actual roto points (should be negative,
    // meaning the draft pick HELPED)

    // Build counterfactual team components:
    // counterfactual = actual - gained_contribution + lost_counterfactual
    const actualComponents = teamFinalComponents.get(teamId);
    if (!actualComponents) return null;

    const counterfactualComponents = { ...actualComponents };

    // Subtract gained player's contribution
    if (gainedContribution) {
      for (const [key, val] of Object.entries(gainedContribution)) {
        if (key in counterfactualComponents && typeof counterfactualComponents[key] === "number") {
          counterfactualComponents[key] -= val;
        }
      }
    }

    // Add lost player's counterfactual contribution
    if (lostCounterfactual) {
      for (const [key, val] of Object.entries(lostCounterfactual)) {
        if (typeof val === "number") {
          counterfactualComponents[key] = (counterfactualComponents[key] || 0) + val;
        }
      }
    }

    // Recompute rate stat values from modified components
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

    // Build counterfactual league standings (swap this team's components)
    const counterfactualTeamComponents = new Map(teamFinalComponents);
    counterfactualTeamComponents.set(teamId, counterfactualComponents);

    const counterfactualRotoPoints = this.computeRotoPointsFromComponents(
      counterfactualTeamComponents, categories, numTeams,
    );

    const actualTeamPoints = actualRotoPoints.get(teamId) || 0;
    const counterfactualTeamPoints = counterfactualRotoPoints.get(teamId) || 0;
    const impactRotoPoints = actualTeamPoints - counterfactualTeamPoints;

    // Compute per-category impact
    const categoryImpacts = this.computeCategoryImpacts(
      teamId, actualComponents, counterfactualComponents, categories, numTeams,
      teamFinalComponents, counterfactualTeamComponents,
    );

    return {
      league_id: leagueId,
      team_id: teamId,
      move_type: pair.type,
      player_gained_id: pair.gainedPlayerId,
      player_lost_id: pair.lostPlayerId,
      effective_date: pair.effectiveDate,
      gained_components: gainedContribution,
      lost_components: lostCounterfactual,
      impact_roto_points: Math.round(impactRotoPoints * 100) / 100,
      category_impacts: categoryImpacts,
      is_incomplete: isIncomplete,
    };
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
}
