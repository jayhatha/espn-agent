import { parse } from "csv-parse/sync";
import type { BaseLogger } from "pino";
import { normalizePlayerName } from "../../../shared/dist/index.js";
import { CachedHttpClient } from "../utils/cached-http-client.js";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FIP_CONSTANT = 3.1;

export interface AdvancedStats {
  babip: number | null;
  xba: number | null;
  xslg: number | null;
  xwoba: number | null;
  iso: number | null;
  kBbPct: number | null;
  k9: number | null;
  fip: number | null;
  xfip: number | null;
  xera: number | null;
  siera: number | null;
}

export interface AdvancedStatsPlayerInput {
  playerId: number;
  playerName: string;
  mlbTeam: string | null;
  positions: string[];
  currentStats: Record<string, number> | null;
}

interface SavantBatterRow {
  name: string;
  xba: number | null;
  xslg: number | null;
  xwoba: number | null;
}

interface SavantPitcherRow {
  name: string;
  xera: number | null;
}

function isPitcher(positions: string[]): boolean {
  return positions.some((position) => ["SP", "RP", "P"].includes(position));
}

function toNullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getSeasonFromYear(season: number): string {
  return String(season);
}

function calculateBabip(stats: Record<string, number> | null): number | null {
  if (!stats) return null;
  const hits = stats.H ?? 0;
  const homeRuns = stats.HR ?? 0;
  const atBats = stats.AB ?? 0;
  const strikeouts = stats.SO ?? 0;
  const sacrificeFlies = stats.SF ?? 0;
  const denominator = atBats - strikeouts - homeRuns + sacrificeFlies;
  if (denominator <= 0) return null;
  return (hits - homeRuns) / denominator;
}

function calculateIso(stats: Record<string, number> | null): number | null {
  if (!stats) return null;
  const atBats = stats.AB ?? 0;
  const hits = stats.H ?? 0;
  const totalBases = stats.TB ?? 0;
  if (atBats <= 0) return null;
  return totalBases / atBats - hits / atBats;
}

function calculateK9(stats: Record<string, number> | null): number | null {
  if (!stats) return null;
  const inningsPitched = stats.IP ?? 0;
  const strikeouts = stats.K ?? 0;
  if (inningsPitched <= 0) return null;
  return (strikeouts * 9) / inningsPitched;
}

function calculateEstimatedBattersFaced(
  stats: Record<string, number> | null,
): number | null {
  if (!stats) return null;
  const outs = stats.OUTS ?? Math.round((stats.IP ?? 0) * 3);
  const hitsAllowed = stats.HA ?? 0;
  const walksAllowed = stats.BBA ?? 0;
  const battersFaced = outs + hitsAllowed + walksAllowed;
  return battersFaced > 0 ? battersFaced : null;
}

function calculateKBbPct(stats: Record<string, number> | null): number | null {
  if (!stats) return null;
  const battersFaced = calculateEstimatedBattersFaced(stats);
  if (!battersFaced) return null;
  const strikeouts = stats.K ?? 0;
  const walksAllowed = stats.BBA ?? 0;
  return ((strikeouts - walksAllowed) / battersFaced) * 100;
}

function calculateFip(stats: Record<string, number> | null): number | null {
  if (!stats) return null;
  const inningsPitched = stats.IP ?? 0;
  if (inningsPitched <= 0) return null;
  const homeRunsAllowed = stats.HRA ?? 0;
  const walksAllowed = stats.BBA ?? 0;
  const strikeouts = stats.K ?? 0;
  return (
    (13 * homeRunsAllowed + 3 * walksAllowed - 2 * strikeouts) /
      inningsPitched +
    FIP_CONSTANT
  );
}

function parseCsvRows(csvText: string): Record<string, string>[] {
  return parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Record<string, string>[];
}

function buildUniqueLookup<T extends { name: string }>(
  rows: T[],
): Map<string, T> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const normalized = normalizePlayerName(row.name);
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  const lookup = new Map<string, T>();
  for (const row of rows) {
    const normalized = normalizePlayerName(row.name);
    if (counts.get(normalized) === 1) {
      lookup.set(normalized, row);
    }
  }
  return lookup;
}

