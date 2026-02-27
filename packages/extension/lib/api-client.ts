import baselineRankings from "../assets/baseline-rankings.json";
import type { Category, DraftConfiguration } from "@espn-fantasy/shared";
import { backOff } from "exponential-backoff";
import { isPracticeDraft, detectLeagueConfig } from "./draft-config-detector";

/**
 * Throttle helper - limits function execution to once per wait period
 */
function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => ReturnType<T> | undefined {
  let timeout: NodeJS.Timeout | null = null;
  let lastRun = 0;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = wait - (now - lastRun);

    if (remaining <= 0) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      lastRun = now;
      return func(...args);
    }

    return undefined;
  };
}

/**
 * Request deduplication cache - prevents duplicate in-flight requests
 */
const inflightRequests = new Map<string, Promise<any>>();

function dedupedRequest<T>(
  key: string,
  requestFn: () => Promise<T>
): Promise<T> {
  const existing = inflightRequests.get(key);
  if (existing) {
    console.log(`[API Client] Deduping request: ${key}`);
    return existing as Promise<T>;
  }

  const promise = requestFn().finally(() => {
    inflightRequests.delete(key);
  });

  inflightRequests.set(key, promise);
  return promise;
}

// Export throttle for use in content script
export { throttle };

// ESPN stat ID to our stat key mapping
// Reference: packages/backend/src/adapters/espn.ts
const ESPN_STAT_MAP: Record<number, {
  key: string;
  name: string;
  type: "COUNTING" | "RATE";
  formulaId?: string;
  requiredComponents?: string[];
}> = {
  // Batting stats
  5: { key: "HR", name: "Home Runs", type: "COUNTING" },
  20: { key: "R", name: "Runs", type: "COUNTING" },
  21: { key: "RBI", name: "RBI", type: "COUNTING" },
  23: { key: "SB", name: "Stolen Bases", type: "COUNTING" },
  3: { key: "AVG", name: "Batting Average", type: "RATE", formulaId: "avg", requiredComponents: ["AB", "H"] },
  17: { key: "OBP", name: "On Base Percentage", type: "RATE", formulaId: "obp", requiredComponents: ["H", "BB", "HBP", "AB", "SF"] },
  18: { key: "OPS", name: "On-Base Plus Slugging", type: "RATE", formulaId: "ops", requiredComponents: ["H", "BB", "HBP", "AB", "SF", "TB"] },
  // Pitching stats
  48: { key: "K", name: "Strikeouts", type: "COUNTING" },
  53: { key: "W", name: "Wins", type: "COUNTING" },
  57: { key: "SV", name: "Saves", type: "COUNTING" },
  47: { key: "ERA", name: "Earned Run Average", type: "RATE", formulaId: "era", requiredComponents: ["ER", "IP"] },
  41: { key: "WHIP", name: "WHIP", type: "RATE", formulaId: "whip", requiredComponents: ["IP", "H", "BB"] },
};

// ESPN lineup slot ID to position mapping
const ESPN_LINEUP_SLOT_MAP: Record<number, string> = {
  0: "C",
  1: "1B",
  2: "2B",
  3: "3B",
  4: "SS",
  5: "OF",
  7: "UT",  // Utility
  13: "P",
  14: "SP",
  15: "RP",
  16: "BE",  // Bench
  17: "IL",  // Injured List
};

export interface PlayerRanking {
  playerId: number;
  playerName: string;
  positions: string[];
  primaryPosition: string;
  vbdScore: number;
  tier: number;
  projectedStats: Record<string, number>;
}

export interface AuctionValue {
  playerId: number;
  playerName: string;
  dollarValue: number;
  vbdScore: number;
  positions: string[];
}

export interface GetRankingsOptions {
  draftFormat?: "snake" | "auction";
  scoringType?: "roto" | "h2h";
  backendLeagueId?: string;
  position?: string;
}

export interface GetAuctionValuesOptions {
  budget?: number;
  rosterSize?: number;
  backendLeagueId?: string;
  position?: string;
}

