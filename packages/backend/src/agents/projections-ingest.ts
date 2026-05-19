import { parse } from "csv-parse/sync";
import type { StatComponents } from "../../../shared/dist/index.js";
import type { BaseLogger } from "pino";
import { type Kysely, sql } from "kysely";
import type { Database } from "../db/schema.js";
import { PlayerIdentityResolutionAgent } from "./player-identity.js";

/**
 * Projections Ingest Agent
 * Per AGENTS.md §2
 *
 * Ingest FanGraphs Depth Charts RoS projections via CSV uploads
 */

/**
 * FanGraphs team abbreviation → ESPN/DB team abbreviation mapping.
 * FanGraphs uses longer codes (KCR, TBR, WSN, SDP, SFG, ATH) while
 * ESPN_PRO_TEAM_MAP stores shorter codes (KC, TB, WSH, SD, SF, OAK).
 * Any FanGraphs abbreviation not listed here is passed through unchanged.
 */
const FANGRAPHS_TO_ESPN_TEAM_MAP: Record<string, string> = {
  KCR: "KC",
  TBR: "TB",
  WSN: "WSH",
  SDP: "SD",
  SFG: "SF",
  ATH: "OAK", // Las Vegas/Oakland Athletics
  CHW: "CWS", // Chicago White Sox
};

interface ProjectionRow {
  projections_run_id: number;
  player_id: number;
  stat_components_json: StatComponents;
}

/** Replace NaN/Infinity with 0 in stat components — Postgres JSONB rejects non-finite numbers. */
function sanitizeStats(stats: StatComponents): StatComponents {
  const clean = { ...stats };
  for (const key of Object.keys(clean) as Array<keyof StatComponents>) {
    const v = clean[key];
    if (typeof v === "number" && !Number.isFinite(v)) {
      (clean as Record<string, number>)[key] = 0;
    }
  }
  return clean;
}

/** Deduplicate projection rows by player_id, merging stat components for duplicates. */
function deduplicateProjectionRows(rows: ProjectionRow[]): ProjectionRow[] {
  const map = new Map<number, ProjectionRow>();
  for (const row of rows) {
    const existing = map.get(row.player_id);
    if (existing) {
      existing.stat_components_json = {
        ...existing.stat_components_json,
        ...row.stat_components_json,
      };
    } else {
      map.set(row.player_id, { ...row });
    }
  }
  return Array.from(map.values()).map((row) => ({
    ...row,
    stat_components_json: sanitizeStats(row.stat_components_json),
  }));
}

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

/** Minimum confidence threshold for fuzzy matches during projections ingest.
 * Set high (0.95) because the char-set overlap algorithm is too generous —
 * it matched completely different names (e.g., "Jared Young" → Aaron Judge)
 * at 0.80+. Only accept very close matches (typos, accents, suffixes). */
// Threshold is defined in PlayerIdentityResolutionAgent.FUZZY_MATCH_CONFIDENCE_THRESHOLD

export class ProjectionsIngestAgent {
  private identityAgent: PlayerIdentityResolutionAgent;