export class AdvancedStatsAdapter {
  private readonly httpClient: CachedHttpClient;

  constructor(
    private readonly logger?: BaseLogger,
    httpClient?: CachedHttpClient,
  ) {
    this.httpClient =
      httpClient ??
      new CachedHttpClient({
        maxEntries: 8,
        defaultTtlMs: CACHE_TTL_MS,
        timeoutMs: 20000,
        logger,
      });
  }

  async getAdvancedStatsForPlayers(
    season: number,
    players: AdvancedStatsPlayerInput[],
  ): Promise<Map<number, AdvancedStats>> {
    const seasonKey = getSeasonFromYear(season);
    const [batterLookup, pitcherLookup] = await Promise.all([
      this.getSavantBatterLookup(seasonKey),
      this.getSavantPitcherLookup(seasonKey),
    ]);

    const result = new Map<number, AdvancedStats>();

    for (const player of players) {
      const normalizedName = normalizePlayerName(player.playerName);
      const pitcher = isPitcher(player.positions);
      const batterRow = !pitcher ? batterLookup.get(normalizedName) : undefined;
      const pitcherRow = pitcher
        ? pitcherLookup.get(normalizedName)
        : undefined;

      result.set(player.playerId, {
        babip: !pitcher ? calculateBabip(player.currentStats) : null,
        xba: batterRow?.xba ?? null,
        xslg: batterRow?.xslg ?? null,
        xwoba: batterRow?.xwoba ?? null,
        iso: !pitcher ? calculateIso(player.currentStats) : null,
        kBbPct: pitcher ? calculateKBbPct(player.currentStats) : null,
        k9: pitcher ? calculateK9(player.currentStats) : null,
        fip: pitcher ? calculateFip(player.currentStats) : null,
        xfip: null,
        xera: pitcherRow?.xera ?? null,
        siera: null,
      });
    }

    return result;
  }

  private async getSavantBatterLookup(
    season: string,
  ): Promise<Map<string, SavantBatterRow>> {
    const url = `https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=batter&year=${season}&position=&team=&min=0&csv=true`;
    try {
      const csvText = await this.httpClient.get<string>(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/csv,text/plain;q=0.9,*/*;q=0.8",
        },
        responseType: "text",
        cacheKey: `savant:batter:${season}`,
      });
      const rows = parseCsvRows(csvText);
      return buildUniqueLookup(
        rows.map((row) => ({
          name: this.parseSavantName(row["last_name, first_name"]),
          xba: toNullableNumber(row.est_ba),
          xslg: toNullableNumber(row.est_slg),
          xwoba: toNullableNumber(row.est_woba),
        })),
      );
    } catch (error) {
      this.logger?.warn(
        { error, season },
        "Failed to load Savant batter expected stats",
      );
      return new Map();
    }
  }

  private async getSavantPitcherLookup(
    season: string,
  ): Promise<Map<string, SavantPitcherRow>> {
    const url = `https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=pitcher&year=${season}&position=&team=&min=0&csv=true`;
    try {
      const csvText = await this.httpClient.get<string>(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/csv,text/plain;q=0.9,*/*;q=0.8",
        },
        responseType: "text",
        cacheKey: `savant:pitcher:${season}`,
      });
      const rows = parseCsvRows(csvText);
      return buildUniqueLookup(
        rows.map((row) => ({
          name: this.parseSavantName(row["last_name, first_name"]),
          xera: toNullableNumber(row.xera),
        })),
      );
    } catch (error) {
      this.logger?.warn(
        { error, season },
        "Failed to load Savant pitcher expected stats",
      );
      return new Map();
    }
  }

  private parseSavantName(rawName: string | undefined): string {
    if (!rawName) return "";
    const [lastName, firstName] = rawName.split(",").map((part) => part.trim());
    if (firstName && lastName) {
      return `${firstName} ${lastName}`;
    }
    return rawName.trim();
  }
}