export interface ProjectedStandingsResponse {
  snapshotDate: string;
  overallStandings: Array<{
    team_id: number;
    teamName: string;
    projected_overall_rank: number;
    projected_overall_points: number;
  }>;
  currentOverallStandings: Array<{
    team_id: number;
    teamName: string;
    overall_rank: number;
    overall_points: number;
  }>;
}

export interface BackendLeagueSummary {
  id: number;
  espnLeagueId: number;
  season?: number;
  name: string;
  created_at?: string;
  snapshotDate?: string;
}

interface BackendLeaguesResponse {
  leagues?: BackendLeagueSummary[];
}

interface RawLeagueSummary {
  id?: number;
  name?: string;
  season?: number;
  created_at?: string;
  espn_league_id?: number;
  espnLeagueId?: number;
  snapshotDate?: string;
}

const DEFAULT_BACKEND_URL = "http://localhost:3001";
const REQUEST_TIMEOUT_MS = 10000;

/**
 * Fetch league settings from ESPN API
 */
async function fetchEspnLeagueSettings(
  espnLeagueId: string,
  season?: number
): Promise<DraftConfiguration | null> {
  // Skip ESPN API call for practice drafts - they have no real league data
  if (isPracticeDraft()) {
    console.log("[API Client] Practice draft detected - skipping ESPN API call");
    return null;
  }

  try {
    const year = season || new Date().getFullYear();
    const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/flb/seasons/${year}/segments/0/leagues/${espnLeagueId}?view=mSettings`;

    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) {
      console.warn("[API Client] ESPN settings fetch failed:", response.status);
      return null;
    }

    const data = await response.json();

    // Map ESPN categories to our format
    const categories: Category[] = (data.settings?.scoringSettings?.scoringItems || [])
      .map((item: any) => {
        const mapping = ESPN_STAT_MAP[item.statId];
        if (!mapping) {
          console.warn("[API Client] Unknown ESPN stat ID:", item.statId);
          return null;
        }

        return {
          category_id: `cat_${item.statId}`,
          name: mapping.name,
          stat_key: mapping.key,
          type: mapping.type,
          direction: item.isReverseItem ? "LOWER_BETTER" : "HIGHER_BETTER",
          formula_id: mapping.formulaId,
          required_components: mapping.requiredComponents,
        };
      })
      .filter(Boolean);

    // Map ESPN roster slots to our format
    const rosterSlots: Record<string, number> = {};
    const lineupSlotCounts = data.settings?.rosterSettings?.lineupSlotCounts || {};

    for (const [slotId, count] of Object.entries(lineupSlotCounts)) {
      const position = ESPN_LINEUP_SLOT_MAP[Number(slotId)];
      if (position && typeof count === "number" && count > 0) {
        rosterSlots[position] = count;
      }
    }

    const totalTeams = data.settings?.size || 12;
    const budget = data.settings?.draftSettings?.budget || 260;
    const minBid = data.settings?.draftSettings?.minBid || 1;

    console.log("[API Client] Fetched ESPN settings:", {
      totalTeams,
      categories: categories.length,
      rosterSlots,
    });

    return {
      categories,
      rosterSlots,
      totalTeams,
      budget,
      minBid,
    };
  } catch (error) {
    console.error("[API Client] Failed to fetch ESPN league settings:", error);
    return null;
  }
}

function normalizeBackendUrl(rawBackendUrl?: string): string {
  const value = (rawBackendUrl || "").trim();
  const backendUrl = value || DEFAULT_BACKEND_URL;
  return backendUrl.replace(/\/+$/, "");
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPracticeDraftHints(titleText?: string): {
  targetName?: string;
  targetSeason?: number;
} {
  if (!titleText) {
    return {};
  }

  const normalizedTitle = titleText.replace(/\?/g, "").trim();
  console.log("[API Client] Extracting hints from title:", normalizedTitle);

  // Pattern 1: "Practice Draft for [League Name] in [Year]"
  const practiceMatch1 = normalizedTitle.match(
    /practice\s+draft\s+for\s+(.+?)\s+in\s+(\d{4})/i,
  );
  if (practiceMatch1) {
    console.log("[API Client] Matched pattern 1:", {
      name: practiceMatch1[1].trim(),
      season: practiceMatch1[2],
    });
    return {
      targetName: practiceMatch1[1].trim(),
      targetSeason: Number.parseInt(practiceMatch1[2], 10),
    };
  }

  // Pattern 2: "[League Name] Practice Draft - [Year]"
  const practiceMatch2 = normalizedTitle.match(
    /(.+?)\s+practice\s+draft\s*[-–—]\s*(\d{4})/i,
  );
  if (practiceMatch2) {
    console.log("[API Client] Matched pattern 2:", {
      name: practiceMatch2[1].trim(),
      season: practiceMatch2[2],
    });
    return {
      targetName: practiceMatch2[1].trim(),
      targetSeason: Number.parseInt(practiceMatch2[2], 10),
    };
  }

  // Pattern 3: "Draft [Year] - [League Name]"
  const practiceMatch3 = normalizedTitle.match(
    /draft\s+(\d{4})\s*[-–—]\s*(.+)/i,
  );
  if (practiceMatch3) {
    console.log("[API Client] Matched pattern 3:", {
      season: practiceMatch3[1],
      name: practiceMatch3[2].trim(),
    });
    return {
      targetSeason: Number.parseInt(practiceMatch3[1], 10),
      targetName: practiceMatch3[2].trim(),
    };
  }

  // Pattern 4: Just extract season year
  const seasonMatch = normalizedTitle.match(/(20\d{2})/);
  const result = {
    targetSeason: seasonMatch ? Number.parseInt(seasonMatch[1], 10) : undefined,
  };
  console.log("[API Client] Fallback season extraction:", result);
  return result;
}

function getLeagueNameScore(leagueName: string, targetName?: string): number {
  if (!targetName) {
    return 0;
  }

  const normalizedLeague = normalizeText(leagueName);
  const normalizedTarget = normalizeText(targetName);

  if (!normalizedTarget) {
    return 0;
  }

  if (normalizedLeague.includes(normalizedTarget)) {
    return 6;
  }

  const targetTokens = normalizedTarget
    .split(" ")
    .filter((token) => token.length > 2);
  if (targetTokens.length === 0) {
    return 0;
  }

  const overlap = targetTokens.filter((token) =>
    normalizedLeague.includes(token),
  ).length;
  if (overlap === 0) {
    return 0;
  }

  return Math.min(4, overlap);
}

async function fetchLeagues(
  normalizedBackendUrl: string,
  apiToken?: string,
): Promise<BackendLeagueSummary[]> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (apiToken?.trim()) {
    headers.Authorization = `Bearer ${apiToken.trim()}`;
  }

  const endpoints = ["/api/admin/leagues", "/api/leagues"];

  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${normalizedBackendUrl}${endpoint}`, {
        signal: controller.signal,
        credentials: "include",
        mode: "cors",
        headers,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        continue;
      }

      const payload = (await parseJsonSafely(
        response,
      )) as BackendLeaguesResponse | null;
      const rawLeagues = Array.isArray(payload?.leagues)
        ? (payload.leagues as RawLeagueSummary[])
        : [];

      const normalized = rawLeagues
        .map((league) => {
          const id = Number(league.id);
          const name = typeof league.name === "string" ? league.name : "";
          const espnLeagueId = Number(
            league.espn_league_id ?? league.espnLeagueId,
          );

          if (!Number.isFinite(id) || !name || !Number.isFinite(espnLeagueId)) {
            return null;
          }

          return {
            id,
            name,
            espnLeagueId,
            season:
              typeof league.season === "number" &&
              Number.isFinite(league.season)
                ? league.season
                : undefined,
            created_at:
              typeof league.created_at === "string"
                ? league.created_at
                : undefined,
            snapshotDate:
              typeof league.snapshotDate === "string"
                ? league.snapshotDate
                : undefined,
          } satisfies BackendLeagueSummary;
        })
        .filter((league): league is BackendLeagueSummary => Boolean(league));

      if (normalized.length > 0) {
        return normalized;
      }
    } catch {
      clearTimeout(timeoutId);
      continue;
    }
  }

  return [];
}