  constructor(
    private db: Kysely<Database>,
    private logger?: BaseLogger,
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
   * Normalize a FanGraphs team abbreviation to the ESPN/DB abbreviation.
   * FanGraphs uses longer codes (KCR, TBR, WSN, SDP, SFG, ATH) that differ
   * from what ESPN stores in player.mlb_team (KC, TB, WSH, SD, SF, OAK).
   */
  private normalizeTeam(team: string | undefined): string | undefined {
    if (!team) return undefined;
    return FANGRAPHS_TO_ESPN_TEAM_MAP[team] ?? team;
  }

  /**
   * Match a FanGraphs player to a database player using identity resolution.
   * Delegates to PlayerIdentityResolutionAgent.resolve() which handles
   * cache lookup, fuzzy matching, threshold filtering, and map writes.
   */
  private async matchPlayer(
    playerName: string,
    team?: string,
    positions?: string[],
  ): Promise<{ playerId: number; matchType: "exact" | "fuzzy" } | null> {
    const fangraphsKey = playerName
      .toLowerCase()
      .replace(/[^a-z]/g, "")
      .trim();
    return this.identityAgent.resolve(
      fangraphsKey,
      playerName,
      team,
      positions,
    );
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
    const aggregateStats: MatchStatistics = {
      exactMatches: 0,
      fuzzyMatches: 0,
      unmatched: 0,
      total: 0,
    };

    if (reports.battersReport) {
      aggregateStats.exactMatches +=
        reports.battersReport.matchStats.exactMatches;
      aggregateStats.fuzzyMatches +=
        reports.battersReport.matchStats.fuzzyMatches;
      aggregateStats.unmatched += reports.battersReport.matchStats.unmatched;
      aggregateStats.total += reports.battersReport.matchStats.total;
      allUnmatched.push(...reports.battersReport.unmatchedPlayers);
    }
    if (reports.pitchersReport) {
      aggregateStats.exactMatches +=
        reports.pitchersReport.matchStats.exactMatches;
      aggregateStats.fuzzyMatches +=
        reports.pitchersReport.matchStats.fuzzyMatches;
      aggregateStats.unmatched += reports.pitchersReport.matchStats.unmatched;
      aggregateStats.total += reports.pitchersReport.matchStats.total;
      allUnmatched.push(...reports.pitchersReport.unmatchedPlayers);
    }

    // Log match summary
    this.logger?.info(
      {
        projectionsRunId: projectionsRun.id,
        ...aggregateStats,
        unmatchedPlayerNames:
          allUnmatched.length <= 20
            ? allUnmatched
            : allUnmatched
                .slice(0, 20)
                .concat([`...and ${allUnmatched.length - 20} more`]),
      },
      "Projections ingest match summary",
    );

    // Store unmatched player names and match stats in projections_run artifacts
    const artifacts = {
      ...(projectionsRun.artifacts_json || {}),
      matchStatistics: aggregateStats,
      unmatchedPlayers: allUnmatched,
    };

    // Check if both batters and pitchers exist for this run
    // (they may have been uploaded in separate requests)
    let hasBatters = hasCompleteBatters;
    let hasPitchers = hasCompletePitchers;

    if (!hasBatters || !hasPitchers) {
      // Check DB for existing projections — count batters vs pitchers in application code
      // to avoid JSONB field extraction with inline casts forcing PostgreSQL to parse every row
      const existingProjections = await this.db
        .selectFrom("player_projection as pp")
        .select(["pp.stat_components_json"])
        .where("pp.projections_run_id", "=", projectionsRun.id)
        .execute();

      let batterCount = 0;
      let pitcherCount = 0;
      for (const proj of existingProjections) {
        const stats = proj.stat_components_json as Record<string, unknown>;
        const ip = parseFloat(String(stats?.IP ?? 0));
        const ab = parseFloat(String(stats?.AB ?? 0));
        if (ip > 0 && ab === 0) {
          pitcherCount++;
        } else if (ab > 0) {
          batterCount++;
        }
      }

      hasBatters = hasBatters || batterCount > 0;
      hasPitchers = hasPitchers || pitcherCount > 0;
    }

    const staleness = hasBatters && hasPitchers ? "fresh" : "stale";

    await this.db
      .updateTable("projections_run")
      .set({
        staleness,
        artifacts_json: artifacts as Record<string, unknown>,
      })
      .where("id", "=", projectionsRun.id)
      .execute();

    if (staleness === "fresh") {
      this.logger?.info(
        { projectionsRunId: projectionsRun.id },
        "Projections run marked as fresh (both batters and pitchers present)",
      );
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
    // H and TB can be derived from 1B/2B/3B/HR, so they're not strictly required
    const required = ["AB", "R", "HR", "RBI", "SB", "BB", "HBP", "SF"];
    const missing = required.filter((col) => !(col in rows[0]));
    // Need either H directly or components to derive it
    const hasH = "H" in rows[0];
    const hasHitComponents =
      "1B" in rows[0] && "2B" in rows[0] && "3B" in rows[0];
    if (!hasH && !hasHitComponents) {
      missing.push("H (or 1B+2B+3B)");
    }
    // Need either TB directly or components to derive it
    if (!("TB" in rows[0]) && !hasHitComponents) {
      missing.push("TB (or 1B+2B+3B)");
    }

    const unmatchedPlayers: string[] = [];
    let exactMatches = 0;
    let fuzzyMatches = 0;
    let totalProcessed = 0;

    const projectionRows: Array<{
      projections_run_id: number;
      player_id: number;
      stat_components_json: StatComponents;
    }> = [];

    for (const row of rows) {
      const playerName = this.getPlayerName(row);
      if (!playerName) continue;

      totalProcessed++;
      const team = this.normalizeTeam((row.Team as string) || undefined);

      // Extract positions from CSV (e.g., "SS, 2B" or "SS/2B")
      const positionsStr =
        (row.Pos as string) || (row.Position as string) || "";
      const positions = positionsStr
        .split(/[,/]/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0 && p !== "IL" && p !== "NA" && p !== "BE"); // Filter out roster slots, not positions

      const singles = parseFloat(row["1B"] as string) || 0;
      const doubles = parseFloat(row["2B"] as string) || 0;
      const triples = parseFloat(row["3B"] as string) || 0;
      const homeRuns = parseFloat(row.HR as string) || 0;

      // Derive H from components if not in CSV (H = 1B + 2B + 3B + HR)
      const hits =
        parseFloat(row.H as string) || singles + doubles + triples + homeRuns;
      // Derive TB from components — FanGraphs exports don't include TB
      const totalBases =
        parseFloat(row.TB as string) ||
        singles + 2 * doubles + 3 * triples + 4 * homeRuns;

      const components: StatComponents = {
        AB: parseFloat(row.AB as string) || 0,
        H: hits,
        R: parseFloat(row.R as string) || 0,
        HR: homeRuns,
        RBI: parseFloat(row.RBI as string) || 0,
        SB: parseFloat(row.SB as string) || 0,
        BB: parseFloat(row.BB as string) || 0,
        HBP: parseFloat(row.HBP as string) || 0,
        SF: parseFloat(row.SF as string) || 0,
        TB: totalBases,
        "1B": singles,
        "2B": doubles,
        "3B": triples,
        CS: parseFloat(row.CS as string) || 0,
        // Playing time fields for allocation model
        G: parseFloat(row.G as string) || 0,
        PA: parseFloat(row.PA as string) || 0,
      };

      // Match player using identity resolution with fuzzy matching (includes position boosting)
      const matchResult = await this.matchPlayer(
        playerName,
        team,
        positions.length > 0 ? positions : undefined,
      );

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

      // Update player positions from CSV if available
      if (positions.length > 0) {
        await this.db
          .updateTable("player")
          .set({ positions })
          .where("id", "=", matchResult.playerId)
          .execute();
      }

      // Collect projection row for batch insert (sanitize NaN/Infinity from parsed CSV values)
      projectionRows.push({
        projections_run_id: projectionsRunId,
        player_id: matchResult.playerId,
        stat_components_json: sanitizeStats(components),
      });
    }

    // Deduplicate by player_id — CSV may list a player twice (e.g., team change).
    // Merge stat components for duplicates so no data is lost.
    const deduped = deduplicateProjectionRows(projectionRows);

    // Batch insert all projection rows in chunks of 500 to stay under PostgreSQL parameter limits
    const CHUNK_SIZE = 500;
    for (let i = 0; i < deduped.length; i += CHUNK_SIZE) {
      const chunk = deduped.slice(i, i + CHUNK_SIZE);
      await this.db
        .insertInto("player_projection")
        .values(chunk)
        .onConflict((oc) =>
          oc.columns(["projections_run_id", "player_id"]).doUpdateSet({
            stat_components_json: sql`player_projection.stat_components_json || excluded.stat_components_json`,
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

    const projectionRows: Array<{
      projections_run_id: number;
      player_id: number;
      stat_components_json: StatComponents;
    }> = [];

    for (const row of rows) {
      const playerName = this.getPlayerName(row);
      if (!playerName) continue;

      totalProcessed++;
      const team = this.normalizeTeam((row.Team as string) || undefined);

      // Extract positions from CSV (e.g., "SP", "RP", "SP/RP")
      const positionsStr =
        (row.Pos as string) || (row.Position as string) || "";
      const positions = positionsStr
        .split(/[,/]/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      const strikeouts = hasK
        ? parseFloat(row.K as string) || 0
        : parseFloat(row.SO as string) || 0;

      const components: StatComponents = {
        IP: parseFloat(row.IP as string) || 0,
        ER: parseFloat(row.ER as string) || 0,
        HA: parseFloat(row.H as string) || 0, // Hits allowed — use HA to avoid collision with batter H
        BBA: parseFloat(row.BB as string) || 0, // Walks allowed — use BBA to avoid collision with batter BB
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

      // Match player using identity resolution with fuzzy matching (includes position boosting)
      const matchResult = await this.matchPlayer(
        playerName,
        team,
        positions.length > 0 ? positions : undefined,
      );

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

      // Update player positions from CSV if available
      if (positions.length > 0) {
        await this.db
          .updateTable("player")
          .set({ positions })
          .where("id", "=", matchResult.playerId)
          .execute();
      }

      // Collect projection row for batch insert (sanitize NaN/Infinity from parsed CSV values)
      projectionRows.push({
        projections_run_id: projectionsRunId,
        player_id: matchResult.playerId,
        stat_components_json: sanitizeStats(components),
      });
    }

    // Deduplicate by player_id — CSV may list a player twice (e.g., team change).
    // Merge stat components for duplicates so no data is lost.
    const deduped = deduplicateProjectionRows(projectionRows);

    // Batch insert all projection rows in chunks of 500 to stay under PostgreSQL parameter limits
    const CHUNK_SIZE = 500;
    for (let i = 0; i < deduped.length; i += CHUNK_SIZE) {
      const chunk = deduped.slice(i, i + CHUNK_SIZE);
      await this.db
        .insertInto("player_projection")
        .values(chunk)
        .onConflict((oc) =>
          oc.columns(["projections_run_id", "player_id"]).doUpdateSet({
            stat_components_json: sql`player_projection.stat_components_json || excluded.stat_components_json`,
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
