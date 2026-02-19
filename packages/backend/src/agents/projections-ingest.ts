import { parse } from "csv-parse/sync";
import type { StatComponents } from "../../../shared/dist/index.js";
import type { Logger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import { PlayerIdentityResolutionAgent } from "./player-identity.js";

/**
 * Projections Ingest Agent
 * Per AGENTS.md §2
 *
 * Ingest FanGraphs Depth Charts RoS projections via CSV uploads
 */

export interface ProjectionCSVRow {
  Name: string;
  Team: string;
  [key: string]: string | number;
}

export interface IngestOptions {
  battersCsv?: string;
  pitchersCsv?: string;
  asOfDate: string; // DATE in ISO format
  leagueId?: number; // Optional: validate against league categories
}

export interface MatchStatistics {
  exactMatches: number;
  fuzzyMatches: number;
  unmatched: number;
  total: number;
}

export interface ValidationReport {
  requiredColumnsPresent: boolean;
  missingColumns: string[];
  rowsParsed: number;
  unmatchedPlayers: string[];
  mappingCoverage: number;
  matchStats: MatchStatistics;
}

/** Minimum confidence threshold for fuzzy matches during projections ingest */
const FUZZY_MATCH_CONFIDENCE_THRESHOLD = 0.8;

export class ProjectionsIngestAgent {
  private identityAgent: PlayerIdentityResolutionAgent;

  constructor(
    private db: Kysely<Database>,
    private logger?: Logger,
  ) {
    this.identityAgent = new PlayerIdentityResolutionAgent(db, logger);
  }

  /** Strip UTF-8 BOM and normalize column headers */
  private cleanCsv(csv: string): string {
    return csv.replace(/^\uFEFF/, "");
  }

  /** Get player name from row, preferring NameASCII over Name */
  private getPlayerName(row: ProjectionCSVRow): string | null {
    return (row.NameASCII as string) || (row.Name as string) || null;
  }

  /**
   * Match a FanGraphs player to a database player using identity resolution
   * Uses cached identity map first, then fuzzy matching with confidence threshold
   * @returns { playerId, matchType } if matched, null otherwise
   */
  private async matchPlayer(
    playerName: string,
    team?: string,
    positions?: string[],
  ): Promise<{ playerId: number; matchType: "exact" | "fuzzy" } | null> {
    // Create FanGraphs key from name (normalized)
    const fangraphsKey = playerName
      .toLowerCase()
      .replace(/[^a-z]/g, "")
      .trim();

    // 1. Check existing identity map (cached exact or fuzzy match)
    const existingMap = await this.db
      .selectFrom("player_identity_map")
      .innerJoin("player", "player.id", "player_identity_map.player_id")
      .select(["player_identity_map.player_id", "player_identity_map.confidence", "player_identity_map.resolution_method"])
      .where("player_identity_map.fangraphs_key", "=", fangraphsKey)
      .executeTakeFirst();

    if (existingMap) {
      const matchType = existingMap.resolution_method === "exact_match" ? "exact" as const : "fuzzy" as const;
      this.logger?.debug(
        { playerName, playerId: existingMap.player_id, confidence: existingMap.confidence, matchType },
        "Using cached identity mapping",
      );
      return { playerId: existingMap.player_id, matchType };
    }

    // 2. Find best match using PlayerIdentityResolutionAgent (fuzzy matching fallback)
    const match = await this.identityAgent.findBestMatch(
      fangraphsKey,
      playerName,
      team,
      positions,
    );

    if (!match) {
      this.logger?.warn({ playerName, team, positions }, "No match found for player");
      return null;
    }

    // 3. Apply confidence threshold for fuzzy matches
    if (match.confidence < FUZZY_MATCH_CONFIDENCE_THRESHOLD) {
      this.logger?.warn(
        { playerName, matchedId: match.playerId, confidence: match.confidence, threshold: FUZZY_MATCH_CONFIDENCE_THRESHOLD },
        "Fuzzy match below confidence threshold, rejecting",
      );
      return null;
    }

    // 4. Store the mapping for future use
    await this.db
      .insertInto("player_identity_map")
      .values({
        player_id: match.playerId,
        fangraphs_key: fangraphsKey,
        confidence: match.confidence,
        resolution_method: match.method,
        updated_at: new Date(),
      })
      .onConflict((oc) =>
        oc.column("player_id").doUpdateSet({
          fangraphs_key: fangraphsKey,
          confidence: match.confidence,
          resolution_method: match.method,
          updated_at: new Date(),
        }),
      )
      .execute();

    const matchType = match.method === "exact_match" ? "exact" as const : "fuzzy" as const;
    this.logger?.debug(
      { playerName, matchedId: match.playerId, confidence: match.confidence, method: match.method },
      "New player identity mapping created via fuzzy matching",
    );

    return { playerId: match.playerId, matchType };
  }

  /**
   * Ingest projections from CSV uploads
   */
  async ingest(options: IngestOptions): Promise<{
    projectionsRunId: number;
    battersReport?: ValidationReport;
    pitchersReport?: ValidationReport;
  }> {
    const { battersCsv, pitchersCsv, asOfDate } = options;

    // Create or update projections run
    let projectionsRun = await this.db
      .selectFrom("projections_run")
      .selectAll()
      .where("source", "=", "fangraphs")
      .where("system", "=", "depth_charts_ros")
      .where("as_of_date", "=", asOfDate)
      .executeTakeFirst();

    if (!projectionsRun) {
      projectionsRun = await this.db
        .insertInto("projections_run")
        .values({
          source: "fangraphs",
          system: "depth_charts_ros",
          as_of_date: asOfDate,
          ingested_at: new Date(),
          staleness: "stale", // Will be set to 'fresh' when both files uploaded
          artifacts_json: {},
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    }

    const reports: {
      battersReport?: ValidationReport;
      pitchersReport?: ValidationReport;
    } = {};

    // Ingest batters
    if (battersCsv) {
      reports.battersReport = await this.ingestBatters(
        projectionsRun.id,
        battersCsv,
      );
    }

    // Ingest pitchers
    if (pitchersCsv) {
      reports.pitchersReport = await this.ingestPitchers(
        projectionsRun.id,
        pitchersCsv,
      );
    }

    // Mark as fresh if both present
    const hasCompleteBatters = reports.battersReport !== undefined;
    const hasCompletePitchers = reports.pitchersReport !== undefined;

    // Aggregate match statistics across batters and pitchers
    const allUnmatched: string[] = [];
    const aggregateStats: MatchStatistics = { exactMatches: 0, fuzzyMatches: 0, unmatched: 0, total: 0 };

    if (reports.battersReport) {
      aggregateStats.exactMatches += reports.battersReport.matchStats.exactMatches;
      aggregateStats.fuzzyMatches += reports.battersReport.matchStats.fuzzyMatches;
      aggregateStats.unmatched += reports.battersReport.matchStats.unmatched;
      aggregateStats.total += reports.battersReport.matchStats.total;
      allUnmatched.push(...reports.battersReport.unmatchedPlayers);
    }
    if (reports.pitchersReport) {
      aggregateStats.exactMatches += reports.pitchersReport.matchStats.exactMatches;
      aggregateStats.fuzzyMatches += reports.pitchersReport.matchStats.fuzzyMatches;
      aggregateStats.unmatched += reports.pitchersReport.matchStats.unmatched;
      aggregateStats.total += reports.pitchersReport.matchStats.total;
      allUnmatched.push(...reports.pitchersReport.unmatchedPlayers);
    }

    // Log match summary
    this.logger?.info(
      {
        projectionsRunId: projectionsRun.id,
        ...aggregateStats,
        unmatchedPlayerNames: allUnmatched.length <= 20 ? allUnmatched : allUnmatched.slice(0, 20).concat([`...and ${allUnmatched.length - 20} more`]),
      },
      "Projections ingest match summary",
    );

    // Store unmatched player names and match stats in projections_run artifacts
    const artifacts = {
      ...(projectionsRun.artifacts_json || {}),
      matchStatistics: aggregateStats,
      unmatchedPlayers: allUnmatched,
    };

    if (hasCompleteBatters && hasCompletePitchers) {
      await this.db
        .updateTable("projections_run")
        .set({
          staleness: "fresh",
          artifacts_json: artifacts as any,
        })
        .where("id", "=", projectionsRun.id)
        .execute();
    } else {
      await this.db
        .updateTable("projections_run")
        .set({
          artifacts_json: artifacts as any,
        })
        .where("id", "=", projectionsRun.id)
        .execute();
    }

    return {
      projectionsRunId: projectionsRun.id,
      ...reports,
    };
  }

  private async ingestBatters(
    projectionsRunId: number,
    csv: string,
  ): Promise<ValidationReport> {
    this.logger?.info({ projectionsRunId }, "Ingesting batters projections");

    const rows = parse(this.cleanCsv(csv), {
      columns: true,
      skip_empty_lines: true,
    }) as ProjectionCSVRow[];

    // Required columns for hitters (per DESIGN_DOC.md §5.2)
    const required = [
      "AB",
      "H",
      "R",
      "HR",
      "RBI",
      "SB",
      "BB",
      "HBP",
      "SF",
      "TB",
    ];
    const missing = required.filter((col) => !(col in rows[0]));

    const unmatchedPlayers: string[] = [];
    let exactMatches = 0;
    let fuzzyMatches = 0;
    let totalProcessed = 0;

    for (const row of rows) {
      const playerName = this.getPlayerName(row);
      if (!playerName) continue;

      totalProcessed++;
      const team = (row.Team as string) || undefined;

      const components: StatComponents = {
        AB: parseFloat(row.AB as string) || 0,
        H: parseFloat(row.H as string) || 0,
        R: parseFloat(row.R as string) || 0,
        HR: parseFloat(row.HR as string) || 0,
        RBI: parseFloat(row.RBI as string) || 0,
        SB: parseFloat(row.SB as string) || 0,
        BB: parseFloat(row.BB as string) || 0,
        HBP: parseFloat(row.HBP as string) || 0,
        SF: parseFloat(row.SF as string) || 0,
        TB: parseFloat(row.TB as string) || 0,
        "2B": parseFloat(row["2B"] as string) || 0,
        "3B": parseFloat(row["3B"] as string) || 0,
        CS: parseFloat(row.CS as string) || 0,
      };

      // Match player using identity resolution with fuzzy matching fallback
      const matchResult = await this.matchPlayer(playerName, team);

      if (!matchResult) {
        unmatchedPlayers.push(playerName);
        continue;
      }

      // Track match type
      if (matchResult.matchType === "exact") {
        exactMatches++;
      } else {
        fuzzyMatches++;
      }

      // Upsert projection
      await this.db
        .insertInto("player_projection")
        .values({
          projections_run_id: projectionsRunId,
          player_id: matchResult.playerId,
          stat_components_json: components,
        })
        .onConflict((oc) =>
          oc.columns(["projections_run_id", "player_id"]).doUpdateSet({
            stat_components_json: components,
          }),
        )
        .execute();
    }

    const matched = exactMatches + fuzzyMatches;
    const matchStats: MatchStatistics = {
      exactMatches,
      fuzzyMatches,
      unmatched: unmatchedPlayers.length,
      total: totalProcessed,
    };

    this.logger?.info(
      { projectionsRunId, type: "batters", ...matchStats },
      "Batters ingest match statistics",
    );

    return {
      requiredColumnsPresent: missing.length === 0,
      missingColumns: missing,
      rowsParsed: rows.length,
      unmatchedPlayers,
      mappingCoverage: rows.length > 0 ? matched / rows.length : 0,
      matchStats,
    };
  }

  private async ingestPitchers(
    projectionsRunId: number,
    csv: string,
  ): Promise<ValidationReport> {
    this.logger?.info({ projectionsRunId }, "Ingesting pitchers projections");

    const rows = parse(this.cleanCsv(csv), {
      columns: true,
      skip_empty_lines: true,
    }) as ProjectionCSVRow[];

    // Required columns for pitchers
    // FanGraphs uses "SO" for strikeouts; we accept both "K" and "SO"
    const required = ["IP", "ER", "H", "BB", "W", "SV"];
    const hasK = "K" in rows[0];
    const hasSO = "SO" in rows[0];
    const missing = required.filter((col) => !(col in rows[0]));
    if (!hasK && !hasSO) {
      missing.push("K/SO");
    }

    const unmatchedPlayers: string[] = [];
    let exactMatches = 0;
    let fuzzyMatches = 0;
    let totalProcessed = 0;

    for (const row of rows) {
      const playerName = this.getPlayerName(row);
      if (!playerName) continue;

      totalProcessed++;
      const team = (row.Team as string) || undefined;

      const strikeouts = hasK
        ? parseFloat(row.K as string) || 0
        : parseFloat(row.SO as string) || 0;

      const components: StatComponents = {
        IP: parseFloat(row.IP as string) || 0,
        ER: parseFloat(row.ER as string) || 0,
        H: parseFloat(row.H as string) || 0,
        BB: parseFloat(row.BB as string) || 0,
        K: strikeouts,
        SO: strikeouts, // ESPN stat 60 uses "SO" as stat_key
        W: parseFloat(row.W as string) || 0,
        SV: parseFloat(row.SV as string) || 0,
        HLD: parseFloat((row.HLD as string) || "0") || 0,
        QS: parseFloat((row.QS as string) || "0") || 0,
      };

      // Match player using identity resolution with fuzzy matching fallback
      const matchResult = await this.matchPlayer(playerName, team);

      if (!matchResult) {
        unmatchedPlayers.push(playerName);
        continue;
      }

      // Track match type
      if (matchResult.matchType === "exact") {
        exactMatches++;
      } else {
        fuzzyMatches++;
      }

      await this.db
        .insertInto("player_projection")
        .values({
          projections_run_id: projectionsRunId,
          player_id: matchResult.playerId,
          stat_components_json: components,
        })
        .onConflict((oc) =>
          oc.columns(["projections_run_id", "player_id"]).doUpdateSet({
            stat_components_json: components,
          }),
        )
        .execute();
    }

    const matched = exactMatches + fuzzyMatches;
    const matchStats: MatchStatistics = {
      exactMatches,
      fuzzyMatches,
      unmatched: unmatchedPlayers.length,
      total: totalProcessed,
    };

    this.logger?.info(
      { projectionsRunId, type: "pitchers", ...matchStats },
      "Pitchers ingest match statistics",
    );

    return {
      requiredColumnsPresent: missing.length === 0,
      missingColumns: missing,
      rowsParsed: rows.length,
      unmatchedPlayers,
      mappingCoverage: rows.length > 0 ? matched / rows.length : 0,
      matchStats,
    };
  }
}