/**
 * Search for leagues by name using public endpoint (no auth required)
 */
async function searchLeaguesByName(
  normalizedBackendUrl: string,
  name: string,
  season?: number,
): Promise<BackendLeagueSummary[]> {
  const params = new URLSearchParams();
  params.set("name", name);
  if (season) params.set("season", season.toString());
  params.set("limit", "10");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${normalizedBackendUrl}/api/leagues/search?${params}`,
      {
        signal: controller.signal,
        mode: "cors",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      return [];
    }

    const data = await parseJsonSafely(response);
    const results = data?.results || [];

    // Convert search results to BackendLeagueSummary format
    return results.map((league: any) => ({
      id: league.id,
      name: league.name,
      espnLeagueId: league.espnLeagueId,
      season: league.season,
      created_at: league.createdAt,
    }));
  } catch {
    clearTimeout(timeoutId);
    return [];
  }
}

/**
 * Clean up practice draft prefix from league name
 */
function cleanPracticeDraftName(name: string): string {
  // Remove common practice draft prefixes
  return name
    .replace(/^practice\s+draft\s+(for\s+)?/i, "")
    .replace(/\s+practice\s+draft$/i, "")
    .trim();
}

/**
 * Fetch league name from ESPN API
 */
async function fetchEspnLeagueName(
  espnLeagueId: string,
): Promise<string | null> {
  try {
    const currentYear = new Date().getFullYear();
    const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/flb/seasons/${currentYear}/segments/0/leagues/${espnLeagueId}?view=mSettings`;

    const response = await fetch(url, {
      credentials: "include",
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const rawName = data?.settings?.name;

    if (!rawName) {
      return null;
    }

    // Clean up practice draft prefixes
    return cleanPracticeDraftName(rawName);
  } catch (error) {
    console.warn("[API Client] Failed to fetch ESPN league name:", error);
    return null;
  }
}

export async function resolveBackendLeagueId(
  espnLeagueId: string,
  pageTitle?: string,
): Promise<string | null> {
  try {
    // For practice drafts, skip backend league resolution - use ESPN ID directly
    if (isPracticeDraft()) {
      console.log("[API Client] Practice draft detected - using ESPN league ID directly");
      return espnLeagueId;
    }

    const { backendUrl, apiToken } = await chrome.storage.local.get([
      "backendUrl",
      "apiToken",
    ]);

    const normalizedBackendUrl = normalizeBackendUrl(backendUrl);

    // Try to fetch leagues - if this fails due to auth, we'll fall back
    let leagues: BackendLeagueSummary[] = [];
    try {
      console.log("[API Client] Attempting to fetch leagues from backend...");
      leagues = await fetchLeagues(normalizedBackendUrl, apiToken);
      console.log(
        "[API Client] fetchLeagues returned",
        leagues.length,
        "leagues",
      );
    } catch (error) {
      console.warn(
        "[API Client] Could not fetch leagues (auth required or backend unavailable):",
        error,
      );

      // Try to get league name from ESPN API first
      console.log("[API Client] Fetching league name from ESPN API...");
      const espnLeagueName = await fetchEspnLeagueName(espnLeagueId);

      // Extract hints from page title as fallback
      const { targetName: pageTitleName, targetSeason } =
        extractPracticeDraftHints(pageTitle);

      // Prefer ESPN API name over page title
      const leagueNameForSearch = espnLeagueName || pageTitleName;

      if (leagueNameForSearch) {
        console.log(
          "[API Client] Trying public search endpoint for:",
          leagueNameForSearch,
          "(source:",
          espnLeagueName ? "ESPN API" : "page title",
          ")",
        );

        const searchResults = await searchLeaguesByName(
          normalizedBackendUrl,
          leagueNameForSearch,
          targetSeason,
        );

        if (searchResults.length > 0) {
          console.log(
            "[API Client] Found leagues via public search:",
            searchResults.length,
          );
          leagues = searchResults;
        } else {
          console.log(
            "[API Client] No results from public search, falling back to ESPN ID:",
            espnLeagueId,
          );
          return espnLeagueId;
        }
      } else {
        // No league name available from any source
        console.log(
          "[API Client] No league name available, falling back to ESPN league ID:",
          espnLeagueId,
        );
        return espnLeagueId;
      }
    }

    console.log("[API Client] Resolving league ID:", {
      espnLeagueId,
      pageTitle,
      availableLeagues: leagues.length,
    });

    // If no leagues found via auth, try public search
    if (leagues.length === 0) {
      console.log(
        "[API Client] No leagues found via auth, trying public search...",
      );

      // Try to get league name from ESPN API first
      const espnLeagueName = await fetchEspnLeagueName(espnLeagueId);

      // Extract hints from page title as fallback
      const { targetName: pageTitleName, targetSeason } =
        extractPracticeDraftHints(pageTitle);

      // Prefer ESPN API name over page title
      const leagueNameForSearch = espnLeagueName || pageTitleName;

      if (leagueNameForSearch) {
        console.log(
          "[API Client] Trying public search endpoint for:",
          leagueNameForSearch,
          "(source:",
          espnLeagueName ? "ESPN API" : "page title",
          ")",
        );

        const searchResults = await searchLeaguesByName(
          normalizedBackendUrl,
          leagueNameForSearch,
          targetSeason,
        );

        if (searchResults.length > 0) {
          console.log(
            "[API Client] Found leagues via public search:",
            searchResults.length,
          );
          leagues = searchResults;
        } else {
          console.log(
            "[API Client] No results from public search, falling back to ESPN ID:",
            espnLeagueId,
          );
          return espnLeagueId;
        }
      } else {
        console.warn(
          "[API Client] No league name available for search, using ESPN ID as fallback",
        );
        return espnLeagueId;
      }
    }

    // Re-check leagues length after potential search
    if (leagues.length === 0) {
      console.warn(
        "[API Client] Still no leagues found, using ESPN ID as fallback",
      );
      return espnLeagueId;
    }

    if (leagues.length === 1) {
      console.log(
        "[API Client] Only one league available, using it:",
        leagues[0],
      );
      return String(leagues[0].id);
    }

    const direct = leagues.find(
      (league) => String(league.espnLeagueId) === espnLeagueId,
    );
    if (direct) {
      console.log("[API Client] Found direct ESPN ID match:", direct);
      return String(direct.id);
    }

    // Get league name from ESPN API for better matching
    const espnLeagueName = await fetchEspnLeagueName(espnLeagueId);
    const { targetName: pageTitleName, targetSeason } =
      extractPracticeDraftHints(pageTitle);

    // Prefer ESPN API name for matching
    const targetName = espnLeagueName || pageTitleName;

    console.log("[API Client] Matching hints:", {
      espnLeagueName,
      pageTitleName,
      targetName,
      targetSeason,
    });

    const scoredCandidates = leagues.map((league) => {
      let score = 0;
      if (targetSeason && typeof league.season === "number") {
        if (league.season === targetSeason) {
          score += 4;
        } else if (Math.abs(league.season - targetSeason) === 1) {
          score += 2;
        }
      }

      score += getLeagueNameScore(league.name, targetName);

      return { league, score };
    });

    const sortedCandidates = scoredCandidates.sort(
      (left, right) => right.score - left.score,
    );

    console.log(
      "[API Client] Scored candidates:",
      sortedCandidates.map((c) => ({
        name: c.league.name,
        season: c.league.season,
        score: c.score,
      })),
    );

    const bestCandidate = sortedCandidates[0];

    if (bestCandidate && bestCandidate.score >= 3) {
      console.log(
        "[API Client] Using best-scored candidate:",
        bestCandidate.league,
      );
      return String(bestCandidate.league.id);
    }

    if (targetName) {
      const nameOnlyBest = leagues
        .map((league) => ({
          league,
          score: getLeagueNameScore(league.name, targetName),
        }))
        .sort((left, right) => right.score - left.score)[0];

      if (nameOnlyBest && nameOnlyBest.score >= 1) {
        console.log("[API Client] Using name-only match:", nameOnlyBest.league);
        return String(nameOnlyBest.league.id);
      }
    }

    if (targetSeason) {
      const seasonCandidates = leagues.filter(
        (league) =>
          typeof league.season === "number" && league.season === targetSeason,
      );

      console.log("[API Client] Season candidates:", seasonCandidates.length);

      if (seasonCandidates.length === 1) {
        console.log(
          "[API Client] Using single season match:",
          seasonCandidates[0],
        );
        return String(seasonCandidates[0].id);
      }

      if (seasonCandidates.length > 1) {
        const newest = seasonCandidates.sort((a, b) => {
          const leftDate = Date.parse(a.created_at || "");
          const rightDate = Date.parse(b.created_at || "");
          return Number.isFinite(rightDate) && Number.isFinite(leftDate)
            ? rightDate - leftDate
            : b.id - a.id;
        })[0];
        console.log("[API Client] Using newest season match:", newest);
        return String(newest.id);
      }
    }

    console.warn(
      "[API Client] Could not resolve backend league ID via matching, using ESPN ID as fallback",
    );
    return espnLeagueId;
  } catch (error) {
    console.error("[API Client] Error resolving backend league ID:", error);
    // Even on error, try to use ESPN league ID as fallback
    return espnLeagueId;
  }
}

function isNoDataStatus(statusCode: number): boolean {
  return statusCode === 204 || statusCode === 404;
}

async function parseJsonSafely(response: Response): Promise<any | null> {
  const contentLength = response.headers.get("content-length");
  if (contentLength === "0" || response.status === 204) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Fetch draft rankings from backend API with fallback to bundled baseline rankings
 */
export async function getRankings(
  espnLeagueId: string,
  options: GetRankingsOptions = {}
): Promise<PlayerRanking[]> {
  const cacheKey = `rankings:${espnLeagueId}:${JSON.stringify(options)}`;

  return dedupedRequest(cacheKey, async () => {
    try {
      const { backendUrl } = await chrome.storage.local.get(["backendUrl"]);
      const normalizedBackendUrl = normalizeBackendUrl(backendUrl);

      // Fetch ESPN settings for league-agnostic draft
      console.log("[API Client] Fetching ESPN settings for league:", espnLeagueId);
      let espnConfig = await fetchEspnLeagueSettings(espnLeagueId);

      // If ESPN settings failed (e.g., practice draft), try DOM detection
      if (!espnConfig) {
        console.log("[API Client] ESPN settings not available, attempting DOM detection");
        const domDetection = detectLeagueConfig();

        if (domDetection.config && domDetection.confidence !== "failed") {
          console.log("[API Client] Using DOM-detected config:", {
            confidence: domDetection.confidence,
            isPracticeDraft: domDetection.isPracticeDraft,
            warnings: domDetection.warnings
          });
          espnConfig = domDetection.config;
        } else {
          console.warn("[API Client] DOM detection failed, using baseline rankings");
          return baselineRankings as PlayerRanking[];
        }
      }

      // Build query params with JSON-encoded config
      const params = new URLSearchParams({
        numTeams: espnConfig.totalTeams.toString(),
        categories: JSON.stringify(espnConfig.categories),
        rosterSlots: JSON.stringify(espnConfig.rosterSlots),
        limit: "300",
      });

      if (options.position) params.set("position", options.position);

      const url = `${normalizedBackendUrl}/api/draft/rankings?${params}`;

      console.log("[API Client] Fetching generic draft rankings");

      // Fetch with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(url, {
        signal: controller.signal,
        mode: "cors",
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await parseJsonSafely(response);
      const rankings = data?.rankings || [];

      console.log("[API Client] Received", rankings.length, "rankings");

      return rankings.length > 0 ? rankings : (baselineRankings as PlayerRanking[]);

    } catch (error) {
      console.warn("[API Client] Failed to fetch live rankings, using baseline:", error);
      return baselineRankings as PlayerRanking[];
    }
  });
}

/**
 * Fetch auction values from backend API with fallback to bundled baseline
 */
export async function getAuctionValues(
  espnLeagueId: string,
  options: GetAuctionValuesOptions = {}
): Promise<AuctionValue[]> {
  const cacheKey = `auction:${espnLeagueId}:${JSON.stringify(options)}`;

  return dedupedRequest(cacheKey, async () => {
    try {
      const { backendUrl } = await chrome.storage.local.get(["backendUrl"]);
      const normalizedBackendUrl = normalizeBackendUrl(backendUrl);

      // Fetch ESPN settings
      console.log("[API Client] Fetching ESPN settings for auction values");
      let espnConfig = await fetchEspnLeagueSettings(espnLeagueId);

      // If ESPN settings failed (e.g., practice draft), try DOM detection
      if (!espnConfig) {
        console.log("[API Client] ESPN settings not available, attempting DOM detection");
        const domDetection = detectLeagueConfig();

        if (domDetection.config && domDetection.confidence !== "failed") {
          console.log("[API Client] Using DOM-detected config for auction values");
          espnConfig = domDetection.config;
        } else {
          console.warn("[API Client] DOM detection failed, no auction values available");
          return [];
        }
      }

      // Build query params
      const params = new URLSearchParams({
        numTeams: espnConfig.totalTeams.toString(),
        categories: JSON.stringify(espnConfig.categories),
        rosterSlots: JSON.stringify(espnConfig.rosterSlots),
        budget: (options.budget || espnConfig.budget || 260).toString(),
        minBid: "1",
        limit: "300",
      });

      if (options.position) params.set("position", options.position);

      const url = `${normalizedBackendUrl}/api/draft/auction?${params}`;

      console.log("[API Client] Fetching generic auction values");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(url, {
        signal: controller.signal,
        mode: "cors",
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await parseJsonSafely(response);
      const valuations = data?.valuations || [];

      console.log("[API Client] Received", valuations.length, "auction values");

      return valuations;

    } catch (error) {
      console.warn("[API Client] Failed to fetch auction values:", error);
      return [];
    }
  });
}

export async function getProjectedStandings(
  leagueId: string,
  options: { backendLeagueId?: string } = {},
): Promise<ProjectedStandingsResponse | null> {
  try {
    const { backendUrl, apiToken } = await chrome.storage.local.get([
      "backendUrl",
      "apiToken",
    ]);

    const normalizedBackendUrl = normalizeBackendUrl(backendUrl);
    const backendLeagueId = options.backendLeagueId || leagueId;
    const url = `${normalizedBackendUrl}/api/leagues/${backendLeagueId}/standings/projected`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (apiToken?.trim()) {
      headers.Authorization = `Bearer ${apiToken.trim()}`;
    }

    const response = await fetch(url, {
      signal: controller.signal,
      credentials: "include",
      mode: "cors",
      headers,
    });

    clearTimeout(timeoutId);

    if (isNoDataStatus(response.status)) {
      return null;
    }

    if (!response.ok) {
      return null;
    }

    const data = (await parseJsonSafely(
      response,
    )) as ProjectedStandingsResponse | null;
    if (!data || !Array.isArray(data.overallStandings)) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * Generate baseline auction values from rankings (simple linear scale)
 */
function generateBaselineAuctionValues(): AuctionValue[] {
  const rankings = baselineRankings as PlayerRanking[];
  const maxValue = 50; // Top player worth $50
  const minValue = 1; // Bottom ranked player worth $1

  return rankings.map((player, index) => {
    // Linear scale from max to min based on ranking
    const value = Math.round(
      maxValue - (index / (rankings.length - 1)) * (maxValue - minValue),
    );

    return {
      playerId: player.playerId,
      playerName: player.playerName,
      positions: player.positions,
      dollarValue: Math.max(value, minValue),
      vbdScore: player.vbdScore ?? 0,
    };
  });
}

/**
 * Fetch rankings with single attempt - backend handles retries with circuit breaker
 * (Phase 12 P04: Backend circuit breaker opens after 5 failures for 60s)
 * Client retries fight the circuit breaker and create thundering herd on recovery
 */
export async function getRankingsWithRetry(
  espnLeagueId: string,
  options: GetRankingsOptions = {}
): Promise<PlayerRanking[]> {
  // Just call getRankings directly - backend handles retries
  return getRankings(espnLeagueId, options);
}

/**
 * Fetch auction values with single attempt - backend handles retries with circuit breaker
 */
export async function getAuctionValuesWithRetry(
  espnLeagueId: string,
  options: GetAuctionValuesOptions = {}
): Promise<AuctionValue[]> {
  // Just call getAuctionValues directly - backend handles retries
  return getAuctionValues(espnLeagueId, options);
}
