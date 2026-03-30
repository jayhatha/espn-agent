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

export interface ValidationReport {
  requiredColumnsPresent: boolean;
  missingColumns: string[];
  rowsParsed: number;
  unmatchedPlayers: string[];
  mappingCoverage: number;
}

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
   * @returns player ID if matched, null otherwise
   */
  private async matchPlayer(
    playerName: string,
    team?: string,
    positions?: string[],
  ): Promise<number | null> {
    // Create FanGraphs key from name (normalized)
    const fangraphsKey = playerName
      .toLowerCase()
      .replace(/[^a-z]/g, "")
      .trim();

    // 1. Check existing identity map
    const existingMap = await this.db
      .selectFrom("player_identity_map")
      .innerJoin("player", "player.id", "player_identity_map.player_id")
      .select(["player_identity_map.player_id", "player_identity_map.confidence"])
      .where("player_identity_map.fangraphs_key", "=", fangraphsKey)
      .executeTakeFirst();

    if (existingMap) {
      this.logger?.debug(
        { playerName, playerId: existingMap.player_id, confidence: existingMap.confidence },
        "Using cached identity mapping",
      );
      return existingMap.player_id;
    }

    // 2. Find best match using identity resolution agent
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

    // 3. Store the mapping for future use
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

    this.logger?.info(
      { playerName, playerId: match.playerId, confidence: match.confidence, method: match.method },
      "New player identity mapping created",
    );

    return match.playerId;
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

    if (hasCompleteBatters && hasCompletePitchers) {
      await this.db
        .updateTable("projections_run")
        .set({ staleness: "fresh" })
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
    let matched = 0;

    for (const row of rows) {
      const playerName = this.getPlayerName(row);
      if (!playerName) continue;

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
        // Playing time fields for allocation model
        G: parseFloat(row.G as string) || 0,
        PA: parseFloat(row.PA as string) || 0,
      };

      // Match player using identity resolution
      const playerId = await this.matchPlayer(playerName, team);

      if (!playerId) {
        unmatchedPlayers.push(playerName);
        continue;
      }

      // Upsert projection
      await this.db
        .insertInto("player_projection")
        .values({
          projections_run_id: projectionsRunId,
          player_id: playerId,
          stat_components_json: components,
        })
        .onConflict((oc) =>
          oc.columns(["projections_run_id", "player_id"]).doUpdateSet({
            stat_components_json: components,
          }),
        )
        .execute();

      matched++;
    }

    return {
      requiredColumnsPresent: missing.length === 0,
      missingColumns: missing,
      rowsParsed: rows.length,
      unmatchedPlayers,
      mappingCoverage: rows.length > 0 ? matched / rows.length : 0,
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
    let matched = 0;

    for (const row of rows) {
      const playerName = this.getPlayerName(row);
      if (!playerName) continue;

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
        // Playing time fields for allocation model
        G: parseFloat(row.G as string) || 0,
        GS: parseFloat(row.GS as string) || 0,
      };

      // Match player using identity resolution
      const playerId = await this.matchPlayer(playerName, team);

      if (!playerId) {
        unmatchedPlayers.push(playerName);
        continue;
      }

      await this.db
        .insertInto("player_projection")
        .values({
          projections_run_id: projectionsRunId,
          player_id: playerId,
          stat_components_json: components,
        })
        .onConflict((oc) =>
          oc.columns(["projections_run_id", "player_id"]).doUpdateSet({
            stat_components_json: components,
          }),
        )
        .execute();

      matched++;
    }

    return {
      requiredColumnsPresent: missing.length === 0,
      missingColumns: missing,
      rowsParsed: rows.length,
      unmatchedPlayers,
      mappingCoverage: rows.length > 0 ? matched / rows.length : 0,
    };
  }
}
